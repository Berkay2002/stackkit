import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, posix } from "node:path";

import { renderPnpmTurboFoundation } from "@stackkit/templates";
import {
  aiSkillRegistryEntrySchema,
  skillsLockSchema,
  stackkitManifestSchema,
  stackkitModuleSchema,
  stackkitPresetSchema,
  type AiSkillAgent,
  type AiSkillDependency,
  type AiSkillRegistryEntry,
  type AiSkillTarget,
  type AiSkillTrust,
  type EnvVarDefinition,
  type FileOperation,
  type LifecycleHook,
  type ModuleId,
  type ModuleMigration,
  type PackageChange,
  type SkillsLock,
  type StackkitConfig,
  type StackkitManifest,
  type StackkitModule,
  type StackkitPreset,
  type TaskDefinition
} from "@stackkit/schemas";

export type {
  AiSkillDependency,
  AiSkillAgent,
  AiSkillRegistryEntry,
  AiSkillTarget,
  AiSkillTrust,
  EnvVarDefinition,
  LifecycleHook,
  ModuleId,
  ModuleMigration,
  PackageChange,
  StackkitConfig,
  StackkitManifest,
  StackkitModule,
  StackkitPreset,
  TaskDefinition
};

export type AiSkillInstallCommand = {
  command: "npx";
  args: string[];
  target: AiSkillTarget;
  skill: AiSkillDependency;
};

export type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type RunCommand = (
  command: string,
  args: readonly string[],
  options: {
    cwd?: string;
  }
) => Promise<CommandResult>;

export type InstallAiSkillsOptions = {
  cwd?: string;
  runCommand: RunCommand;
};

export type InstallAiSkillsResult = {
  installed: AiSkillDependency[];
  unresolved: AiSkillDependency[];
};

export type CreatePlan = {
  schemaVersion: 1;
  operation: "create";
  dryRun: true;
  projectName: string;
  targetDirectoryName: string;
  filePlan: FilePlan;
  warnings: string[];
  modules: {
    id: string;
    version: string;
  }[];
  selectedModules: StackkitModule[];
  aiSkills: {
    targets: AiSkillTarget[];
    resolved: AiSkillDependency[];
    local: AiSkillDependency[];
    unresolved: AiSkillDependency[];
  };
  skillInstallCommands: AiSkillInstallCommand[];
};

export type CreatePlanInput = {
  config: StackkitConfig;
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
};

export type ResolveAiSkillOptions = {
  officialAllowlist?: readonly string[];
  curatedAllowlist?: readonly string[];
  failedInstalls?: readonly {
    source?: string;
    skill: string;
    causedBy: ModuleId;
    reason: string;
  }[];
};

export type FileOverwritePolicy = "never" | "if-owned" | "always";

export type PlannedFile = {
  path: string;
  owner: string;
  content: string;
  hash: string;
  overwrite: FileOverwritePolicy;
};

export type FilePlan = {
  files: PlannedFile[];
};

export type FileConflict = {
  path: string;
  reason: "exists-unowned" | "modified-owned";
};

export type ManifestFileRecord = {
  path: string;
  owner: string;
  hash: string;
};

export type WriteLocalAiGuidanceInput = {
  targets: readonly AiSkillTarget[];
  local: readonly AiSkillDependency[];
};

type FilePlanOperation = {
  kind: string;
  path?: string;
  owner?: string;
  content?: string;
  overwrite?: string;
};

const defaultOfficialSkillSources = [
  "https://github.com/shadcn/ui",
  "https://github.com/fastapi/fastapi",
  "https://github.com/vercel-labs/agent-skills",
  "https://github.com/supabase/agent-skills",
  "https://github.com/neondatabase/agent-skills",
  "https://github.com/planetscale/database-skills",
  "https://github.com/clerk/skills",
  "https://github.com/better-auth/skills",
  "https://github.com/auth0/agent-skills"
] as const;

const aiSkillTargetByAgent: Record<AiSkillAgent, AiSkillTarget> = {
  codex: {
    agent: "codex",
    directory: ".agents",
    enabled: true
  },
  "claude-code": {
    agent: "claude-code",
    directory: ".claude",
    enabled: true
  }
};

export function defineModule(module: StackkitModule): StackkitModule {
  return stackkitModuleSchema.parse(module);
}

export function definePreset(preset: StackkitPreset): StackkitPreset {
  return stackkitPresetSchema.parse(preset);
}

