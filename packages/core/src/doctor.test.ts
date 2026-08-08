import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runDoctor } from "./index.js";

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
          actions: ["stackkit create --allow-external-state"]
        })
      ])
    );
  });
});
