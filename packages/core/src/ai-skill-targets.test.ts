import { describe, expect, it } from "vitest";

import { createManifest, planAiSkillInstallCommands, resolveAiSkillTargets } from "./index.js";

describe("resolveAiSkillTargets", () => {
  it("defaults to Codex-compatible .agents skills", () => {
    expect(resolveAiSkillTargets()).toEqual([
      {
        agent: "codex",
        directory: ".agents",
        enabled: true
      }
    ]);
  });

  it("adds Claude Code only when selected", () => {
    expect(resolveAiSkillTargets(["codex", "claude-code"])).toEqual([
      {
        agent: "codex",
        directory: ".agents",
        enabled: true
      },
      {
        agent: "claude-code",
        directory: ".claude",
        enabled: true
      }
    ]);
  });
});

describe("planAiSkillInstallCommands", () => {
  it("plans npx skills add commands for each selected agent target", () => {
    const commands = planAiSkillInstallCommands(
      [
        {
          source: "https://github.com/vercel-labs/agent-skills",
          skills: ["deploy-to-vercel", "vercel-react-best-practices"],
          trust: "official",
          causedBy: "deploy/vercel",
          reason: "Vercel deployment and React guidance"
        }
      ],
      resolveAiSkillTargets(["codex", "claude-code"])
    );

    expect(commands).toEqual([
      {
        command: "npx",
        args: [
          "-y",
          "skills",
          "add",
          "https://github.com/vercel-labs/agent-skills",
          "--skill",
          "deploy-to-vercel",
          "vercel-react-best-practices",
          "--agent",
          "codex",
          "-y",
          "--copy"
        ],
        target: {
          agent: "codex",
          directory: ".agents",
          enabled: true
        },
        skill: expect.objectContaining({
          source: "https://github.com/vercel-labs/agent-skills",
          skills: ["deploy-to-vercel", "vercel-react-best-practices"]
        })
      },
      {
        command: "npx",
        args: [
          "-y",
          "skills",
          "add",
          "https://github.com/vercel-labs/agent-skills",
          "--skill",
          "deploy-to-vercel",
          "vercel-react-best-practices",
          "--agent",
          "claude-code",
          "-y",
          "--copy"
        ],
        target: {
          agent: "claude-code",
          directory: ".claude",
          enabled: true
        },
        skill: expect.objectContaining({
          source: "https://github.com/vercel-labs/agent-skills",
          skills: ["deploy-to-vercel", "vercel-react-best-practices"]
        })
      }
    ]);
  });

  it("does not plan npx installs for local or unresolved guidance", () => {
    const commands = planAiSkillInstallCommands(
      [
        {
          skills: ["stackkit-kubernetes-guidance"],
          trust: "local",
          causedBy: "deploy/kubernetes",
          reason: "Local guidance"
        },
        {
          source: "https://github.com/example/random-skills",
          skills: ["random-api"],
          trust: "unresolved",
          causedBy: "api/unknown",
          reason: "Untrusted source"
        }
      ],
      resolveAiSkillTargets(["codex", "claude-code"])
    );

    expect(commands).toEqual([]);
  });
});

describe("StackkitManifest ai skill targets", () => {
  it("records selected skill targets separately from installed skills", () => {
    const manifest = createManifest({
      schemaVersion: 1,
      stackkitVersion: "0.0.0",
      projectName: "example",
      createdAt: "2026-06-01T00:00:00.000Z",
      modules: [],
      files: [],
      aiSkills: {
        targets: resolveAiSkillTargets(["codex", "claude-code"]),
        installed: [],
        unresolved: []
      },
      migrations: {
        applied: []
      }
    });

    expect(manifest.aiSkills.targets).toEqual([
      {
        agent: "codex",
        directory: ".agents",
        enabled: true
      },
      {
        agent: "claude-code",
        directory: ".claude",
        enabled: true
      }
    ]);
  });
});
