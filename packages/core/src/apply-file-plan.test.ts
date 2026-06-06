import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { applyFilePlan, buildFilePlan, hashContent } from "./index.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("applyFilePlan", () => {
  it("writes files and returns manifest file records", async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), "stackkit-apply-file-plan-"));
    tempDirectories.push(projectDirectory);

    const plan = buildFilePlan([
      { kind: "write", path: "src/app.ts", owner: "web/nextjs", content: "export const app = true;\n" },
      { kind: "write", path: "README.md", owner: "docs/readme", content: "# Example\n" }
    ]);

    const records = await applyFilePlan(projectDirectory, plan);

    await expect(readFile(join(projectDirectory, "src", "app.ts"), "utf8")).resolves.toBe("export const app = true;\n");
    await expect(readFile(join(projectDirectory, "README.md"), "utf8")).resolves.toBe("# Example\n");
    expect(records).toEqual([
      { path: "src/app.ts", owner: "web/nextjs", hash: hashContent("export const app = true;\n") },
      { path: "README.md", owner: "docs/readme", hash: hashContent("# Example\n") }
    ]);
  });

  it("rejects unsafe paths from manually constructed plans before writing", async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), "stackkit-apply-file-plan-"));
    tempDirectories.push(projectDirectory);

    await expect(
      applyFilePlan(projectDirectory, {
        files: [
          {
            path: "../outside.txt",
            owner: "docs/readme",
            content: "outside\n",
            hash: hashContent("outside\n"),
            overwrite: "if-owned"
          }
        ]
      })
    ).rejects.toThrow("File path escapes project directory: ../outside.txt");
  });

  it("rejects backslash traversal paths from manually constructed plans", async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), "stackkit-apply-file-plan-"));
    tempDirectories.push(projectDirectory);

    await expect(
      applyFilePlan(projectDirectory, {
        files: [
          {
            path: "foo\\..\\..\\outside.txt",
            owner: "docs/readme",
            content: "outside\n",
            hash: hashContent("outside\n"),
            overwrite: "if-owned"
          }
        ]
      })
    ).rejects.toThrow("File path escapes project directory: foo\\..\\..\\outside.txt");
  });

  it("refuses to overwrite unmanaged files", async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), "stackkit-apply-file-plan-"));
    tempDirectories.push(projectDirectory);
    await writeFile(join(projectDirectory, "README.md"), "# Existing\n", "utf8");

    const plan = buildFilePlan([{ kind: "write", path: "README.md", owner: "docs/readme", content: "# Stackkit\n" }]);

    await expect(applyFilePlan(projectDirectory, plan)).rejects.toThrow(
      "File plan has conflicts: README.md (exists-unowned)"
    );
    await expect(readFile(join(projectDirectory, "README.md"), "utf8")).resolves.toBe("# Existing\n");
  });
});
