import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  applyAutomaticMigrations,
  applyModuleUpdates,
  hashContent,
  planModuleMigrations,
  planModuleUpdates
} from "./index.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("update and migration planning", () => {
  it("plans module updates when registry version is newer", () => {
    const plan = planModuleUpdates({
      manifestModules: [{ id: "web/nextjs", version: "1.0.0", options: {} }],
      availableModules: [
        {
          id: "web/nextjs",
          version: "1.1.0",
          title: "Next.js",
          description: "Next.js app"
        }
      ]
    });

    expect(plan.updates).toEqual([{ id: "web/nextjs", from: "1.0.0", to: "1.1.0" }]);
  });

  it("plans pending migrations and separates review-required migrations", () => {
    const plan = planModuleMigrations({
      manifest: {
        schemaVersion: 1,
        stackkitVersion: "0.0.0",
        projectName: "acme",
        createdAt: "2026-06-02T00:00:00.000Z",
        modules: [{ id: "web/nextjs", version: "1.0.0", options: {} }],
        files: [],
        aiSkills: { targets: [], installed: [], unresolved: [] },
        migrations: { applied: [] }
      },
      modules: [
        {
          id: "web/nextjs",
          version: "1.1.0",
          title: "Next.js",
          description: "Next.js app",
          migrations: [
            {
              from: "1.0.0",
              to: "1.1.0",
              title: "Add Next.js config",
              operations: [{ kind: "write", path: "apps/web/next.config.ts", content: "export default {};\n" }],
              safety: "review-required"
            }
          ]
        }
      ]
    });

    expect(plan.reviewRequired.map((migration) => migration.title)).toEqual(["Add Next.js config"]);
    expect(plan.automatic).toEqual([]);
  });

  it("applies automatic migrations and records them in the manifest", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stackkit-migrate-"));
    tempDirectories.push(directory);

    const result = await applyAutomaticMigrations({
      projectDirectory: directory,
      manifest: {
        schemaVersion: 1,
        stackkitVersion: "0.0.0",
        projectName: "acme",
        createdAt: "2026-06-02T00:00:00.000Z",
        modules: [{ id: "web/nextjs", version: "1.0.0", options: {} }],
        files: [],
        aiSkills: { targets: [], installed: [], unresolved: [] },
        migrations: { applied: [] }
      },
      modules: [
        {
          id: "web/nextjs",
          version: "1.1.0",
          title: "Next.js",
          description: "Next.js app",
          migrations: [
            {
              from: "1.0.0",
              to: "1.1.0",
              title: "Add Next.js config",
              operations: [{ kind: "write", path: "apps/web/next.config.ts", content: "export default {};\n" }],
              safety: "automatic"
            }
          ]
        }
      ]
    });

    await expect(readFile(join(directory, "apps", "web", "next.config.ts"), "utf8")).resolves.toContain("export default");
    expect(result.manifest.files).toEqual([
      expect.objectContaining({ path: "apps/web/next.config.ts", owner: "web/nextjs" })
    ]);
    expect(result.manifest.migrations.applied).toHaveLength(1);
  });

  it("applies automatic delete migrations and removes stale manifest file records", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stackkit-migrate-delete-"));
    tempDirectories.push(directory);
    const legacyPath = join(directory, "apps", "web", "legacy.ts");
    const legacyContent = "export const legacy = true;\n";

    await mkdir(join(directory, "apps", "web"), { recursive: true });
    await writeFile(legacyPath, legacyContent, "utf8");

    const result = await applyAutomaticMigrations({
      projectDirectory: directory,
      manifest: {
        schemaVersion: 1,
        stackkitVersion: "0.0.0",
        projectName: "acme",
        createdAt: "2026-06-02T00:00:00.000Z",
        modules: [{ id: "web/nextjs", version: "1.0.0", options: {} }],
        files: [{ path: "apps/web/legacy.ts", owner: "web/nextjs", hash: hashContent(legacyContent) }],
        aiSkills: { targets: [], installed: [], unresolved: [] },
        migrations: { applied: [] }
      },
      modules: [
        {
          id: "web/nextjs",
          version: "1.1.0",
          title: "Next.js",
          description: "Next.js app",
          migrations: [
            {
              from: "1.0.0",
              to: "1.1.0",
              title: "Remove legacy file",
              operations: [{ kind: "delete", path: "apps/web/legacy.ts" }],
              safety: "automatic"
            }
          ]
        }
      ]
    });

    await expect(readFile(legacyPath, "utf8")).rejects.toThrow();
    expect(result.manifest.files).toEqual([]);
    expect(result.manifest.migrations.applied).toHaveLength(1);
  });

  it("does not duplicate applied migrations or file records when run twice", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stackkit-migrate-idempotent-"));
    tempDirectories.push(directory);

    const modules = [
      {
        id: "web/nextjs",
        version: "1.1.0",
        title: "Next.js",
        description: "Next.js app",
        migrations: [
          {
            from: "1.0.0",
            to: "1.1.0",
            title: "Add Next.js config",
            operations: [{ kind: "write", path: "apps/web/next.config.ts", content: "export default {};\n" }],
            safety: "automatic"
          }
        ]
      }
    ];
    const baseManifest = {
      schemaVersion: 1,
      stackkitVersion: "0.0.0",
      projectName: "acme",
      createdAt: "2026-06-02T00:00:00.000Z",
      modules: [{ id: "web/nextjs", version: "1.0.0", options: {} }],
      files: [],
      aiSkills: { targets: [], installed: [], unresolved: [] },
      migrations: { applied: [] }
    } as const;

    const first = await applyAutomaticMigrations({ projectDirectory: directory, manifest: baseManifest, modules });
    const second = await applyAutomaticMigrations({ projectDirectory: directory, manifest: first.manifest, modules });

    expect(second.manifest.migrations.applied).toHaveLength(1);
    expect(second.manifest.files.filter((file) => file.path === "apps/web/next.config.ts")).toHaveLength(1);
  });

  it("applies module version updates to the manifest", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stackkit-update-"));
    tempDirectories.push(directory);

    const result = await applyModuleUpdates({
      projectDirectory: directory,
      manifest: {
        schemaVersion: 1,
        stackkitVersion: "0.0.0",
        projectName: "acme",
        createdAt: "2026-06-02T00:00:00.000Z",
        modules: [{ id: "web/nextjs", version: "1.0.0", options: {} }],
        files: [],
        aiSkills: { targets: [], installed: [], unresolved: [] },
        migrations: { applied: [] }
      },
      availableModules: [{ id: "web/nextjs", version: "1.1.0", title: "Next.js", description: "Next.js app" }]
    });

    expect(result.manifest.modules).toEqual([
      expect.objectContaining({
        id: "web/nextjs",
        version: "1.1.0",
        options: {},
        snapshot: expect.objectContaining({ id: "web/nextjs", version: "1.1.0" })
      })
    ]);
  });
});
