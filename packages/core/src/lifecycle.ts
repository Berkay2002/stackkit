import { rm } from "node:fs/promises";
import { join } from "node:path";

import {
  type AiSkillTarget,
  type LifecycleHook,
  type ModuleMigration,
  type SkillsLock,
  type StackkitManifest,
  type StackkitModule
} from "@berkayorhan/stackkit-schemas";

import { hashContent, joinProjectDirectory, normalizeProjectPath, readExistingFile } from "./fs-utils.js";
import { type RunCommand } from "./package-manager.js";
import {
  applyFilePlan,
  buildFilePlan,
  detectFileConflicts,
  mergeManifestFiles,
  type FileConflict,
  type FilePlan,
  type ManifestFileRecord
} from "./file-plan.js";
import { createManifest, readOptionalSkillsLock, writeManifest, writeSkillsLock } from "./manifest.js";
import {
  installAiSkills,
  isInstallableSkill,
  mergeSkillDependencies,
  missingSkillInstallCommandRunner,
  planAiSkillInstallCommands,
  resolveAiSkills,
  writeLocalAiGuidance
} from "./skills.js";
import { resolveModuleGraph } from "./module-graph.js";
import {
  buildReconstructedManagedFilePlan,
  filePlanToExpectedFiles,
  mergeCreateFileOperations,
  planEnvExampleFiles,
  renderCreateFiles,
  snapshotStackkitModule
} from "./create.js";
import { planPackageChangeFiles } from "./package-files.js";

export type AddModulesPlan = {
  schemaVersion: 1;
  operation: "add";
  safe: boolean;
  refusals: FileConflict[];
  modules: StackkitModule[];
  modulesToAdd: StackkitModule[];
  manifest: StackkitManifest;
};

export type RemoveModulesPlan = {
  schemaVersion: 1;
  operation: "remove";
  safe: boolean;
  refusals: FileConflict[];
  modulesToRemove: string[];
  filesToRemove: ManifestFileRecord[];
  manifest: StackkitManifest;
};

export type ApplyAddModulesInput = {
  projectDirectory: string;
  manifest: StackkitManifest;
  moduleIds: readonly string[];
  availableModules: readonly StackkitModule[];
  curatedSkillSourceAllowlist?: readonly string[];
  skillTargets?: readonly AiSkillTarget[];
  runCommand?: RunCommand;
};

export type ApplyRemoveModulesInput = {
  projectDirectory: string;
  manifest: StackkitManifest;
  moduleIds: readonly string[];
};

export type ModuleUpdatePlan = {
  updates: { id: string; from: string; to: string }[];
};

export type ModuleMigrationPlan = {
  automatic: ModuleMigration[];
  reviewRequired: ModuleMigration[];
  manual: ModuleMigration[];
};

type MigrationFileOperation =
  | {
      kind: "write";
      path: string;
      owner: string;
      content: string;
      overwrite: "if-owned";
    }
  | {
      kind: "delete";
      path: string;
      owner: string;
    };

export function planAddModules(input: {
  manifest: StackkitManifest;
  moduleIds: readonly string[];
  availableModules: readonly StackkitModule[];
}): AddModulesPlan {
  const manifest = createManifest(input.manifest);
  const moduleById = new Map(input.availableModules.map((module) => [module.id, module]));
  const existingIds = new Set(manifest.modules.map((module) => module.id));
  const requestedIds = new Set(input.moduleIds);
  const selectedIds = [...existingIds, ...input.moduleIds];
  const selectedModules = selectedIds.map((moduleId) => {
    const module = moduleById.get(moduleId);

    if (!module) {
      throw new Error(`Unknown Stackkit module: ${moduleId}`);
    }

    return module;
  });
  const modules = resolveModuleGraph(selectedModules, { availableModules: input.availableModules });
  const modulesToAdd = modules.filter((module) => requestedIds.has(module.id) && !existingIds.has(module.id));
  const existingModuleById = new Map(manifest.modules.map((module) => [module.id, module]));
  const nextManifest = createManifest({
    ...manifest,
    modules: modules.map((module) => ({
      id: module.id,
      version: module.version,
      options: existingModuleById.get(module.id)?.options ?? {},
      snapshot: existingModuleById.get(module.id)?.snapshot ?? snapshotStackkitModule(module)
    }))
  });

  return {
    schemaVersion: 1,
    operation: "add",
    safe: true,
    refusals: [],
    modules,
    modulesToAdd,
    manifest: nextManifest
  };
}

