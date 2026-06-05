import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { applyCreatePlan, createCreatePlan, createFileContentDiff, defineModule, diffManagedFile } from "./index.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const workspaceModule = defineModule({
  id: "workspace/pnpm-turbo",
  version: "1.0.0",
  title: "pnpm and Turborepo",
  description: "pnpm workspace with Turborepo task orchestration",
  aliases: ["workspace"],
  category: "workspace",
  provides: ["workspace/node"]
});

describe("createFileContentDiff", () => {
  it("marks added and removed lines", () => {
    const diff = createFileContentDiff("one\ntwo\n", "one\nthree\n");

    expect(diff.parts.some((part) => part.kind === "removed" && part.value.includes("two"))).toBe(true);
    expect(diff.parts.some((part) => part.kind === "added" && part.value.includes("three"))).toBe(true);
  });
});

describe("diffManagedFile", () => {
  it("returns structured diff data for a modified managed file", async () => {
    const parentDirectory = await mkdtemp(join(tmpdir(), "stackkit-diff-"));
    tempDirectories.push(parentDirectory);
    const plan = createCreatePlan({
      config: {
        projectName: "acme-dashboard",
        packageManager: "pnpm",
        workspace: "pnpm-turbo",
        modules: ["workspace/pnpm-turbo"],
        ai: { skillTargets: ["codex"], skillMode: "skip", linkMode: "copy" }
      },
      availableModules: [workspaceModule]
    });
    const result = await applyCreatePlan(plan, { parentDirectory, installSkills: false });
    const packageJsonPath = join(result.projectDirectory, "package.json");
    const current = await readFile(packageJsonPath, "utf8");
    await writeFile(packageJsonPath, current.replace('"private": true', '"private": false'), "utf8");

    const diff = await diffManagedFile(result.projectDirectory, "package.json");

    expect(diff.path).toBe("package.json");
    expect(diff.currentHash).not.toBe(diff.expectedHash);
    expect(diff.diff.parts.length).toBeGreaterThan(0);
    expect(diff.diff.parts.some((part) => part.kind === "removed" && part.value.includes('"private": true'))).toBe(true);
    expect(diff.diff.parts.some((part) => part.kind === "added" && part.value.includes('"private": false'))).toBe(true);
  });
});
