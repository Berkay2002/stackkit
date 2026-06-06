import { readdir } from "node:fs/promises";
import { join } from "node:path";

import {
  renderDockerFiles,
  renderFastApiService,
  renderKubernetesFiles,
  renderNextjsApp,
  renderPnpmTurboFoundation,
  renderShadcnUi,
  renderVercelFiles
} from "@berkayorhan/stackkit-templates";
import {
  type AiSkillDependency,
  type AiSkillLinkMode,
  type AiSkillMode,
  type AiSkillTarget,
  type EnvVarDefinition,
  type FileOperation,
  type StackkitConfig,
  type StackkitManifest,
  type StackkitManifestSource,
  type StackkitModule,
  type StackkitPreset
} from "@berkayorhan/stackkit-schemas";

import { isNodeError, normalizeProjectPath, normalizeTargetDirectoryName, readExistingFile } from "./fs-utils.js";
import { getPackageManagerAdapter, type PackageManagerAdapter, type RunCommand } from "./package-manager.js";
import { composeReadme } from "./readme.js";
import { normalizeEnvVars, renderEnvExampleContent } from "./env.js";
import {
  applyFilePlan,
  buildFilePlan,
  detectFileConflicts,
  filePlanToOperations,
  mergeManifestFiles,
  type FileConflict,
  type FilePlan,
  type ManifestFileRecord
} from "./file-plan.js";
import { writeManifest, writeSkillsLock } from "./manifest.js";
import {
  installAiSkills,
  isInstallableSkill,
  missingSkillInstallCommandRunner,
  planAiSkillInstallCommands,
  resolveAiSkills,
  resolveAiSkillTargets,
  writeLocalAiGuidance,
  type AiSkillInstallCommand
} from "./skills.js";
import { resolveConfiguredModules, resolveModuleGraph, validateProjectSlug } from "./module-graph.js";
import {
  appendFileContent,
  mergePackageOperations,
  planPackageChangeFiles
} from "./package-files.js";
import { runDoctor } from "./doctor.js";
import { defineModule } from "./registry.js";
import { runLifecycleHooks } from "./lifecycle.js";

export type CreatePlan = {
  schemaVersion: 1;
  operation: "create";
  dryRun: true;
  projectName: string;
  packageManager: StackkitConfig["packageManager"];
  source: StackkitManifestSource;
  targetDirectoryName: string;
  filePlan: FilePlan;
  warnings: string[];
  modules: {
    id: string;
    version: string;
  }[];
  selectedModules: StackkitModule[];
  aiSkills: {
    mode: AiSkillMode;
    linkMode: AiSkillLinkMode;
    targets: AiSkillTarget[];
    resolved: AiSkillDependency[];
    planned: AiSkillDependency[];
    local: AiSkillDependency[];
    unresolved: AiSkillDependency[];
  };
  skillInstallCommands: AiSkillInstallCommand[];
};

export type CreatePlanInput = {
  config: StackkitConfig;
  source?: StackkitManifestSource;
  availableModules: readonly StackkitModule[];
  availablePresets?: readonly StackkitPreset[];
  curatedSkillSourceAllowlist?: readonly string[];
};

export type ApplyCreatePlanOptions = {
  parentDirectory: string;
  targetDirectory?: string;
  stackkitVersion?: string;
  now?: () => Date;
  installSkills?: boolean;
  runCommand?: RunCommand;
};

export type ApplyCreatePlanResult = {
  projectDirectory: string;
  manifest: StackkitManifest;
  doctor: import("@berkayorhan/stackkit-schemas").DoctorResult;
};

type ResolveSkillInstallResult = {
  installed: AiSkillDependency[];
  planned: AiSkillDependency[];
  unresolved: AiSkillDependency[];
};

