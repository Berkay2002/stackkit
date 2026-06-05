import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, posix } from "node:path";

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
  aiSkillRegistryEntrySchema,
  envVarDefinitionSchema,
  projectSlugSchema,
  skillsLockSchema,
  stackkitConfigSchema,
  stackkitManifestSchema,
  stackkitModuleSchema,
  stackkitPresetSchema,
  stackkitRegistrySchema,
  stackkitRecipeSchema,
  type AiSkillAgent,
  type AiSkillDependency,
  type AiSkillRegistryEntry,
  type AiSkillLinkMode,
  type AiSkillMode,
  type AiSkillTarget,
  type AiSkillTrust,
  type DoctorCheck,
  type DoctorResult,
  type EnvVarDefinition,
  type FileOperation,
  type LifecycleHook,
  type ModuleId,
  type ModuleMigration,
  type PackageChange,
  type PackageManager,
  type ReadmeMetadata,
  type SkillsLock,
  type StackkitConfig,
  type StackkitManifest,
  type StackkitManifestSource,
  type StackkitModule,
  type StackkitModuleInput,
  type StackkitPreset,
  type StackkitPresetInput,
  type StackkitRegistry,
  type StackkitRecipe,
  type StackkitRecipeInput,
  type TaskDefinition
} from "@berkayorhan/stackkit-schemas";

export type {
  AiSkillDependency,
  AiSkillAgent,
  AiSkillRegistryEntry,
  AiSkillLinkMode,
  AiSkillMode,
  AiSkillTarget,
  AiSkillTrust,
  DoctorCheck,
  DoctorResult,
  EnvVarDefinition,
  LifecycleHook,
  ModuleId,
  ModuleMigration,
  PackageChange,
  PackageManager,
  ReadmeMetadata,
  StackkitConfig,
  StackkitManifest,
  StackkitManifestSource,
  StackkitModule,
  StackkitModuleInput,
  StackkitPreset,
  StackkitPresetInput,
  StackkitRegistry,
  StackkitRecipe,
  StackkitRecipeInput,
  TaskDefinition
};

export type AiSkillInstallCommand = {
  command: "npx";
  args: string[];
  target: AiSkillTarget;
  skill: AiSkillDependency;
};

export type PackageManagerName = PackageManager;

export type PackageManagerAdapter = {
  name: PackageManagerName;
  lockfile: string;
  workspaceFile?: string;
  packageManagerField: string;
  installCommand: string[];
  runCommand: (script: string) => string[];
  addCommand: (packages: readonly string[]) => string[];
  dlxCommand: (packageName: string, args: readonly string[]) => string[];
};

export type ComposeReadmeInput = {
  projectName: string;
  packageManager: PackageManagerName;
  modules: readonly StackkitModule[];
};

type ReadmeCommand = {
  label: string;
  command: string;
};

type ReadmeLayoutEntry = {
  path: string;
  description: string;
};

type NormalizedEnvVar = {
  name: string;
  description: string;
  required: boolean;
  example?: string;
  target: "root" | "web" | "api" | "db";
};

const envTargets = ["root", "web", "api", "db"] as const;

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

type ResolveSkillInstallResult = InstallAiSkillsResult & {
  planned: AiSkillDependency[];
};

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
  doctor: DoctorResult;
};

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

export type StackkitInfo = {
  project: {
    name: string;
    packageManager: PackageManagerName;
    stackkitVersion: string;
  };
  source:
    | {
        kind: StackkitManifestSource["kind"];
        path?: string;
        preset?: string;
        recipeCode?: string;
      }
    | null;
  modules: {
    id: string;
    title?: string;
    version: string;
  }[];
  paths: Record<string, string>;
  ai: {
    targets: string[];
    installed: number;
    local: number;
    unresolved: number;
  };
};

export type FileDiffPart = {
  kind: "same" | "added" | "removed";
  value: string;
};

export type FileContentDiff = {
  parts: FileDiffPart[];
};

export type ManagedFileDiff = {
  path: string;
  owner: string;
  expectedHash: string;
  currentHash: string | undefined;
  expectedContent: string;
  currentContent: string | undefined;
  diff: FileContentDiff;
};

export type ModuleDiscoveryEntry = {
  id: string;
  version: string;
  title: string;
  description: string;
  aliases: string[];
  category?: string;
};

export type CustomizerCatalogChoice = {
  id: string;
  alias: string;
  title: string;
  description: string;
  icon?: string;
};

