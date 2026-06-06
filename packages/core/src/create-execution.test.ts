import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  applyEnvExamples,
  applyPackageChanges,
  applyCreatePlan,
  createCreatePlan,
  defineModule,
  planEnvExampleFiles,
  runLifecycleHooks,
  type EnvVarDefinition,
  type PackageChange
} from "./index.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("create execution helpers", () => {
  it("merges package changes into package.json", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stackkit-package-change-"));
    tempDirectories.push(directory);

    const changes: PackageChange[] = [
      {
        packagePath: "package.json",
        scripts: { dev: "turbo run dev" },
        dependencies: { next: "^15.0.0" },
        devDependencies: { typescript: "^5.9.3" },
        peerDependencies: {},
        optionalDependencies: {}
      }
    ];

    await applyPackageChanges(directory, changes);

    const pkg = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
    expect(pkg.scripts.dev).toBe("turbo run dev");
    expect(pkg.dependencies.next).toBe("^15.0.0");
    expect(pkg.devDependencies.typescript).toBe("^5.9.3");
  });

  it("writes .env.example entries from env var declarations", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stackkit-env-"));
    tempDirectories.push(directory);

    const envVars: EnvVarDefinition[] = [
      {
        name: "DATABASE_URL",
        description: "Postgres connection string",
        required: true,
        example: "postgres://postgres:postgres@localhost:5432/app"
      }
    ];

    await applyEnvExamples(directory, envVars);

    await expect(readFile(join(directory, ".env.example"), "utf8")).resolves.toContain(
      "DATABASE_URL=postgres://postgres:postgres@localhost:5432/app"
    );
  });

  it("groups env examples from selected modules", async () => {
    const operations = await planEnvExampleFiles("C:\\project", [
      {
        name: "DATABASE_URL",
        description: "Database connection string.",
        required: true,
        example: "",
        target: "api"
      },
      {
        name: "AUTH0_CLIENT_SECRET",
        description: "Auth0 client secret.",
        required: true,
        example: "",
        target: "web"
      }
    ]);

    expect(operations[0]?.content).toContain("# Web");
    expect(operations[0]?.content).toContain("AUTH0_CLIENT_SECRET=");
    expect(operations[0]?.content).toContain("# API");
    expect(operations[0]?.content).toContain("DATABASE_URL=");
  });

  it("renders compatible duplicate env vars once", async () => {
    const operations = await planEnvExampleFiles("C:\\project", [
      {
        name: "DATABASE_URL",
        description: "Database connection string.",
        required: true,
        example: "",
        target: "api"
      },
      {
        name: "DATABASE_URL",
        description: "Database connection string.",
        required: true,
        example: "",
        target: "api"
      }
    ]);

    expect(operations[0]?.content?.match(/DATABASE_URL=/g)).toHaveLength(1);
  });

  it("rejects incompatible duplicate env vars during planning", async () => {
    await expect(
      planEnvExampleFiles("C:\\project", [
        {
          name: "DATABASE_URL",
          description: "Database connection string.",
          required: true,
          example: "",
          target: "api"
        },
        {
          name: "DATABASE_URL",
          description: "Web database connection string.",
          required: true,
          example: "",
          target: "web"
        }
      ])
    ).rejects.toThrow("Incompatible environment variable metadata for DATABASE_URL");
  });

  it("writes .env.example but never writes .env", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stackkit-env-no-dotenv-"));
    tempDirectories.push(directory);

    await applyEnvExamples(directory, [
      {
        name: "DATABASE_URL",
        description: "Database connection string.",
        required: true,
        example: "",
        target: "api"
      }
    ]);

    await expect(readFile(join(directory, ".env.example"), "utf8")).resolves.toContain("DATABASE_URL=");
    await expect(readFile(join(directory, ".env"), "utf8")).rejects.toThrow();
  });

  it("runs lifecycle hooks with the injected command runner", async () => {
    const seen: string[][] = [];

    await runLifecycleHooks(
      [{ name: "format", command: "pnpm", args: ["format"], cwd: "apps/web" }],
      {
        projectDirectory: "C:/tmp/project",
        runCommand: async (command, args, options) => {
          seen.push([options.cwd ?? "", command, ...args]);
          return { exitCode: 0, stdout: "", stderr: "" };
        }
      }
    );

    expect(seen).toEqual([["C:/tmp/project/apps/web", "pnpm", "format"]]);
  });

  it("keeps selected module details out of serialized create plans", () => {
    const plan = createCreatePlan({
      config: {
        projectName: "private-plan",
        packageManager: "pnpm",
        workspace: "pnpm-turbo",
        modules: ["custom/module"],
        ai: {
          skillTargets: ["codex"]
        }
      },
      availableModules: [
        defineModule({
          id: "custom/module",
          version: "1.0.0",
          title: "Custom",
          description: "Custom module"
        })
      ]
    });

    expect(JSON.parse(JSON.stringify(plan))).not.toHaveProperty("selectedModules");
  });

  it("records merged env example files under the docs/env owner", async () => {
    const parentDirectory = await mkdtemp(join(tmpdir(), "stackkit-create-env-owner-"));
    tempDirectories.push(parentDirectory);

    const plan = createCreatePlan({
      config: {
        projectName: "env-owner",
        packageManager: "pnpm",
        workspace: "pnpm-turbo",
        modules: ["custom/env"],
        ai: {
          skillTargets: ["codex"]
        }
      },
      availableModules: [
        defineModule({
          id: "custom/env",
          version: "1.0.0",
          title: "Env",
          description: "Env module",
          files: [
            {
              kind: "write",
              path: ".env.example",
              owner: "custom/env",
              content: "# Existing\nEXISTING=value\n"
            }
          ],
          envVars: [
            {
              name: "DATABASE_URL",
              description: "Postgres connection string",
              required: true,
              example: "postgres://postgres:postgres@localhost:5432/app"
            }
          ]
        })
      ]
    });

    const result = await applyCreatePlan(plan, { parentDirectory });

    expect(result.manifest.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ".env.example",
          owner: "docs/env"
        })
      ])
    );
    await expect(readFile(join(result.projectDirectory, ".env.example"), "utf8")).resolves.toContain("EXISTING=value");
  });

  it("executes native initializers and records their expected files", async () => {
    const parentDirectory = await mkdtemp(join(tmpdir(), "stackkit-native-init-"));
    tempDirectories.push(parentDirectory);
    const seen: string[][] = [];

    const plan = createCreatePlan({
      config: {
        projectName: "native-init",
        packageManager: "pnpm",
        workspace: "pnpm-turbo",
        modules: ["custom/native"],
        ai: { skillTargets: ["codex"], skillMode: "skip" }
      },
      availableModules: [
        defineModule({
          id: "custom/native",
          version: "1.0.0",
          title: "Native",
          description: "Native initializer",
          files: [
            {
              kind: "write",
              path: "generated.txt",
              owner: "custom/native",
              content: "before\n"
            }
          ],
          nativeInitializers: [
            {
              name: "custom native init",
              phase: "integration",
              tool: { execution: "package-manager-dlx", package: "custom-native@latest" },
              args: ["init", { token: "project-name" }],
              cwd: ".",
              mutationPolicy: "merge-owned",
              expectedFiles: ["generated.txt", "native-only.txt"],
              redactExpectedFiles: ["secret.env"]
            }
          ]
        })
      ]
    });

    const result = await applyCreatePlan(plan, {
      parentDirectory,
      runCommand: async (command, args, options) => {
        seen.push([options.cwd ?? "", command, ...args]);
        await writeFile(join(options.cwd ?? resultlessProjectDirectory(parentDirectory, "native-init"), "generated.txt"), "after\n", "utf8");
        await writeFile(join(options.cwd ?? resultlessProjectDirectory(parentDirectory, "native-init"), "native-only.txt"), "created\n", "utf8");
        await writeFile(join(options.cwd ?? resultlessProjectDirectory(parentDirectory, "native-init"), "secret.env"), "SECRET=value\n", "utf8");
        return { exitCode: 0, stdout: "", stderr: "" };
      }
    });

    expect(seen).toEqual([
      [result.projectDirectory, "pnpm", "dlx", "custom-native@latest", "init", "native-init"]
    ]);
    expect(result.manifest.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "generated.txt", owner: "custom/native" }),
        expect.objectContaining({ path: "native-only.txt", owner: "custom/native" })
      ])
    );
    expect(result.manifest.files).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "secret.env" })])
    );
    expect(result.manifest.expectedFiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "generated.txt", owner: "custom/native", content: "after\n" }),
        expect.objectContaining({ path: "native-only.txt", owner: "custom/native", content: "created\n" })
      ])
    );
    expect(result.manifest.expectedFiles).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "secret.env" })])
    );
  });
});

function resultlessProjectDirectory(parentDirectory: string, projectName: string): string {
  return join(parentDirectory, projectName);
}
