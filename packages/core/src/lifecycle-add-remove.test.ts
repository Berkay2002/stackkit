import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  applyAddModules,
  applyRemoveModules,
  createManifest,
  defineModule,
  hashContent,
  planAddModules,
  planRemoveModules,
  readOptionalSkillsLock,
  writeManifest,
  type StackkitManifest
} from "./index.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function baseManifest(files: StackkitManifest["files"] = []): StackkitManifest {
  return createManifest({
    schemaVersion: 1,
    stackkitVersion: "0.1.0",
    projectName: "acme",
    createdAt: "2026-06-02T00:00:00.000Z",
    modules: [{ id: "workspace/pnpm-turbo", version: "1.0.0", options: {} }],
    files,
    aiSkills: {
      targets: [{ agent: "codex", directory: ".agents", enabled: true }],
      installed: [],
      unresolved: []
    },
    migrations: {
      applied: []
    }
  });
}

describe("planAddModules", () => {
  it("plans adding new modules to an existing manifest", () => {
    const plan = planAddModules({
      manifest: baseManifest(),
      moduleIds: ["web/nextjs"],
      availableModules: [
        defineModule({
          id: "workspace/pnpm-turbo",
          version: "1.0.0",
          title: "Workspace",
          description: "Existing workspace",
          provides: ["workspace/node"]
        }),
        defineModule({
          id: "web/nextjs",
          version: "2.0.0",
          title: "Next.js",
          description: "Next.js app",
          requires: ["workspace/node"]
        })
      ]
    });

    expect(plan.safe).toBe(true);
    expect(plan.modules.map((module) => module.id)).toEqual(["workspace/pnpm-turbo", "web/nextjs"]);
    expect(plan.modulesToAdd.map((module) => module.id)).toEqual(["web/nextjs"]);
    expect(plan.manifest.modules).toEqual([
      { id: "workspace/pnpm-turbo", version: "1.0.0", options: {} },
      { id: "web/nextjs", version: "2.0.0", options: {} }
    ]);
  });
});

describe("planRemoveModules", () => {
  it("refuses to remove modified owned files", () => {
    const manifest = baseManifest([{ path: "apps/web/page.tsx", owner: "web/nextjs", hash: hashContent("original\n") }]);

    const plan = planRemoveModules({
      manifest: {
        ...manifest,
        modules: [...manifest.modules, { id: "web/nextjs", version: "1.0.0", options: {} }]
      },
      moduleIds: ["web/nextjs"],
      currentFiles: [{ path: "apps/web/page.tsx", owner: "web/nextjs", hash: hashContent("changed\n") }]
    });

    expect(plan.safe).toBe(false);
    expect(plan.refusals).toEqual([{ path: "apps/web/page.tsx", reason: "modified-owned" }]);
  });
});