export function defineSkillSource(entry: AiSkillRegistryEntry): AiSkillRegistryEntry {
  return aiSkillRegistryEntrySchema.parse(entry);
}

export function resolveAiSkills(modules: readonly StackkitModule[], options: ResolveAiSkillOptions = {}): AiSkillDependency[] {
  const officialAllowlist = new Set(options.officialAllowlist ?? defaultOfficialSkillSources);
  const curatedAllowlist = new Set(options.curatedAllowlist ?? []);
  const resolved = new Map<string, AiSkillDependency>();

  for (const module of modules) {
    for (const dependency of module.aiSkills ?? []) {
      const accepted = isAcceptedSkillDependency(dependency, officialAllowlist, curatedAllowlist);
      const normalized = accepted ? dependency : markUnresolved(dependency);
      const key = skillDependencyKey(normalized);
      const existing = resolved.get(key);

      if (existing) {
        existing.skills = mergeSkills(existing.skills, normalized.skills);
      } else {
        resolved.set(key, { ...normalized, skills: [...normalized.skills] });
      }
    }
  }

  for (const failedInstall of options.failedInstalls ?? []) {
    const unresolved: AiSkillDependency = {
      source: failedInstall.source,
      skills: [failedInstall.skill],
      trust: "unresolved",
      causedBy: failedInstall.causedBy,
      reason: failedInstall.reason
    };
    resolved.set(skillDependencyKey(unresolved), unresolved);
  }

  return [...resolved.values()];
}

export function resolveAiSkillTargets(agents: readonly AiSkillAgent[] = ["codex"]): AiSkillTarget[] {
  return [...new Set(agents)].map((agent) => aiSkillTargetByAgent[agent]);
}

export function planAiSkillInstallCommands(
  skills: readonly AiSkillDependency[],
  targets: readonly AiSkillTarget[] = resolveAiSkillTargets()
): AiSkillInstallCommand[] {
  const commands: AiSkillInstallCommand[] = [];

  for (const skill of skills) {
    if (!skill.source || skill.trust === "local" || skill.trust === "unresolved") {
      continue;
    }

    for (const target of targets) {
      if (!target.enabled) {
        continue;
      }

      commands.push({
        command: "npx",
        args: ["-y", "skills", "add", skill.source, "--skill", ...skill.skills, "--agent", target.agent, "-y", "--copy"],
        target,
        skill
      });
    }
  }

  return commands;
}

export async function installAiSkills(
  commands: readonly AiSkillInstallCommand[],
  options: InstallAiSkillsOptions
): Promise<InstallAiSkillsResult> {
  const installed = new Map<string, AiSkillDependency>();
  const unresolved = new Map<string, AiSkillDependency>();

  for (const installCommand of commands) {
    try {
      const result = await options.runCommand(installCommand.command, installCommand.args, { cwd: options.cwd });

      if (result.exitCode === 0) {
        installed.set(skillDependencyKey(installCommand.skill), installCommand.skill);
        continue;
      }

      const message = normalizeCommandFailureMessage(result);
      const failedSkill = markSkillInstallFailed(installCommand.skill, message);
      unresolved.set(skillDependencyKey(failedSkill), failedSkill);
    } catch (error) {
      const failedSkill = markSkillInstallFailed(
        installCommand.skill,
        error instanceof Error ? error.message : String(error)
      );
      unresolved.set(skillDependencyKey(failedSkill), failedSkill);
    }
  }

  return {
    installed: [...installed.values()],
    unresolved: [...unresolved.values()]
  };
}

export type ResolveModuleGraphOptions = {
  presets?: readonly StackkitPreset[];
  availablePresets?: readonly StackkitPreset[];
  selectedPresets?: readonly string[];
  availableModules?: readonly StackkitModule[];
};

export function resolveModuleGraph(
  modules: readonly StackkitModule[],
  options: ResolveModuleGraphOptions = {}
): StackkitModule[] {
  const expanded = [...expandPresetModules(options), ...modules];
  const unique = dedupeModules(expanded);
  const ordered = orderModulesByRequirements(unique);

  validateModuleRequirements(ordered);
  validateModuleConflicts(ordered);

  return ordered;
}

