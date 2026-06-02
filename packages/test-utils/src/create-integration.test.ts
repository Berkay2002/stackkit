import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { applyCreatePlan, createCreatePlan } from "@stackkit/core";
import { builtinModules, curatedSkillSourceAllowlist } from "@stackkit/registry";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

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
      runCommand: async () => ({ exitCode: 0, stdout: "ok", stderr: "" })
    });

    await expect(readFile(join(result.projectDirectory, "apps", "web", "package.json"), "utf8")).resolves.toContain("next");
    await expect(readFile(join(result.projectDirectory, "apps", "web", "components.json"), "utf8")).resolves.toContain("new-york");
    await expect(readFile(join(result.projectDirectory, ".stackkit", "project.json"), "utf8")).resolves.toContain("web/nextjs");
    await expect(readFile(join(result.projectDirectory, "skills-lock.json"), "utf8")).resolves.toContain("vercel-react-best-practices");
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
          "db/drizzle",
          "db/sqlalchemy",
          "auth/auth0-nextjs",
          "auth/auth0-fastapi",
          "deploy/vercel",
          "deploy/docker"
        ],
        ai: { skillTargets: ["codex"] }
      },
      availableModules: builtinModules,
      curatedSkillSourceAllowlist
    });

    const result = await applyCreatePlan(plan, {
      parentDirectory: parent,
      runCommand: async () => ({ exitCode: 0, stdout: "ok", stderr: "" })
    });

    await expect(readFile(join(result.projectDirectory, "apps", "web", "package.json"), "utf8")).resolves.toContain("next");
    await expect(readFile(join(result.projectDirectory, "apps", "api", "app", "main.py"), "utf8")).resolves.toContain("FastAPI");
    await expect(readFile(join(result.projectDirectory, "docker-compose.yml"), "utf8")).resolves.toContain("services:");
    expect(result.doctor.ok).toBe(true);
  });
});
