import { readdir } from "node:fs/promises";
import { join } from "node:path";

import {
  renderBiomeConfig,
  renderDatabaseClient,
  renderDockerFiles,
  renderEslintConfig,
  renderFastApiService,
  renderKubernetesFiles,
  renderMypyConfig,
  renderNextjsApp,
  renderPnpmTurboFoundation,
  renderPrettierConfig,
  renderPyrightConfig,
  renderRuffConfig,
  renderShadcnUi,
  renderTanStackStartApp,
  renderVercelFiles,
  renderViteApp
} from "@berkayorhan/stackkit-templates";
import {
  type AiSkillDependency,
  type AiSkillLinkMode,
  type AiSkillMode,
  type AiSkillTarget,
  type EnvVarDefinition,
  type FileOperation,
  type ManifestExpectedFile,
  type NativeInitializer,
  type NativeInitializerArg,
  type NativeInitializerMutationPolicy,
  type NativeInitializerPhase,
  type StackkitConfig,
  type StackkitManifest,
  type StackkitManifestSource,
  type StackkitModule,
  type StackkitPreset,
  stackkitModuleSchema
} from "@berkayorhan/stackkit-schemas";

import {
  hashContent,
  isNodeError,
  normalizeProjectPath,
  normalizeTargetDirectoryName,
  readExistingFile
} from "./fs-utils.js";
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
  planPackageChangeFiles,
  renderPackageChangeFiles
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
  nativeInitializers: PlannedNativeInitializer[];
};