export function createCreatePlan(input: CreatePlanInput): CreatePlan {
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
  const installCommands = planAiSkillInstallCommands(resolvedSkills, targets);
  const filePlan = buildFilePlan(renderCreateFiles(input.config, modules));

  const plan: Omit<CreatePlan, "selectedModules"> = {
    schemaVersion: 1,
    operation: "create",
    dryRun: true,
    projectName: input.config.projectName,
    targetDirectoryName: normalizeTargetDirectoryName(input.config.projectName),
    filePlan,
    warnings: [],
    modules: modules.map((module) => ({
      id: module.id,
      version: module.version
    })),
    aiSkills: {
      targets,
      resolved: resolvedSkills,
      local: resolvedSkills.filter((skill) => skill.trust === "local"),
      unresolved: resolvedSkills.filter((skill) => skill.trust === "unresolved")
    },
    skillInstallCommands: installCommands
  };

  return attachSelectedModules(plan, modules);
}

export function renderCreateFiles(config: StackkitConfig, modules: readonly StackkitModule[]): FileOperation[] {
  const operations: FileOperation[] = [];
  const seenPaths = new Set<string>();
  const selectedModuleIds = new Set(modules.map((module) => module.id));

  if (selectedModuleIds.has("workspace/pnpm-turbo") || selectedModuleIds.has("workspace/typescript")) {
    appendUniqueFileOperations(
      operations,
      seenPaths,
      renderPnpmTurboFoundation({ projectName: config.projectName }).filter((operation) =>
        selectedModuleIds.has(operation.owner)
      )
    );
  }

  for (const module of modules) {
    appendUniqueFileOperations(operations, seenPaths, module.files ?? []);
  }

  return operations;
}

export async function applyCreatePlan(
  plan: CreatePlan,
  options: ApplyCreatePlanOptions
): Promise<ApplyCreatePlanResult> {
  const projectDirectory = options.targetDirectory ?? join(options.parentDirectory, normalizeTargetDirectoryName(plan.targetDirectoryName));
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
    createdAt: (options.now ?? (() => new Date()))().toISOString(),
    modules: plan.modules.map((module) => ({ ...module, options: {} })),
    files,
    aiSkills: {
      targets: plan.aiSkills.targets,
      installed: skillInstallResult.installed,
      unresolved: skillInstallResult.unresolved
    },
    migrations: {
      applied: []
    }
  });
  await writeSkillsLock(projectDirectory, {
    schemaVersion: 1,
    targets: plan.aiSkills.targets,
    installed: skillInstallResult.installed,
    local: plan.aiSkills.local,
    unresolved: skillInstallResult.unresolved
  });
  await writeLocalAiGuidance(projectDirectory, {
    targets: plan.aiSkills.targets,
    local: plan.aiSkills.local
  });

  return { projectDirectory, manifest };
}

export function createManifest(input: StackkitManifest): StackkitManifest {
  return stackkitManifestSchema.parse(input);
}

export function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function buildFilePlan(operations: readonly FilePlanOperation[]): FilePlan {
  return {
    files: operations
      .filter((operation) => operation.kind === "write")
      .map((operation) => {
        if (!operation.path) {
          throw new Error("Write operation is missing a file path");
        }

        if (!operation.owner) {
          throw new Error(`Write operation is missing an owner for ${operation.path}`);
        }

        const content = operation.content ?? "";

        return {
          path: normalizeProjectPath(operation.path),
          owner: operation.owner,
          content,
          hash: hashContent(content),
          overwrite: normalizeOverwritePolicy(operation.overwrite)
        };
      })
  };
}

export async function detectFileConflicts(
  projectDirectory: string,
  plan: FilePlan,
  ownedFiles: readonly ManifestFileRecord[]
): Promise<FileConflict[]> {
  const ownedFileByPath = new Map(ownedFiles.map((file) => [normalizeProjectPath(file.path), file]));
  const conflicts: FileConflict[] = [];

  for (const rawFile of plan.files) {
    const file = normalizePlannedFile(rawFile);

    if (file.overwrite === "always") {
      continue;
    }

    const existingContent = await readExistingFile(join(projectDirectory, file.path));

    if (existingContent === undefined) {
      continue;
    }

    const ownedFile = ownedFileByPath.get(file.path);

    if (!ownedFile) {
      conflicts.push({ path: file.path, reason: "exists-unowned" });
      continue;
    }

    if (ownedFile.hash !== hashContent(existingContent)) {
      conflicts.push({ path: file.path, reason: "modified-owned" });
    }
  }

  return conflicts;
}

