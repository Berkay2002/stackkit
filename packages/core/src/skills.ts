import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  aiSkillRegistryEntrySchema,
  skillsLockSchema,
  type AiSkillAgent,
  type AiSkillDependency,
  type AiSkillLinkMode,
  type AiSkillRegistryEntry,
  type AiSkillTarget,
  type AiSkillTrust,
  type ModuleId,
  type SkillsLock,
  type StackkitModule
} from "@berkayorhan/stackkit-schemas";

import { type CommandResult, type RunCommand } from "./package-manager.js";

export type AiSkillInstallCommand = {
  command: "npx";
  args: string[];
  target: AiSkillTarget;
  skill: AiSkillDependency;
};

export type InstallAiSkillsOptions = {
  cwd?: string;
  runCommand: RunCommand;
  now?: () => Date;
};

export type InstallAiSkillsResult = {
  installed: AiSkillDependency[];
  unresolved: AiSkillDependency[];
};

export type ResolveSkillInstallResult = InstallAiSkillsResult & {
  planned: AiSkillDependency[];
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

export type WriteLocalAiGuidanceInput = {
  targets: readonly AiSkillTarget[];
  local: readonly AiSkillDependency[];
};

export const defaultOfficialSkillSources = [
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

export const aiSkillTargetByAgent: Record<AiSkillAgent, AiSkillTarget> = {
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

export function planSkillUpdateCommands(lock: SkillsLock): AiSkillInstallCommand[] {
  const parsed = skillsLockSchema.parse(lock);
  const target = parsed.targets.find((candidate) => candidate.enabled);

  if (!target) {
    return [];
  }

  return parsed.installed.filter(isUpdatableExternalSkill).map((skill) => ({
    command: "npx",
    args: ["-y", "skills", "update", ...skill.skills, "--project", "-y"],
    target,
    skill
  }));
}

export async function applySkillUpdate(lock: SkillsLock, options: InstallAiSkillsOptions): Promise<SkillsLock> {
  const parsed = skillsLockSchema.parse(lock);
  const result = await installAiSkills(planSkillUpdateCommands(parsed), options);
  const refreshedAt = (options.now ?? (() => new Date()))().toISOString();
  const updatedKeys = new Set(result.installed.map(skillDependencyKey));
  const installed = parsed.installed.map((skill) =>
    updatedKeys.has(skillDependencyKey(skill)) ? { ...skill, verifiedAt: refreshedAt } : skill
  );

  return {
    schemaVersion: 1,
    mode: parsed.mode,
    linkMode: parsed.linkMode,
    targets: parsed.targets,
    installed,
    planned: parsed.planned,
    local: parsed.local,
    unresolved: mergeSkillDependencies(
      parsed.unresolved.filter((skill) => !updatedKeys.has(skillDependencyKey(skill))),
      result.unresolved
    )
  };
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

export function isInstallableSkill(skill: AiSkillDependency): boolean {
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

function isUpdatableExternalSkill(skill: AiSkillDependency): boolean {
  return !!skill.source && (skill.trust === "official" || skill.trust === "curated");
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

export function skillDependencyKey(dependency: AiSkillDependency): string {
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

export async function missingSkillInstallCommandRunner(): Promise<CommandResult> {
  return {
    exitCode: 1,
    stdout: "",
    stderr: "No command runner configured for AI skill installation"
  };
}

export function renderLocalAiGuidance(skillName: string, skill: AiSkillDependency): string {
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