export function createCreatePlan(input: CreatePlanInput): CreatePlan {
  const projectName = validateProjectSlug(input.config.projectName);
  const selectedPresets =
    "preset" in input.config && typeof input.config.preset === "string" ? [input.config.preset] : [];
  const modules = resolveModuleGraph(resolveConfiguredModules(input.config, input.availableModules), {
    availablePresets: input.availablePresets,
    presets: input.availablePresets,
    availableModules: input.availableModules,
    selectedPresets
  });
  const resolvedSkills = resolveAiSkills(modules, { curatedAllowlist: input.curatedSkillSourceAllowlist });
  const targets = resolveAiSkillTargets(input.config.ai.skillTargets);
  const mode = input.config.ai.skillMode;
  const linkMode = input.config.ai.linkMode;
  const effectiveResolvedSkills = mode === "skip" ? [] : resolvedSkills;
  const installableSkills = effectiveResolvedSkills.filter(isInstallableSkill);
  const installCommands = mode === "skip" ? [] : planAiSkillInstallCommands(effectiveResolvedSkills, targets, linkMode);
  const filePlan = buildFilePlan(renderCreateFiles(input.config, modules));

  const plan: Omit<CreatePlan, "selectedModules"> = {
    schemaVersion: 1,
    operation: "create",
    dryRun: true,
    projectName,
    packageManager: input.config.packageManager,
    source: input.source ?? { kind: "config", path: "stackkit.config.json" },
    targetDirectoryName: normalizeTargetDirectoryName(projectName),
    filePlan,
    warnings: [],
    modules: modules.map((module) => ({
      id: module.id,
      version: module.version
    })),
    aiSkills: {
      mode,
      linkMode,
      targets,
      resolved: effectiveResolvedSkills,
      planned: mode === "plan" ? installableSkills : [],
      local: effectiveResolvedSkills.filter((skill) => skill.trust === "local"),
      unresolved: effectiveResolvedSkills.filter((skill) => skill.trust === "unresolved")
    },
    skillInstallCommands: installCommands
  };

  return attachSelectedModules(plan, modules);
}

function renderStackkitConfig(config: StackkitConfig): FileOperation {
  return {
    kind: "write",
    path: "stackkit.config.json",
    owner: "stackkit/config",
    overwrite: "never",
    content: `${JSON.stringify(
      {
        $schema: "https://stackkit.dev/schema.json",
        projectName: config.projectName,
        packageManager: config.packageManager,
        workspace: config.workspace,
        preset: config.preset,
        modules: config.modules,
        options: config.options ?? {},
        ai: config.ai
      },
      null,
      2
    )}\n`
  };
}

export function renderCreateFiles(config: StackkitConfig, modules: readonly StackkitModule[]): FileOperation[] {
  const operations: FileOperation[] = [];
  const seenPaths = new Set<string>();
  const selectedModuleIds = new Set(modules.map((module) => module.id));
  const packageManager = getPackageManagerAdapter(config.packageManager);

  appendUniqueFileOperations(operations, seenPaths, [renderStackkitConfig(config)]);
  appendUniqueFileOperations(operations, seenPaths, [
    {
      kind: "write",
      path: "README.md",
      owner: "docs/readme",
      content: composeReadme({ projectName: config.projectName, packageManager: config.packageManager, modules }),
      overwrite: "if-owned"
    }
  ]);

  if (selectedModuleIds.has("workspace/pnpm-turbo") || selectedModuleIds.has("workspace/typescript")) {
    appendUniqueFileOperations(
      operations,
      seenPaths,
      renderPnpmTurboFoundation({
        projectName: config.projectName,
        packageManagerField: packageManager.packageManagerField,
        workspaceFile: packageManager.workspaceFile
      }).filter((operation) => selectedModuleIds.has(operation.owner))
    );
  }

  if (selectedModuleIds.has("ui/shadcn")) {
    appendSelectedFileOperations(operations, seenPaths, renderShadcnUi({ appName: "web" }), selectedModuleIds);
  }

  if (selectedModuleIds.has("web/nextjs")) {
    appendSelectedFileOperations(
      operations,
      seenPaths,
      renderNextjsApp({ appName: "web", packageManagerField: packageManager.packageManagerField }),
      selectedModuleIds
    );
  }

  if (selectedModuleIds.has("api/fastapi")) {
    appendSelectedFileOperations(
      operations,
      seenPaths,
      renderFastApiService({ serviceName: "api", projectName: config.projectName }),
      selectedModuleIds
    );
  }

  if (selectedModuleIds.has("deploy/vercel")) {
    appendSelectedFileOperations(operations, seenPaths, renderVercelFiles(), selectedModuleIds);
  }

  if (selectedModuleIds.has("deploy/docker")) {
    appendSelectedFileOperations(operations, seenPaths, renderDockerFiles(toDockerTemplateOptions(packageManager)), selectedModuleIds);
  }

  if (selectedModuleIds.has("deploy/kubernetes")) {
    appendSelectedFileOperations(operations, seenPaths, renderKubernetesFiles(), selectedModuleIds);
  }

  for (const module of modules) {
    appendUniqueFileOperations(operations, seenPaths, module.files ?? []);
  }

  return operations;
}

