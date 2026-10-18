import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  applyCreatePlan,
  applyRemoveModules,
  createCreatePlan,
  planAddModules,
  planModuleMigrations,
  planRemoveModules,
  planUpdateModules,
  type StackkitManifest
} from "@berkayorhan/stackkit-core";
import { builtinModules, builtinPresets, curatedSkillSourceAllowlist } from "@berkayorhan/stackkit-registry";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
}, 120_000);

describe("golden-path lifecycle e2e", () => {
  it("keeps user and initializer edits safe across lifecycle commands on next-fastapi-postgres-auth0", async () => {
    const { projectDirectory, manifest } = await createGoldenProject();
    const input = { projectDirectory, manifest, availableModules: builtinModules };

    // A fresh project is already at the registry's versions: nothing to migrate or update.
    expect(planModuleMigrations({ manifest, modules: builtinModules })).toEqual({ automatic: [], reviewRequired: [], manual: [] });
    const update = await planUpdateModules(input);
    expect(update).toMatchObject({ safe: true, updates: [], writes: [], deletes: [], refusals: [] });

    // Typos, uninstalled and depended-on modules are refused before anything is written.
    await expect(planRemoveModules({ ...input, moduleIds: ["quality/pytst"] })).rejects.toThrow("Unknown Stackkit module or alias");
    await expect(planRemoveModules({ ...input, moduleIds: ["web/vite"] })).rejects.toThrow("is not installed");
    const dependedOn = await planRemoveModules({ ...input, moduleIds: ["db/postgres"] });
    expect(dependedOn.safe).toBe(false);
    expect(dependedOn.dependents.length).toBeGreaterThan(0);

    // add applies the same support gate as create.
    await expect(planAddModules({ ...input, moduleIds: ["rust/tokio"], includePreview: true })).rejects.toThrow("is planned");

    // Removing an unrelated module leaves the user's edit and the shadcn initializer output in place.
    const pagePath = join(projectDirectory, "apps", "web", "app", "page.tsx");
    const editedPage = `${await readFile(pagePath, "utf8")}\n// my change\n`;
    await writeFile(pagePath, editedPage, "utf8");
    const utilsPath = join(projectDirectory, "packages", "ui", "src", "lib", "utils.ts");
    const utils = await readFile(utilsPath, "utf8");

    const removed = await applyRemoveModules({ ...input, moduleIds: ["quality/pytest"] });

    expect(removed.manifest.modules.map((module) => module.id)).not.toContain("quality/pytest");
    await expect(readFile(pagePath, "utf8")).resolves.toBe(editedPage);
    await expect(readFile(utilsPath, "utf8")).resolves.toBe(utils);
  }, 120_000);
});

async function createGoldenProject(): Promise<{ projectDirectory: string; manifest: StackkitManifest }> {
  const parent = await mkdtemp(join(tmpdir(), "stackkit-lifecycle-golden-"));
  tempDirectories.push(parent);
  const preset = builtinPresets.find((candidate) => candidate.id === "next-fastapi-postgres-auth0")!;
  const plan = createCreatePlan({
    config: {
      projectName: "golden",
      packageManager: "pnpm",
      workspace: "pnpm-turbo",
      modules: [...preset.modules],
      registries: {},
      ai: { skillMode: "skip", skillTargets: ["codex"], linkMode: "copy" }
    },
    availableModules: builtinModules,
    curatedSkillSourceAllowlist
  });

  const result = await applyCreatePlan(plan, {
    parentDirectory: parent,
    runCommand: async (command, args, options) => {
      // Stand-in for `shadcn init`, which edits files Stackkit generated and adds its own.
      if (command === "pnpm" && args[0] === "dlx" && String(args[1]).startsWith("shadcn@")) {
        await simulateShadcnInit(options.cwd ?? join(parent, "golden"));
      }

      return { exitCode: 0, stdout: "ok", stderr: "" };
    }
  });

  return { projectDirectory: result.projectDirectory, manifest: result.manifest };
}

async function simulateShadcnInit(projectDirectory: string): Promise<void> {
  const packagePath = join(projectDirectory, "packages", "ui", "package.json");
  const pkg = JSON.parse(await readFile(packagePath, "utf8"));

  await mkdir(join(projectDirectory, "packages", "ui", "src", "lib"), { recursive: true });
  await writeFile(join(projectDirectory, "packages", "ui", "src", "lib", "utils.ts"), "export function cn() {}\n", "utf8");
  await writeFile(
    packagePath,
    `${JSON.stringify({ ...pkg, dependencies: { ...(pkg.dependencies ?? {}), tailwindcss: "^4" } }, null, 2)}\n`,
    "utf8"
  );
}
