import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { applyCreatePlan, createCreatePlan, resolveStackAxes } from "@berkayorhan/stackkit-core";
import { builtinModules, curatedSkillSourceAllowlist } from "@berkayorhan/stackkit-registry";

import { simulatedRunCommand } from "./index.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true, maxRetries: 5 })));
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
      runCommand: simulatedRunCommand(join(parent, "next-shadcn"))
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
      runCommand: simulatedRunCommand(join(parent, "final-stackkit-app"))
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
        runCommand: simulatedRunCommand(join(parent, "provider-app"))
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
      runCommand: simulatedRunCommand(join(parent, "api-supabase"))
    });

    await expect(access(join(result.projectDirectory, "apps", "web", "db", "client.ts"))).rejects.toThrow();
  });
});