export function planRemoveModules(input: {
  manifest: StackkitManifest;
  moduleIds: readonly string[];
  currentFiles: readonly ManifestFileRecord[];
}): RemoveModulesPlan {
  const manifest = createManifest(input.manifest);
  const removeIds = new Set(input.moduleIds);
  const currentFileByPath = new Map(input.currentFiles.map((file) => [normalizeProjectPath(file.path), file]));
  const filesToRemove = manifest.files.filter((file) => removeIds.has(file.owner));
  const refusals = filesToRemove
    .filter((file) => currentFileByPath.get(normalizeProjectPath(file.path))?.hash !== file.hash)
    .map((file) => ({ path: normalizeProjectPath(file.path), reason: "modified-owned" as const }));
  const nextManifest = createManifest({
    ...manifest,
    modules: manifest.modules.filter((module) => !removeIds.has(module.id)),
    files: manifest.files.filter((file) => !removeIds.has(file.owner))
  });

  return {
    schemaVersion: 1,
    operation: "remove",
    safe: refusals.length === 0,
    refusals,
    modulesToRemove: [...removeIds],
    filesToRemove,
    manifest: nextManifest
  };
}

export async function readCurrentManagedFileHashes(
  projectDirectory: string,
  manifest: StackkitManifest
): Promise<ManifestFileRecord[]> {
  const records: ManifestFileRecord[] = [];

  for (const file of manifest.files) {
    const normalizedPath = normalizeProjectPath(file.path);
    const content = await readExistingFile(join(projectDirectory, normalizedPath));

    if (content === undefined) {
      continue;
    }

    records.push({
      path: normalizedPath,
      owner: file.owner,
      hash: hashContent(content)
    });
  }

  return records;
}

export async function applyAddModules(input: ApplyAddModulesInput): Promise<{ manifest: StackkitManifest }> {
  const plan = planAddModules(input);
  const fullFilePlan = await planAddModuleFiles(input);
  const conflicts = await detectFileConflicts(input.projectDirectory, fullFilePlan, input.manifest.files);

  if (conflicts.length > 0) {
    throw new Error(
      `Add target has conflicts: ${conflicts.map((conflict) => `${conflict.path} (${conflict.reason})`).join(", ")}`
    );
  }

  const files = await applyFilePlan(input.projectDirectory, fullFilePlan, {
    ownedFiles: input.manifest.files,
    conflictLabel: "Add target"
  });
  if (input.runCommand) {
    await runLifecycleHooks(
      plan.modulesToAdd.flatMap((module) => module.postAdd ?? []),
      { projectDirectory: input.projectDirectory, runCommand: input.runCommand }
    );
  }

  const skillResult = await resolveAddSkillResult(input.projectDirectory, plan.modulesToAdd, input);
  const nextAiSkills = skillResult.lock
    ? {
        mode: skillResult.lock.mode,
        linkMode: skillResult.lock.linkMode,
        targets: skillResult.lock.targets,
        installed: skillResult.lock.installed,
        planned: skillResult.lock.planned,
        local: skillResult.lock.local,
        unresolved: skillResult.lock.unresolved
      }
    : plan.manifest.aiSkills;
  const nextManifest = await writeManifest(input.projectDirectory, {
    ...plan.manifest,
    files: mergeManifestFiles(input.manifest.files, files),
    expectedFiles: mergeExpectedFiles(input.manifest.expectedFiles, filePlanToExpectedFiles(fullFilePlan)),
    aiSkills: nextAiSkills
  });

  if (skillResult.lock) {
    await writeSkillsLock(input.projectDirectory, skillResult.lock);
    await writeLocalAiGuidance(input.projectDirectory, {
      targets: skillResult.lock.targets,
      local: skillResult.lock.local
    });
  }

  return { manifest: nextManifest };
}

