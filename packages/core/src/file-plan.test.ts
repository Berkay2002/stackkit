import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildFilePlan, detectFileConflicts, hashContent } from "./index.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("buildFilePlan", () => {
  it("builds planned write files with deterministic hashes", () => {
    const plan = buildFilePlan([
      { kind: "write", path: "src/app.ts", owner: "web/nextjs", content: "export const app = true;\n" },
      { kind: "write", path: "./README.md", owner: "docs/readme" },
      { kind: "install", package: "vitest" }
    ]);

    expect(plan.files).toEqual([
      {
        path: "src/app.ts",
        owner: "web/nextjs",
        content: "export const app = true;\n",
        hash: hashContent("export const app = true;\n"),
        overwrite: "if-owned"
      },
      {
        path: "README.md",
        owner: "docs/readme",
        content: "",
        hash: hashContent(""),
        overwrite: "if-owned"
      }
    ]);
  });

  it("rejects paths that escape the project directory", () => {
    expect(() => buildFilePlan([{ kind: "write", path: "../outside.ts", owner: "web/nextjs" }])).toThrow(
      "File path escapes project directory: ../outside.ts"
    );
  });

  it("rejects absolute paths", () => {
    expect(() => buildFilePlan([{ kind: "write", path: "/tmp/outside.ts", owner: "web/nextjs" }])).toThrow(
      "File path must be project-relative: /tmp/outside.ts"
    );
  });
});

describe("detectFileConflicts", () => {
  it("reports exists-unowned when a target file exists and is not recorded in owned files", async () => {
    const projectDirectory = await mkdtempProject("stackkit-file-plan-");
    await mkdir(join(projectDirectory, "src"), { recursive: true });
    await writeFile(join(projectDirectory, "src", "app.ts"), "existing\n", "utf8");

    const plan = buildFilePlan([{ kind: "write", path: "src/app.ts", owner: "web/nextjs", content: "next\n" }]);

    await expect(detectFileConflicts(projectDirectory, plan, [])).resolves.toEqual([
      {
        path: "src/app.ts",
        reason: "exists-unowned"
      }
    ]);
  });

  it("allows unchanged owned files", async () => {
    const projectDirectory = await mkdtempProject("stackkit-file-plan-");
    await mkdir(join(projectDirectory, "src"), { recursive: true });
    await writeFile(join(projectDirectory, "src", "app.ts"), "existing\n", "utf8");

    const plan = buildFilePlan([{ kind: "write", path: "src/app.ts", owner: "web/nextjs", content: "next\n" }]);

    await expect(
      detectFileConflicts(projectDirectory, plan, [
        { path: "./src\\app.ts", owner: "web/nextjs", hash: hashContent("existing\n") }
      ])
    ).resolves.toEqual([]);
  });

  it("reports modified-owned when the current file content no longer matches the manifest hash", async () => {
    const projectDirectory = await mkdtempProject("stackkit-file-plan-");
    await mkdir(join(projectDirectory, "src"), { recursive: true });
    await writeFile(join(projectDirectory, "src", "app.ts"), "changed\n", "utf8");

    const plan = buildFilePlan([{ kind: "write", path: "src/app.ts", owner: "web/nextjs", content: "next\n" }]);

    await expect(
      detectFileConflicts(projectDirectory, plan, [
        { path: "src/app.ts", owner: "web/nextjs", hash: hashContent("original\n") }
      ])
    ).resolves.toEqual([
      {
        path: "src/app.ts",
        reason: "modified-owned"
      }
    ]);
  });

  it("rejects unsafe paths from manually constructed plans", async () => {
    const projectDirectory = await mkdtempProject("stackkit-file-plan-");

    await expect(
      detectFileConflicts(
        projectDirectory,
        {
          files: [
            {
              path: "../outside.ts",
              owner: "web/nextjs",
              content: "",
              hash: hashContent(""),
              overwrite: "if-owned"
            }
          ]
        },
        []
      )
    ).rejects.toThrow("File path escapes project directory: ../outside.ts");
  });
});

async function mkdtempProject(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  tempDirectories.push(directory);
  return directory;
}
