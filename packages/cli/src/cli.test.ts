import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildConfigFromInteractiveAnswers, createStackkitProgram, isDirectCliExecution } from "./index.js";

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

  it("maps interactive answers to Stackkit config", () => {
    expect(
      buildConfigFromInteractiveAnswers({
        projectName: "acme-dashboard",
        preset: "next-fastapi-postgres-auth0",
        aiTargets: ["codex", "claude-code"]
      })
    ).toEqual({
      projectName: "acme-dashboard",
      packageManager: "pnpm",
      workspace: "pnpm-turbo",
      preset: "next-fastapi-postgres-auth0",
      modules: [],
      ai: { skillTargets: ["codex", "claude-code"] }
    });
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

  it("prints an add dry-run summary without modifying the manifest", async () => {
    const projectDirectory = await createManagedProject(["workspace/pnpm-turbo"]);

    const { output } = await runProgram(["add", "web/nextjs", "--dry-run", "--dir", projectDirectory]);

    expect(output).toContain("Stackkit add plan for acme-dashboard");
    expect(output).toContain("Modules to add: web/nextjs");
    expect(output).toContain("STACKKIT_PLAN_JSON_START");

    const manifest = await readManifestFile(projectDirectory);
    expect(manifest.modules.map((module) => module.id)).toEqual(["workspace/pnpm-turbo"]);
  });

  it("applies add by updating the manifest", async () => {
    const projectDirectory = await createManagedProject(["workspace/pnpm-turbo"]);

    const { output } = await runProgram(["add", "web/nextjs", "--dir", projectDirectory]);

    expect(output).toBe("Added web/nextjs to acme-dashboard\n");

    const manifest = await readManifestFile(projectDirectory);
    expect(manifest.modules.map((module) => module.id)).toEqual(["workspace/pnpm-turbo", "web/nextjs"]);
  });

  it("prints a remove dry-run summary", async () => {
    const projectDirectory = await createManagedProject(["workspace/pnpm-turbo", "web/nextjs"]);

    const { output } = await runProgram(["remove", "web/nextjs", "--dry-run", "--dir", projectDirectory]);

    expect(output).toContain("Stackkit remove plan for acme-dashboard");
    expect(output).toContain("Modules to remove: web/nextjs");
    expect(output).toContain("Safe to remove: yes");

    const manifest = await readManifestFile(projectDirectory);
    expect(manifest.modules.map((module) => module.id)).toEqual(["workspace/pnpm-turbo", "web/nextjs"]);
  });

  it("refuses remove without --yes and applies with --yes", async () => {
    const projectDirectory = await createManagedProject(["workspace/pnpm-turbo", "web/nextjs"]);

    await expect(runProgram(["remove", "web/nextjs", "--dir", projectDirectory])).rejects.toThrow("without --yes");

    const { output } = await runProgram(["remove", "web/nextjs", "--yes", "--dir", projectDirectory]);
    expect(output).toBe("Removed web/nextjs from acme-dashboard\n");

    const manifest = await readManifestFile(projectDirectory);
    expect(manifest.modules.map((module) => module.id)).toEqual(["workspace/pnpm-turbo"]);
  });

  it("prints a read-only diff summary without modifying the manifest", async () => {
    const projectDirectory = await createManagedProject(["workspace/pnpm-turbo", "web/nextjs"]);

    const { output } = await runProgram(["diff", "--dir", projectDirectory]);

    expect(output).toContain("Stackkit diff for acme-dashboard");
    expect(output).toContain("STACKKIT_DIFF_JSON_START");
    expect(output).toContain("STACKKIT_DIFF_JSON_END");

    const manifest = await readManifestFile(projectDirectory);
    expect(manifest.migrations.applied).toHaveLength(0);
    await expect(stat(join(projectDirectory, "apps", "web", "instrumentation.ts"))).rejects.toMatchObject({
      code: "ENOENT"
    });
  });

  it("prints planned updates for update --dry-run without changing the manifest", async () => {
    const projectDirectory = await createManagedProject(["workspace/pnpm-turbo", "web/nextjs"]);

    const { output } = await runProgram(["update", "--dry-run", "--dir", projectDirectory]);

    expect(output).toContain("Stackkit update plan for acme-dashboard");
    expect(output).toContain("STACKKIT_UPDATE_JSON_START");

    const manifest = await readManifestFile(projectDirectory);
    expect(manifest.migrations.applied).toHaveLength(0);
    await expect(stat(join(projectDirectory, "apps", "web", "instrumentation.ts"))).rejects.toMatchObject({
      code: "ENOENT"
    });
  });

  it("prints pending migrations for migrate --dry-run without writing files", async () => {
    const projectDirectory = await createManagedProject(["workspace/pnpm-turbo", "web/nextjs"]);

    const { output } = await runProgram(["migrate", "--dry-run", "--dir", projectDirectory]);

    expect(output).toContain("Stackkit migrate plan for acme-dashboard");
    expect(output).toContain("Add Next.js instrumentation hook");
    expect(output).toContain("STACKKIT_MIGRATE_JSON_START");

    await expect(stat(join(projectDirectory, "apps", "web", "instrumentation.ts"))).rejects.toMatchObject({
      code: "ENOENT"
    });
  });

  it("applies automatic migrations with migrate --apply", async () => {
    const projectDirectory = await createManagedProject(["workspace/pnpm-turbo", "web/nextjs"]);

    await runProgram(["migrate", "--apply", "--dir", projectDirectory]);

    const content = await readFile(join(projectDirectory, "apps", "web", "instrumentation.ts"), "utf8");
    expect(content).toContain("register");

    const manifest = await readManifestFile(projectDirectory);
    expect(manifest.migrations.applied).toHaveLength(1);
  });

  it("is idempotent when migrate --apply runs twice", async () => {
    const projectDirectory = await createManagedProject(["workspace/pnpm-turbo", "web/nextjs"]);

    await runProgram(["migrate", "--apply", "--dir", projectDirectory]);
    await runProgram(["migrate", "--apply", "--dir", projectDirectory]);

    const manifest = await readManifestFile(projectDirectory);
    expect(manifest.migrations.applied).toHaveLength(1);
  });
  it("reports a healthy project with doctor", async () => {
    const projectDirectory = await createManagedProject(["workspace/pnpm-turbo"]);

    const { output } = await runProgram(["doctor", "--dir", projectDirectory]);

    expect(output).toContain("Stackkit doctor passed");
    expect(output).toContain("[ok] manifest.exists");
  });

  it("plans skill sync commands from the recorded lock", async () => {
    const projectDirectory = await createManagedProject(["workspace/pnpm-turbo", "web/nextjs"]);

    const { output } = await runProgram(["skills", "sync", "--dir", projectDirectory]);

    expect(output).toContain("Stackkit skills sync plan");
    expect(output).toContain("https://github.com/vercel-labs/agent-skills");
  });

  it("applies skill sync and reports completion", async () => {
    const projectDirectory = await createManagedProject(["workspace/pnpm-turbo", "web/nextjs"]);

    const { output } = await runProgram(["skills", "sync", "--apply", "--dir", projectDirectory]);

    expect(output).toBe("Stackkit skills sync complete\n");
  });
});

async function runProgram(argv: string[]): Promise<{ output: string }> {
  let output = "";
  const program = createStackkitProgram({
    runCommand: async () => ({ exitCode: 0, stdout: "", stderr: "" })
  });
  program.configureOutput({
    writeOut: (value) => {
      output += value;
    }
  });

  await program.parseAsync(argv, { from: "user" });

  return { output };
}

async function createManagedProject(modules: string[]): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "stackkit-cli-"));
  tempDirectories.push(directory);
  const configPath = join(directory, "stackkit.config.json");
  const projectDirectory = join(directory, "acme-dashboard");

  await writeFile(
    configPath,
    JSON.stringify({ projectName: "acme-dashboard", modules, ai: { skillTargets: ["codex"] } }, null, 2),
    "utf8"
  );

  await runProgram(["create", "--config", configPath, "--dir", projectDirectory]);

  return projectDirectory;
}

async function readManifestFile(
  projectDirectory: string
): Promise<{ modules: { id: string }[]; migrations: { applied: unknown[] } }> {
  return JSON.parse(await readFile(join(projectDirectory, ".stackkit", "project.json"), "utf8")) as {
    modules: { id: string }[];
    migrations: { applied: unknown[] };
  };
}
