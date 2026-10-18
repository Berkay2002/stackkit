import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { applyCreatePlan, createCreatePlan, resolveSpawnCommand } from "@berkayorhan/stackkit-core";
import { builtinModules, curatedSkillSourceAllowlist } from "@berkayorhan/stackkit-registry";

import { simulatedRunCommand } from "./index.js";

const tempDirectories: string[] = [];
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const cliEntry = join(repoRoot, "packages", "cli", "dist", "index.js");
// Real installs, builds, and Python tooling. Off in `pnpm test`; `pnpm smoke` (vitest --mode e2e) turns it on.
const realToolchain = process.env.STACKKIT_E2E === "1";

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true, maxRetries: 5 })));
}, 120_000);

describe("generated multi-stack project", () => {
  it("generates representative multi-stack project files with mocked skill installs", async () => {
    const result = await createMultiStackProject();

    await expect(readFile(join(result.projectDirectory, "README.md"), "utf8")).resolves.toContain(
      "# next-fastapi-postgres-auth0"
    );
    await expect(readFile(join(result.projectDirectory, ".env.example"), "utf8")).resolves.toContain("# API");
    await expect(readFile(join(result.projectDirectory, "eslint.config.mjs"), "utf8")).resolves.toContain("@eslint/js");
    await expect(readFile(join(result.projectDirectory, "apps", "web", "package.json"), "utf8")).resolves.toContain("next");
    await expect(readFile(join(result.projectDirectory, "apps", "web", "app", "layout.tsx"), "utf8")).resolves.toContain(
      "RootLayout"
    );
    await expect(readFile(join(result.projectDirectory, "apps", "api", "package.json"), "utf8")).resolves.toContain("uv run pytest");
    await expect(readFile(join(result.projectDirectory, "apps", "api", "app", "main.py"), "utf8")).resolves.toContain("FastAPI");
    await expect(readFile(join(result.projectDirectory, "apps", "api", "app", "auth.py"), "utf8")).resolves.toContain("PyJWKClient");
    await expect(readFile(join(result.projectDirectory, "apps", "api", "migrations", "versions", "0001_create_todos.py"), "utf8")).resolves.toContain("create_table");
    await expect(readFile(join(result.projectDirectory, "apps", "web", "app", "dashboard", "page.tsx"), "utf8")).resolves.toContain("listTodos");
    await expect(readFile(join(result.projectDirectory, "apps", "api", "tests", "test_health.py"), "utf8")).resolves.toContain(
      "test_health"
    );
    await expect(readFile(join(result.projectDirectory, "docker-compose.yml"), "utf8")).resolves.toContain("postgres:17-alpine");
    const rootPackageJson = JSON.parse(await readFile(join(result.projectDirectory, "package.json"), "utf8"));
    expect(rootPackageJson.scripts).toEqual(
      expect.objectContaining({
        dev: "turbo run dev",
        build: "turbo run build",
        test: "turbo run test",
        typecheck: "turbo run typecheck",
        lint: "turbo run lint",
        format: "turbo run format"
      })
    );
    expect(result.doctor.ok).toBe(true);
  });

  it.runIf(realToolchain)("installs, tests, builds, and doctors the generated project with real tooling", async () => {
    const result = await createMultiStackProject();
    const turboBinPath = join(result.projectDirectory, "node_modules", ".bin", process.platform === "win32" ? "turbo.CMD" : "turbo");
    const lifecycle = await runGeneratedLifecycle({
      projectDirectory: result.projectDirectory,
      repoRoot,
      cliEntry,
      hasTurboBin: () => pathExists(turboBinPath),
      runCommand
    });

    if (process.env.CI) {
      // CI installs uv, so a skipped Python branch means the gate silently lost coverage.
      expect(lifecycle.skipped).toEqual([]);
    }

    for (const skipped of lifecycle.skipped) {
      console.warn(skipped);
    }
  }, 900_000);

  it("runs web-only generated checks when uv is unavailable", async () => {
    const calls: Array<{ command: string; args: readonly string[]; cwd: string; allowFailure: boolean }> = [];

    const result = await runGeneratedLifecycle({
      projectDirectory: "generated-project",
      repoRoot: "repo-root",
      cliEntry: "cli-entry.js",
      hasTurboBin: async () => true,
      runCommand: async (command, args, cwd, options = {}) => {
        calls.push({ command, args, cwd, allowFailure: options.allowFailure === true });

        if (command === "uv") {
          return { exitCode: 1, stdout: "", stderr: "uv was not found" };
        }

        if (command === "node") {
          return { exitCode: 0, stdout: "Stackkit doctor passed", stderr: "" };
        }

        return { exitCode: 0, stdout: "ok", stderr: "" };
      }
    });

    expect(result.skipped).toEqual(["Skipping generated Python/API runtime checks: uv is not installed."]);
    expect(calls.map((call) => [call.command, call.args])).toEqual([
      ["pnpm", ["install", "--lockfile-only"]],
      ["uv", ["--version"]],
      ["pnpm", ["--dir", "apps/web", "test"]],
      ["pnpm", ["--dir", "apps/web", "typecheck"]],
      ["pnpm", ["--dir", "apps/web", "build"]],
      ["pnpm", ["--dir", "apps/web", "lint"]],
      ["node", ["cli-entry.js", "doctor", "--dir", "generated-project"]]
    ]);
    expect(calls.find((call) => call.command === "uv")?.allowFailure).toBe(true);
    expect(calls.some((call) => call.command === "pnpm" && call.args.length === 1)).toBe(false);
    expect(calls.some((call) => call.args.includes("apps/api"))).toBe(false);
  });
});

