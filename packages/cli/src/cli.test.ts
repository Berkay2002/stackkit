import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { type RunCommand } from "@berkayorhan/stackkit-core";

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
      "info",
      "module",
      "skills",
      "recipe",
      "preset",
      "registry",
      "config"
    ]);
  });

  it("groups nested lifecycle commands by domain", () => {
    const program = createStackkitProgram();

    expect(program.commands.find((command) => command.name() === "skills")?.commands.map((command) => command.name())).toEqual([
      "sync",
      "update"
    ]);
    expect(program.commands.find((command) => command.name() === "recipe")?.commands.map((command) => command.name())).toEqual([
      "encode",
      "decode",
      "inspect"
    ]);
    expect(program.commands.find((command) => command.name() === "preset")?.commands.map((command) => command.name())).toEqual([
      "list",
      "inspect"
    ]);
    expect(program.commands.find((command) => command.name() === "registry")?.commands.map((command) => command.name())).toEqual([
      "list"
    ]);
    expect(program.commands.find((command) => command.name() === "module")?.commands.map((command) => command.name())).toEqual([
      "list",
      "search",
      "inspect"
    ]);
    expect(program.commands.find((command) => command.name() === "config")?.commands.map((command) => command.name())).toEqual([
      "validate"
    ]);
  });

  it("detects when the CLI module is the executed process entrypoint", () => {
    const entrypoint = "C:\\Users\\berka\\Project\\my-monorepo\\packages\\cli\\dist\\index.js";

    expect(isDirectCliExecution(new URL(`file:///${entrypoint.replaceAll("\\", "/")}`).href, entrypoint)).toBe(true);
    expect(isDirectCliExecution("file:///c:/Users/berka/Project/my-monorepo/packages/cli/dist/index.js", entrypoint)).toBe(true);
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

  it("accepts a project name positional argument for create", async () => {
    const { output } = await runProgram(["create", "acme", "--dry-run"]);

    expect(output).toContain("Stackkit create plan for acme");
    expect(output).toContain("STACKKIT_PLAN_JSON_START");
  });

  it("accepts comma-separated AI targets", async () => {
    const { output } = await runProgram(["create", "acme", "--dry-run", "--ai", "codex,claude-code"]);

    expect(output).toContain("codex -> .agents");
    expect(output).toContain("claude-code -> .claude");
  });

  it("resolves stack-axis create flags to canonical module ids", async () => {
    const { output } = await runProgram([
      "create",
      "acme",
      "--web",
      "next",
      "--api",
      "fastapi",
      "--db",
      "postgres",
      "--auth",
      "auth0",
      "--dry-run"
    ]);
    const plan = readCreatePlan(output);

    expect(output).toContain("Next.js");
    expect(plan.modules.map((module) => module.id)).toEqual([
      "workspace/pnpm-turbo",
      "workspace/typescript",
      "web/nextjs",
      "ui/shadcn",
      "api/fastapi",
      "db/postgres",
      "db/sqlalchemy",
      "auth/auth0-nextjs",
      "auth/auth0-fastapi",
      // Default tooling is gap-filled after stack-axis resolution: TS (eslint/prettier/tsc)
      // and Python (ruff/mypy) defaults for the present languages.
      "quality/eslint",
      "quality/prettier",
      "quality/tsc",
      "quality/ruff",
      "quality/mypy"
    ]);
  });

  it("rejects --auth auth0 without a framework axis", async () => {
    await expect(runProgram(["create", "acme", "--auth", "auth0", "--dry-run"])).rejects.toThrow(
      "Auth0 requires a supported framework context"
    );
  });

  it("rejects auth0 as a generic --with module alias", async () => {
    await expect(runProgram(["create", "acme", "--web", "next", "--with", "auth0", "--dry-run"])).rejects.toThrow(
      "Unknown Stackkit module or alias: auth0"
    );
  });

  it("rejects --with concrete auth modules that conflict with --auth", async () => {
    await expect(
      runProgram(["create", "acme", "--web", "next", "--auth", "clerk", "--with", "auth0-nextjs", "--dry-run"])
    ).rejects.toThrow("Conflicting auth providers: clerk, auth0");
  });

  it("rejects --with auth aliases that conflict with --auth", async () => {
    await expect(
      runProgram(["create", "acme", "--web", "next", "--auth", "better-auth", "--with", "clerk", "--dry-run"])
    ).rejects.toThrow("Conflicting auth providers: better-auth, clerk");
  });

  it("merges preset modules with stack-axis additions", async () => {
    const { output } = await runProgram([
      "create",
      "acme",
      "--preset",
      "next-postgres-clerk",
      "--with",
      "docker",
      "--deploy",
      "vercel",
      "--dry-run"
    ]);
    const plan = readCreatePlan(output);

    expect(plan.modules.map((module) => module.id)).toEqual(
      expect.arrayContaining(["db/postgres", "db/drizzle", "auth/clerk", "deploy/docker", "deploy/vercel"])
    );
  });

  it("accepts skills plan mode", async () => {
    const { output } = await runProgram(["create", "acme", "--dry-run", "--skills", "plan"]);
    const plan = readCreatePlan(output);

    expect(output).toContain("AI skill mode: plan");
    expect(plan.aiSkills.mode).toBe("plan");
    expect(plan.aiSkills.planned).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          skills: ["vercel-react-best-practices"],
          trust: "official"
        })
      ])
    );
  });

  it("omits skill commands and guidance from create dry-run in skills skip mode", async () => {
    const { output } = await runProgram(["create", "acme", "--dry-run", "--skills", "skip", "--ai", "codex,claude-code"]);
    const plan = readCreatePlan(output);

    expect(output).toContain("AI skill mode: skip");
    expect(plan.skillInstallCommands).toEqual([]);
    expect(plan.aiSkills.local).toEqual([]);
    expect(plan.aiSkills.planned).toEqual([]);
    expect(plan.aiSkills.unresolved).toEqual([]);
  });

  it("omits the copy override when symlink link mode is selected", async () => {
    const { output } = await runProgram(["create", "acme", "--dry-run", "--skill-link", "symlink"]);
    const plan = readCreatePlan(output);

    expect(output).toContain("AI skill link mode: symlink");
    expect(plan.aiSkills.linkMode).toBe("symlink");
    expect(plan.skillInstallCommands[0]?.args).not.toContain("--copy");
    expect(plan.skillInstallCommands[0]?.args).not.toContain("--symlink");
  });

  it("uses --pm to override the package manager in create dry-run", async () => {
    const { output } = await runProgram(["create", "acme", "--pm", "bun", "--dry-run"]);
    const plan = readCreatePlan(output);
    const packageJson = JSON.parse(plan.filePlan.files.find((file) => file.path === "package.json")?.content ?? "{}");

    expect(output).toContain("Package manager: bun");
    expect(plan.packageManager).toBe("bun");
    expect(packageJson.packageManager).toContain("bun@");
  });

  it("prints planned file content with create --dry-run --view", async () => {
    const { output } = await runProgram(["create", "acme", "--dry-run", "--view", "package.json"]);

    expect(output).toContain("Stackkit file view: package.json");
    expect(output).toContain('"name": "acme"');
    expect(output).not.toContain("STACKKIT_PLAN_JSON_START");
  });

  it("prints file-oriented diffs with create --dry-run --diff", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stackkit-cli-"));
    tempDirectories.push(directory);
    const targetDirectory = join(directory, "acme");
    await writeFile(join(directory, "package.json"), "{}\n", "utf8");

    const { output } = await runProgram(["create", "acme", "--dry-run", "--dir", targetDirectory, "--diff"]);

    expect(output).toContain("Stackkit create diff for acme");
    expect(output).toContain("+++ package.json");
    expect(output).toContain("+  \"name\": \"acme\"");
  });

  it("uses --package-manager to override config packageManager in create dry-run", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stackkit-cli-"));
    tempDirectories.push(directory);
    const configPath = join(directory, "stackkit.config.json");

    await writeFile(
      configPath,
      JSON.stringify(
        {
          projectName: "from-config",
          packageManager: "npm",
          modules: ["workspace/pnpm-turbo"],
          ai: { skillTargets: ["codex"] }
        },
        null,
        2
      ),
      "utf8"
    );

    const { output } = await runProgram(["create", "--config", configPath, "--package-manager", "yarn", "--dry-run"]);
    const plan = readCreatePlan(output);
    const packageJson = JSON.parse(plan.filePlan.files.find((file) => file.path === "package.json")?.content ?? "{}");

    expect(output).toContain("Package manager: yarn");
    expect(plan.packageManager).toBe("yarn");
    expect(packageJson.packageManager).toContain("yarn@");
  });

  it("uses a positional project name to override config projectName", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stackkit-cli-"));
    tempDirectories.push(directory);
    const configPath = join(directory, "stackkit.config.json");

    await writeFile(
      configPath,
      JSON.stringify(
        {
          projectName: "from-config",
          modules: ["workspace/pnpm-turbo"],
          ai: { skillTargets: ["codex"] }
        },
        null,
        2
      ),
      "utf8"
    );

    const { output } = await runProgram(["create", "from-position", "--config", configPath, "--dry-run"]);

    expect(output).toContain("Stackkit create plan for from-position");
    expect(output).toContain('"projectName": "from-position"');
  });

  it("rejects invalid scripted project names", async () => {
    await expect(runProgram(["create", "Acme Dashboard", "--dry-run"])).rejects.toThrow("Invalid project name");
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
          preset: "next",
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
      "quality/prettier",
      "quality/tsc"
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

    expect(output).toContain("next");

    output = "";
    await program.parseAsync(["preset", "inspect", "next"], { from: "user" });

    expect(output).toContain("workspace/pnpm-turbo");
  });

  it("lists the built-in registry", async () => {
    const { output } = await runProgram(["registry", "list"]);

    expect(output).toContain("@stackkit");
    expect(output).toContain("Stackkit built-in registry");
  });

  it("lists registries as JSON", async () => {
    const { output } = await runProgram(["registry", "list", "--json"]);

    expect(JSON.parse(output)).toEqual([
      expect.objectContaining({
        namespace: "@stackkit",
        source: "builtin"
      })
    ]);
  });

  it("includes local registries declared in config", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stackkit-cli-registry-"));
    tempDirectories.push(directory);
    const configPath = join(directory, "stackkit.config.json");
    await writeFile(
      join(directory, "stackkit.registry.json"),
      JSON.stringify({
        schemaVersion: 1,
        namespace: "@acme",
        name: "Acme local registry",
        modules: [],
        presets: []
      }),
      "utf8"
    );
    await writeFile(
      configPath,
      JSON.stringify({
        projectName: "acme",
        registries: {
          "@acme": "./stackkit.registry.json"
        }
      }),
      "utf8"
    );

    const { output } = await runProgram(["registry", "list", "--config", configPath]);

    expect(output).toContain("@stackkit");
    expect(output).toContain("@acme");
    expect(output).toContain("local");
  });

  it("rejects remote registries declared in config", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stackkit-cli-registry-"));
    tempDirectories.push(directory);
    const configPath = join(directory, "stackkit.config.json");
    await writeFile(
      configPath,
      JSON.stringify({
        projectName: "acme",
        registries: {
          "@acme": "https://example.com/stackkit.registry.json"
        }
      }),
      "utf8"
    );

    await expect(runProgram(["registry", "list", "--config", configPath])).rejects.toThrow(
      "Remote registries are not supported yet"
    );
  });

  it("encodes and decodes recipes", async () => {
    const encoded = await runProgram(["recipe", "encode", "--preset", "next"]);
    const code = encoded.output.trim();

    expect(code).toMatch(/^sk_/);

    const decoded = await runProgram(["recipe", "decode", code, "--json"]);

    expect(JSON.parse(decoded.output)).toEqual(expect.objectContaining({ preset: "next" }));
  });

  it("encodes config recipes without project names", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stackkit-cli-"));
    tempDirectories.push(directory);
    const configPath = join(directory, "stackkit.config.json");
    await writeFile(
      configPath,
      JSON.stringify(
        {
          projectName: "from-config",
          preset: "next-postgres-better-auth",
          modules: ["deploy/docker"],
          ai: { skillTargets: ["codex"] }
        },
        null,
        2
      ),
      "utf8"
    );

    const encoded = await runProgram(["recipe", "encode", "--config", configPath]);
    const decoded = await runProgram(["recipe", "decode", encoded.output.trim(), "--json"]);
    const recipe = JSON.parse(decoded.output) as { projectName?: string; preset: string; modules: string[] };

    expect(recipe.projectName).toBeUndefined();
    expect(recipe.preset).toBe("next-postgres-better-auth");
    expect(recipe.modules).toEqual(["deploy/docker"]);
  });

  it("creates from a recipe and uses the positional project name", async () => {
    const encoded = await runProgram(["recipe", "encode", "--preset", "next-postgres-clerk"]);
    const code = encoded.output.trim();
    const { output } = await runProgram(["create", "acme", "--recipe", code, "--dry-run"]);
    const plan = readCreatePlan(output);

    expect(plan.projectName).toBe("acme");
    expect(plan.modules.map((module) => module.id)).toEqual(
      expect.arrayContaining(["web/nextjs", "db/postgres", "db/drizzle", "auth/clerk"])
    );
  });

  it("uses --pm to override the recipe package manager in create dry-run", async () => {
    const encoded = await runProgram(["recipe", "encode", "--preset", "next"]);
    const code = encoded.output.trim();
    const { output } = await runProgram(["create", "acme", "--recipe", code, "--pm", "bun", "--dry-run"]);
    const plan = readCreatePlan(output);

    expect(output).toContain("Package manager: bun");
    expect(plan.packageManager).toBe("bun");
  });

  it("records recipe provenance in the generated manifest during create --recipe", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stackkit-cli-"));
    tempDirectories.push(directory);
    const targetDirectory = join(directory, "recipe-project");
    const encoded = await runProgram(["recipe", "encode", "--preset", "next"]);
    const code = encoded.output.trim();

    await runProgram(["create", "acme", "--recipe", code, "--dir", targetDirectory, "--yes"]);

    const manifest = await readManifestFile(targetDirectory);
    expect(manifest.source).toEqual({ kind: "recipe", code });
  });

  it("rejects combining create --recipe with --config", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stackkit-cli-"));
    tempDirectories.push(directory);
    const configPath = join(directory, "stackkit.config.json");
    await writeFile(configPath, JSON.stringify({ projectName: "acme", modules: [] }, null, 2), "utf8");
    const encoded = await runProgram(["recipe", "encode", "--preset", "next"]);

    await expect(runProgram(["create", "acme", "--recipe", encoded.output.trim(), "--config", configPath, "--dry-run"])).rejects.toThrow(
      "Cannot combine --recipe and --config"
    );
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
      registries: {},
      ai: {
        skillTargets: ["codex", "claude-code"],
        skillMode: "install",
        linkMode: "copy"
      }
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

    await program.parseAsync(["create", "--config", configPath, "--dir", targetDirectory, "--yes"], { from: "user" });

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

  it("prints planned file content with add --dry-run --view", async () => {
    const projectDirectory = await createManagedProject(["workspace/pnpm-turbo"]);

    const { output } = await runProgram(["add", "web/nextjs", "--dry-run", "--view", "apps/web/package.json", "--dir", projectDirectory]);

    expect(output).toContain("Stackkit file view: apps/web/package.json");
    expect(output).toContain('"name": "@acme/web"');
  });

  it("prints file-oriented diffs with add --dry-run --diff", async () => {
    const projectDirectory = await createManagedProject(["workspace/pnpm-turbo"]);

    const { output } = await runProgram(["add", "web/nextjs", "--dry-run", "--diff", "--dir", projectDirectory]);

    expect(output).toContain("Stackkit add diff for acme-dashboard");
    expect(output).toContain("+++ apps/web/package.json");
    expect(output).toContain('+  "name": "@acme/web"');
  });

  it("applies add by updating the manifest", async () => {
    const projectDirectory = await createManagedProject(["workspace/pnpm-turbo"]);

    const { output } = await runProgram(["add", "web/nextjs", "--dir", projectDirectory]);

    expect(output).toBe("Added web/nextjs to acme-dashboard\n");

    const manifest = await readManifestFile(projectDirectory);
    expect(manifest.modules.map((module) => module.id)).toEqual(["workspace/pnpm-turbo", "web/nextjs"]);
  });

  it("plans curated skills when adding a builtin curated module in plan mode", async () => {
    const projectDirectory = await createManagedProject(["workspace/pnpm-turbo"], { skillMode: "plan" });

    await runProgram(["add", "web/django", "--dir", projectDirectory]);

    const manifest = await readManifestFile(projectDirectory);
    expect(manifest.aiSkills.installed).toEqual([]);
    expect(manifest.aiSkills.planned).toEqual([
      expect.objectContaining({
        source: "https://github.com/affaan-m/everything-claude-code",
        skills: ["django-patterns", "django-security", "django-tdd", "django-verification"],
        trust: "curated",
        causedBy: "web/django"
      })
    ]);
    expect(manifest.aiSkills.unresolved).toEqual([]);
  });

  it("installs curated skills when adding a builtin curated module in install mode", async () => {
    const projectDirectory = await createManagedProject(["workspace/pnpm-turbo"]);
    const runCommandCalls: { command: string; args: string[]; options: { cwd?: string } }[] = [];
    const runCommand: RunCommand = async (command, args, options) => {
      runCommandCalls.push({ command, args: [...args], options });

      return { exitCode: 0, stdout: "installed", stderr: "" };
    };

    await runProgram(["add", "web/django", "--dir", projectDirectory], { runCommand });

    expect(runCommandCalls).toEqual([
      expect.objectContaining({
        command: "npx",
        args: expect.arrayContaining([
          "skills",
          "add",
          "https://github.com/affaan-m/everything-claude-code",
          "--skill",
          "django-patterns",
          "django-security",
          "django-tdd",
          "django-verification",
          "--agent",
          "codex"
        ]),
        options: { cwd: projectDirectory }
      })
    ]);

    const manifest = await readManifestFile(projectDirectory);
    expect(manifest.aiSkills.installed).toEqual([
      expect.objectContaining({
        source: "https://github.com/affaan-m/everything-claude-code",
        skills: ["django-patterns", "django-security", "django-tdd", "django-verification"],
        trust: "curated",
        causedBy: "web/django"
      })
    ]);
    expect(manifest.aiSkills.unresolved).toEqual([]);
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

  it("prints a managed file diff", async () => {
    const projectDirectory = await createManagedProject(["workspace/pnpm-turbo"]);
    await writeFile(join(projectDirectory, "package.json"), "{}\n", "utf8");

    const { output } = await runProgram(["diff", "--file", "package.json", "--cwd", projectDirectory]);

    expect(output).toContain("Stackkit file diff: package.json");
    expect(output).toContain("--- expected");
    expect(output).toContain("+++ current");
  });

  it("prints project info as JSON", async () => {
    const projectDirectory = await createManagedProject(["workspace/pnpm-turbo"]);

    const { output } = await runProgram(["info", "--json", "--cwd", projectDirectory]);

    expect(JSON.parse(output)).toEqual(
      expect.objectContaining({
        project: expect.objectContaining({ name: "acme-dashboard", packageManager: "pnpm" }),
        modules: [{ id: "workspace/pnpm-turbo", version: "1.0.0" }]
      })
    );
  });

  it("prints project info for humans", async () => {
    const projectDirectory = await createManagedProject(["workspace/pnpm-turbo"]);

    const { output } = await runProgram(["info", "--cwd", projectDirectory]);

    expect(output).toContain("Stackkit project: acme-dashboard");
    expect(output).toContain("Package manager: pnpm");
    expect(output).toContain("Modules:");
    expect(output).toContain("- workspace/pnpm-turbo");
  });

  it("renders doctor actions", async () => {
    const projectDirectory = await createManagedProject(["workspace/pnpm-turbo"]);
    await writeFile(join(projectDirectory, "package.json"), "{}\n", "utf8");

    const { output } = await runProgram(["doctor", "--dir", projectDirectory]);

    expect(output).toContain("Run: stackkit diff --file package.json");
  });

  it("lists modules by friendly alias", async () => {
    const { output } = await runProgram(["module", "list"]);

    expect(output).toContain("fastapi");
    expect(output).toContain("Next.js");
  });

  it("searches modules by query", async () => {
    const { output } = await runProgram(["module", "search", "rust", "--json"]);
    const modules = JSON.parse(output) as { id: string }[];

    expect(modules.map((module) => module.id)).toContain("rust/axum");
  });

  it("inspects a module alias as JSON", async () => {
    const { output } = await runProgram(["module", "inspect", "fastapi", "--json"]);

    expect(JSON.parse(output)).toEqual(expect.objectContaining({ id: "api/fastapi" }));
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

async function runProgram(
  argv: string[],
  options: { runCommand?: RunCommand } = {}
): Promise<{ output: string }> {
  let output = "";
  const program = createStackkitProgram({
    runCommand: options.runCommand ?? (async () => ({ exitCode: 0, stdout: "", stderr: "" }))
  });
  program.configureOutput({
    writeOut: (value) => {
      output += value;
    }
  });

  await program.parseAsync(argv, { from: "user" });

  return { output };
}

function readCreatePlan(output: string): {
  projectName: string;
  packageManager: string;
  modules: { id: string; version: string }[];
  filePlan: { files: { path: string; content: string }[] };
  aiSkills: {
    mode: string;
    linkMode: string;
    local: unknown[];
    planned: unknown[];
    unresolved: unknown[];
  };
  skillInstallCommands: { args: string[] }[];
} {
  const json = output.match(/STACKKIT_PLAN_JSON_START\n(?<json>[\s\S]+?)\nSTACKKIT_PLAN_JSON_END/)?.groups?.json;

  return JSON.parse(json ?? "{}") as {
    projectName: string;
    packageManager: string;
    modules: { id: string; version: string }[];
    filePlan: { files: { path: string; content: string }[] };
    aiSkills: {
      mode: string;
      linkMode: string;
      local: unknown[];
      planned: unknown[];
      unresolved: unknown[];
    };
    skillInstallCommands: { args: string[] }[];
  };
}

async function createManagedProject(
  modules: string[],
  ai: { skillMode?: "install" | "plan" | "skip" } = {}
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "stackkit-cli-"));
  tempDirectories.push(directory);
  const configPath = join(directory, "stackkit.config.json");
  const projectDirectory = join(directory, "acme-dashboard");

  await writeFile(
    configPath,
    JSON.stringify({ projectName: "acme-dashboard", modules, ai: { skillTargets: ["codex"], ...ai } }, null, 2),
    "utf8"
  );

  await runProgram(["create", "--config", configPath, "--dir", projectDirectory, "--yes"]);

  return projectDirectory;
}

async function readManifestFile(
  projectDirectory: string
): Promise<{
  source: { kind: string; code?: string; path?: string };
  modules: { id: string }[];
  aiSkills: {
    installed: unknown[];
    planned: unknown[];
    unresolved: unknown[];
  };
  migrations: { applied: unknown[] };
}> {
  return JSON.parse(await readFile(join(projectDirectory, ".stackkit", "project.json"), "utf8")) as {
    source: { kind: string; code?: string; path?: string };
    modules: { id: string }[];
    aiSkills: {
      installed: unknown[];
      planned: unknown[];
      unresolved: unknown[];
    };
    migrations: { applied: unknown[] };
  };
}