describe("applyAddModules", () => {
  it("writes new module files and updates manifest", async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), "stackkit-add-"));
    tempDirectories.push(projectDirectory);
    const manifest = await writeManifest(projectDirectory, baseManifest());

    const result = await applyAddModules({
      projectDirectory,
      manifest,
      moduleIds: ["web/nextjs"],
      availableModules: [
        defineModule({
          id: "workspace/pnpm-turbo",
          version: "1.0.0",
          title: "Workspace",
          description: "Existing workspace",
          provides: ["workspace/node"]
        }),
        defineModule({
          id: "web/nextjs",
          version: "1.0.0",
          title: "Next.js",
          description: "Next.js app",
          requires: ["workspace/node"],
          files: [{ kind: "write", path: "apps/web/page.tsx", owner: "web/nextjs", content: "export default Page;\n" }]
        })
      ]
    });

    await expect(readFile(join(projectDirectory, "apps", "web", "page.tsx"), "utf8")).resolves.toBe(
      "export default Page;\n"
    );
    expect(result.manifest.modules).toEqual([
      { id: "workspace/pnpm-turbo", version: "1.0.0", options: {} },
      { id: "web/nextjs", version: "1.0.0", options: {} }
    ]);
    expect(result.manifest.files).toEqual(
      expect.arrayContaining([
        { path: "apps/web/page.tsx", owner: "web/nextjs", hash: hashContent("export default Page;\n") }
      ])
    );
  });

  it("refuses when package change would modify an unowned existing package file", async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), "stackkit-add-"));
    tempDirectories.push(projectDirectory);
    await writeManifest(projectDirectory, baseManifest());
    await writeFile(join(projectDirectory, "package.json"), "{\"name\":\"existing\"}\n", "utf8");

    await expect(
      applyAddModules({
        projectDirectory,
        manifest: baseManifest(),
        moduleIds: ["web/nextjs"],
        availableModules: [
          defineModule({
            id: "workspace/pnpm-turbo",
            version: "1.0.0",
            title: "Workspace",
            description: "Existing workspace",
            provides: ["workspace/node"]
          }),
          defineModule({
            id: "web/nextjs",
            version: "1.0.0",
            title: "Next.js",
            description: "Next.js app",
            requires: ["workspace/node"],
            packageChanges: [
              {
                packagePath: "package.json",
                scripts: { dev: "next dev" },
                dependencies: { next: "^15.0.0" },
                devDependencies: {},
                peerDependencies: {},
                optionalDependencies: {}
              }
            ]
          })
        ]
      })
    ).rejects.toThrow("Add target has conflicts: package.json (exists-unowned)");
  });

  it("updates skills-lock.json when add introduces AI skills", async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), "stackkit-add-"));
    tempDirectories.push(projectDirectory);
    const manifest = await writeManifest(projectDirectory, baseManifest());

    await applyAddModules({
      projectDirectory,
      manifest,
      moduleIds: ["custom/local-skill"],
      availableModules: [
        defineModule({
          id: "workspace/pnpm-turbo",
          version: "1.0.0",
          title: "Workspace",
          description: "Existing workspace"
        }),
        defineModule({
          id: "custom/local-skill",
          version: "1.0.0",
          title: "Local skill",
          description: "Local skill guidance",
          aiSkills: [
            {
              skills: ["custom-local-guidance"],
              trust: "local",
              causedBy: "custom/local-skill",
              reason: "No external skill is configured"
            }
          ]
        })
      ]
    });

    const lock = await readOptionalSkillsLock(projectDirectory);

    expect(lock?.local).toEqual([
      expect.objectContaining({
        skills: ["custom-local-guidance"],
        trust: "local",
        causedBy: "custom/local-skill"
      })
    ]);
    await expect(
      readFile(join(projectDirectory, ".agents", "skills", "custom-local-guidance", "SKILL.md"), "utf8")
    ).resolves.toContain("custom/local-skill");
  });
});

describe("applyRemoveModules", () => {
  it("deletes owned unchanged files and updates manifest", async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), "stackkit-remove-"));
    tempDirectories.push(projectDirectory);
    await mkdir(join(projectDirectory, "apps", "web"), { recursive: true });
    await writeFile(join(projectDirectory, "apps", "web", "page.tsx"), "original\n", "utf8");
    const manifest = await writeManifest(
      projectDirectory,
      createManifest({
        ...baseManifest([{ path: "apps/web/page.tsx", owner: "web/nextjs", hash: hashContent("original\n") }]),
        modules: [
          { id: "workspace/pnpm-turbo", version: "1.0.0", options: {} },
          { id: "web/nextjs", version: "1.0.0", options: {} }
        ]
      })
    );

    const result = await applyRemoveModules({ projectDirectory, manifest, moduleIds: ["web/nextjs"] });

    await expect(readFile(join(projectDirectory, "apps", "web", "page.tsx"), "utf8")).rejects.toMatchObject({
      code: "ENOENT"
    });
    expect(result.manifest.modules).toEqual([{ id: "workspace/pnpm-turbo", version: "1.0.0", options: {} }]);
    expect(result.manifest.files).toEqual([]);
  });
});
