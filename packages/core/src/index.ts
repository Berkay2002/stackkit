import {
  aiSkillRegistryEntrySchema,
  stackkitManifestSchema,
  stackkitModuleSchema,
  stackkitPresetSchema,
  type AiSkillDependency,
  type AiSkillRegistryEntry,
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
  AiSkillRegistryEntry,
  AiSkillTrust,
  ModuleId,
  ModuleMigration,
  StackkitConfig,
  StackkitManifest,
  StackkitModule,
  StackkitPreset
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

export function resolveModuleGraph(modules: readonly StackkitModule[]): StackkitModule[] {
  return [...modules];
}

export function createManifest(input: StackkitManifest): StackkitManifest {
  return stackkitManifestSchema.parse(input);
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