export type PlannedNativeInitializer = {
  moduleId: string;
  name: string;
  phase: NativeInitializerPhase;
  command: string;
  args: string[];
  cwd: string;
  mutationPolicy: NativeInitializerMutationPolicy;
  expectedFiles: string[];
  redactExpectedFiles: string[];
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
  const nativeInitializers = planNativeInitializers({
    config: input.config,
    modules,
    projectName,
    targetDirectoryName: normalizeTargetDirectoryName(projectName)
  });

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
    skillInstallCommands: installCommands,
    nativeInitializers
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

  // Tool choice is recorded as module identity; derive the active tool from the selected module ids so
  // the diff engine (which replays renderCreateFiles from manifest module ids) stays consistent.
  const tsTooling = selectedModuleIds.has("quality/biome") ? "biome" : "eslint-prettier";
  const pyTypecheck = selectedModuleIds.has("quality/pyright") ? "pyright" : "mypy";

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
        workspaceFile: packageManager.workspaceFile,
        tsTooling
      }).filter((operation) => selectedModuleIds.has(operation.owner))
    );
  }

  const hasShadcn = selectedModuleIds.has("ui/shadcn");
  const webFramework: "nextjs" | "vite" | "tanstack-start" | undefined =
    selectedModuleIds.has("web/nextjs") ? "nextjs"
    : selectedModuleIds.has("web/vite") ? "vite"
    : selectedModuleIds.has("web/tanstack-start") ? "tanstack-start"
    : undefined;

  if (hasShadcn) {
    appendSelectedFileOperations(operations, seenPaths, renderShadcnUi({ appName: "web", framework: webFramework ?? "nextjs" }), selectedModuleIds);
  }

  if (selectedModuleIds.has("web/nextjs")) {
    appendSelectedFileOperations(
      operations,
      seenPaths,
      renderNextjsApp({ appName: "web", packageManagerField: packageManager.packageManagerField, tsTooling, withShadcn: hasShadcn }),
      selectedModuleIds
    );
  }

  if (selectedModuleIds.has("web/vite")) {
    appendSelectedFileOperations(
      operations,
      seenPaths,
      renderViteApp({ appName: "web", packageManagerField: packageManager.packageManagerField, withShadcn: hasShadcn }),
      selectedModuleIds
    );
  }

  if (selectedModuleIds.has("web/tanstack-start")) {
    appendSelectedFileOperations(
      operations,
      seenPaths,
      renderTanStackStartApp({ appName: "web", packageManagerField: packageManager.packageManagerField, withShadcn: hasShadcn }),
      selectedModuleIds
    );
  }

  if (selectedModuleIds.has("api/fastapi")) {
    appendSelectedFileOperations(
      operations,
      seenPaths,
      renderFastApiService({ serviceName: "api", projectName: config.projectName, pyTypecheck }),
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

  // Quality Module config files: append every tool's config; appendSelectedFileOperations filters to
  // operations whose owner is a selected module, so unselected tools (e.g. biome when eslint/prettier
  // is chosen) drop out automatically.
  appendSelectedFileOperations(operations, seenPaths, renderEslintConfig(), selectedModuleIds);
  appendSelectedFileOperations(operations, seenPaths, renderPrettierConfig(), selectedModuleIds);
  appendSelectedFileOperations(operations, seenPaths, renderBiomeConfig(), selectedModuleIds);
  appendSelectedFileOperations(operations, seenPaths, renderRuffConfig(), selectedModuleIds);
  appendSelectedFileOperations(operations, seenPaths, renderMypyConfig(), selectedModuleIds);
  appendSelectedFileOperations(operations, seenPaths, renderPyrightConfig(), selectedModuleIds);

  const dbProvider = [...selectedModuleIds].find((id) => id.startsWith("postgres/"));

  if (selectedModuleIds.has("web/nextjs") && selectedModuleIds.has("db/drizzle")) {
    const runtime = config.options?.["db/drizzle"]?.runtime === "edge" ? "edge" : "node";
    appendSelectedFileOperations(
      operations,
      seenPaths,
      renderDatabaseClient({ client: "drizzle", runtime, provider: dbProvider }),
      selectedModuleIds
    );
  }

  if (selectedModuleIds.has("web/nextjs") && selectedModuleIds.has("db/prisma")) {
    appendSelectedFileOperations(
      operations,
      seenPaths,
      renderDatabaseClient({ client: "prisma", runtime: "node", provider: dbProvider }),
      selectedModuleIds
    );
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

  let files = await applyFilePlan(projectDirectory, fullFilePlan, {
    ownedFiles: [],
    conflictLabel: "Create target"
  });
  if (options.runCommand) {
    await runLifecycleHooks(
      plan.selectedModules.flatMap((module) => module.postCreate ?? []),
      { projectDirectory, runCommand: options.runCommand }
    );
    await runNativeInitializers(plan.nativeInitializers, { projectDirectory, runCommand: options.runCommand });
    files = await refreshManagedFileHashes(projectDirectory, files);
    files = mergeManifestFiles(files, await readNativeInitializerManagedFiles(projectDirectory, plan.nativeInitializers));
  }

  const skillInstallResult = await resolveSkillInstallResult(plan, projectDirectory, options);
  const expectedFiles = await readManagedExpectedFiles(projectDirectory, files, plan.nativeInitializers);
  const manifest = await writeManifest(projectDirectory, {
    schemaVersion: 1,
    stackkitVersion: options.stackkitVersion ?? "0.0.0",
    projectName: plan.projectName,
    packageManager: plan.packageManager,
    source: plan.source,
    paths: { root: "." },
    createdAt: (options.now ?? (() => new Date()))().toISOString(),
    modules: plan.selectedModules.map((module) => ({
      id: module.id,
      version: module.version,
      options: {},
      snapshot: snapshotStackkitModule(module)
    })),
    files,
    expectedFiles,
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

async function readManagedExpectedFiles(
  projectDirectory: string,
  files: readonly ManifestFileRecord[],
  nativeInitializers: readonly PlannedNativeInitializer[] = []
): Promise<ManifestExpectedFile[]> {
  const expectedFiles: ManifestExpectedFile[] = [];
  const redactedPaths = new Set(nativeInitializers.flatMap((initializer) => initializer.redactExpectedFiles));

  for (const file of files) {
    if (redactedPaths.has(file.path)) {
      continue;
    }

    const content = await readExistingFile(join(projectDirectory, file.path));

    if (content === undefined) {
      continue;
    }

    expectedFiles.push({
      path: file.path,
      owner: file.owner,
      content,
      hash: hashContent(content)
    });
  }

  return expectedFiles;
}

async function refreshManagedFileHashes(
  projectDirectory: string,
  files: readonly ManifestFileRecord[]
): Promise<ManifestFileRecord[]> {
  const refreshed: ManifestFileRecord[] = [];

  for (const file of files) {
    const content = await readExistingFile(join(projectDirectory, file.path));

    if (content === undefined) {
      continue;
    }

    refreshed.push({
      ...file,
      hash: hashContent(content)
    });
  }

  return refreshed;
}

type PlanNativeInitializersInput = {
  config: StackkitConfig;
  modules: readonly StackkitModule[];
  projectName: string;
  targetDirectoryName: string;
};

function planNativeInitializers(input: PlanNativeInitializersInput): PlannedNativeInitializer[] {
  const selectedModuleIds = new Set(input.modules.map((module) => module.id));
  const capabilities = new Set(input.modules.flatMap((module) => module.provides ?? []));
  const adapter = getPackageManagerAdapter(input.config.packageManager);
  const planned: PlannedNativeInitializer[] = [];

  for (const module of input.modules) {
    for (const initializer of module.nativeInitializers ?? []) {
      if (!initializer.enabled) {
        continue;
      }

      if (!nativeInitializerApplies(initializer, selectedModuleIds, capabilities)) {
        continue;
      }

      const resolvedArgs = resolveNativeInitializerArgs(initializer.args, input, selectedModuleIds);

      if (!resolvedArgs) {
        continue;
      }

      const [command, ...args] =
        initializer.tool.execution === "package-manager-dlx"
          ? adapter.dlxCommand(initializer.tool.package, resolvedArgs)
          : [initializer.tool.command, ...resolvedArgs];

      planned.push({
        moduleId: module.id,
        name: initializer.name,
        phase: initializer.phase,
        command,
        args,
        cwd: normalizeNativeInitializerCwd(initializer.cwd),
        mutationPolicy: initializer.mutationPolicy,
        expectedFiles: initializer.expectedFiles.map(normalizeProjectPath),
        redactExpectedFiles: initializer.redactExpectedFiles.map(normalizeProjectPath)
      });
    }
  }

  return planned;
}

function normalizeNativeInitializerCwd(cwd: string): string {
  if (cwd === ".") {
    return ".";
  }

  return normalizeProjectPath(cwd);
}

function nativeInitializerApplies(
  initializer: NativeInitializer,
  selectedModuleIds: ReadonlySet<string>,
  capabilities: ReadonlySet<string>
): boolean {
  const when = initializer.when;

  if (!when) {
    return true;
  }

  if (when.allModules && !when.allModules.every((moduleId) => selectedModuleIds.has(moduleId))) {
    return false;
  }

  if (when.anyModules && !when.anyModules.some((moduleId) => selectedModuleIds.has(moduleId))) {
    return false;
  }

  if (when.capabilities && !when.capabilities.every((capability) => capabilities.has(capability))) {
    return false;
  }

  return true;
}

function resolveNativeInitializerArgs(
  args: readonly NativeInitializerArg[],
  input: PlanNativeInitializersInput,
  selectedModuleIds: ReadonlySet<string>
): string[] | undefined {
  const resolved: string[] = [];

  for (const arg of args) {
    if (typeof arg === "string") {
      resolved.push(arg);
      continue;
    }

    const value = resolveNativeInitializerToken(arg, input, selectedModuleIds);

    if (value === undefined) {
      return undefined;
    }

    resolved.push(value);
  }

  return resolved;
}

function resolveNativeInitializerToken(
  arg: Exclude<NativeInitializerArg, string>,
  input: PlanNativeInitializersInput,
  selectedModuleIds: ReadonlySet<string>
): string | undefined {
  const raw =
    arg.token === "project-name" ? input.projectName
    : arg.token === "target-directory-name" ? input.targetDirectoryName
    : arg.token === "package-manager" ? input.config.packageManager
    : arg.token === "web-framework" ? selectedWebFramework(selectedModuleIds)
    : undefined;

  if (raw === undefined) {
    return undefined;
  }

  return arg.values?.[raw] ?? raw;
}

function selectedWebFramework(selectedModuleIds: ReadonlySet<string>): "nextjs" | "vite" | "tanstack-start" | undefined {
  if (selectedModuleIds.has("web/nextjs")) {
    return "nextjs";
  }

  if (selectedModuleIds.has("web/vite")) {
    return "vite";
  }

  if (selectedModuleIds.has("web/tanstack-start")) {
    return "tanstack-start";
  }

  return undefined;
}

async function runNativeInitializers(
  initializers: readonly PlannedNativeInitializer[],
  options: {
    projectDirectory: string;
    runCommand: RunCommand;
  }
): Promise<void> {
  for (const initializer of initializers) {
    const cwd = join(options.projectDirectory, initializer.cwd);
    const result = await options.runCommand(initializer.command, initializer.args, { cwd });

    if (result.exitCode !== 0) {
      throw new Error(`Native initializer failed: ${initializer.name}`);
    }
  }
}

async function readNativeInitializerManagedFiles(
  projectDirectory: string,
  initializers: readonly PlannedNativeInitializer[]
): Promise<ManifestFileRecord[]> {
  const records: ManifestFileRecord[] = [];

  for (const initializer of initializers) {
    for (const filePath of initializer.expectedFiles) {
      const content = await readExistingFile(join(projectDirectory, filePath));

      if (content === undefined) {
        continue;
      }

      records.push({
        path: filePath,
        owner: initializer.moduleId,
        hash: hashContent(content)
      });
    }
  }

  return records;
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
  return renderEnvExampleFiles(existingContent, envVars, separator);
}

export async function applyEnvExamples(
  projectDirectory: string,
  envVars: readonly EnvVarDefinition[]
): Promise<ManifestFileRecord[]> {
  return await applyFilePlan(projectDirectory, buildFilePlan(await planEnvExampleFiles(projectDirectory, envVars)));
}

export function buildExpectedManagedFilePlan(manifest: StackkitManifest): FilePlan {
  if ((manifest.expectedFiles ?? []).length > 0) {
    return expectedFilesToFilePlan(manifest.expectedFiles ?? []);
  }

  return buildReconstructedManagedFilePlan(manifest);
}

export function buildReconstructedManagedFilePlan(manifest: StackkitManifest): FilePlan {
  const modules = manifest.modules.map((module) => manifestModuleToStackkitModule(module));
  const config = {
    projectName: manifest.projectName,
    packageManager: manifest.packageManager,
    workspace: "pnpm-turbo" as const,
    modules: manifest.modules.map((module) => module.id),
    registries: {},
    ai: {
      skillTargets: manifest.aiSkills.targets.map((target) => target.agent),
      skillMode: manifest.aiSkills.mode,
      linkMode: manifest.aiSkills.linkMode
    }
  };
  const createOperations = renderCreateFiles(config, modules);
  const packageOperations = renderPackageChangeFiles(modules.flatMap((module) => module.packageChanges ?? []));
  const envOperations = renderEnvExampleFiles("", modules.flatMap((module) => module.envVars ?? []));

  return buildFilePlan(mergeCreateFileOperations([...createOperations, ...packageOperations, ...envOperations]));
}

export function manifestModuleToStackkitModule(module: StackkitManifest["modules"][number]): StackkitModule {
  if (module.snapshot) {
    return module.snapshot;
  }

  return defineModule({
    id: module.id,
    version: module.version,
    title: module.id,
    description: module.id
  });
}

export function filePlanToExpectedFiles(plan: FilePlan): ManifestExpectedFile[] {
  return plan.files.map((file) => ({
    path: file.path,
    owner: file.owner,
    content: file.content,
    hash: file.hash
  }));
}

export function expectedFilesToFilePlan(expectedFiles: readonly ManifestExpectedFile[]): FilePlan {
  return {
    files: expectedFiles.map((file) => ({
      path: normalizeProjectPath(file.path),
      owner: file.owner,
      content: file.content,
      hash: file.hash,
      overwrite: "if-owned"
    }))
  };
}

export function snapshotStackkitModule(module: StackkitModule): StackkitModule {
  return stackkitModuleSchema.parse(JSON.parse(JSON.stringify(module)));
}

export function renderEnvExampleFiles(
  existingContent: string,
  envVars: readonly EnvVarDefinition[],
  separator = existingContent.length === 0 || existingContent.endsWith("\n") ? "" : "\n"
): FileOperation[] {
  if (envVars.length === 0) {
    return [];
  }

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
