import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { applyCreatePlan, createCreatePlan, resolveSpawnCommand, resolveStackAxes } from "@berkayorhan/stackkit-core";
import { builtinModules, curatedSkillSourceAllowlist } from "@berkayorhan/stackkit-registry";

const tempDirectories: string[] = [];
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const cliEntry = join(repoRoot, "packages", "cli", "dist", "index.js");

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
}, 120_000);

describe("create integration", () => {
  it("generates a Next.js and ShadCN project from config", async () => {
    const parent = await mkdtemp(join(tmpdir(), "stackkit-example-"));
    tempDirectories.push(parent);

    const plan = createCreatePlan({
      config: {
        projectName: "next-shadcn",
        packageManager: "pnpm",
        workspace: "pnpm-turbo",
        modules: ["workspace/pnpm-turbo", "workspace/typescript", "web/nextjs", "ui/shadcn", "deploy/vercel"],
        ai: { skillTargets: ["codex"] }
      },
      availableModules: builtinModules,
      curatedSkillSourceAllowlist
    });

    const result = await applyCreatePlan(plan, {
      parentDirectory: parent,
      runCommand: async (command, args, options) => {
        await simulateNativeInitializer(command, args, options.cwd ?? resultlessProjectDirectory(parent, "next-shadcn"));

        return { exitCode: 0, stdout: "ok", stderr: "" };
      }
    });

    await expect(readFile(join(result.projectDirectory, "apps", "web", "package.json"), "utf8")).resolves.toContain("next");
    await expect(readFile(join(result.projectDirectory, "apps", "web", "components.json"), "utf8")).resolves.toContain(
      "@workspace/ui/components"
    );
    await expect(readFile(join(result.projectDirectory, "packages", "ui", "components.json"), "utf8")).resolves.toContain(
      "radix-nova"
    );
    await expect(readFile(join(result.projectDirectory, "packages", "ui", "src", "styles", "globals.css"), "utf8")).resolves.toContain(
      '@import "tailwindcss"'
    );
    await expect(readFile(join(result.projectDirectory, ".stackkit", "project.json"), "utf8")).resolves.toContain("web/nextjs");
    await expect(readFile(join(result.projectDirectory, "skills-lock.json"), "utf8")).resolves.toContain("vercel-react-best-practices");
    // The native initializer creates packages/ui/src/lib/utils.ts even though it is not in the
    // initializer's declared expectedFiles. Stackkit must still take ownership of it.
    const utilsFile = result.manifest.files.find((file) => file.path === "packages/ui/src/lib/utils.ts");
    expect(utilsFile).toBeDefined();
    expect(utilsFile?.owner).toBe("ui/shadcn");
    expect(result.doctor.ok).toBe(true);
  });

  it("generates representative multi-stack project files with mocked skill installs", async () => {
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
          "auth/auth0-nextjs",
          "auth/auth0-fastapi",
          "deploy/vercel",
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

    const result = await applyCreatePlan(plan, {
      parentDirectory: parent,
      runCommand: async (command, args, options) => {
        await simulateNativeInitializer(command, args, options.cwd ?? resultlessProjectDirectory(parent, "next-fastapi-postgres-auth0"));

        return { exitCode: 0, stdout: "ok", stderr: "" };
      }
    });

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
    await expect(readFile(join(result.projectDirectory, "apps", "api", "tests", "test_health.py"), "utf8")).resolves.toContain(
      "test_health"
    );
    await expect(readFile(join(result.projectDirectory, "docker-compose.yml"), "utf8")).resolves.toContain("services:");
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

    const turboBinPath = join(result.projectDirectory, "node_modules", ".bin", process.platform === "win32" ? "turbo.CMD" : "turbo");
    const lifecycle = await runGeneratedLifecycle({
      projectDirectory: result.projectDirectory,
      repoRoot,
      cliEntry,
      hasTurboBin: () => pathExists(turboBinPath),
      runCommand
    });

    for (const skipped of lifecycle.skipped) {
      console.warn(skipped);
    }
  }, 180_000);

  it("generates root lint config for CLI-axis Next.js stacks", async () => {
    const parent = await mkdtemp(join(tmpdir(), "stackkit-example-axis-"));
    tempDirectories.push(parent);

    const modules = resolveStackAxes(
      {
        web: "next",
        api: "fastapi",
        db: "postgres",
        auth: "auth0",
        with: ["shadcn", "docker"],
        deploy: ["vercel"]
      },
      builtinModules
    );
    const plan = createCreatePlan({
      config: {
        projectName: "final-stackkit-app",
        packageManager: "pnpm",
        workspace: "pnpm-turbo",
        modules,
        ai: { skillMode: "skip", skillTargets: ["codex"] }
      },
      availableModules: builtinModules,
      curatedSkillSourceAllowlist
    });

    const result = await applyCreatePlan(plan, {
      parentDirectory: parent,
      runCommand: async (command, args, options) => {
        await simulateNativeInitializer(command, args, options.cwd ?? resultlessProjectDirectory(parent, "final-stackkit-app"));

        return { exitCode: 0, stdout: "ok", stderr: "" };
      }
    });

    await expect(readFile(join(result.projectDirectory, "eslint.config.mjs"), "utf8")).resolves.toContain("@eslint/js");
    await expect(readFile(join(result.projectDirectory, "apps", "web", "package.json"), "utf8")).resolves.toContain(
      "../../eslint.config.mjs"
    );
  }, 60_000);

  it("scaffolds correct env, client, and config files for each Postgres provider", async () => {
    type ProviderCase = {
      provider: string;
      runtime?: "node" | "edge";
      clientImport: string;
      envContains?: string;
      file?: { path: string; contains: string };
    };

    const cases: ProviderCase[] = [
      { provider: "byo", clientImport: "drizzle-orm/node-postgres" },
      { provider: "neon", clientImport: "drizzle-orm/node-postgres" },
      { provider: "neon", runtime: "edge", clientImport: "@neondatabase/serverless" },
      { provider: "supabase", clientImport: "drizzle-orm/node-postgres", envContains: "DIRECT_URL" },
      {
        provider: "supabase-local",
        clientImport: "drizzle-orm/node-postgres",
        envContains: "DIRECT_URL",
        file: { path: join("supabase", "config.toml"), contains: "port = 54322" }
      },
      {
        provider: "postgres-local",
        clientImport: "drizzle-orm/node-postgres",
        file: { path: "docker-compose.db.yml", contains: "postgres:17" }
      }
    ];

    for (const testCase of cases) {
      const parent = await mkdtemp(join(tmpdir(), `stackkit-provider-${testCase.provider}-`));
      tempDirectories.push(parent);

      const modules = resolveStackAxes(
        { web: "next", db: "postgres", dbProvider: testCase.provider === "byo" ? undefined : testCase.provider },
        builtinModules
      );
      const plan = createCreatePlan({
        config: {
          projectName: "provider-app",
          packageManager: "pnpm",
          workspace: "pnpm-turbo",
          modules,
          options: testCase.runtime === "edge" ? { "db/drizzle": { runtime: "edge" } } : undefined,
          ai: { skillMode: "skip", skillTargets: ["codex"] }
        },
        availableModules: builtinModules,
        curatedSkillSourceAllowlist
      });

      const result = await applyCreatePlan(plan, {
        parentDirectory: parent,
        runCommand: async (command, args, options) => {
          await simulateNativeInitializer(command, args, options.cwd ?? resultlessProjectDirectory(parent, "provider-app"));

          return { exitCode: 0, stdout: "ok", stderr: "" };
        }
      });

      const label = `${testCase.provider}/${testCase.runtime ?? "node"}`;
      const client = await readFile(join(result.projectDirectory, "apps", "web", "db", "client.ts"), "utf8");
      expect(client, label).toContain(testCase.clientImport);

      if (testCase.envContains) {
        await expect(readFile(join(result.projectDirectory, ".env.example"), "utf8"), label).resolves.toContain(
          testCase.envContains
        );
      }

      if (testCase.file) {
        await expect(readFile(join(result.projectDirectory, testCase.file.path), "utf8"), label).resolves.toContain(
          testCase.file.contains
        );
      }

      expect(result.doctor.ok, label).toBe(true);
    }
  }, 120_000);

  it("does not emit a TypeScript db client for an API + SQLAlchemy stack", async () => {
    const parent = await mkdtemp(join(tmpdir(), "stackkit-provider-api-"));
    tempDirectories.push(parent);

    const modules = resolveStackAxes({ api: "fastapi", db: "postgres", dbProvider: "supabase" }, builtinModules);
    const plan = createCreatePlan({
      config: {
        projectName: "api-supabase",
        packageManager: "pnpm",
        workspace: "pnpm-turbo",
        modules,
        ai: { skillMode: "skip", skillTargets: ["codex"] }
      },
      availableModules: builtinModules,
      curatedSkillSourceAllowlist
    });

    const result = await applyCreatePlan(plan, {
      parentDirectory: parent,
      runCommand: async (command, args, options) => {
        await simulateNativeInitializer(command, args, options.cwd ?? resultlessProjectDirectory(parent, "api-supabase"));

        return { exitCode: 0, stdout: "ok", stderr: "" };
      }
    });

    await expect(access(join(result.projectDirectory, "apps", "web", "db", "client.ts"))).rejects.toThrow();
  });

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

  it("treats missing optional commands as allowed failures", async () => {
    const result = await runCommand("stackkit-command-that-does-not-exist", ["--version"], process.cwd(), {
      allowFailure: true
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("spawn stackkit-command-that-does-not-exist ENOENT");
  });
});

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function resultlessProjectDirectory(parent: string, projectName: string): string {
  return join(parent, projectName);
}

async function simulateNativeInitializer(command: string, args: readonly string[], cwd: string): Promise<void> {
  if (command !== "pnpm" || args[0] !== "dlx") {
    return;
  }

  if (args[1] === "shadcn@latest") {
    await simulateShadcnInit(cwd);
    return;
  }

  if (args[1] === "clerk@latest") {
    await simulateClerkInit(cwd);
  }
}

async function simulateShadcnInit(projectDirectory: string): Promise<void> {
  const libDirectory = join(projectDirectory, "packages", "ui", "src", "lib");
  const packagePath = join(projectDirectory, "packages", "ui", "package.json");
  const pkg = JSON.parse(await readFile(packagePath, "utf8"));

  await mkdir(libDirectory, { recursive: true });
  await writeFile(
    join(libDirectory, "utils.ts"),
    "export function cn(...inputs: string[]) {\n  return inputs.filter(Boolean).join(\" \");\n}\n",
    "utf8"
  );
  await writeFile(
    packagePath,
    `${JSON.stringify(
      {
        ...pkg,
        dependencies: {
          ...(pkg.dependencies ?? {}),
          tailwindcss: "^4"
        }
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

async function simulateClerkInit(webDirectory: string): Promise<void> {
  await mkdir(join(webDirectory, "app", "sign-in", "[[...sign-in]]"), { recursive: true });
  await mkdir(join(webDirectory, "app", "sign-up", "[[...sign-up]]"), { recursive: true });
  await writeFile(
    join(webDirectory, "app", "sign-in", "[[...sign-in]]", "page.tsx"),
    'export default function SignInPage() {\n  return <div>Sign in</div>;\n}\n',
    "utf8"
  );
  await writeFile(
    join(webDirectory, "app", "sign-up", "[[...sign-up]]", "page.tsx"),
    'export default function SignUpPage() {\n  return <div>Sign up</div>;\n}\n',
    "utf8"
  );
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
  const result = await new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve, reject) => {
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
    }, 120_000);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      if (options.allowFailure) {
        resolve({ exitCode: 1, stdout, stderr: error.message });
        return;
      }

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