function toDockerTemplateOptions(adapter: PackageManagerAdapter): {
  packageManagerName: string;
  installCommand: readonly string[];
  runBuildCommand: readonly string[];
  runStartCommand: readonly string[];
} {
  const installCommand =
    adapter.name === "pnpm"
      ? ["corepack", "enable", "&&", ...adapter.installCommand, "--frozen-lockfile"]
      : adapter.name === "yarn"
        ? ["corepack", "enable", "&&", ...adapter.installCommand]
        : adapter.installCommand;

  return {
    packageManagerName: adapter.name,
    installCommand,
    runBuildCommand: adapter.runCommand("build"),
    runStartCommand: adapter.runCommand("start")
  };
}

export async function applyCreatePlan(
  plan: CreatePlan,
  options: ApplyCreatePlanOptions
): Promise<ApplyCreatePlanResult> {
  const projectDirectory = options.targetDirectory ?? join(options.parentDirectory, normalizeTargetDirectoryName(plan.targetDirectoryName));
  await assertCreateTargetIsSafe(projectDirectory);

  const packageOperations = await planPackageChangeFiles(
    projectDirectory,
    plan.selectedModules.flatMap((module) => module.packageChanges ?? [])
  );
  const envOperations = await planEnvExampleFiles(
    projectDirectory,
    plan.selectedModules.flatMap((module) => module.envVars ?? [])
  );
  const fullFilePlan = buildFilePlan(
    mergeCreateFileOperations([...filePlanToOperations(plan.filePlan), ...packageOperations, ...envOperations])
  );
  const conflicts = await detectFileConflicts(projectDirectory, fullFilePlan, []);

  if (conflicts.length > 0) {
    throw new Error(
      `Create target has conflicts: ${conflicts.map((conflict) => `${conflict.path} (${conflict.reason})`).join(", ")}`
    );
  }

  const files = await applyFilePlan(projectDirectory, fullFilePlan);
  if (options.runCommand) {
    await runLifecycleHooks(
      plan.selectedModules.flatMap((module) => module.postCreate ?? []),
      { projectDirectory, runCommand: options.runCommand }
    );
  }

  const skillInstallResult = await resolveSkillInstallResult(plan, projectDirectory, options);
  const manifest = await writeManifest(projectDirectory, {
    schemaVersion: 1,
    stackkitVersion: options.stackkitVersion ?? "0.0.0",
    projectName: plan.projectName,
    packageManager: plan.packageManager,
    source: plan.source,
    paths: { root: "." },
    createdAt: (options.now ?? (() => new Date()))().toISOString(),
    modules: plan.modules.map((module) => ({ ...module, options: {} })),
    files,
    aiSkills: {
      mode: plan.aiSkills.mode,
      linkMode: plan.aiSkills.linkMode,
      targets: plan.aiSkills.targets,
      installed: skillInstallResult.installed,
      planned: skillInstallResult.planned,
      local: plan.aiSkills.local,
      unresolved: skillInstallResult.unresolved
    },
    migrations: {
      applied: []
    }
  });
  if (plan.aiSkills.mode !== "skip") {
    await writeSkillsLock(projectDirectory, {
      schemaVersion: 1,
      mode: plan.aiSkills.mode,
      linkMode: plan.aiSkills.linkMode,
      targets: plan.aiSkills.targets,
      installed: skillInstallResult.installed,
      planned: skillInstallResult.planned,
      local: plan.aiSkills.local,
      unresolved: skillInstallResult.unresolved
    });
    await writeLocalAiGuidance(projectDirectory, {
      targets: plan.aiSkills.targets,
      local: plan.aiSkills.local
    });
  }

  const doctor = await runDoctor(projectDirectory);

  return { projectDirectory, manifest, doctor };
}

async function assertCreateTargetIsSafe(projectDirectory: string): Promise<void> {
  const existingManifest = await readExistingFile(join(projectDirectory, ".stackkit", "project.json"));

  if (existingManifest !== undefined) {
    throw new Error(
      `Refusing to create in ${projectDirectory}: already Stackkit-managed. Use stackkit add, stackkit update, or stackkit diff.`
    );
  }

  try {
    const entries = await readdir(projectDirectory);

    if (entries.length > 0) {
      throw new Error(`Refusing to create in non-empty directory: ${projectDirectory}`);
    }
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return;
    }

    throw error;
  }
}

export async function planEnvExampleFiles(
  projectDirectory: string,
  envVars: readonly EnvVarDefinition[]
): Promise<FileOperation[]> {
  if (envVars.length === 0) {
    return [];
  }

  const existing = await readExistingFile(join(projectDirectory, ".env.example"));
  const existingContent = existing ?? "";
  const separator = existingContent.length === 0 || existingContent.endsWith("\n") ? "" : "\n";
  const additions = renderEnvExampleContent(normalizeEnvVars(envVars));

  return [
    {
      kind: "write",
      path: ".env.example",
      owner: "docs/env",
      content: `${existingContent}${separator}${additions}`,
      overwrite: "if-owned"
    }
  ];
}

