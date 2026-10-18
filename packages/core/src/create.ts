import { mkdir, open, readdir, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

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
  type CreateApplyPhase,
  type EnvVarDefinition,
  type FileOperation,
  type ManifestExpectedFile,
  type NativeInitializer,
  type NativeInitializerArg,
  type NativeInitializerMutationPolicy,
  type NativeInitializerPhase,
  type SkippedInitializer,
  type StackkitConfig,
  type StackkitManifest,
  type StackkitManifestSource,
  type StackkitModule,
  type StackkitPreset,
  createApplyPhaseSchema,
  createApplyStateSchema,
  stackkitModuleSchema
} from "@berkayorhan/stackkit-schemas";

export type { CreateApplyPhase } from "@berkayorhan/stackkit-schemas";

import {
  hashContent,
  isNodeError,
  normalizeProjectPath,
  normalizeTargetDirectoryName,
  readExistingFile,
  resolveProjectCwd
} from "./fs-utils.js";
import { getPackageManagerAdapter, type PackageManagerAdapter, type RunCommand } from "./package-manager.js";
import { composeReadme } from "./readme.js";
import { normalizeEnvVars, renderEnvExampleContent } from "./env.js";
import {
  applyFilePlan,
  buildFilePlan,
  mergeManifestFiles,
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
  renderPackageChangeFiles
} from "./package-files.js";
import { runDoctor } from "./doctor.js";
import { defineModule } from "./registry.js";
import { runLifecycleHooks } from "./lifecycle.js";
import { expandExpectedFiles, matchGlob } from "./glob-match.js";

export type CreatePlan = {
  schemaVersion: 1;
  operation: "create";
  dryRun: true;
  planHash: string;
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
  /** Per-module options from the config; persisted into the manifest so lifecycle re-renders match create. */
  options: NonNullable<StackkitConfig["options"]>;
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
  packageName?: string;
  requestedPackage?: string;
  resolvedVersion?: string;
  cwd: string;
  mutationPolicy: NativeInitializerMutationPolicy;
  expectedFiles: string[];
  redactExpectedFiles: string[];
  gated: boolean;
  skipReason?: string;
};

export type CreatePlanInput = {
  config: StackkitConfig;
  source?: StackkitManifestSource;
  availableModules: readonly StackkitModule[];
  availablePresets?: readonly StackkitPreset[];
  curatedSkillSourceAllowlist?: readonly string[];
  allowExternalState?: boolean;
};

export type ApplyCreatePlanOptions = {
  parentDirectory: string;
  targetDirectory?: string;
  stackkitVersion?: string;
  now?: () => Date;
  installSkills?: boolean;
  runCommand?: RunCommand;
  allowExternalState?: boolean;
  resume?: boolean;
  retryInitializers?: boolean;
};

export type ApplyCreatePlanResult = {
  projectDirectory: string;
  manifest: StackkitManifest;
  doctor: import("@berkayorhan/stackkit-schemas").DoctorResult;
};

