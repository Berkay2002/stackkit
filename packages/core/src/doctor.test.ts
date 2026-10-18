import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { defineModule, runDoctor } from "./index.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("runDoctor", () => {
  it("reports a missing manifest", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stackkit-doctor-missing-"));
    tempDirectories.push(directory);

    const result = await runDoctor(directory);

    expect(result.ok).toBe(false);
    expect(result.checks).toEqual([
      expect.objectContaining({
        id: "manifest.exists",
        status: "error"
      })
    ]);
  });

  it("reports modified owned files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stackkit-doctor-modified-"));
    tempDirectories.push(directory);
    await writeFile(join(directory, "package.json"), "{}\n", "utf8");
    await mkdir(join(directory, ".stackkit"), { recursive: true });
    await writeFile(
      join(directory, ".stackkit", "project.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          stackkitVersion: "0.0.0",
          projectName: "acme",
          createdAt: "2026-06-02T00:00:00.000Z",
          modules: [],
          files: [{ path: "package.json", owner: "workspace/pnpm-turbo", hash: "not-the-current-hash" }],
          aiSkills: { targets: [], installed: [], unresolved: [] },
          migrations: { applied: [] }
        },
        null,
        2
      ),
      "utf8"
    );

    const result = await runDoctor(directory);

    expect(result.ok).toBe(true);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "files.package.json",
          status: "warning",
          actions: ["stackkit diff --file package.json"]
        })
      ])
    );
  });

  it("returns concrete actions for unresolved skills", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stackkit-doctor-unresolved-"));
    tempDirectories.push(directory);
    await mkdir(join(directory, ".stackkit"), { recursive: true });
    await writeFile(
      join(directory, ".stackkit", "project.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          stackkitVersion: "0.0.0",
          projectName: "acme",
          createdAt: "2026-06-02T00:00:00.000Z",
          modules: [],
          files: [],
          aiSkills: {
            targets: [],
            installed: [],
            unresolved: [
              {
                source: "https://example.com/missing-skills",
                skills: ["missing"],
                trust: "unresolved",
                causedBy: "web/nextjs",
                reason: "Skill install failed: missing"
              }
            ]
          },
          migrations: { applied: [] }
        },
        null,
        2
      ),
      "utf8"
    );

    const result = await runDoctor(directory);
    const check = result.checks.find((item) => item.id === "skills.unresolved");

    expect(result.ok).toBe(true);
    expect(check).toEqual(
      expect.objectContaining({
        status: "warning",
        actions: ["stackkit skills sync --apply"]
      })
    );

    // Once `skills sync` resolves them, skills-lock.json is the source of truth even if the manifest copy is stale.
    await writeFile(
      join(directory, "skills-lock.json"),
      JSON.stringify({ schemaVersion: 1, targets: [], installed: [], local: [], unresolved: [] }),
      "utf8"
    );

    const synced = await runDoctor(directory);

    expect(synced.checks.find((item) => item.id === "skills.unresolved")).toBeUndefined();
  });

  it("reports skipped native initializers as known gaps", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stackkit-doctor-skipped-init-"));
    tempDirectories.push(directory);
    await mkdir(join(directory, ".stackkit"), { recursive: true });
    await writeFile(
      join(directory, ".stackkit", "project.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          stackkitVersion: "0.0.0",
          projectName: "acme",
          createdAt: "2026-06-02T00:00:00.000Z",
          modules: [],
          files: [],
          skippedInitializers: [
            {
              name: "clerk init",
              moduleId: "auth/clerk",
              mutationPolicy: "external-state",
              reason: "Requires --allow-external-state"
            }
          ],
          aiSkills: {
            targets: [],
            installed: [],
            unresolved: []
          },
          migrations: { applied: [] }
        },
        null,
        2
      ),
      "utf8"
    );

    const result = await runDoctor(directory);

    expect(result.ok).toBe(true);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "initializers.skipped.clerk-init",
          status: "warning",
          actions: []
        })
      ])
    );
  });

  async function writeCommandManifest(validate: unknown[]): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "stackkit-doctor-command-"));
    tempDirectories.push(root);
    const directory = join(root, "project");
    await mkdir(join(directory, ".stackkit"), { recursive: true });
    await writeFile(
      join(directory, ".stackkit", "project.json"),
      JSON.stringify({
        schemaVersion: 1,
        stackkitVersion: "0.3.0",
        projectName: "acme",
        createdAt: "2026-08-08T00:00:00.000Z",
        modules: [{
          id: "api/example",
          version: "1.0.0",
          snapshot: { id: "api/example", version: "1.0.0", title: "Example API", description: "Example API", validate }
        }],
        files: [],
        aiSkills: { targets: [], installed: [], unresolved: [] },
        migrations: { applied: [] }
      }),
      "utf8"
    );
    return directory;
  }

  const trustedExample = defineModule({
    id: "api/example",
    version: "1.0.0",
    title: "Example API",
    description: "Example API",
    validate: [{ kind: "command-succeeds", command: "pnpm", args: ["test"] }]
  });

  it("runs command-succeeds validations from the trusted registry and reports failures", async () => {
    const directory = await writeCommandManifest([{ kind: "command-succeeds", command: "pnpm", args: ["test"] }]);
    const calls: Array<{ command: string; args: readonly string[]; cwd?: string }> = [];
    const result = await runDoctor(directory, {
      modules: [trustedExample],
      runCommand: async (command, args, options) => {
        calls.push({ command, args, cwd: options.cwd });
        return { exitCode: 1, stdout: "", stderr: "failed" };
      }
    });

    expect(calls).toEqual([{ command: "pnpm", args: ["test"], cwd: directory }]);
    expect(result.ok).toBe(false);
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "error", message: "Runtime validation failed for api/example: pnpm test" })
    ]));
  });

  it("never runs commands recorded only in the manifest snapshot", async () => {
    const directory = await writeCommandManifest([
      { kind: "command-succeeds", command: "node", args: ["-e", "require('fs').writeFileSync('PWNED.txt','x')"] }
    ]);
    const calls: string[] = [];
    const runCommand = async (command: string) => {
      calls.push(command);
      return { exitCode: 0, stdout: "", stderr: "" };
    };

    const untrusted = await runDoctor(directory, { runCommand });
    expect(calls).toEqual([]);
    expect(untrusted.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "warning", message: expect.stringContaining("never executed") })
    ]));

    const tampered = await runDoctor(directory, { runCommand, modules: [trustedExample] });
    expect(calls).toEqual(["pnpm"]);
    expect(tampered.ok).toBe(true);
  });

  it("treats manifest paths that escape the project as missing", async () => {
    const directory = await writeCommandManifest([{ kind: "file-exists", path: "../outside.txt" }]);
    await writeFile(join(directory, "..", "outside.txt"), "x", "utf8");

    const result = await runDoctor(directory);

    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "error", message: "Module validation failed for api/example: missing ../outside.txt" })
    ]));
  });
});