export async function applyEnvExamples(
  projectDirectory: string,
  envVars: readonly EnvVarDefinition[]
): Promise<ManifestFileRecord[]> {
  return await applyFilePlan(projectDirectory, buildFilePlan(await planEnvExampleFiles(projectDirectory, envVars)));
}

export function buildExpectedManagedFilePlan(manifest: StackkitManifest): FilePlan {
  const modules = manifest.modules.map((module) => manifestModuleToStackkitModule(module));

  return buildFilePlan(
    renderCreateFiles(
      {
        projectName: manifest.projectName,
        packageManager: manifest.packageManager,
        workspace: "pnpm-turbo",
        modules: manifest.modules.map((module) => module.id),
        registries: {},
        ai: {
          skillTargets: manifest.aiSkills.targets.map((target) => target.agent),
          skillMode: manifest.aiSkills.mode,
          linkMode: manifest.aiSkills.linkMode
        }
      },
      modules
    )
  );
}

export function manifestModuleToStackkitModule(module: StackkitManifest["modules"][number]): StackkitModule {
  return defineModule({
    id: module.id,
    version: module.version,
    title: module.id,
    description: module.id
  });
}

function attachSelectedModules(
  plan: Omit<CreatePlan, "selectedModules">,
  selectedModules: readonly StackkitModule[]
): CreatePlan {
  Object.defineProperty(plan, "selectedModules", {
    value: [...selectedModules],
    enumerable: false,
    configurable: false,
    writable: false
  });

  return plan as CreatePlan;
}

export function mergeCreateFileOperations(operations: readonly FileOperation[]): FileOperation[] {
  const operationByPath = new Map<string, FileOperation>();

  for (const operation of operations) {
    const path = normalizeProjectPath(operation.path);
    const existing = operationByPath.get(path);
    const normalized = { ...operation, path };

    if (!existing) {
      operationByPath.set(path, normalized);
      continue;
    }

    if (path.endsWith("package.json")) {
      operationByPath.set(path, mergePackageOperations(existing, normalized));
      continue;
    }

    if (path === ".env.example") {
      operationByPath.set(path, {
        ...normalized,
        content: appendFileContent(existing.content ?? "", normalized.content ?? "")
      });
      continue;
    }

    operationByPath.set(path, normalized);
  }

  return [...operationByPath.values()];
}

async function resolveSkillInstallResult(
  plan: CreatePlan,
  projectDirectory: string,
  options: ApplyCreatePlanOptions
): Promise<ResolveSkillInstallResult> {
  if (plan.aiSkills.mode === "skip") {
    return {
      installed: [],
      planned: [],
      unresolved: []
    };
  }

  if (plan.aiSkills.mode === "plan") {
    return {
      installed: [],
      planned: plan.aiSkills.planned,
      unresolved: plan.aiSkills.unresolved
    };
  }

  if (options.installSkills === false) {
    return {
      installed: plan.aiSkills.resolved.filter((skill) => skill.trust === "official" || skill.trust === "curated"),
      planned: [],
      unresolved: plan.aiSkills.unresolved
    };
  }

  if (plan.skillInstallCommands.length === 0) {
    return {
      installed: [],
      planned: [],
      unresolved: plan.aiSkills.unresolved
    };
  }

  const installResult = await installAiSkills(plan.skillInstallCommands, {
    cwd: projectDirectory,
    runCommand: options.runCommand ?? missingSkillInstallCommandRunner
  });

  return {
    installed: installResult.installed,
    planned: [],
    unresolved: [...plan.aiSkills.unresolved, ...installResult.unresolved]
  };
}

function appendUniqueFileOperations(
  target: FileOperation[],
  seenPaths: Set<string>,
  operations: readonly FileOperation[]
): void {
  for (const operation of operations) {
    const normalizedPath = normalizeProjectPath(operation.path);

    if (seenPaths.has(normalizedPath)) {
      continue;
    }

    seenPaths.add(normalizedPath);
    target.push({ ...operation, path: normalizedPath });
  }
}

function appendSelectedFileOperations(
  target: FileOperation[],
  seenPaths: Set<string>,
  operations: readonly FileOperation[],
  selectedModuleIds: ReadonlySet<string>
): void {
  appendUniqueFileOperations(
    target,
    seenPaths,
    operations.filter((operation) => selectedModuleIds.has(operation.owner))
  );
}
