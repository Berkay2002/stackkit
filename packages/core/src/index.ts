import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  aiSkillRegistryEntrySchema,
  stackkitManifestSchema,
  stackkitModuleSchema,
  stackkitPresetSchema,
  type AiSkillAgent,
  type AiSkillDependency,
  type AiSkillRegistryEntry,
  type AiSkillTarget,
  type AiSkillTrust,
  type ModuleId,
  type ModuleMigration,
  type StackkitConfig,
  type StackkitManifest,
  type StackkitModule,
  type StackkitPreset
} from "@stackkit/schemas";

export type {
  AiSkillDependency,
  AiSkillAgent,
  AiSkillRegistryEntry,
  AiSkillTarget,
  AiSkillTrust,
  ModuleId,
  ModuleMigration,
  StackkitConfig,
  StackkitManifest,
  StackkitModule,
  StackkitPreset
};

export type AiSkillInstallCommand = {
  command: "npx";
  args: string[];
  target: AiSkillTarget;
  skill: AiSkillDependency;
};

export type CreatePlan = {
  schemaVersion: 1;
  operation: "create";
  dryRun: true;
  projectName: string;
  modules: {
    id: string;
    version: string;
  }[];
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

  return {
    schemaVersion: 1,
    operation: "create",
    dryRun: true,
    projectName: input.config.projectName,
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
}

export function createManifest(input: StackkitManifest): StackkitManifest {
  return stackkitManifestSchema.parse(input);
}

export async function writeManifest(projectDirectory: string, manifest: StackkitManifest): Promise<StackkitManifest> {
  const parsed = createManifest(manifest);
  const stackkitDirectory = join(projectDirectory, ".stackkit");

  await mkdir(stackkitDirectory, { recursive: true });
  await writeFile(join(stackkitDirectory, "project.json"), `${JSON.stringify(parsed, null, 2)}\n`, "utf8");

  return parsed;
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

function skillDependencyKey(dependency: AiSkillDependency): string {
  return `${dependency.trust}:${dependency.source ?? "local"}:${dependency.causedBy}`;
}

function mergeSkills(left: readonly string[], right: readonly string[]): string[] {
  return [...new Set([...left, ...right])];
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
