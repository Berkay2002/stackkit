import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const tempDirectories: string[] = [];

const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");
const cliEntry = join(repoRoot, "packages", "cli", "dist", "index.js");

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("CLI e2e smoke", () => {
  it("creates a foundation project and doctor validates it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stackkit-e2e-"));
    tempDirectories.push(directory);
    const configPath = join(directory, "stackkit.config.json");
    const targetDirectory = join(directory, "generated");

    await writeFile(
      configPath,
      JSON.stringify({
        projectName: "smoke",
        modules: ["workspace/pnpm-turbo", "workspace/typescript"],
        ai: { skillTargets: ["codex"] }
      }),
      "utf8"
    );

    const { stdout } = await execFileAsync("node", [cliEntry, "create", "--config", configPath, "--dir", targetDirectory, "--yes"], {
      cwd: repoRoot
    });

    expect(stdout).toContain("Created Stackkit project");

    const doctor = await execFileAsync("node", [cliEntry, "doctor"], {
      cwd: targetDirectory
    });

    expect(doctor.stdout).toContain("Stackkit doctor passed");
  });
});
