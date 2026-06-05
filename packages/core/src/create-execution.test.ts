import { mkdtemp, readFile, rm } from "node:fs/promises";
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
});
