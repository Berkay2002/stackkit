import { rm } from "node:fs/promises";
import { join } from "node:path";

import {
  type AiSkillTarget,
  type LifecycleHook,
  type ModuleRemovalPolicy,
  type ModuleMigration,
  type SkillsLock,
  type StackkitManifest,
  type StackkitModule
} from "@berkayorhan/stackkit-schemas";

import { hashContent, normalizeProjectPath, readExistingFile, resolveContainedProjectPath, resolveProjectCwd } from "./fs-utils.js";
import { type RunCommand } from "./package-manager.js";
import {
  applyFilePlanUnchecked,
  buildFilePlan,
  detectFileConflicts,
  mergeManifestFiles,
  type FileConflict,
  type PlannedFile
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
import { resolveModuleAlias, resolveModuleGraph } from "./module-graph.js";
import {
  buildReconstructedManagedFilePlan,
  filePlanToExpectedFiles,
  manifestModuleToStackkitModule,
  manifestToConfig,
  mergeCreateFileOperations,
  planEnvExampleFiles,
  renderCreateFiles,
  snapshotStackkitModule
} from "./create.js";
import { planPackageChangeFiles } from "./package-files.js";
import { assertCreateSupport } from "./support.js";

/** Files a lifecycle operation will write or delete, and the drifted files that block it. */
export type LifecycleFileChanges = {
  writes: PlannedFile[];
  deletes: string[];
  refusals: FileConflict[];
};

export type AddModulesPlan = {
  schemaVersion: 1;
  operation: "add";
  safe: boolean;
  refusals: FileConflict[];
  modules: StackkitModule[];
  modulesToAdd: StackkitModule[];
  writes: PlannedFile[];
  manifest: StackkitManifest;
};

export type RemoveModulesPlan = LifecycleFileChanges & {
  schemaVersion: 1;
  operation: "remove";
  safe: boolean;
  blockedModules: string[];
  /** Remaining modules that require a capability only the removed modules provide. */
  dependents: string[];
  modulesToRemove: string[];
  removalAdvisories: {
    moduleId: string;
    policy: ModuleRemovalPolicy;
  }[];
  manifest: StackkitManifest;
};

export type UpdateModulesPlan = LifecycleFileChanges & {
  schemaVersion: 1;
  operation: "update";
  safe: boolean;
  updates: ModuleUpdatePlan["updates"];
  migrations: ModuleMigrationPlan;
  manifest: StackkitManifest;
};

export type ApplyAddModulesInput = {
  projectDirectory: string;
  manifest: StackkitManifest;
  moduleIds: readonly string[];
  availableModules: readonly StackkitModule[];
  includePreview?: boolean;
  curatedSkillSourceAllowlist?: readonly string[];
  skillTargets?: readonly AiSkillTarget[];
  runCommand?: RunCommand;
};

export type ApplyRemoveModulesInput = {
  projectDirectory: string;
  manifest: StackkitManifest;
  moduleIds: readonly string[];
  availableModules?: readonly StackkitModule[];
  /** Overwrite or delete drifted files instead of refusing. */
  force?: boolean;
};

export type ApplyModuleUpdatesInput = {
  projectDirectory: string;
  manifest: StackkitManifest;
  availableModules: readonly StackkitModule[];
  /** Overwrite or delete drifted files instead of refusing. */
  force?: boolean;
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

/**
 * Resolve a module id or alias to a module installed in the manifest, or throw. Lifecycle commands
 * must never report success for a typo or for a module the project does not have.
 */
export function resolveInstalledModuleId(
  manifest: StackkitManifest,
  input: string,
  availableModules: readonly StackkitModule[] = []
): string {
  const moduleId = manifest.modules.some((module) => module.id === input)
    ? input
    : resolveModuleAlias(
        input,
        availableModules.length > 0 ? availableModules : manifest.modules.map(manifestModuleToStackkitModule)
      );

  if (!manifest.modules.some((module) => module.id === moduleId)) {
    throw new Error(`Module ${moduleId} is not installed in ${manifest.projectName}.`);
  }

  return moduleId;
}

export async function planAddModules(input: {
  projectDirectory: string;
  manifest: StackkitManifest;
  moduleIds: readonly string[];
  availableModules: readonly StackkitModule[];
  includePreview?: boolean;
}): Promise<AddModulesPlan> {
  const manifest = createManifest(input.manifest);
  const moduleById = new Map(input.availableModules.map((module) => [module.id, module]));
  const existingIds = new Set(manifest.modules.map((module) => module.id));
  const requestedIds = new Set(input.moduleIds.map((moduleId) => resolveModuleAlias(moduleId, input.availableModules)));
  const selectedModules = [...existingIds, ...requestedIds].map((moduleId) => {
    const module = moduleById.get(moduleId);

    if (!module) {
      throw new Error(`Unknown Stackkit module: ${moduleId}`);
    }

    return module;
  });
  const modules = resolveModuleGraph(selectedModules, { availableModules: input.availableModules });
  const modulesToAdd = modules.filter((module) => requestedIds.has(module.id) && !existingIds.has(module.id));

  // Same support contract as create: planned modules are never generated, preview needs an explicit opt-in.
  assertCreateSupport({ modules: modulesToAdd, includePreview: input.includePreview });

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
  const writes = await renderAddedModuleFiles(input.projectDirectory, nextManifest, modules, modulesToAdd);
  const refusals = await detectFileConflicts(input.projectDirectory, { files: writes }, manifest.files);

  return {
    schemaVersion: 1,
    operation: "add",
    safe: refusals.length === 0,
    refusals,
    modules,
    modulesToAdd,
    writes,
    manifest: withFileChanges(nextManifest, { writes, deletes: [] })
  };
}

export async function planRemoveModules(input: {
  projectDirectory: string;
  manifest: StackkitManifest;
  moduleIds: readonly string[];
  availableModules?: readonly StackkitModule[];
  force?: boolean;
}): Promise<RemoveModulesPlan> {
  const manifest = createManifest(input.manifest);
  const removeIds = new Set(
    input.moduleIds.map((moduleId) => resolveInstalledModuleId(manifest, moduleId, input.availableModules))
  );
  const availableModuleById = new Map(input.availableModules?.map((module) => [module.id, module]) ?? []);
  const installedModules = manifest.modules.map(
    (module) => module.snapshot ?? availableModuleById.get(module.id) ?? manifestModuleToStackkitModule(module)
  );
  const remainingModules = installedModules.filter((module) => !removeIds.has(module.id));
  const stillProvided = new Set(remainingModules.flatMap((module) => module.provides ?? []));
  const lostCapabilities = new Set(
    installedModules
      .filter((module) => removeIds.has(module.id))
      .flatMap((module) => module.provides ?? [])
      .filter((capability) => !stillProvided.has(capability))
  );
  const dependents = remainingModules
    .filter((module) => (module.requires ?? []).some((capability) => lostCapabilities.has(capability)))
    .map((module) => module.id);
  const removalAdvisories = [...removeIds].map((moduleId) => ({
    moduleId,
    policy:
      availableModuleById.get(moduleId)?.removalPolicy ??
      manifest.modules.find((module) => module.id === moduleId)?.snapshot?.removalPolicy ?? {
        mode: "managed-files-only" as const,
        retainedData: [],
        manualCleanup: []
      }
  }));
  const blockedModules = removalAdvisories
    .filter((advisory) => advisory.policy.mode === "blocked")
    .map((advisory) => advisory.moduleId);
  const nextManifest = createManifest({
    ...manifest,
    modules: manifest.modules.filter((module) => !removeIds.has(module.id))
  });
  const changes = await planManagedFileChanges({
    projectDirectory: input.projectDirectory,
    manifest,
    nextManifest,
    removedModuleIds: removeIds,
    force: input.force
  });

  return {
    schemaVersion: 1,
    operation: "remove",
    safe: changes.refusals.length === 0 && blockedModules.length === 0 && dependents.length === 0,
    ...changes,
    blockedModules,
    dependents,
    modulesToRemove: [...removeIds],
    removalAdvisories,
    manifest: withFileChanges(nextManifest, changes)
  };
}

export async function applyAddModules(
  input: ApplyAddModulesInput
): Promise<{ manifest: StackkitManifest; plan: AddModulesPlan }> {
  const plan = await planAddModules(input);

  if (!plan.safe) {
    throw new Error(`Add target has conflicts: ${formatConflicts(plan.refusals)}`);
  }

  await applyFilePlanUnchecked(input.projectDirectory, { files: plan.writes });

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
  const nextManifest = await writeManifest(input.projectDirectory, { ...plan.manifest, aiSkills: nextAiSkills });

  if (skillResult.lock) {
    await writeSkillsLock(input.projectDirectory, skillResult.lock);
    await writeLocalAiGuidance(input.projectDirectory, {
      targets: skillResult.lock.targets,
      local: skillResult.lock.local
    });
  }

  return { manifest: nextManifest, plan };
}

export async function applyRemoveModules(
  input: ApplyRemoveModulesInput
): Promise<{ manifest: StackkitManifest; plan: RemoveModulesPlan }> {
  const plan = await planRemoveModules(input);

  if (plan.blockedModules.length > 0) {
    throw new Error(`Removal is blocked by module policy: ${plan.blockedModules.join(", ")}`);
  }

  if (plan.dependents.length > 0) {
    throw new Error(
      `Cannot remove ${plan.modulesToRemove.join(", ")}: still required by ${plan.dependents.join(", ")}. Remove those modules first.`
    );
  }

  if (!plan.safe) {
    throw new Error(`Remove target has conflicts: ${formatConflicts(plan.refusals)}`);
  }

  await applyLifecycleChanges(input.projectDirectory, plan);

  return { manifest: await writeManifest(input.projectDirectory, plan.manifest), plan };
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

function compareSemver(a: string, b: string): number {
  const partsA = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const partsB = b.split(".").map((part) => Number.parseInt(part, 10) || 0);

  for (let index = 0; index < 3; index += 1) {
    const valueA = partsA[index] ?? 0;
    const valueB = partsB[index] ?? 0;

    if (valueA !== valueB) {
      return valueA < valueB ? -1 : 1;
    }
  }

  return 0;
}

function isMigrationApplicableToVersion(installedVersion: string, migration: ModuleMigration): boolean {
  return compareSemver(installedVersion, migration.from) >= 0 && compareSemver(installedVersion, migration.to) < 0;
}

/**
 * Collect migrations that are genuinely pending for a project: only for modules
 * actually recorded in the manifest, only when the installed version falls in the
 * migration's [from, to) range, and only when the migration has not been applied yet.
 */
function collectPendingMigrations(
  manifest: StackkitManifest,
  modules: readonly StackkitModule[]
): { module: StackkitModule; migration: ModuleMigration }[] {
  const applied = new Set(manifest.migrations.applied.map((entry) => JSON.stringify(entry)));
  const installedVersionById = new Map(manifest.modules.map((module) => [module.id, module.version]));

  return modules.flatMap((module) => {
    const installedVersion = installedVersionById.get(module.id);

    if (installedVersion === undefined) {
      return [];
    }

    return (module.migrations ?? [])
      .filter(
        (migration) =>
          isMigrationApplicableToVersion(installedVersion, migration) && !applied.has(JSON.stringify(migration))
      )
      .map((migration) => ({ module, migration }));
  });
}

export function planModuleMigrations(input: {
  manifest: StackkitManifest;
  modules: readonly StackkitModule[];
}): ModuleMigrationPlan {
  const pending = collectPendingMigrations(input.manifest, input.modules).map(({ migration }) => migration);

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
  const migrations = await planAutomaticMigrationChanges(input.projectDirectory, manifest, input.modules);

  if (migrations.refusals.length > 0) {
    throw new Error(`Migration has conflicts: ${formatConflicts(migrations.refusals)}`);
  }

  await applyLifecycleChanges(input.projectDirectory, migrations);

  // A migration moves the module to its `to` version, so it is never offered again.
  const nextManifest = withFileChanges(
    {
      ...manifest,
      modules: manifest.modules.map((module) => ({
        ...module,
        version: migrations.applied
          .filter((entry) => entry.module.id === module.id)
          .map((entry) => entry.migration.to)
          .reduce((highest, version) => (compareSemver(version, highest) > 0 ? version : highest), module.version)
      })),
      migrations: {
        applied: [...manifest.migrations.applied, ...migrations.applied.map(({ migration }) => migration)]
      }
    },
    migrations
  );

  return { manifest: await writeManifest(input.projectDirectory, nextManifest) };
}

/**
 * Plan a full update: version bumps, re-rendered template changes, and pending automatic migrations,
 * checked for conflicts together so apply either writes everything or nothing.
 */
export async function planUpdateModules(input: ApplyModuleUpdatesInput): Promise<UpdateModulesPlan> {
  const manifest = createManifest(input.manifest);
  const updates = planModuleUpdates({ manifestModules: manifest.modules, availableModules: input.availableModules }).updates;
  const availableById = new Map(input.availableModules.map((module) => [module.id, module]));
  const nextManifest = createManifest({
    ...manifest,
    modules: manifest.modules.map((manifestModule) => {
      const available = availableById.get(manifestModule.id);

      return available
        ? { ...manifestModule, version: available.version, snapshot: snapshotStackkitModule(available) }
        : manifestModule;
    })
  });
  const templateChanges = await planManagedFileChanges({
    projectDirectory: input.projectDirectory,
    manifest,
    nextManifest,
    force: input.force
  });
  const migrations = await planAutomaticMigrationChanges(input.projectDirectory, manifest, input.availableModules);
  const migrationPaths = new Set([...migrations.writes.map((file) => file.path), ...migrations.deletes]);
  const changes: LifecycleFileChanges = {
    writes: [...templateChanges.writes.filter((file) => !migrationPaths.has(file.path)), ...migrations.writes],
    deletes: [...templateChanges.deletes.filter((path) => !migrationPaths.has(path)), ...migrations.deletes],
    refusals: [...templateChanges.refusals, ...migrations.refusals]
  };

  return {
    schemaVersion: 1,
    operation: "update",
    safe: changes.refusals.length === 0,
    ...changes,
    updates,
    migrations: planModuleMigrations({ manifest, modules: input.availableModules }),
    manifest: withFileChanges(
      {
        ...nextManifest,
        migrations: {
          applied: [...manifest.migrations.applied, ...migrations.applied.map(({ migration }) => migration)]
        }
      },
      changes
    )
  };
}

export async function applyModuleUpdates(
  input: ApplyModuleUpdatesInput
): Promise<{ manifest: StackkitManifest; updates: ModuleUpdatePlan["updates"]; plan: UpdateModulesPlan }> {
  const plan = await planUpdateModules(input);

  if (!plan.safe) {
    throw new Error(`Update target has conflicts: ${formatConflicts(plan.refusals)}`);
  }

  await applyLifecycleChanges(input.projectDirectory, plan);

  return { manifest: await writeManifest(input.projectDirectory, plan.manifest), updates: plan.updates, plan };
}

/**
 * Diff the files rendered for the current module set against the files rendered for the next one,
 * and only touch paths whose rendered content changes. A path is written or deleted only while it
 * still matches what Stackkit rendered (for files of removed modules: the recorded hash). Anything
 * else — user edits, native-initializer or migration output, deleted files — is drift and is
 * refused unless forced. Paths no template ever rendered are left alone.
 *
 * ponytail: the drift baseline is the current template code, so a template change shipped in a newer
 * Stackkit without a module version bump also reads as drift; record per-file render provenance in the
 * manifest if that becomes noisy.
 */
async function planManagedFileChanges(input: {
  projectDirectory: string;
  manifest: StackkitManifest;
  nextManifest: StackkitManifest;
  removedModuleIds?: ReadonlySet<string>;
  force?: boolean;
}): Promise<LifecycleFileChanges> {
  const filesByPath = <T extends { path: string }>(files: readonly T[]) =>
    new Map(files.map((file) => [normalizeProjectPath(file.path), file]));
  const previousRender = filesByPath(buildReconstructedManagedFilePlan(input.manifest).files);
  const nextRender = filesByPath(buildReconstructedManagedFilePlan(input.nextManifest).files);
  const records = filesByPath(input.manifest.files);
  const removed = input.removedModuleIds ?? new Set<string>();
  const changes: LifecycleFileChanges = { writes: [], deletes: [], refusals: [] };
  const readHash = async (path: string) => {
    const content = await readExistingFile(join(input.projectDirectory, path));
    return content === undefined ? undefined : hashContent(content);
  };

  for (const [path, file] of nextRender) {
    const previous = previousRender.get(path);
    const record = records.get(path);

    if (previous?.hash === file.hash || (previous && !record)) {
      continue;
    }

    const diskHash = await readHash(path);

    if (diskHash !== undefined && file.overwrite === "never") {
      continue;
    }

    const clean =
      diskHash === undefined ? !record : diskHash === file.hash || (previous !== undefined && diskHash === previous.hash);

    if (!clean && !input.force) {
      changes.refusals.push({
        path,
        reason: diskHash === undefined ? "missing-owned" : record ? "modified-owned" : "exists-unowned"
      });
      continue;
    }

    changes.writes.push(file);
  }

  for (const [path, record] of records) {
    if (nextRender.has(path)) {
      continue;
    }

    const baseHash = removed.has(record.owner) ? record.hash : previousRender.get(path)?.hash;

    // Not rendered by a template and its owner stays installed: native-initializer or migration output.
    if (baseHash === undefined) {
      continue;
    }

    const diskHash = await readHash(path);

    if (diskHash !== undefined && diskHash !== baseHash && !input.force) {
      changes.refusals.push({ path, reason: "modified-owned" });
      continue;
    }

    changes.deletes.push(path);
  }

  return changes;
}

async function planAutomaticMigrationChanges(
  projectDirectory: string,
  manifest: StackkitManifest,
  modules: readonly StackkitModule[]
): Promise<LifecycleFileChanges & { applied: { module: StackkitModule; migration: ModuleMigration }[] }> {
  const applied = collectPendingMigrations(manifest, modules).filter(({ migration }) => migration.safety === "automatic");
  const operations: MigrationFileOperation[] = applied.flatMap(({ module, migration }) =>
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
  const deleteOperations = operations.filter((operation) => operation.kind === "delete");
  const writes = buildFilePlan(operations).files;

  return {
    writes,
    deletes: deleteOperations.map((operation) => normalizeProjectPath(operation.path)),
    refusals: [
      ...(await detectFileConflicts(projectDirectory, { files: writes }, manifest.files)),
      ...(await detectMigrationDeleteConflicts(projectDirectory, deleteOperations, manifest.files))
    ],
    applied
  };
}

async function detectMigrationDeleteConflicts(
  projectDirectory: string,
  operations: readonly Extract<MigrationFileOperation, { kind: "delete" }>[],
  ownedFiles: StackkitManifest["files"]
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

async function applyLifecycleChanges(
  projectDirectory: string,
  changes: Pick<LifecycleFileChanges, "writes" | "deletes">
): Promise<void> {
  for (const path of changes.deletes) {
    await rm(await resolveContainedProjectPath(projectDirectory, path), { force: true });
  }

  await applyFilePlanUnchecked(projectDirectory, { files: changes.writes });
}

/** The manifest after applying file changes: deleted paths drop out, written paths get fresh records. */
function withFileChanges(
  manifest: StackkitManifest,
  changes: Pick<LifecycleFileChanges, "writes" | "deletes">
): StackkitManifest {
  const deleted = new Set(changes.deletes);
  const kept = <T extends { path: string }>(file: T) => !deleted.has(normalizeProjectPath(file.path));

  return createManifest({
    ...manifest,
    files: mergeManifestFiles(
      manifest.files.filter(kept),
      changes.writes.map(({ path, owner, hash }) => ({ path, owner, hash }))
    ),
    expectedFiles: mergeManifestFiles(
      manifest.expectedFiles.filter(kept),
      filePlanToExpectedFiles({ files: changes.writes })
    )
  });
}

function formatConflicts(conflicts: readonly FileConflict[]): string {
  return conflicts.map((conflict) => `${conflict.path} (${conflict.reason})`).join(", ");
}

/** Files owned by the added modules, plus package.json and .env.example changes merged into what is on disk. */
async function renderAddedModuleFiles(
  projectDirectory: string,
  manifest: StackkitManifest,
  modules: readonly StackkitModule[],
  modulesToAdd: readonly StackkitModule[]
): Promise<PlannedFile[]> {
  const moduleIdsToAdd = new Set(modulesToAdd.map((module) => module.id));
  const directOperations = renderCreateFiles(manifestToConfig(manifest), modules).filter((operation) =>
    moduleIdsToAdd.has(operation.owner)
  );
  const packageOperations = await planPackageChangeFiles(projectDirectory, modulesToAdd, manifest.files);
  const envOperations = await planEnvExampleFiles(
    projectDirectory,
    modulesToAdd.flatMap((module) => module.envVars ?? [])
  );

  return buildFilePlan(mergeCreateFileOperations([...directOperations, ...packageOperations, ...envOperations])).files;
}

export async function runLifecycleHooks(
  hooks: readonly LifecycleHook[],
  options: { projectDirectory: string; runCommand: RunCommand }
): Promise<void> {
  for (const hook of hooks) {
    const result = await options.runCommand(hook.command, hook.args, {
      cwd: resolveProjectCwd(options.projectDirectory, hook.cwd)
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