export type CustomizerCatalog = {
  presets: {
    id: string;
    title: string;
    description: string;
    modules: string[];
  }[];
  categories: Record<string, CustomizerCatalogChoice[]>;
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

const packageManagers: Record<PackageManagerName, PackageManagerAdapter> = {
  pnpm: {
    name: "pnpm",
    lockfile: "pnpm-lock.yaml",
    workspaceFile: "pnpm-workspace.yaml",
    packageManagerField: "pnpm@10.5.1",
    installCommand: ["pnpm", "install"],
    runCommand: (script) => ["pnpm", script],
    addCommand: (packages) => ["pnpm", "add", ...packages],
    dlxCommand: (packageName, args) => ["pnpm", "dlx", packageName, ...args]
  },
  npm: {
    name: "npm",
    lockfile: "package-lock.json",
    packageManagerField: "npm@11.5.2",
    installCommand: ["npm", "install"],
    runCommand: (script) => ["npm", "run", script],
    addCommand: (packages) => ["npm", "install", ...packages],
    dlxCommand: (packageName, args) => ["npx", "-y", packageName, ...args]
  },
  yarn: {
    name: "yarn",
    lockfile: "yarn.lock",
    packageManagerField: "yarn@4.9.4",
    installCommand: ["yarn", "install"],
    runCommand: (script) => ["yarn", script],
    addCommand: (packages) => ["yarn", "add", ...packages],
    dlxCommand: (packageName, args) => ["yarn", "dlx", packageName, ...args]
  },
  bun: {
    name: "bun",
    lockfile: "bun.lock",
    packageManagerField: "bun@1.2.15",
    installCommand: ["bun", "install"],
    runCommand: (script) => ["bun", "run", script],
    addCommand: (packages) => ["bun", "add", ...packages],
    dlxCommand: (packageName, args) => ["bunx", packageName, ...args]
  }
};

export function defineModule(module: StackkitModuleInput): StackkitModule {
  return stackkitModuleSchema.parse(module);
}

export function definePreset(preset: StackkitPresetInput): StackkitPreset {
  return stackkitPresetSchema.parse(preset);
}

export function buildCustomizerCatalog(input: {
  modules: readonly StackkitModule[];
  presets: readonly StackkitPreset[];
}): CustomizerCatalog {
  const categories: Record<string, CustomizerCatalogChoice[]> = {};

  for (const module of input.modules) {
    const category = module.category ?? "other";
    const choice: CustomizerCatalogChoice = {
      id: module.id,
      alias: module.aliases[0] ?? module.id,
      title: module.title,
      description: module.description
    };

    if (module.icon) {
      choice.icon = module.icon;
    }

    categories[category] ??= [];
    categories[category].push(choice);
  }

  for (const choices of Object.values(categories)) {
    choices.sort(compareCatalogChoices);
  }

  return {
    presets: input.presets
      .map((preset) => ({
        id: preset.id,
        title: preset.title,
        description: preset.description,
        modules: [...preset.modules]
      }))
      .sort((left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id)),
    categories: Object.fromEntries(Object.entries(categories).sort(([left], [right]) => left.localeCompare(right)))
  };
}

export function defineSkillSource(entry: AiSkillRegistryEntry): AiSkillRegistryEntry {
  return aiSkillRegistryEntrySchema.parse(entry);
}

function compareCatalogChoices(left: CustomizerCatalogChoice, right: CustomizerCatalogChoice): number {
  return left.title.localeCompare(right.title) || left.id.localeCompare(right.id);
}

export async function loadProjectRegistries(
  projectDirectory: string,
  registries: Record<string, string>
): Promise<StackkitRegistry[]> {
  const loaded: StackkitRegistry[] = [];

  for (const [namespace, location] of Object.entries(registries)) {
    if (/^https?:\/\//i.test(location)) {
      throw new Error(`Remote registries are not supported yet: ${namespace}`);
    }

    const fullPath = join(projectDirectory, normalizeProjectPath(location));
    const parsed = stackkitRegistrySchema.parse(JSON.parse(await readFile(fullPath, "utf8")));

    if (parsed.namespace !== namespace) {
      throw new Error(`Registry namespace mismatch: expected ${namespace}, got ${parsed.namespace}`);
    }

    loaded.push(parsed);
  }

  return loaded;
}

export function getPackageManagerAdapter(name: PackageManagerName): PackageManagerAdapter {
  return packageManagers[name];
}

export function composeReadme(input: ComposeReadmeInput): string {
  const adapter = getPackageManagerAdapter(input.packageManager);
  const readme = collectReadmeMetadata(input.modules, adapter);
  const envVars = normalizeEnvVars(input.modules.flatMap((module) => module.envVars ?? []));

  return [
    `# ${input.projectName}`,
    "",
    "## Stack",
    renderList(readme.stack),
    "",
    "## Project Layout",
    renderLayout(readme.layout),
    "",
    "## Prerequisites",
    renderList(readme.prerequisites),
    "",
    "## Install",
    renderCommands(readme.installCommands),
    "",
    "## Development",
    renderCommands(readme.devCommands),
    "",
    "## Verification",
    renderCommands(readme.verificationCommands),
    "",
    "## Commands",
    renderCommands(readme.commands),
    "",
    "## Environment",
    renderEnvironmentTable(envVars),
    "",
    "## Stackkit",
    renderList(readme.stackkit),
    ""
  ].join("\n");
}

function collectReadmeMetadata(
  modules: readonly StackkitModule[],
  adapter: PackageManagerAdapter
): Required<ReadmeMetadata> {
  const metadata = modules.flatMap((module) => (module.readme ? [module.readme] : []));
  const stack = uniqueStrings([
    ...metadata.flatMap((item) => item.stack),
    ...modules.filter((module) => !module.readme?.stack.length).map((module) => module.title)
  ]);
  const layout = uniqueLayout(metadata.flatMap((item) => item.layout));
  const prerequisites = uniqueStrings(metadata.flatMap((item) => item.prerequisites));
  const installCommands = uniqueCommands(metadata.flatMap((item) => item.installCommands));
  const devCommands = uniqueCommands(metadata.flatMap((item) => item.devCommands));
  const verificationCommands = uniqueCommands(metadata.flatMap((item) => item.verificationCommands));
  const commands = uniqueCommands(metadata.flatMap((item) => item.commands));
  const stackkit = uniqueStrings(metadata.flatMap((item) => item.stackkit));

  return {
    stack,
    layout,
    prerequisites: prerequisites.length > 0 ? prerequisites : [`${adapter.name} via Corepack where applicable`],
    installCommands: installCommands.length > 0 ? installCommands : [{ label: "Install dependencies", command: commandToString(adapter.installCommand) }],
    devCommands: devCommands.length > 0 ? devCommands : [{ label: "Start development", command: commandToString(adapter.runCommand("dev")) }],
    verificationCommands:
      verificationCommands.length > 0
        ? verificationCommands
        : [
            { label: "Run tests", command: commandToString(adapter.runCommand("test")) },
            { label: "Typecheck", command: commandToString(adapter.runCommand("typecheck")) }
          ],
    commands:
      commands.length > 0
        ? commands
        : [
            { label: "Build", command: commandToString(adapter.runCommand("build")) },
            { label: "Lint", command: commandToString(adapter.runCommand("lint")) },
            { label: "Format", command: commandToString(adapter.runCommand("format")) }
          ],
    stackkit:
      stackkit.length > 0
        ? stackkit
        : ["This project is generated and managed by Stackkit. Keep stackkit.config.json and .stackkit/project.json in sync with lifecycle changes."]
  };
}

function renderList(items: readonly string[]): string {
  if (items.length === 0) {
    return "_None declared._";
  }

  return items.map((item) => `- ${item}`).join("\n");
}

function renderLayout(entries: readonly ReadmeLayoutEntry[]): string {
  if (entries.length === 0) {
    return "_No project layout metadata declared._";
  }

  return entries.map((entry) => `- \`${entry.path}\` - ${entry.description}`).join("\n");
}

function renderCommands(commands: readonly ReadmeCommand[]): string {
  if (commands.length === 0) {
    return "_No commands declared._";
  }

  return commands.map((command) => `- ${command.label}: \`${command.command}\``).join("\n");
}

function renderEnvironmentTable(envVars: readonly NormalizedEnvVar[]): string {
  if (envVars.length === 0) {
    return "_No environment variables declared._";
  }

  return [
    "| Target | Name | Required | Description |",
    "| --- | --- | --- | --- |",
    ...envVars.map(
      (envVar) =>
        `| ${envTargetLabel(envVar.target)} | \`${envVar.name}\` | ${envVar.required ? "Required" : "Optional"} | ${envVar.description} |`
    )
  ].join("\n");
}

function commandToString(command: readonly string[]): string {
  return command.join(" ");
}

function uniqueStrings(items: readonly string[]): string[] {
  return [...new Set(items)];
}

function uniqueLayout(entries: readonly ReadmeLayoutEntry[]): ReadmeLayoutEntry[] {
  return uniqueBy(entries, (entry) => `${entry.path}\0${entry.description}`);
}

function uniqueCommands(commands: readonly ReadmeCommand[]): ReadmeCommand[] {
  return uniqueBy(commands, (command) => `${command.label}\0${command.command}`);
}

function uniqueBy<T>(items: readonly T[], keyFor: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    const key = keyFor(item);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}

function normalizeEnvVars(envVars: readonly EnvVarDefinition[]): NormalizedEnvVar[] {
  const byName = new Map<string, NormalizedEnvVar>();

  for (const envVar of envVars) {
    const normalized = envVarDefinitionSchema.parse(envVar) as NormalizedEnvVar;
    const existing = byName.get(normalized.name);

    if (!existing) {
      byName.set(normalized.name, normalized);
      continue;
    }

    if (!isCompatibleEnvVar(existing, normalized)) {
      throw new Error(`Incompatible environment variable metadata for ${normalized.name}`);
    }
  }

  return [...byName.values()].sort((left, right) => {
    const targetOrder = envTargetOrder(left.target) - envTargetOrder(right.target);

    return targetOrder === 0 ? left.name.localeCompare(right.name) : targetOrder;
  });
}

function isCompatibleEnvVar(left: NormalizedEnvVar, right: NormalizedEnvVar): boolean {
  return (
    left.description === right.description &&
    left.required === right.required &&
    (left.example ?? "") === (right.example ?? "") &&
    left.target === right.target
  );
}

function envTargetOrder(target: NormalizedEnvVar["target"]): number {
  return { root: 0, web: 1, api: 2, db: 3 }[target];
}

function envTargetLabel(target: NormalizedEnvVar["target"]): string {
  return { root: "Root", web: "Web", api: "API", db: "Database" }[target];
}

export function validateProjectSlug(name: string): string {
  const parsed = projectSlugSchema.safeParse(name);

  if (!parsed.success) {
    throw new Error(`Invalid project name: "${name}". Use a lowercase slug such as acme-dashboard.`);
  }

  return parsed.data;
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
  targets: readonly AiSkillTarget[] = resolveAiSkillTargets(),
  linkMode: AiSkillLinkMode = "copy"
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
        args: [
          "-y",
          "skills",
          "add",
          skill.source,
          "--skill",
          ...skill.skills,
          "--agent",
          target.agent,
          "-y",
          ...(linkMode === "copy" ? ["--copy"] : [])
        ],
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

export function planSkillSyncCommands(lock: SkillsLock): AiSkillInstallCommand[] {
  const parsed = skillsLockSchema.parse(lock);
  const retriableUnresolved = parsed.unresolved.flatMap((skill) => {
    const retriableSkill = restoreRetriableSkill(skill);

    return retriableSkill ? [retriableSkill] : [];
  });

  return planAiSkillInstallCommands([...parsed.installed, ...parsed.planned, ...retriableUnresolved], parsed.targets, parsed.linkMode);
}

export async function applySkillSync(lock: SkillsLock, options: InstallAiSkillsOptions): Promise<SkillsLock> {
  const parsed = skillsLockSchema.parse(lock);
  const result = await installAiSkills(planSkillSyncCommands(parsed), options);
  const installed = mergeSkillDependencies(parsed.installed, result.installed);
  const installedKeys = new Set(installed.map(skillDependencyKey));

  return {
    schemaVersion: 1,
    mode: parsed.mode,
    linkMode: parsed.linkMode,
    targets: parsed.targets,
    installed,
    planned: parsed.planned.filter((skill) => !installedKeys.has(skillDependencyKey(skill))),
    local: parsed.local,
    // Retain previously-unresolved skills that were not (and could not be) retried,
    // dropping only those that just installed successfully.
    unresolved: mergeSkillDependencies(
      parsed.unresolved.filter((skill) => !installedKeys.has(skillDependencyKey(skill))),
      result.unresolved
    )
  };
}

export type ResolveModuleGraphOptions = {
  presets?: readonly StackkitPreset[];
  availablePresets?: readonly StackkitPreset[];
  selectedPresets?: readonly string[];
  availableModules?: readonly StackkitModule[];
};

export type StackAxes = {
  web?: string;
  api?: string;
  db?: string;
  dbClient?: string;
  auth?: string | readonly string[];
  with?: readonly string[];
  deploy?: readonly string[];
};

export function resolveModuleAlias(input: string, modules: readonly StackkitModule[]): string {
  if (modules.some((module) => module.id === input)) {
    return input;
  }

  const matches = modules.filter((module) => module.aliases.includes(input));

  if (matches.length === 0) {
    throw new Error(`Unknown Stackkit module or alias: ${input}`);
  }

  if (matches.length > 1) {
    throw new Error(`Ambiguous Stackkit alias: ${input}`);
  }

  return matches[0].id;
}

export function resolveStackAxes(axes: StackAxes, modules: readonly StackkitModule[]): string[] {
  const resolved: string[] = [];
  const api = axes.api ? resolveModuleAlias(axes.api, modules) : undefined;
  const web = axes.web ? resolveModuleAlias(axes.web, modules) : undefined;
  const db = axes.db ? resolveModuleAlias(axes.db, modules) : undefined;
  const auth = normalizeSingleAuth(axes.auth);
  const hasNext = web === "web/nextjs";
  const hasFastApi = api === "api/fastapi";
  const hasAxum = api === "rust/axum";

  if (hasNext) {
    appendExistingModules(resolved, modules, [
      "workspace/pnpm-turbo",
      "workspace/typescript",
      "web/nextjs",
      "ui/shadcn",
      "quality/eslint"
    ]);
  } else if (web) {
    appendModule(resolved, web);
  }

  if (hasFastApi) {
    appendExistingModules(resolved, modules, ["api/fastapi"]);
  } else if (hasAxum) {
    appendExistingModules(resolved, modules, ["rust/tokio", "rust/axum"]);
  } else if (api) {
    appendModule(resolved, api);
  }

  if (db === "db/postgres") {
    appendExistingModules(resolved, modules, ["db/postgres"]);
    appendDatabaseClient(resolved, modules, axes.dbClient, { hasFastApi, hasAxum });
  } else if (db) {
    appendModule(resolved, db);
  } else if (axes.dbClient) {
    appendModule(resolved, resolveDatabaseClientAlias(axes.dbClient, modules, { hasFastApi, hasAxum }));
  }

  if (auth) {
    appendAuthProvider(resolved, modules, auth, { hasNext, hasFastApi, hasAxum });
  }

  for (const moduleId of resolveDeploymentModules(axes.with ?? [], modules, { includeKubernetesBase: false })) {
    appendModule(resolved, moduleId);
  }

  for (const moduleId of resolveDeploymentModules(axes.deploy ?? [], modules, { includeKubernetesBase: true })) {
    appendModule(resolved, moduleId);
  }

  return resolved;
}

export function encodeRecipe(recipe: StackkitRecipeInput): string {
  const json = JSON.stringify(stackkitRecipeSchema.parse(recipe));

  return `sk_${Buffer.from(json, "utf8").toString("base64url")}`;
}

export function decodeRecipe(code: string): StackkitRecipe {
  if (!code.startsWith("sk_")) {
    throw new Error("Invalid Stackkit recipe code");
  }

  try {
    const json = Buffer.from(code.slice(3), "base64url").toString("utf8");

    return stackkitRecipeSchema.parse(JSON.parse(json));
  } catch {
    throw new Error("Invalid Stackkit recipe code");
  }
}

function normalizeSingleAuth(auth: StackAxes["auth"]): string | undefined {
  if (!auth) {
    return undefined;
  }

  const selected = Array.isArray(auth) ? auth : [auth];
  const unique = [...new Set(selected)];

  if (unique.length > 1) {
    throw new Error("Select only one auth provider");
  }

  return unique[0];
}

function appendDatabaseClient(
  resolved: string[],
  modules: readonly StackkitModule[],
  dbClient: string | undefined,
  context: { hasFastApi: boolean; hasAxum: boolean }
): void {
  if (dbClient) {
    appendModule(resolved, resolveDatabaseClientAlias(dbClient, modules, context));
    return;
  }

  if (context.hasFastApi) {
    appendExistingModules(resolved, modules, ["db/sqlalchemy"]);
    return;
  }

  if (context.hasAxum) {
    appendExistingModules(resolved, modules, ["rust/sqlx"]);
    return;
  }

  appendExistingModules(resolved, modules, ["db/drizzle"]);
}

function resolveDatabaseClientAlias(
  input: string,
  modules: readonly StackkitModule[],
  context: { hasFastApi: boolean; hasAxum: boolean }
): string {
  if (input === "sqlx" && context.hasAxum && hasModule(modules, "rust/sqlx")) {
    return "rust/sqlx";
  }

  return resolveModuleAlias(input, modules);
}

function appendAuthProvider(
  resolved: string[],
  modules: readonly StackkitModule[],
  auth: string,
  context: { hasNext: boolean; hasFastApi: boolean; hasAxum: boolean }
): void {
  if (auth === "auth0") {
    const initialCount = resolved.length;

    if (context.hasNext) {
      appendExistingModules(resolved, modules, ["auth/auth0-nextjs"]);
    }
    if (context.hasFastApi) {
      appendExistingModules(resolved, modules, ["auth/auth0-fastapi"]);
    }
    if (context.hasAxum) {
      appendExistingModules(resolved, modules, ["auth/auth0-axum"]);
    }
    if (resolved.length === initialCount) {
      throw new Error("Auth0 requires a supported framework context. Select --web next or --api fastapi with --auth auth0.");
    }
    return;
  }

  appendModule(resolved, resolveModuleAlias(auth, modules));
}

function resolveDeploymentModules(
  inputs: readonly string[],
  modules: readonly StackkitModule[],
  options: { includeKubernetesBase: boolean }
): string[] {
  const resolved: string[] = [];

  for (const input of inputs) {
    const moduleId = resolveModuleAlias(input, modules);

    if (moduleId === "deploy/kubernetes" && options.includeKubernetesBase) {
      appendExistingModules(resolved, modules, ["deploy/docker", "deploy/kubernetes"]);
      continue;
    }

    appendModule(resolved, moduleId);
  }

  return resolved;
}

function appendExistingModules(target: string[], modules: readonly StackkitModule[], moduleIds: readonly string[]): void {
  for (const moduleId of moduleIds) {
    if (hasModule(modules, moduleId)) {
      appendModule(target, moduleId);
    }
  }
}

function hasModule(modules: readonly StackkitModule[], moduleId: string): boolean {
  return modules.some((module) => module.id === moduleId);
}

function appendModule(target: string[], moduleId: string): void {
  if (!target.includes(moduleId)) {
    target.push(moduleId);
  }
}

export type ValidateConfigResult = {
  ok: boolean;
  errors: string[];
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
  validateAuthProviderConflicts(ordered);

  return ordered;
}

export function validateStackkitConfig(
  config: StackkitConfig,
  availableModules: readonly StackkitModule[],
  availablePresets: readonly StackkitPreset[] = []
): ValidateConfigResult {
  const errors: string[] = [];
  const moduleById = new Map<string, StackkitModule>(availableModules.map((module) => [module.id, module]));
  const presetById = new Map<string, StackkitPreset>(availablePresets.map((preset) => [preset.id, preset]));
  const selectedModules: StackkitModule[] = [];

  try {
    validateProjectSlug(config.projectName);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  for (const moduleId of config.modules) {
    const module = moduleById.get(moduleId);

    if (!module) {
      errors.push(`Unknown Stackkit module: ${moduleId}`);
      continue;
    }

    selectedModules.push(module);
  }

  if (config.preset && !presetById.has(config.preset)) {
    errors.push(`Unknown Stackkit preset: ${config.preset}`);
  }

  if (errors.length === 0) {
    try {
      resolveModuleGraph(selectedModules, {
        presets: availablePresets,
        selectedPresets: config.preset ? [config.preset] : [],
        availableModules
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

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
      options: existingModuleById.get(module.id)?.options ?? {}
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

  const files = await applyFilePlan(input.projectDirectory, fullFilePlan);
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

  for (const file of plan.filesToRemove) {
    await rm(join(input.projectDirectory, normalizeProjectPath(file.path)), { force: true });
  }

  const manifest = await writeManifest(input.projectDirectory, plan.manifest);

  return { manifest };
}

export type ModuleUpdatePlan = {
  updates: { id: string; from: string; to: string }[];
};

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

export type ModuleMigrationPlan = {
  automatic: ModuleMigration[];
  reviewRequired: ModuleMigration[];
  manual: ModuleMigration[];
};

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
  const applied = new Set(input.manifest.migrations.applied.map((entry) => JSON.stringify(entry)));
  const automatic = input.modules.flatMap((module) =>
    (module.migrations ?? [])
      .filter((migration) => migration.safety === "automatic" && !applied.has(JSON.stringify(migration)))
      .map((migration) => ({ module, migration }))
  );
  const operations = automatic.flatMap(({ module, migration }) =>
    migration.operations.map((operation) => ({
      kind: operation.kind,
      path: operation.path,
      owner: module.id,
      content: operation.kind === "write" ? operation.content : undefined,
      overwrite: "if-owned" as const
    }))
  );
  const filePlan = buildFilePlan(operations);
  const conflicts = await detectFileConflicts(input.projectDirectory, filePlan, input.manifest.files);

  if (conflicts.length > 0) {
    throw new Error(
      `Migration has conflicts: ${conflicts.map((conflict) => `${conflict.path} (${conflict.reason})`).join(", ")}`
    );
  }

  const files = await applyFilePlan(input.projectDirectory, filePlan);
  const nextManifest = createManifest({
    ...input.manifest,
    files: mergeManifestFiles(input.manifest.files, files),
    migrations: {
      applied: [...input.manifest.migrations.applied, ...automatic.map(({ migration }) => migration)]
    }
  });
  await writeManifest(input.projectDirectory, nextManifest);

  return { manifest: nextManifest };
}

export async function applyModuleUpdates(input: {
  projectDirectory: string;
  manifest: StackkitManifest;
  availableModules: readonly StackkitModule[];
}): Promise<{ manifest: StackkitManifest; updates: ModuleUpdatePlan["updates"] }> {
  const updatePlan = planModuleUpdates({
    manifestModules: input.manifest.modules,
    availableModules: input.availableModules
  });
  const availableById = new Map(input.availableModules.map((module) => [module.id, module]));
  const nextModules = input.manifest.modules.map((manifestModule) => {
    const available = availableById.get(manifestModule.id);

    return {
      ...manifestModule,
      version: available?.version ?? manifestModule.version
    };
  });
  const nextManifest = createManifest({
    ...input.manifest,
    modules: nextModules
  });
  await writeManifest(input.projectDirectory, nextManifest);

  return { manifest: nextManifest, updates: updatePlan.updates };
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

export async function runDoctor(projectDirectory: string): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];
  const manifestPath = join(projectDirectory, ".stackkit", "project.json");
  const manifestContent = await readExistingFile(manifestPath);

  if (!manifestContent) {
    return {
      ok: false,
      checks: [
        createDoctorCheck({
          id: "manifest.exists",
          status: "error",
          message: ".stackkit/project.json is missing"
        })
      ]
    };
  }

  const manifest = stackkitManifestSchema.parse(JSON.parse(manifestContent));
  checks.push(createDoctorCheck({ id: "manifest.exists", status: "ok", message: ".stackkit/project.json exists" }));

  for (const file of manifest.files) {
    const content = await readExistingFile(join(projectDirectory, file.path));

    if (content === undefined) {
      checks.push(createDoctorCheck({
        id: `files.${file.path}`,
        status: "error",
        message: `Managed file is missing: ${file.path}`,
        actions: [`stackkit diff --file ${file.path}`]
      }));
      continue;
    }

    if (hashContent(content) !== file.hash) {
      checks.push(createDoctorCheck({
        id: `files.${file.path}`,
        status: "warning",
        message: `Managed file was modified: ${file.path}`,
        actions: [`stackkit diff --file ${file.path}`]
      }));
      continue;
    }

    checks.push(createDoctorCheck({
      id: `files.${file.path}`,
      status: "ok",
      message: `Managed file is unchanged: ${file.path}`
    }));
  }

  if (manifest.aiSkills.unresolved.length > 0) {
    checks.push(createDoctorCheck({
      id: "skills.unresolved",
      status: "warning",
      message: `${manifest.aiSkills.unresolved.length} AI skill dependency could not be resolved`,
      actions: ["stackkit skills sync --apply"]
    }));
  }

  return {
    ok: checks.every((check) => check.status === "ok"),
    checks
  };
}

function createDoctorCheck(check: Omit<DoctorCheck, "actions"> & { actions?: string[] }): DoctorCheck {
  return {
    ...check,
    actions: check.actions ?? []
  };
}

export function createFileContentDiff(expectedContent: string, currentContent: string): FileContentDiff {
  const expectedLines = splitLines(expectedContent);
  const currentLines = splitLines(currentContent);
  const lcs = buildLineLcs(expectedLines, currentLines);
  const parts: FileDiffPart[] = [];
  let expectedIndex = 0;
  let currentIndex = 0;

  for (const entry of lcs) {
    while (expectedIndex < entry.expectedIndex) {
      appendDiffPart(parts, "removed", expectedLines[expectedIndex] ?? "");
      expectedIndex += 1;
    }
    while (currentIndex < entry.currentIndex) {
      appendDiffPart(parts, "added", currentLines[currentIndex] ?? "");
      currentIndex += 1;
    }

    appendDiffPart(parts, "same", entry.value);
    expectedIndex = entry.expectedIndex + 1;
    currentIndex = entry.currentIndex + 1;
  }

  while (expectedIndex < expectedLines.length) {
    appendDiffPart(parts, "removed", expectedLines[expectedIndex] ?? "");
    expectedIndex += 1;
  }
  while (currentIndex < currentLines.length) {
    appendDiffPart(parts, "added", currentLines[currentIndex] ?? "");
    currentIndex += 1;
  }

  return { parts };
}

export async function diffManagedFile(projectDirectory: string, filePath: string): Promise<ManagedFileDiff> {
  const path = normalizeProjectPath(filePath);
  const manifest = await readManifest(projectDirectory);
  const managedFile = manifest.files.find((file) => normalizeProjectPath(file.path) === path);

  if (!managedFile) {
    throw new Error(`File is not managed by Stackkit: ${path}`);
  }

  const expectedFile = buildExpectedManagedFilePlan(manifest).files.find((file) => file.path === path);

  if (!expectedFile) {
    throw new Error(`Managed file cannot be deterministically re-rendered: ${path}`);
  }

  const currentContent = await readExistingFile(join(projectDirectory, path));

  return {
    path,
    owner: managedFile.owner,
    expectedHash: expectedFile.hash,
    currentHash: currentContent === undefined ? undefined : hashContent(currentContent),
    expectedContent: expectedFile.content,
    currentContent,
    diff: createFileContentDiff(expectedFile.content, currentContent ?? "")
  };
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

export function listStackkitModules(modules: readonly StackkitModule[]): ModuleDiscoveryEntry[] {
  return modules.map(moduleDiscoveryEntry);
}

export function searchStackkitModules(query: string, modules: readonly StackkitModule[]): ModuleDiscoveryEntry[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery.length === 0) {
    return [];
  }

  return listStackkitModules(modules).filter((module) =>
    [module.id, module.title, module.description, module.category ?? "", ...module.aliases].some((value) =>
      value.toLowerCase().includes(normalizedQuery)
    )
  );
}

export function inspectStackkitModule(input: string, modules: readonly StackkitModule[]): ModuleDiscoveryEntry {
  const id = resolveModuleAlias(input, modules);
  const module = modules.find((candidate) => candidate.id === id);

  if (!module) {
    throw new Error(`Unknown Stackkit module: ${input}`);
  }

  return moduleDiscoveryEntry(module);
}

function buildExpectedManagedFilePlan(manifest: StackkitManifest): FilePlan {
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

function manifestModuleToStackkitModule(module: StackkitManifest["modules"][number]): StackkitModule {
  return defineModule({
    id: module.id,
    version: module.version,
    title: module.id,
    description: module.id
  });
}

function moduleDiscoveryEntry(module: StackkitModule): ModuleDiscoveryEntry {
  return {
    id: module.id,
    version: module.version,
    title: module.title,
    description: module.description,
    aliases: module.aliases,
    category: module.category
  };
}

function splitLines(content: string): string[] {
  if (content.length === 0) {
    return [];
  }

  return content.match(/[^\n]*\n|[^\n]+/g) ?? [];
}

function buildLineLcs(
  expectedLines: readonly string[],
  currentLines: readonly string[]
): { expectedIndex: number; currentIndex: number; value: string }[] {
  const table = Array.from({ length: expectedLines.length + 1 }, () => Array<number>(currentLines.length + 1).fill(0));

  for (let expectedIndex = expectedLines.length - 1; expectedIndex >= 0; expectedIndex -= 1) {
    for (let currentIndex = currentLines.length - 1; currentIndex >= 0; currentIndex -= 1) {
      table[expectedIndex]![currentIndex] =
        expectedLines[expectedIndex] === currentLines[currentIndex]
          ? (table[expectedIndex + 1]?.[currentIndex + 1] ?? 0) + 1
          : Math.max(table[expectedIndex + 1]?.[currentIndex] ?? 0, table[expectedIndex]?.[currentIndex + 1] ?? 0);
    }
  }

  const entries: { expectedIndex: number; currentIndex: number; value: string }[] = [];
  let expectedIndex = 0;
  let currentIndex = 0;

  while (expectedIndex < expectedLines.length && currentIndex < currentLines.length) {
    if (expectedLines[expectedIndex] === currentLines[currentIndex]) {
      entries.push({ expectedIndex, currentIndex, value: expectedLines[expectedIndex] ?? "" });
      expectedIndex += 1;
      currentIndex += 1;
      continue;
    }

    if ((table[expectedIndex + 1]?.[currentIndex] ?? 0) >= (table[expectedIndex]?.[currentIndex + 1] ?? 0)) {
      expectedIndex += 1;
    } else {
      currentIndex += 1;
    }
  }

  return entries;
}

function appendDiffPart(parts: FileDiffPart[], kind: FileDiffPart["kind"], value: string): void {
  const previous = parts.at(-1);

  if (previous?.kind === kind) {
    previous.value += value;
    return;
  }

  parts.push({ kind, value });
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

function renderEnvExampleContent(envVars: readonly NormalizedEnvVar[]): string {
  const sections = envTargets.flatMap((target) => {
    const targetVars = envVars.filter((envVar) => envVar.target === target);

    if (targetVars.length === 0) {
      return [];
    }

    return [
      [
        `# ${envTargetLabel(target)}`,
        ...targetVars.flatMap((envVar) => [`# ${envVar.description}`, `${envVar.name}=${envVar.example ?? ""}`, ""])
      ].join("\n")
    ];
  });

  return sections.length > 0 ? `${sections.join("\n")}\n` : "";
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

export async function readManifest(projectDirectory: string): Promise<StackkitManifest> {
  const manifestPath = join(projectDirectory, ".stackkit", "project.json");
  const existing = await readExistingFile(manifestPath);

  if (existing === undefined) {
    throw new Error(`No Stackkit manifest found at ${manifestPath}`);
  }

  return stackkitManifestSchema.parse(JSON.parse(existing));
}

export async function writeSkillsLock(projectDirectory: string, lock: SkillsLock): Promise<SkillsLock> {
  const parsed = skillsLockSchema.parse(lock);

  await writeFile(join(projectDirectory, "skills-lock.json"), `${JSON.stringify(parsed, null, 2)}\n`, "utf8");

  return parsed;
}

export async function readOptionalSkillsLock(projectDirectory: string): Promise<SkillsLock | undefined> {
  const existing = await readExistingFile(join(projectDirectory, "skills-lock.json"));

  if (existing === undefined) {
    return undefined;
  }

  return skillsLockSchema.parse(JSON.parse(existing));
}

export async function collectInfo(projectDirectory: string): Promise<StackkitInfo> {
  const manifest = await readManifest(projectDirectory);
  const config = await readOptionalStackkitConfig(projectDirectory);
  const lock = await readOptionalSkillsLock(projectDirectory);
  const aiSkills = lock ?? manifest.aiSkills;

  return {
    project: {
      name: manifest.projectName,
      packageManager: manifest.packageManager,
      stackkitVersion: manifest.stackkitVersion
    },
    source: collectInfoSource(manifest.source, config),
    modules: manifest.modules.map((module) => ({
      id: module.id,
      version: module.version
    })),
    paths: manifest.paths,
    ai: {
      targets: aiSkills.targets.filter((target) => target.enabled).map((target) => target.agent),
      installed: aiSkills.installed.length,
      local: aiSkills.local.length,
      unresolved: aiSkills.unresolved.length
    }
  };
}

export async function readSkillsLock(projectDirectory: string): Promise<SkillsLock> {
  const content = await readFile(join(projectDirectory, "skills-lock.json"), "utf8");

  return skillsLockSchema.parse(JSON.parse(content));
}

export function mergeSkillDependencies(
  left: readonly AiSkillDependency[],
  right: readonly AiSkillDependency[]
): AiSkillDependency[] {
  const merged = new Map<string, AiSkillDependency>();

  for (const dependency of [...left, ...right]) {
    const key = skillDependencyKey(dependency);
    const existing = merged.get(key);

    if (existing) {
      merged.set(key, { ...existing, skills: mergeSkills(existing.skills, dependency.skills) });
    } else {
      merged.set(key, { ...dependency, skills: [...dependency.skills] });
    }
  }

  return [...merged.values()];
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

async function readOptionalStackkitConfig(projectDirectory: string): Promise<StackkitConfig | undefined> {
  const content = await readExistingFile(join(projectDirectory, "stackkit.config.json"));

  if (content === undefined) {
    return undefined;
  }

  try {
    return stackkitConfigSchema.parse(JSON.parse(content));
  } catch {
    return undefined;
  }
}

function collectInfoSource(
  source: StackkitManifestSource,
  config: StackkitConfig | undefined
): StackkitInfo["source"] {
  if (source.kind === "config") {
    return {
      kind: source.kind,
      path: source.path,
      preset: config?.preset
    };
  }

  if (source.kind === "recipe") {
    return {
      kind: source.kind,
      recipeCode: source.code
    };
  }

  return { kind: source.kind };
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

function isInstallableSkill(skill: AiSkillDependency): boolean {
  return !!skill.source && skill.trust !== "local" && skill.trust !== "unresolved";
}

function restoreRetriableSkill(skill: AiSkillDependency): AiSkillDependency | undefined {
  if (!isRetriableUnresolvedSkill(skill)) {
    return undefined;
  }

  return {
    ...skill,
    trust: inferExternalSkillTrust(skill.source)
  };
}

function isRetriableUnresolvedSkill(skill: AiSkillDependency): skill is AiSkillDependency & { source: string } {
  return !!skill.source && skill.trust === "unresolved" && skill.reason.startsWith("Skill install failed:");
}

function inferExternalSkillTrust(source: string): Exclude<AiSkillTrust, "local" | "unresolved"> {
  return defaultOfficialSkillSources.some((officialSource) => officialSource === source) ? "official" : "curated";
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
  return `${dependency.source ?? dependency.trust}:${dependency.causedBy}`;
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

function mergeManifestFiles(
  existingFiles: readonly ManifestFileRecord[],
  newFiles: readonly ManifestFileRecord[]
): ManifestFileRecord[] {
  const fileByPath = new Map<string, ManifestFileRecord>();

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

function validateAuthProviderConflicts(modules: readonly StackkitModule[]): void {
  const providers: string[] = [];

  for (const module of modules) {
    const provider = authProviderKey(module);

    if (provider && !providers.includes(provider)) {
      providers.push(provider);
    }
  }

  if (providers.length > 1) {
    throw new Error(`Conflicting auth providers: ${providers.join(", ")}. Select only one auth provider.`);
  }
}

function authProviderKey(module: StackkitModule): string | undefined {
  if (module.category !== "auth" && !module.id.startsWith("auth/")) {
    return undefined;
  }

  const authModule = module.id.slice("auth/".length);

  if (authModule.startsWith("auth0-")) {
    return "auth0";
  }

  return authModule;
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