export async function applyRemoveModules(input: ApplyRemoveModulesInput): Promise<{ manifest: StackkitManifest }> {
  const currentFiles = await readCurrentManagedFileHashes(input.projectDirectory, input.manifest);
  const plan = planRemoveModules({ ...input, currentFiles });

  if (!plan.safe) {
    throw new Error(
      `Remove target has modified owned files: ${plan.refusals
        .map((refusal) => `${refusal.path} (${refusal.reason})`)
        .join(", ")}`
    );
  }

  const regeneratedPlan = buildReconstructedManagedFilePlan(plan.manifest);
  const managedPathSet = new Set(input.manifest.files.map((file) => normalizeProjectPath(file.path)));
  const removePathSet = new Set(plan.filesToRemove.map((file) => normalizeProjectPath(file.path)));
  const regeneratedFiles = regeneratedPlan.files.filter(
    (file) => managedPathSet.has(file.path) && !removePathSet.has(file.path)
  );
  const regeneratedPathSet = new Set(regeneratedFiles.map((file) => file.path));
  const sharedDeletes = plan.manifest.files.filter((file) => {
    const path = normalizeProjectPath(file.path);
    return managedPathSet.has(path) && !regeneratedPathSet.has(path);
  });
  const currentFileByPath = new Map(currentFiles.map((file) => [normalizeProjectPath(file.path), file]));
  const sharedDeleteRefusals = sharedDeletes
    .filter((file) => currentFileByPath.get(normalizeProjectPath(file.path))?.hash !== file.hash)
    .map((file) => ({ path: normalizeProjectPath(file.path), reason: "modified-owned" as const }));

  if (sharedDeleteRefusals.length > 0) {
    throw new Error(
      `Remove target has modified shared files: ${sharedDeleteRefusals
        .map((refusal) => `${refusal.path} (${refusal.reason})`)
        .join(", ")}`
    );
  }

  for (const file of plan.filesToRemove) {
    await rm(join(input.projectDirectory, normalizeProjectPath(file.path)), { force: true });
  }

  for (const file of sharedDeletes) {
    await rm(join(input.projectDirectory, normalizeProjectPath(file.path)), { force: true });
  }

  const rewrittenFiles = await applyFilePlan(input.projectDirectory, { files: regeneratedFiles }, {
    ownedFiles: currentFiles,
    conflictLabel: "Remove target"
  });
  const sharedDeletePathSet = new Set(sharedDeletes.map((file) => normalizeProjectPath(file.path)));
  const nextFiles = mergeManifestFiles(
    plan.manifest.files.filter((file) => !sharedDeletePathSet.has(normalizeProjectPath(file.path))),
    rewrittenFiles
  );
  const nextFilePathSet = new Set(nextFiles.map((file) => normalizeProjectPath(file.path)));
  const manifest = await writeManifest(input.projectDirectory, {
    ...plan.manifest,
    files: nextFiles,
    expectedFiles: filePlanToExpectedFiles({ files: regeneratedFiles }).filter((file) =>
      nextFilePathSet.has(normalizeProjectPath(file.path))
    )
  });

  return { manifest };
}

export function planModuleUpdates(input: {
  manifestModules: readonly StackkitManifest["modules"][number][];
  availableModules: readonly StackkitModule[];
}): ModuleUpdatePlan {
  const availableById = new Map(input.availableModules.map((module) => [module.id, module]));

  return {
    updates: input.manifestModules.flatMap((manifestModule) => {
      const available = availableById.get(manifestModule.id);

      if (!available || available.version === manifestModule.version) {
        return [];
      }

      return [{ id: manifestModule.id, from: manifestModule.version, to: available.version }];
    })
  };
}

export function planModuleMigrations(input: {
  manifest: StackkitManifest;
  modules: readonly StackkitModule[];
}): ModuleMigrationPlan {
  const applied = new Set(input.manifest.migrations.applied.map((entry) => JSON.stringify(entry)));
  const pending = input.modules
    .flatMap((module) => module.migrations ?? [])
    .filter((migration) => !applied.has(JSON.stringify(migration)));

  return {
    automatic: pending.filter((migration) => migration.safety === "automatic"),
    reviewRequired: pending.filter((migration) => migration.safety === "review-required"),
    manual: pending.filter((migration) => migration.safety === "manual")
  };
}