export type ResolveSkillInstallResult = {
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
  const filePlan = buildCreateFilePlan(input.config, modules);
  const nativeInitializers = planNativeInitializers({
    config: input.config,
    modules,
    projectName,
    targetDirectoryName: normalizeTargetDirectoryName(projectName),
    allowExternalState: input.allowExternalState ?? false
  });

  const planWithoutHash: Omit<CreatePlan, "selectedModules" | "planHash"> = {
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
    options: input.config.options ?? {},
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

  const plan: Omit<CreatePlan, "selectedModules"> = {
    ...planWithoutHash,
    planHash: hashContent(
      JSON.stringify({ ...planWithoutHash, selectedModules: modules.map(snapshotStackkitModule) })
    )
  };

  return attachSelectedModules(plan, modules);
}

export function computeCreatePlanHash(plan: Omit<CreatePlan, "selectedModules"> | CreatePlan): string {
  const { planHash: _planHash, ...planWithoutHash } = plan;
  const selectedModules = "selectedModules" in plan
    ? plan.selectedModules.map(snapshotStackkitModule)
    : [];
  return hashContent(JSON.stringify({ ...planWithoutHash, selectedModules }));
}

function renderStackkitConfig(config: StackkitConfig): FileOperation {
  return {
    kind: "write",
    path: "stackkit.config.json",
    owner: "stackkit/config",
    overwrite: "never",
    content: `${JSON.stringify(
      {
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
      // Reserved non-module owner: the README is always generated, not contributed by docs/readme.
      owner: "stackkit/readme",
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
  const hasSqlAlchemy = selectedModuleIds.has("db/sqlalchemy");
  const hasAuth0Nextjs = selectedModuleIds.has("auth/auth0-nextjs");
  const hasAuth0FastApi = selectedModuleIds.has("auth/auth0-fastapi");
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
      renderNextjsApp({
        appName: "web",
        packageManagerField: packageManager.packageManagerField,
        tsTooling,
        withShadcn: hasShadcn,
        withAuth0: hasAuth0Nextjs,
        withTodoApi: hasAuth0Nextjs && hasAuth0FastApi && hasSqlAlchemy
      }),
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
      renderFastApiService({
        serviceName: "api",
        projectName: config.projectName,
        pyTypecheck,
        withSqlAlchemy: hasSqlAlchemy,
        withAuth0: hasAuth0FastApi
      }),
      selectedModuleIds
    );
  }

  if (selectedModuleIds.has("deploy/vercel")) {
    appendSelectedFileOperations(operations, seenPaths, renderVercelFiles(), selectedModuleIds);
  }

  if (selectedModuleIds.has("deploy/docker")) {
    appendSelectedFileOperations(
      operations,
      seenPaths,
      renderDockerFiles({
        ...toDockerTemplateOptions(packageManager),
        serviceTargets: selectedDockerServiceTargets(selectedModuleIds),
        withPostgres: selectedModuleIds.has("postgres/local"),
        withSqlAlchemy: hasSqlAlchemy,
        withAuth0Web: hasAuth0Nextjs,
        withAuth0Api: hasAuth0FastApi
      }),
      selectedModuleIds
    );
  }

  if (selectedModuleIds.has("deploy/kubernetes")) {
    appendSelectedFileOperations(
      operations,
      seenPaths,
      renderKubernetesFiles({ serviceTargets: selectedDockerServiceTargets(selectedModuleIds) }),
      selectedModuleIds
    );
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

type DockerServiceTarget = "web" | "api";

function selectedDockerServiceTargets(selectedModuleIds: ReadonlySet<string>): DockerServiceTarget[] {
  const targets: DockerServiceTarget[] = [];

  if (selectedModuleIds.has("web/nextjs")) {
    targets.push("web");
  }
  if (selectedModuleIds.has("api/fastapi")) {
    targets.push("api");
  }

  return targets;
}

export async function applyCreatePlan(
  plan: CreatePlan,
  options: ApplyCreatePlanOptions
): Promise<ApplyCreatePlanResult> {
  const projectDirectory = options.targetDirectory ?? join(options.parentDirectory, normalizeTargetDirectoryName(plan.targetDirectoryName));
  const expectedPlanHash = computeCreatePlanHash(plan);
  if (plan.planHash !== expectedPlanHash) {
    throw new Error(`Create plan hash mismatch: expected ${expectedPlanHash}, received ${plan.planHash}.`);
  }

  let state: CreateApplyState;
  if (options.resume) {
    state = await readCreateApplyState(projectDirectory);
    if (state.planHash !== plan.planHash) {
      throw new Error(`Cannot resume create: journal plan hash ${state.planHash} does not match ${plan.planHash}.`);
    }
  } else {
    await assertCreateTargetIsSafe(projectDirectory);
    state = createInitialApplyState(plan, projectDirectory, options.now ?? (() => new Date()));
    await writeCreateApplyState(projectDirectory, state);
  }

  await runCreateApplyPhase(state, "deterministic-files", projectDirectory, options.now, async () => {
    // On resume, files this phase already wrote match their planned hash and are rewritten as owned;
    // anything that differs from the plan still conflicts.
    state.files = await applyFilePlan(projectDirectory, plan.filePlan, {
      ownedFiles: options.resume ? plan.filePlan.files : [],
      conflictLabel: "Create target"
    });
  });

  await runCreateApplyPhase(state, "initializers", projectDirectory, options.now, async () => {
    if (!options.runCommand) {
      return;
    }

    for (const [moduleIndex, module] of plan.selectedModules.entries()) {
      for (const [hookIndex, hook] of (module.postCreate ?? []).entries()) {
        const stepId = `post-create:${moduleIndex}:${hookIndex}:${module.id}:${hook.name}`;
        await runCheckpointedInitializerStep(state, stepId, projectDirectory, options.now, options.retryInitializers ?? false, async () => {
          await runLifecycleHooks([hook], { projectDirectory, runCommand: options.runCommand! });
        });
      }
    }

    for (const [initializerIndex, initializer] of plan.nativeInitializers.entries()) {
      const stepId = `native:${initializerIndex}:${initializer.moduleId}:${initializer.name}`;
      await runCheckpointedInitializerStep(state, stepId, projectDirectory, options.now, options.retryInitializers ?? false, async (progress) => {
        const initializerResult = await runNativeInitializer(initializer, {
          projectDirectory,
          runCommand: options.runCommand!,
          allowExternalState: options.allowExternalState ?? false,
          progress,
          persistProgress: () => writeCreateApplyState(projectDirectory, state, options.now)
        });
        state.files = refreshChangedFileHashes(state.files, initializerResult.changed);
        state.files = mergeManifestFiles(state.files, initializerResult.files);
        state.skippedInitializers = mergeSkippedInitializers(state.skippedInitializers, initializerResult.skipped);
      });
    }
  });

  await runCreateApplyPhase(state, "skills", projectDirectory, options.now, async () => {
    state.skillInstallResult = await resolveSkillInstallResult(plan, projectDirectory, options);
    if (plan.aiSkills.mode !== "skip") {
      await writeSkillsLock(projectDirectory, {
        schemaVersion: 1,
        mode: plan.aiSkills.mode,
        linkMode: plan.aiSkills.linkMode,
        targets: plan.aiSkills.targets,
        installed: state.skillInstallResult.installed,
        planned: state.skillInstallResult.planned,
        local: plan.aiSkills.local,
        unresolved: state.skillInstallResult.unresolved
      });
      await writeLocalAiGuidance(projectDirectory, {
        targets: plan.aiSkills.targets,
        local: plan.aiSkills.local
      });
    }
  });

  await runCreateApplyPhase(state, "manifest", projectDirectory, options.now, async () => {
    const skillInstallResult = state.skillInstallResult ?? emptySkillInstallResult(plan);
    const expectedFiles = await readManagedExpectedFiles(projectDirectory, state.files, plan.filePlan, plan.nativeInitializers);
    state.manifest = await writeManifest(projectDirectory, {
      schemaVersion: 1,
      stackkitVersion: options.stackkitVersion ?? "0.0.0",
      projectName: plan.projectName,
      packageManager: plan.packageManager,
      source: plan.source,
      paths: { root: "." },
      createdAt: state.startedAt,
      planHash: plan.planHash,
      modules: plan.selectedModules.map((module) => ({
        id: module.id,
        version: module.version,
        options: plan.options?.[module.id] ?? {},
        snapshot: snapshotStackkitModule(module)
      })),
      files: state.files,
      expectedFiles,
      skippedInitializers: state.skippedInitializers,
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
  });

  await runCreateApplyPhase(state, "verification", projectDirectory, options.now, async () => {
    // Runtime validations (typecheck, compose config) need installed dependencies, which create does not
    // install, so verification covers files, manifest, and skills only. `stackkit doctor` runs the rest.
    state.doctor = await runDoctor(projectDirectory, { modules: plan.selectedModules, skipRuntimeValidations: true });
  });

  if (!state.manifest || !state.doctor) {
    throw new Error("Create journal is incomplete after apply.");
  }

  // Every phase completed: the journal (full plan plus absolute local path) is no longer needed.
  await rm(createApplyStatePath(projectDirectory), { force: true });

  return { projectDirectory, manifest: state.manifest, doctor: state.doctor };
}

export async function resumeCreatePlan(options: ResumeCreatePlanOptions): Promise<ApplyCreatePlanResult> {
  const { availableModules, ...applyOptions } = options;
  const state = await readCreateApplyState(options.projectDirectory);
  const selectedModules = state.selectedModules.map((module) => stackkitModuleSchema.parse(module));
  const trustedModules = new Map(availableModules.map((module) => [module.id, module]));
  const untrusted = selectedModules.filter((module) => {
    const trusted = trustedModules.get(module.id);
    return !trusted || !isDeepStrictEqual(snapshotStackkitModule(trusted), module);
  });

  // The journal is project data: its hooks and validations only run when they match the installed registry.
  if (untrusted.length > 0) {
    throw new Error(
      `Cannot resume create: journal modules do not match the installed Stackkit registry: ${untrusted.map((module) => module.id).join(", ")}. ` +
      "Resume with the Stackkit version that started this create, or start over in an empty directory."
    );
  }

  const plan = attachSelectedModules(state.plan, selectedModules);

  return await applyCreatePlan(plan, {
    ...applyOptions,
    parentDirectory: options.projectDirectory,
    targetDirectory: options.projectDirectory,
    resume: true
  });
}

function createApplyStatePath(projectDirectory: string): string {
  return join(projectDirectory, ".stackkit", "apply-state.json");
}

export async function readCreateApplyState(projectDirectory: string): Promise<CreateApplyState> {
  const path = createApplyStatePath(projectDirectory);
  const content = await readExistingFile(path);
  if (content === undefined) {
    throw new Error(`Cannot resume create: ${path} is missing.`);
  }

  const state = createApplyStateSchema.parse(JSON.parse(content)) as unknown as CreateApplyState;
  state.initializerProgress ??= {};
  if (state.schemaVersion !== 1 || state.operation !== "create" || !state.plan || !state.planHash) {
    throw new Error(`Cannot resume create: ${path} is not a valid create journal.`);
  }
  if (!isSameDirectory(state.projectDirectory, projectDirectory)) {
    throw new Error(`Cannot resume create: journal target is ${state.projectDirectory}, not ${projectDirectory}.`);
  }
  state.selectedModules = state.selectedModules.map((module) => stackkitModuleSchema.parse(module));
  const hydratedPlan = attachSelectedModules({ ...state.plan }, state.selectedModules);
  if (state.plan.planHash !== state.planHash || computeCreatePlanHash(hydratedPlan) !== state.planHash) {
    throw new Error("Cannot resume create: journal plan hash is invalid.");
  }
  return state;
}

function isSameDirectory(left: string, right: string): boolean {
  const normalize = (path: string) => (process.platform === "win32" ? resolve(path).toLowerCase() : resolve(path));
  return normalize(left) === normalize(right);
}

function createInitialApplyState(plan: CreatePlan, projectDirectory: string, now: () => Date): CreateApplyState {
  const timestamp = now().toISOString();
  const phases = Object.fromEntries(
    createApplyPhases.map((phase) => [phase, { status: "pending" as const }])
  ) as CreateApplyState["phases"];
  phases.planned = { status: "completed", completedAt: timestamp };
  const { selectedModules: _selectedModules, ...serializedPlan } = plan;

  return {
    schemaVersion: 1,
    operation: "create",
    planHash: plan.planHash,
    projectDirectory,
    startedAt: timestamp,
    updatedAt: timestamp,
    plan: JSON.parse(JSON.stringify(serializedPlan)) as Omit<CreatePlan, "selectedModules">,
    selectedModules: plan.selectedModules.map(snapshotStackkitModule),
    phases,
    files: [],
    skippedInitializers: [],
    initializerProgress: {}
  };
}

async function runCheckpointedInitializerStep(
  state: CreateApplyState,
  stepId: string,
  projectDirectory: string,
  now: (() => Date) | undefined,
  retryInitializers: boolean,
  run: (progress: InitializerProgress) => Promise<void>
): Promise<void> {
  const existing = state.initializerProgress[stepId];
  if (existing?.status === "completed") {
    return;
  }
  if (existing && !retryInitializers) {
    throw new Error(
      `Cannot safely retry initializer step ${stepId} after status ${existing.status}. ` +
      "Inspect partial output, then re-run create --resume with --retry-initializers."
    );
  }

  const progress: InitializerProgress = { status: "running", before: existing?.before };
  state.initializerProgress[stepId] = progress;
  await writeCreateApplyState(projectDirectory, state, now);

  try {
    await run(progress);
    state.initializerProgress[stepId] = {
      status: "completed",
      completedAt: (now ?? (() => new Date()))().toISOString()
    };
    await writeCreateApplyState(projectDirectory, state, now);
  } catch (error) {
    state.initializerProgress[stepId] = { status: "failed", error: errorMessage(error), before: progress.before };
    await writeCreateApplyState(projectDirectory, state, now);
    throw error;
  }
}

function mergeSkippedInitializers(
  current: readonly SkippedInitializer[],
  additions: readonly SkippedInitializer[]
): SkippedInitializer[] {
  const entries = new Map(current.map((entry) => [`${entry.moduleId}:${entry.name}`, entry]));
  for (const entry of additions) {
    entries.set(`${entry.moduleId}:${entry.name}`, entry);
  }
  return [...entries.values()];
}

async function runCreateApplyPhase(
  state: CreateApplyState,
  phase: CreateApplyPhase,
  projectDirectory: string,
  now: (() => Date) | undefined,
  apply: () => Promise<void>
): Promise<void> {
  if (state.phases[phase].status === "completed") {
    return;
  }

  state.phases[phase] = { status: "running" };
  await writeCreateApplyState(projectDirectory, state, now);

  try {
    await apply();
    const completedAt = (now ?? (() => new Date()))().toISOString();
    state.phases[phase] = { status: "completed", completedAt };
    await writeCreateApplyState(projectDirectory, state, now);
  } catch (error) {
    state.phases[phase] = { status: "failed", error: errorMessage(error) };
    await writeCreateApplyState(projectDirectory, state, now);
    throw error;
  }
}

async function writeCreateApplyState(
  projectDirectory: string,
  state: CreateApplyState,
  now: (() => Date) | undefined = undefined
): Promise<void> {
  const journalPath = createApplyStatePath(projectDirectory);
  await mkdir(dirname(journalPath), { recursive: true });
  state.updatedAt = (now ?? (() => new Date()))().toISOString();
  const temporaryPath = `${journalPath}.${process.pid}.${Date.now()}.tmp`;
  const handle = await open(temporaryPath, "wx");
  try {
    await handle.writeFile(`${JSON.stringify(state, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporaryPath, journalPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

function emptySkillInstallResult(plan: CreatePlan): ResolveSkillInstallResult {
  return {
    installed: [],
    planned: plan.aiSkills.planned,
    unresolved: plan.aiSkills.unresolved
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readManagedExpectedFiles(
  projectDirectory: string,
  files: readonly ManifestFileRecord[],
  filePlan: FilePlan,
  nativeInitializers: readonly PlannedNativeInitializer[] = []
): Promise<ManifestExpectedFile[]> {
  const expectedFiles: ManifestExpectedFile[] = [];
  const redactedPatterns = nativeInitializers.flatMap((initializer) => initializer.redactExpectedFiles);
  const plannedByPath = new Map(filePlan.files.map((file) => [file.path, file]));

  for (const file of files) {
    if (redactedPatterns.some((pattern) => matchGlob(file.path, pattern))) {
      continue;
    }

    // Record what Stackkit produced, not later edits: disk content only when it still matches the
    // recorded hash (e.g. a user edit made before --resume), otherwise the planned content.
    const onDisk = await readExistingFile(join(projectDirectory, file.path));
    const planned = plannedByPath.get(file.path);
    const content = onDisk !== undefined && hashContent(onDisk) === file.hash
      ? onDisk
      : planned?.hash === file.hash ? planned.content : undefined;

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

/** Apply an initializer's own changes to managed records (undefined hash = deleted); other drift stays drift. */
function refreshChangedFileHashes(
  files: readonly ManifestFileRecord[],
  changed: ReadonlyMap<string, string | undefined>
): ManifestFileRecord[] {
  return files.flatMap((file) => {
    if (!changed.has(file.path)) {
      return [file];
    }

    const hash = changed.get(file.path);
    return hash === undefined ? [] : [{ ...file, hash }];
  });
}

type PlanNativeInitializersInput = {
  config: StackkitConfig;
  modules: readonly StackkitModule[];
  projectName: string;
  targetDirectoryName: string;
  allowExternalState: boolean;
};

export const createApplyPhases = createApplyPhaseSchema.options;

export type CreateApplyState = {
  schemaVersion: 1;
  operation: "create";
  planHash: string;
  projectDirectory: string;
  startedAt: string;
  updatedAt: string;
  plan: Omit<CreatePlan, "selectedModules">;
  selectedModules: StackkitModule[];
  phases: Record<
    CreateApplyPhase,
    {
      status: "pending" | "running" | "completed" | "failed";
      completedAt?: string;
      error?: string;
    }
  >;
  files: ManifestFileRecord[];
  skippedInitializers: SkippedInitializer[];
  initializerProgress: Record<string, InitializerProgress>;
  skillInstallResult?: ResolveSkillInstallResult;
  manifest?: StackkitManifest;
  doctor?: import("@berkayorhan/stackkit-schemas").DoctorResult;
};

type InitializerProgress = {
  status: "running" | "completed" | "failed";
  completedAt?: string;
  error?: string;
  /** Project file hashes captured before the first attempt, so a retry still claims partial output. */
  before?: Record<string, string>;
};

export type ResumeCreatePlanOptions = Omit<ApplyCreatePlanOptions, "parentDirectory" | "targetDirectory" | "resume"> & {
  projectDirectory: string;
  /** Trusted module definitions (the installed registry) the journal's modules must match. */
  availableModules: readonly StackkitModule[];
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

      const gating = nativeInitializerGating(initializer.mutationPolicy, input.allowExternalState);
      const packageResolution = initializer.tool.execution === "package-manager-dlx"
        ? parseInitializerPackage(initializer.tool.package)
        : {};

      planned.push({
        moduleId: module.id,
        name: initializer.name,
        phase: initializer.phase,
        command,
        args,
        ...packageResolution,
        cwd: normalizeNativeInitializerCwd(initializer.cwd),
        mutationPolicy: initializer.mutationPolicy,
        expectedFiles: initializer.expectedFiles.map(normalizeProjectPath),
        redactExpectedFiles: initializer.redactExpectedFiles.map(normalizeProjectPath),
        gated: gating.gated,
        skipReason: gating.reason
      });
    }
  }

  return planned;
}

function parseInitializerPackage(requestedPackage: string): {
  packageName: string;
  requestedPackage: string;
  resolvedVersion?: string;
} {
  const separator = requestedPackage.lastIndexOf("@");
  const hasVersion = separator > 0;
  return {
    packageName: hasVersion ? requestedPackage.slice(0, separator) : requestedPackage,
    requestedPackage,
    resolvedVersion: hasVersion ? requestedPackage.slice(separator + 1) : undefined
  };
}

function nativeInitializerGating(
  mutationPolicy: NativeInitializerMutationPolicy,
  allowExternalState: boolean
): { gated: boolean; reason?: string } {
  if (mutationPolicy === "external-state" && !allowExternalState) {
    return { gated: true, reason: "Requires --allow-external-state" };
  }

  return { gated: false };
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

// Never claimed by an initializer: VCS, Stackkit metadata, dependency/build/cache output, and
// package-manager lockfiles (they change on every install and belong to the user).
const NATIVE_INITIALIZER_IGNORED_DIRECTORIES = new Set([
  ".git",
  ".stackkit",
  "node_modules",
  ".turbo",
  ".next",
  ".venv",
  "__pycache__",
  "dist",
  "target"
]);
const NATIVE_INITIALIZER_IGNORED_FILES = new Set([
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "uv.lock",
  "Cargo.lock"
]);

/**
 * Snapshot every source file under the project (hash by relative path), skipping VCS,
 * dependency, build-output, lockfile, and Stackkit-metadata paths. Used to diff the working tree around a
 * native initializer run so Stackkit can take ownership of whatever the tool actually wrote
 * rather than trusting a hand-maintained list of expected files.
 */
async function captureProjectFileSnapshot(projectDirectory: string): Promise<Map<string, string>> {
  const snapshot = new Map<string, string>();

  async function walk(relativeDirectory: string): Promise<void> {
    let entries;

    try {
      entries = await readdir(join(projectDirectory, relativeDirectory), { withFileTypes: true });
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return;
      }

      throw error;
    }

    for (const entry of entries) {
      const childRelative = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        if (NATIVE_INITIALIZER_IGNORED_DIRECTORIES.has(entry.name)) {
          continue;
        }

        await walk(childRelative);
        continue;
      }

      if (!entry.isFile() || NATIVE_INITIALIZER_IGNORED_FILES.has(entry.name)) {
        continue;
      }

      const content = await readExistingFile(join(projectDirectory, childRelative));

      if (content !== undefined) {
        snapshot.set(normalizeProjectPath(childRelative), hashContent(content));
      }
    }
  }

  await walk("");
  return snapshot;
}

/**
 * Run one native initializer and record what it actually did. The working tree is diffed before and
 * after the run: new paths (minus redactions) are claimed, and `changed` lists every path whose
 * content the run itself changed. New paths are measured against the snapshot taken before the
 * first attempt, so a retry still claims output a failed attempt left behind.
 */
async function runNativeInitializer(
  initializer: PlannedNativeInitializer,
  options: {
    projectDirectory: string;
    runCommand: RunCommand;
    allowExternalState: boolean;
    progress: InitializerProgress;
    persistProgress: () => Promise<void>;
  }
): Promise<{ files: ManifestFileRecord[]; changed: Map<string, string | undefined>; skipped: SkippedInitializer[] }> {
  const gating = nativeInitializerGating(initializer.mutationPolicy, options.allowExternalState);
  if (initializer.gated || gating.gated) {
    return {
      files: [],
      changed: new Map(),
      skipped: [{
        name: initializer.name,
        moduleId: initializer.moduleId,
        mutationPolicy: initializer.mutationPolicy,
        reason: initializer.skipReason ?? gating.reason ?? "Skipped"
      }]
    };
  }

  const before = await captureProjectFileSnapshot(options.projectDirectory);
  if (!options.progress.before) {
    options.progress.before = Object.fromEntries(before);
    await options.persistProgress();
  }
  const firstAttemptBefore = new Map(Object.entries(options.progress.before));

  const cwd = resolveProjectCwd(options.projectDirectory, initializer.cwd);
  const result = await options.runCommand(initializer.command, initializer.args, { cwd });

  if (result.exitCode !== 0) {
    throw new Error(`Native initializer failed: ${initializer.name}`);
  }

  const after = await captureProjectFileSnapshot(options.projectDirectory);
  const redacted = expandExpectedFiles(initializer.redactExpectedFiles, after.keys());
  const files: ManifestFileRecord[] = [];
  const changed = new Map<string, string | undefined>();

  for (const [path, hash] of after) {
    if (before.get(path) !== hash) {
      changed.set(path, hash);
    }
    if (!firstAttemptBefore.has(path) && !redacted.includes(path)) {
      files.push({ path, owner: initializer.moduleId, hash });
    }
  }
  for (const path of before.keys()) {
    if (!after.has(path)) {
      changed.set(path, undefined);
    }
  }

  return { files, changed, skipped: [] };
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
      const hasJournal = (await readExistingFile(join(projectDirectory, ".stackkit", "apply-state.json"))) !== undefined;
      throw new Error(
        `Refusing to create in non-empty directory: ${projectDirectory}` +
        (hasJournal ? `. It holds an interrupted create; continue it with stackkit create --resume --dir ${projectDirectory}` : "")
      );
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

  return renderEnvExampleFiles((await readExistingFile(join(projectDirectory, ".env.example"))) ?? "", envVars);
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
  return buildCreateFilePlan(manifestToConfig(manifest), manifest.modules.map(manifestModuleToStackkitModule));
}

/** The config a manifest was rendered from, as far as the manifest records it (module ids and options). */
export function manifestToConfig(manifest: StackkitManifest): StackkitConfig {
  return {
    projectName: manifest.projectName,
    packageManager: manifest.packageManager,
    workspace: "pnpm-turbo",
    modules: manifest.modules.map((module) => module.id),
    registries: {},
    options: Object.fromEntries(
      manifest.modules.filter((module) => Object.keys(module.options).length > 0).map((module) => [module.id, module.options])
    ),
    ai: {
      skillTargets: manifest.aiSkills.targets.map((target) => target.agent),
      skillMode: manifest.aiSkills.mode,
      linkMode: manifest.aiSkills.linkMode
    }
  };
}

export function buildCreateFilePlan(config: StackkitConfig, modules: readonly StackkitModule[]): FilePlan {
  const createOperations = renderCreateFiles(config, modules);
  const packageOperations = renderPackageChangeFiles(modules);
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

/** Append env var declarations to `.env.example`, skipping keys the existing content already declares. */
export function renderEnvExampleFiles(existingContent: string, envVars: readonly EnvVarDefinition[]): FileOperation[] {
  const existingKeys = new Set(
    existingContent.split(/\r?\n/).flatMap((line) => /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)?.[1] ?? [])
  );
  const additions = normalizeEnvVars(envVars).filter((envVar) => !existingKeys.has(envVar.name));

  if (additions.length === 0) {
    return [];
  }

  return [
    {
      kind: "write",
      path: ".env.example",
      // Reserved non-module owner: .env.example is always generated, not contributed by docs/env.
      owner: "stackkit/env",
      content: appendFileContent(existingContent, renderEnvExampleContent(additions)),
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