export async function applyFilePlan(projectDirectory: string, plan: FilePlan): Promise<ManifestFileRecord[]> {
  const records: ManifestFileRecord[] = [];

  for (const rawFile of plan.files) {
    const file = normalizePlannedFile(rawFile);
    const targetPath = join(projectDirectory, file.path);

    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, file.content, "utf8");
    records.push({ path: file.path, owner: file.owner, hash: file.hash });
  }

  return records;
}

export async function planPackageChangeFiles(
  projectDirectory: string,
  changes: readonly PackageChange[]
): Promise<FileOperation[]> {
  const packageByPath = new Map<string, Record<string, unknown>>();

  for (const change of changes) {
    const packagePath = normalizeProjectPath(change.packagePath);
    const existingPackage = packageByPath.get(packagePath) ?? (await readPackageJson(join(projectDirectory, packagePath)));
    const nextPackage = mergePackageJson(existingPackage, change);

    packageByPath.set(packagePath, nextPackage);
  }

  return [...packageByPath.entries()].map(([path, pkg]) => ({
    kind: "write",
    path,
    owner: "workspace/pnpm-turbo",
    content: `${JSON.stringify(pkg, null, 2)}\n`,
    overwrite: "if-owned"
  }));
}

export async function applyPackageChanges(
  projectDirectory: string,
  changes: readonly PackageChange[]
): Promise<ManifestFileRecord[]> {
  return await applyFilePlan(projectDirectory, buildFilePlan(await planPackageChangeFiles(projectDirectory, changes)));
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
  const additions = envVars
    .flatMap((envVar) => [`# ${envVar.description}`, `${envVar.name}=${envVar.example ?? ""}`, ""])
    .join("\n");

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

export async function writeManifest(projectDirectory: string, manifest: StackkitManifest): Promise<StackkitManifest> {
  const parsed = createManifest(manifest);
  const stackkitDirectory = join(projectDirectory, ".stackkit");

  await mkdir(stackkitDirectory, { recursive: true });
  await writeFile(join(stackkitDirectory, "project.json"), `${JSON.stringify(parsed, null, 2)}\n`, "utf8");

  return parsed;
}

export async function writeSkillsLock(projectDirectory: string, lock: SkillsLock): Promise<SkillsLock> {
  const parsed = skillsLockSchema.parse(lock);

  await writeFile(join(projectDirectory, "skills-lock.json"), `${JSON.stringify(parsed, null, 2)}\n`, "utf8");

  return parsed;
}

export async function writeLocalAiGuidance(
  projectDirectory: string,
  input: WriteLocalAiGuidanceInput
): Promise<void> {
  const enabledTargets = input.targets.filter((target) => target.enabled);

  for (const skill of input.local) {
    for (const skillName of skill.skills) {
      for (const target of enabledTargets) {
        const skillDirectory = join(projectDirectory, target.directory, "skills", skillName);
        await mkdir(skillDirectory, { recursive: true });
        await writeFile(join(skillDirectory, "SKILL.md"), renderLocalAiGuidance(skillName, skill), "utf8");
      }
    }
  }
}

async function readExistingFile(path: string): Promise<string | undefined> {
  try {
    const fileStat = await stat(path);

    if (!fileStat.isFile()) {
      return "";
    }

    return await readFile(path, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

function normalizeProjectPath(path: string): string {
  if (isAbsolute(path) || /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("/") || path.startsWith("\\")) {
    throw new Error(`File path must be project-relative: ${path}`);
  }

  const normalized = posix.normalize(path.replaceAll("\\", "/"));

  if (normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`File path escapes project directory: ${path}`);
  }

  if (normalized === ".") {
    throw new Error(`File path must not resolve to the project directory: ${path}`);
  }

  return normalized;
}

function normalizeTargetDirectoryName(name: string): string {
  if (
    isAbsolute(name) ||
    /^[a-zA-Z]:[\\/]/.test(name) ||
    name.startsWith("/") ||
    name.startsWith("\\") ||
    name.includes("/") ||
    name.includes("\\")
  ) {
    throw new Error(`Create target directory must be a single relative directory name: ${name}`);
  }

  const normalized = posix.normalize(name);

  if (normalized === "." || normalized === ".." || normalized.startsWith("../") || normalized !== name) {
    throw new Error(`Create target directory must be a single relative directory name: ${name}`);
  }

  return name;
}

function isAcceptedSkillDependency(
  dependency: AiSkillDependency,
  officialAllowlist: ReadonlySet<string>,
  curatedAllowlist: ReadonlySet<string>
): boolean {
  if (dependency.trust === "local" || dependency.trust === "unresolved") {
    return true;
  }

  if (!dependency.source) {
    return false;
  }

  if (dependency.trust === "official") {
    return officialAllowlist.has(dependency.source);
  }

  return curatedAllowlist.has(dependency.source);
}

function markUnresolved(dependency: AiSkillDependency): AiSkillDependency {
  return {
    ...dependency,
    trust: "unresolved"
  };
}

function markSkillInstallFailed(dependency: AiSkillDependency, message: string): AiSkillDependency {
  return {
    ...dependency,
    trust: "unresolved",
    reason: `Skill install failed: ${message}`
  };
}

function skillDependencyKey(dependency: AiSkillDependency): string {
  return `${dependency.trust}:${dependency.source ?? "local"}:${dependency.causedBy}`;
}

function mergeSkills(left: readonly string[], right: readonly string[]): string[] {
  return [...new Set([...left, ...right])];
}

function normalizeCommandFailureMessage(result: CommandResult): string {
  const output = result.stderr.trim() || result.stdout.trim();

  if (output) {
    return output;
  }

  return `exit code ${result.exitCode}`;
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

function joinProjectDirectory(projectDirectory: string, path: string): string {
  if (projectDirectory.includes("/")) {
    return posix.join(projectDirectory.replaceAll("\\", "/"), path.replaceAll("\\", "/"));
  }

  return join(projectDirectory, path);
}

function filePlanToOperations(plan: FilePlan): FileOperation[] {
  return plan.files.map((file) => ({
    kind: "write",
    path: file.path,
    owner: file.owner,
    content: file.content,
    overwrite: file.overwrite
  }));
}

function mergeCreateFileOperations(operations: readonly FileOperation[]): FileOperation[] {
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

function mergePackageOperations(left: FileOperation, right: FileOperation): FileOperation {
  return {
    ...left,
    owner: right.owner,
    content: `${JSON.stringify(mergePackageJson(parsePackageJson(left.content ?? ""), parsePackageJson(right.content ?? "")), null, 2)}\n`,
    overwrite: right.overwrite
  };
}

function appendFileContent(left: string, right: string): string {
  if (left.length === 0) {
    return right;
  }

  if (right.length === 0) {
    return left;
  }

  return `${left}${left.endsWith("\n") ? "" : "\n"}${right}`;
}

async function readPackageJson(path: string): Promise<Record<string, unknown>> {
  const existing = await readExistingFile(path);

  return existing ? parsePackageJson(existing) : {};
}

function parsePackageJson(content: string): Record<string, unknown> {
  if (content.trim().length === 0) {
    return {};
  }

  const parsed: unknown = JSON.parse(content);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }

  return parsed as Record<string, unknown>;
}

function mergePackageJson(
  pkg: Record<string, unknown>,
  change: PackageChange | Record<string, unknown>
): Record<string, unknown> {
  return {
    ...pkg,
    ...pickNonPackageFields(change),
    scripts: mergePackageField(pkg.scripts, change.scripts),
    dependencies: mergePackageField(pkg.dependencies, change.dependencies),
    devDependencies: mergePackageField(pkg.devDependencies, change.devDependencies),
    peerDependencies: mergePackageField(pkg.peerDependencies, change.peerDependencies),
    optionalDependencies: mergePackageField(pkg.optionalDependencies, change.optionalDependencies)
  };
}

function pickNonPackageFields(input: Record<string, unknown>): Record<string, unknown> {
  const { scripts, dependencies, devDependencies, peerDependencies, optionalDependencies, packagePath, ...fields } = input;

  return fields;
}

function mergePackageField(left: unknown, right: unknown): Record<string, string> {
  return {
    ...(isPackageJsonField(left) ? left : {}),
    ...(isPackageJsonField(right) ? right : {})
  };
}

function isPackageJsonField(value: unknown): value is Record<string, string> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).every((fieldValue) => typeof fieldValue === "string")
  );
}

async function resolveSkillInstallResult(
  plan: CreatePlan,
  projectDirectory: string,
  options: ApplyCreatePlanOptions
): Promise<InstallAiSkillsResult> {
  if (options.installSkills === false) {
    return {
      installed: plan.aiSkills.resolved.filter((skill) => skill.trust === "official" || skill.trust === "curated"),
      unresolved: plan.aiSkills.unresolved
    };
  }

  if (plan.skillInstallCommands.length === 0) {
    return {
      installed: [],
      unresolved: plan.aiSkills.unresolved
    };
  }

  const installResult = await installAiSkills(plan.skillInstallCommands, {
    cwd: projectDirectory,
    runCommand: options.runCommand ?? missingSkillInstallCommandRunner
  });

  return {
    installed: installResult.installed,
    unresolved: [...plan.aiSkills.unresolved, ...installResult.unresolved]
  };
}

async function missingSkillInstallCommandRunner(): Promise<CommandResult> {
  return {
    exitCode: 1,
    stdout: "",
    stderr: "No command runner configured for AI skill installation"
  };
}

function renderLocalAiGuidance(skillName: string, skill: AiSkillDependency): string {
  return [
    "---",
    `name: ${skillName}`,
    `description: Local Stackkit guidance for ${skill.causedBy}`,
    "---",
    "",
    `Module: ${skill.causedBy}`,
    "",
    skill.reason,
    ""
  ].join("\n");
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

function expandPresetModules(options: ResolveModuleGraphOptions): StackkitModule[] {
  const selectedPresets = options.selectedPresets ?? [];

  if (selectedPresets.length === 0) {
    return [];
  }

  const presets = options.presets ?? options.availablePresets ?? [];
  const presetById = new Map<string, StackkitPreset>(presets.map((preset) => [preset.id, preset]));
  const moduleById = new Map<string, StackkitModule>((options.availableModules ?? []).map((module) => [module.id, module]));
  const expanded: StackkitModule[] = [];

  for (const presetId of selectedPresets) {
    const preset = presetById.get(presetId);

    if (!preset) {
      throw new Error(`Unknown Stackkit preset: ${presetId}`);
    }

    for (const moduleId of preset.modules) {
      const module = moduleById.get(moduleId);

      if (!module) {
        throw new Error(`Preset ${presetId} references unknown module: ${moduleId}`);
      }

      expanded.push(module);
    }
  }

  return expanded;
}

function dedupeModules(modules: readonly StackkitModule[]): StackkitModule[] {
  const moduleById = new Map<string, StackkitModule>();

  for (const module of modules) {
    moduleById.set(module.id, module);
  }

  return [...moduleById.values()];
}

function orderModulesByRequirements(modules: readonly StackkitModule[]): StackkitModule[] {
  const pending = [...modules];
  const ordered: StackkitModule[] = [];
  const provided = new Set<string>();

  while (pending.length > 0) {
    const index = pending.findIndex((module) =>
      (module.requires ?? []).every((capability: string) => provided.has(capability))
    );

    if (index === -1) {
      ordered.push(...pending);
      break;
    }

    const [module] = pending.splice(index, 1);
    ordered.push(module);

    for (const capability of module.provides ?? []) {
      provided.add(capability);
    }
  }

  return ordered;
}

function validateModuleRequirements(modules: readonly StackkitModule[]): void {
  const provided = new Set<string>();

  for (const module of modules) {
    for (const required of module.requires ?? []) {
      if (!provided.has(required)) {
        throw new Error(`Module ${module.id} requires capability ${required}`);
      }
    }

    for (const capability of module.provides ?? []) {
      provided.add(capability);
    }
  }
}

function validateModuleConflicts(modules: readonly StackkitModule[]): void {
  const selected = new Set(modules.map((module) => module.id));

  for (const module of modules) {
    for (const conflict of module.conflicts ?? []) {
      if (selected.has(conflict)) {
        throw new Error(`Module ${module.id} conflicts with ${conflict}`);
      }
    }
  }
}

function resolveConfiguredModules(config: StackkitConfig, availableModules: readonly StackkitModule[]): StackkitModule[] {
  const moduleById = new Map<string, StackkitModule>(availableModules.map((module) => [module.id, module]));

  return config.modules.map((moduleId: string) => {
    const module = moduleById.get(moduleId);

    if (!module) {
      throw new Error(`Unknown Stackkit module: ${moduleId}`);
    }

    return module;
  });
}

function normalizeOverwritePolicy(overwrite: string | undefined): FileOverwritePolicy {
  if (overwrite === "never" || overwrite === "always") {
    return overwrite;
  }

  return "if-owned";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function normalizePlannedFile(file: PlannedFile): PlannedFile {
  return {
    ...file,
    path: normalizeProjectPath(file.path)
  };
}
