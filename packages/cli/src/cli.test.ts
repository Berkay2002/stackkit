import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createStackkitProgram, isDirectCliExecution } from "./index.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("createStackkitProgram", () => {
  it("exposes the full Stackkit lifecycle command surface", () => {
    const program = createStackkitProgram();

    expect(program.commands.map((command) => command.name())).toEqual([
      "create",
      "init",
      "add",
      "remove",
      "update",
      "migrate",
      "diff",
      "doctor",
      "skills",
      "preset",
      "config"
    ]);
  });

  it("groups nested lifecycle commands by domain", () => {
    const program = createStackkitProgram();

    expect(program.commands.find((command) => command.name() === "skills")?.commands.map((command) => command.name())).toEqual([
      "sync",
      "update"
    ]);
    expect(program.commands.find((command) => command.name() === "preset")?.commands.map((command) => command.name())).toEqual([
      "list",
      "inspect"
    ]);
    expect(program.commands.find((command) => command.name() === "config")?.commands.map((command) => command.name())).toEqual([
      "validate"
    ]);
  });

  it("detects when the CLI module is the executed process entrypoint", () => {
    const entrypoint = "C:\\Users\\berka\\Project\\my-monorepo\\packages\\cli\\dist\\index.js";

    expect(isDirectCliExecution(new URL(`file:///${entrypoint.replaceAll("\\", "/")}`).href, entrypoint)).toBe(true);
    expect(isDirectCliExecution(new URL(`file:///${entrypoint.replaceAll("\\", "/")}`).href, "C:\\different\\index.js")).toBe(false);
    expect(isDirectCliExecution(new URL(`file:///${entrypoint.replaceAll("\\", "/")}`).href, undefined)).toBe(false);
  });

  it("prints a human summary and extractable JSON plan for create --config", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stackkit-cli-"));
    tempDirectories.push(directory);
    const configPath = join(directory, "stackkit.config.json");

    await writeFile(
      configPath,
      JSON.stringify(
        {
          projectName: "acme-dashboard",
          modules: ["workspace/pnpm-turbo", "web/nextjs", "deploy/docker", "deploy/kubernetes"],
          ai: {
            skillTargets: ["codex", "claude-code"]
          }
        },
        null,
        2
      ),
      "utf8"
    );

    let output = "";
    const program = createStackkitProgram();
    program.configureOutput({
      writeOut: (value) => {
        output += value;
      }
    });

    await program.parseAsync(["create", "--config", configPath, "--dry-run"], { from: "user" });

    expect(output).toContain("Stackkit create plan for acme-dashboard");
    expect(output).toContain("Modules: workspace/pnpm-turbo, web/nextjs, deploy/docker, deploy/kubernetes");
    expect(output).toContain("AI skill targets: codex -> .agents, claude-code -> .claude");
    expect(output).toContain("STACKKIT_PLAN_JSON_START");
    expect(output).toContain("STACKKIT_PLAN_JSON_END");

    const json = output.match(/STACKKIT_PLAN_JSON_START\n(?<json>[\s\S]+?)\nSTACKKIT_PLAN_JSON_END/)?.groups?.json;
    expect(json).toBeDefined();

    const plan = JSON.parse(json ?? "{}") as {
      projectName: string;
      modules: { id: string; version: string }[];
      aiSkills: { targets: { agent: string; directory: string }[] };
      skillInstallCommands: { command: string; args: string[] }[];
    };

    expect(plan.projectName).toBe("acme-dashboard");
    expect(plan.modules).toEqual([
      { id: "workspace/pnpm-turbo", version: "1.0.0" },
      { id: "web/nextjs", version: "1.0.0" },
      { id: "deploy/docker", version: "1.0.0" },
      { id: "deploy/kubernetes", version: "1.0.0" }
    ]);
    expect(plan.aiSkills.targets).toEqual([
      { agent: "codex", directory: ".agents", enabled: true },
      { agent: "claude-code", directory: ".claude", enabled: true }
    ]);
    expect(plan.skillInstallCommands).toEqual([
      expect.objectContaining({
        command: "npx",
        args: expect.arrayContaining(["skills", "add", "https://github.com/vercel-labs/agent-skills", "--agent", "codex"])
      }),
      expect.objectContaining({
        command: "npx",
        args: expect.arrayContaining(["skills", "add", "https://github.com/vercel-labs/agent-skills", "--agent", "claude-code"])
      })
    ]);
  });

  it("expands a valid preset when creating a plan from config", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stackkit-cli-"));
    tempDirectories.push(directory);
    const configPath = join(directory, "stackkit.config.json");

    await writeFile(
      configPath,
      JSON.stringify(
        {
          projectName: "next-starter",
          preset: "next-only",
          ai: {
            skillTargets: ["codex"]
          }
        },
        null,
        2
      ),
      "utf8"
    );

    let output = "";
    const program = createStackkitProgram();
    program.configureOutput({
      writeOut: (value) => {
        output += value;
      }
    });

    await program.parseAsync(["create", "--config", configPath, "--dry-run"], { from: "user" });

    expect(output).toContain("Stackkit create plan for next-starter");
    expect(output).toContain("Modules: workspace/pnpm-turbo, workspace/typescript, web/nextjs, ui/shadcn, quality/eslint, quality/prettier");

    const json = output.match(/STACKKIT_PLAN_JSON_START\n(?<json>[\s\S]+?)\nSTACKKIT_PLAN_JSON_END/)?.groups?.json;
    expect(json).toBeDefined();

    const plan = JSON.parse(json ?? "{}") as {
      modules: { id: string; version: string }[];
    };

    expect(plan.modules.map((module) => module.id)).toEqual([
      "workspace/pnpm-turbo",
      "workspace/typescript",
      "web/nextjs",
      "ui/shadcn",
      "quality/eslint",
      "quality/prettier"
    ]);
  });

  it("validates a Stackkit config file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stackkit-cli-"));
    tempDirectories.push(directory);
    const configPath = join(directory, "stackkit.config.json");

    await writeFile(
      configPath,
      JSON.stringify(
        {
          projectName: "acme",
          modules: ["workspace/pnpm-turbo", "web/nextjs"]
        },
        null,
        2
      ),
      "utf8"
    );

    let output = "";
    const program = createStackkitProgram();
    program.configureOutput({
      writeOut: (value) => {
        output += value;
      }
    });

    await program.parseAsync(["config", "validate", configPath], { from: "user" });

    expect(output).toContain("Config is valid");
  });

  it("lists and inspects presets", async () => {
    let output = "";
    const program = createStackkitProgram();
    program.configureOutput({
      writeOut: (value) => {
        output += value;
      }
    });

    await program.parseAsync(["preset", "list"], { from: "user" });

    expect(output).toContain("next-only");

    output = "";
    await program.parseAsync(["preset", "inspect", "next-only"], { from: "user" });

    expect(output).toContain("workspace/pnpm-turbo");
  });

  it("does not create the target directory or run skill installs during create --dry-run", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stackkit-cli-"));
    tempDirectories.push(directory);
    const configPath = join(directory, "stackkit.config.json");
    const targetDirectory = join(directory, "acme-dashboard");

    await writeFile(
      configPath,
      JSON.stringify(
        {
          projectName: "acme-dashboard",
          modules: ["workspace/pnpm-turbo", "web/nextjs"],
          ai: {
            skillTargets: ["codex"]
          }
        },
        null,
        2
      ),
      "utf8"
    );

    let runCommandCalls = 0;
    const program = createStackkitProgram({
      runCommand: async () => {
        runCommandCalls += 1;
        return { exitCode: 0, stdout: "", stderr: "" };
      }
    });
    program.configureOutput({ writeOut: () => undefined });

    await program.parseAsync(["create", "--config", configPath, "--dir", targetDirectory, "--dry-run"], { from: "user" });

    await expect(stat(targetDirectory)).rejects.toMatchObject({ code: "ENOENT" });
    expect(runCommandCalls).toBe(0);
  });

  it("writes project files during create --config --dir", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stackkit-cli-"));
    tempDirectories.push(directory);
    const configPath = join(directory, "stackkit.config.json");
    const targetDirectory = join(directory, "created-project");

    await writeFile(
      configPath,
      JSON.stringify(
        {
          projectName: "acme-dashboard",
          modules: ["workspace/pnpm-turbo"],
          ai: {
            skillTargets: ["codex"]
          }
        },
        null,
        2
      ),
      "utf8"
    );

    let output = "";
    const program = createStackkitProgram();
    program.configureOutput({
      writeOut: (value) => {
        output += value;
      }
    });

    await program.parseAsync(["create", "--config", configPath, "--dir", targetDirectory], { from: "user" });

    expect(output).toBe(`Created Stackkit project at ${targetDirectory}\n`);
    await expect(readFile(join(targetDirectory, "package.json"), "utf8")).resolves.toContain(
      "\"name\": \"acme-dashboard\""
    );
    await expect(readFile(join(targetDirectory, ".stackkit", "project.json"), "utf8")).resolves.toContain(
      "\"projectName\": \"acme-dashboard\""
    );
  });
});