export async function applyAutomaticMigrations(input: {
  projectDirectory: string;
  manifest: StackkitManifest;
  modules: readonly StackkitModule[];
}): Promise<{ manifest: StackkitManifest }> {
  const manifest = createManifest(input.manifest);
  const applied = new Set(manifest.migrations.applied.map((entry) => JSON.stringify(entry)));
  const automatic = input.modules.flatMap((module) =>
    (module.migrations ?? [])
      .filter((migration) => migration.safety === "automatic" && !applied.has(JSON.stringify(migration)))
      .map((migration) => ({ module, migration }))
  );
  const operations: MigrationFileOperation[] = automatic.flatMap(({ module, migration }) =>
    migration.operations.map((operation) =>
      operation.kind === "write"
        ? {
            kind: "write",
            path: operation.path,
            owner: module.id,
            content: operation.content,
            overwrite: "if-owned"
          }
        : {
            kind: "delete",
            path: operation.path,
            owner: module.id
          }
    )
  );
  const writeOperations = operations.filter((operation) => operation.kind === "write");
  const deleteOperations = operations.filter((operation) => operation.kind === "delete");
  const filePlan = buildFilePlan(writeOperations);
  const conflicts = [
    ...(await detectFileConflicts(input.projectDirectory, filePlan, manifest.files)),
    ...(await detectMigrationDeleteConflicts(input.projectDirectory, deleteOperations, manifest.files))
  ];

  if (conflicts.length > 0) {
    throw new Error(
      `Migration has conflicts: ${conflicts.map((conflict) => `${conflict.path} (${conflict.reason})`).join(", ")}`
    );
  }

  const fileByPath = new Map(
    manifest.files.map((file) => {
      const path = normalizeProjectPath(file.path);
      return [path, { ...file, path }];
    })
  );

  for (const operation of operations) {
    if (operation.kind === "delete") {
      const path = normalizeProjectPath(operation.path);
      await rm(join(input.projectDirectory, path), { force: true });
      fileByPath.delete(path);
      continue;
    }

    const [file] = await applyFilePlan(input.projectDirectory, buildFilePlan([operation]), {
      ownedFiles: [...fileByPath.values()],
      conflictLabel: "Migration"
    });
    fileByPath.set(file.path, file);
  }

  const expectedFileByPath = new Map(
    manifest.expectedFiles.map((file) => [normalizeProjectPath(file.path), { ...file, path: normalizeProjectPath(file.path) }])
  );

  for (const operation of operations) {
    const path = normalizeProjectPath(operation.path);

    if (operation.kind === "delete") {
      expectedFileByPath.delete(path);
      continue;
    }

    expectedFileByPath.set(path, {
      path,
      owner: operation.owner,
      content: operation.content,
      hash: hashContent(operation.content)
    });
  }

  const nextManifest = createManifest({
    ...manifest,
    files: [...fileByPath.values()],
    expectedFiles: [...expectedFileByPath.values()],
    migrations: {
      applied: [...manifest.migrations.applied, ...automatic.map(({ migration }) => migration)]
    }
  });
  await writeManifest(input.projectDirectory, nextManifest);

  return { manifest: nextManifest };
}

async function detectMigrationDeleteConflicts(
  projectDirectory: string,
  operations: readonly Extract<MigrationFileOperation, { kind: "delete" }>[],
  ownedFiles: readonly ManifestFileRecord[]
): Promise<FileConflict[]> {
  const ownedFileByPath = new Map(ownedFiles.map((file) => [normalizeProjectPath(file.path), file]));
  const conflicts: FileConflict[] = [];

  for (const operation of operations) {
    const path = normalizeProjectPath(operation.path);
    const existingContent = await readExistingFile(join(projectDirectory, path));

    if (existingContent === undefined) {
      continue;
    }

    const ownedFile = ownedFileByPath.get(path);

    if (!ownedFile || ownedFile.owner !== operation.owner) {
      conflicts.push({ path, reason: "exists-unowned" });
      continue;
    }

    if (ownedFile.hash !== hashContent(existingContent)) {
      conflicts.push({ path, reason: "modified-owned" });
    }
  }

  return conflicts;
}

export async function applyModuleUpdates(input: {
  projectDirectory: string;
  manifest: StackkitManifest;
  availableModules: readonly StackkitModule[];
}): Promise<{ manifest: StackkitManifest; updates: ModuleUpdatePlan["updates"] }> {
  const manifest = createManifest(input.manifest);
  const updatePlan = planModuleUpdates({
    manifestModules: manifest.modules,
    availableModules: input.availableModules
  });
  const availableById = new Map(input.availableModules.map((module) => [module.id, module]));
  const nextModules = manifest.modules.map((manifestModule) => {
    const available = availableById.get(manifestModule.id);

    return {
      ...manifestModule,
      version: available?.version ?? manifestModule.version,
      snapshot: available ? snapshotStackkitModule(available) : manifestModule.snapshot
    };
  });
  const nextManifest = createManifest({
    ...manifest,
    modules: nextModules,
    expectedFiles: filePlanToExpectedFiles(buildReconstructedManagedFilePlan({ ...manifest, modules: nextModules }))
  });
  await writeManifest(input.projectDirectory, nextManifest);

  return { manifest: nextManifest, updates: updatePlan.updates };
}