async function createMultiStackProject() {
  const parent = await mkdtemp(join(tmpdir(), "stackkit-example-multi-"));
  tempDirectories.push(parent);

  const plan = createCreatePlan({
    config: {
      projectName: "next-fastapi-postgres-auth0",
      packageManager: "pnpm",
      workspace: "pnpm-turbo",
      modules: [
        "workspace/pnpm-turbo",
        "workspace/typescript",
        "web/nextjs",
        "ui/shadcn",
        "api/fastapi",
        "db/postgres",
        "db/sqlalchemy",
        "postgres/local",
        "auth/auth0-nextjs",
        "auth/auth0-fastapi",
        "deploy/docker",
        "quality/eslint",
        "quality/prettier",
        "quality/ruff",
        "quality/pytest"
      ],
      ai: { skillTargets: ["codex"] }
    },
    availableModules: builtinModules,
    curatedSkillSourceAllowlist
  });

  return applyCreatePlan(plan, {
    parentDirectory: parent,
    runCommand: simulatedRunCommand(join(parent, "next-fastapi-postgres-auth0"))
  });
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

type CommandResult = { exitCode: number; stdout: string; stderr: string };
type CommandOptions = { allowFailure?: boolean };
type CommandRunner = (
  command: string,
  args: readonly string[],
  cwd: string,
  options?: CommandOptions
) => Promise<CommandResult>;

async function runGeneratedLifecycle({
  projectDirectory,
  repoRoot,
  cliEntry,
  hasTurboBin,
  runCommand
}: {
  projectDirectory: string;
  repoRoot: string;
  cliEntry: string;
  hasTurboBin: () => Promise<boolean>;
  runCommand: CommandRunner;
}): Promise<{ skipped: string[] }> {
  const skipped: string[] = [];

  await runCommand("pnpm", ["install", "--lockfile-only"], projectDirectory);

  if (!(await hasTurboBin())) {
    await runCommand("pnpm", ["install", "--ignore-scripts"], projectDirectory);
  }

  const uvAvailable = (await runCommand("uv", ["--version"], projectDirectory, { allowFailure: true })).exitCode === 0;

  if (uvAvailable) {
    await runCommand("pnpm", ["test"], projectDirectory);
    await runCommand("pnpm", ["typecheck"], projectDirectory);
    await runCommand("pnpm", ["build"], projectDirectory);
    await runCommand("pnpm", ["lint"], projectDirectory);
    await runCommand("pnpm", ["--dir", "apps/api", "exec", "uv", "run", "pytest"], projectDirectory);
  } else {
    skipped.push("Skipping generated Python/API runtime checks: uv is not installed.");

    for (const script of ["test", "typecheck", "build", "lint"]) {
      await runCommand("pnpm", ["--dir", "apps/web", script], projectDirectory);
    }
  }

  const doctor = await runCommand("node", [cliEntry, "doctor", "--dir", projectDirectory], repoRoot);
  const doctorOutput = `${doctor.stdout}${doctor.stderr}`;
  expect(doctorOutput).toContain("Stackkit doctor passed");
  expect(doctorOutput).not.toContain("Managed file was modified");

  return { skipped };
}

async function runCommand(
  command: string,
  args: readonly string[],
  cwd: string,
  options: CommandOptions = {}
): Promise<CommandResult> {
  const result = await new Promise<CommandResult>((resolve, reject) => {
    const invocation = resolveSpawnCommand(command, args);
    const child = spawn(invocation.command, invocation.args, {
      cwd,
      windowsVerbatimArguments: invocation.windowsVerbatimArguments,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Command timed out: ${command} ${args.join(" ")}`));
    }, 600_000);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });

  if (!options.allowFailure && result.exitCode !== 0) {
    throw new Error(
      `Command failed: ${command} ${args.join(" ")}\nexitCode=${result.exitCode}\nstdout=${result.stdout}\nstderr=${result.stderr}`
    );
  }

  return result;
}
