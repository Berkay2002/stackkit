import { describe, expect, it } from "vitest";

import {
  applySkillSync,
  installAiSkills,
  planSkillSyncCommands,
  type AiSkillInstallCommand,
  type RunCommand
} from "./index.js";

const installCommand: AiSkillInstallCommand = {
  command: "npx",
  args: [
    "-y",
    "skills",
    "add",
    "https://github.com/vercel-labs/agent-skills",
    "--skill",
    "vercel-react-best-practices",
    "--agent",
    "codex",
    "-y",
    "--copy"
  ],
  target: { agent: "codex", directory: ".agents", enabled: true },
  skill: {
    source: "https://github.com/vercel-labs/agent-skills",
    skills: ["vercel-react-best-practices"],
    trust: "official",
    causedBy: "web/nextjs",
    reason: "React and Next.js app code"
  }
};

describe("installAiSkills", () => {
  it("runs successful commands and records installed skills", async () => {
    const calls: { command: string; args: string[]; cwd?: string }[] = [];
    const runCommand: RunCommand = async (command, args, options) => {
      calls.push({ command, args, cwd: options.cwd });
      return { exitCode: 0, stdout: "installed", stderr: "" };
    };

    const result = await installAiSkills([installCommand], {
      cwd: "C:\\project",
      runCommand
    });

    expect(calls).toEqual([{ command: "npx", args: installCommand.args, cwd: "C:\\project" }]);
    expect(result).toEqual({
      installed: [installCommand.skill],
      unresolved: []
    });
  });

  it("allows skill installs without a working directory", async () => {
    const calls: { cwd?: string }[] = [];
    const runCommand: RunCommand = async (_command, _args, options) => {
      calls.push({ cwd: options.cwd });
      return { exitCode: 0, stdout: "installed", stderr: "" };
    };

    const result = await installAiSkills([installCommand], { runCommand });

    expect(calls).toEqual([{ cwd: undefined }]);
    expect(result.installed).toEqual([installCommand.skill]);
  });

  it("records failed commands as unresolved and continues processing", async () => {
    const secondCommand: AiSkillInstallCommand = {
      ...installCommand,
      args: [
        "-y",
        "skills",
        "add",
        "https://github.com/shadcn/ui",
        "--skill",
        "shadcn-ui",
        "--agent",
        "codex",
        "-y",
        "--copy"
      ],
      skill: {
        source: "https://github.com/shadcn/ui",
        skills: ["shadcn-ui"],
        trust: "official",
        causedBy: "ui/shadcn",
        reason: "shadcn/ui component work"
      }
    };
    const runCommand: RunCommand = async (_command, args) => {
      if (args.includes("vercel-react-best-practices")) {
        return { exitCode: 1, stdout: "", stderr: "network unavailable" };
      }

      return { exitCode: 0, stdout: "installed", stderr: "" };
    };

    const result = await installAiSkills([installCommand, secondCommand], {
      cwd: "C:\\project",
      runCommand
    });

    expect(result.installed).toEqual([secondCommand.skill]);
    expect(result.unresolved).toEqual([
      {
        source: "https://github.com/vercel-labs/agent-skills",
        skills: ["vercel-react-best-practices"],
        trust: "unresolved",
        causedBy: "web/nextjs",
        reason: "Skill install failed: network unavailable"
      }
    ]);
  });
});

describe("skill sync", () => {
  const skill = installCommand.skill;

  it("plans skill sync commands from skills lock", () => {
    const commands = planSkillSyncCommands({
      schemaVersion: 1,
      targets: [{ agent: "codex", directory: ".agents", enabled: true }],
      installed: [skill],
      local: [],
      unresolved: []
    });

    expect(commands).toEqual([
      expect.objectContaining({
        command: "npx",
        args: expect.arrayContaining(["skills", "add", "https://github.com/vercel-labs/agent-skills", "--agent", "codex"])
      })
    ]);
  });

  it("applies skill sync commands and returns an updated lock", async () => {
    const result = await applySkillSync(
      {
        schemaVersion: 1,
        targets: [{ agent: "codex", directory: ".agents", enabled: true }],
        installed: [],
        local: [],
        unresolved: [skill]
      },
      {
        runCommand: async () => ({ exitCode: 0, stdout: "ok", stderr: "" })
      }
    );

    expect(result.installed).toEqual([skill]);
    expect(result.unresolved).toEqual([]);
  });
});