export async function planAddModuleFiles(input: {
  projectDirectory: string;
  manifest: StackkitManifest;
  moduleIds: readonly string[];
  availableModules: readonly StackkitModule[];
}): Promise<FilePlan> {
  const plan = planAddModules(input);
  const moduleIdsToAdd = new Set(plan.modulesToAdd.map((module) => module.id));
  const directOperations = renderCreateFiles(
    {
      projectName: input.manifest.projectName,
      packageManager: input.manifest.packageManager,
      workspace: "pnpm-turbo",
      modules: plan.modules.map((module) => module.id),
      registries: {},
      ai: {
        skillTargets: [],
        skillMode: input.manifest.aiSkills.mode,
        linkMode: input.manifest.aiSkills.linkMode
      }
    },
    plan.modules
  ).filter((operation) => moduleIdsToAdd.has(operation.owner));
  const packageOperations = await planPackageChangeFiles(
    input.projectDirectory,
    plan.modulesToAdd.flatMap((module) => module.packageChanges ?? [])
  );
  const envOperations = await planEnvExampleFiles(
    input.projectDirectory,
    plan.modulesToAdd.flatMap((module) => module.envVars ?? [])
  );

  return buildFilePlan(mergeCreateFileOperations([...directOperations, ...packageOperations, ...envOperations]));
}

export async function runLifecycleHooks(
  hooks: readonly LifecycleHook[],
  options: { projectDirectory: string; runCommand: RunCommand }
): Promise<void> {
  for (const hook of hooks) {
    const result = await options.runCommand(hook.command, hook.args, {
      cwd: hook.cwd ? joinProjectDirectory(options.projectDirectory, normalizeProjectPath(hook.cwd)) : options.projectDirectory
    });

    if (result.exitCode !== 0) {
      throw new Error(`Lifecycle hook failed (${hook.name}): ${result.stderr || result.stdout || result.exitCode}`);
    }
  }
}

async function resolveAddSkillResult(
  projectDirectory: string,
  modulesToAdd: readonly StackkitModule[],
  input: ApplyAddModulesInput
): Promise<{ lock?: SkillsLock }> {
  const existingLock = await readOptionalSkillsLock(projectDirectory);
  const targets = [...(input.skillTargets ?? existingLock?.targets ?? input.manifest.aiSkills.targets)];
  const mode = input.manifest.aiSkills.mode;
  const linkMode = input.manifest.aiSkills.linkMode;

  if (mode === "skip") {
    return {};
  }

  const resolvedSkills = resolveAiSkills(modulesToAdd, { curatedAllowlist: input.curatedSkillSourceAllowlist });
  const local = resolvedSkills.filter((skill) => skill.trust === "local");
  const initiallyUnresolved = resolvedSkills.filter((skill) => skill.trust === "unresolved");
  const installableSkills = resolvedSkills.filter(isInstallableSkill);
  const installCommands = planAiSkillInstallCommands(resolvedSkills, targets, linkMode);
  const installResult =
    mode === "plan"
      ? { installed: [], unresolved: [] }
      : installCommands.length > 0
        ? await installAiSkills(installCommands, {
            cwd: projectDirectory,
            runCommand: input.runCommand ?? missingSkillInstallCommandRunner
          })
        : {
            installed: [],
            unresolved: []
          };
  const baseLock: SkillsLock = existingLock ?? {
    schemaVersion: 1,
    mode,
    linkMode,
    targets,
    installed: input.manifest.aiSkills.installed,
    planned: input.manifest.aiSkills.planned,
    local: input.manifest.aiSkills.local,
    unresolved: input.manifest.aiSkills.unresolved
  };

  return {
    lock: {
      schemaVersion: 1,
      mode,
      linkMode,
      targets,
      installed: mergeSkillDependencies(baseLock.installed, installResult.installed),
      planned: mergeSkillDependencies(baseLock.planned, mode === "plan" ? installableSkills : []),
      local: mergeSkillDependencies(baseLock.local, local),
      unresolved: mergeSkillDependencies(baseLock.unresolved, [...initiallyUnresolved, ...installResult.unresolved])
    }
  };
}

function mergeExpectedFiles(
  existingFiles: readonly StackkitManifest["expectedFiles"][number][],
  newFiles: readonly StackkitManifest["expectedFiles"][number][]
): StackkitManifest["expectedFiles"] {
  const fileByPath = new Map<string, StackkitManifest["expectedFiles"][number]>();

  for (const file of existingFiles) {
    const path = normalizeProjectPath(file.path);
    fileByPath.set(path, { ...file, path });
  }

  for (const file of newFiles) {
    const path = normalizeProjectPath(file.path);
    fileByPath.set(path, { ...file, path });
  }

  return [...fileByPath.values()];
}
