import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { writeManifest } from "./index.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("writeManifest", () => {
  it("writes the Stackkit project manifest to .stackkit/project.json", async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), "stackkit-manifest-"));
    tempDirectories.push(projectDirectory);

    await writeManifest(projectDirectory, {
      schemaVersion: 1,
      stackkitVersion: "0.0.0",
      projectName: "example",
      createdAt: "2026-06-01T00:00:00.000Z",
      modules: [{ id: "web/nextjs", version: "1.0.0", options: {} }],
      files: [],
      aiSkills: {
        installed: [],
        unresolved: []
      },
      migrations: {
        applied: []
      }
    });

    const manifest = JSON.parse(await readFile(join(projectDirectory, ".stackkit", "project.json"), "utf8"));

    expect(manifest).toEqual(
      expect.objectContaining({
        schemaVersion: 1,
        projectName: "example",
        modules: [{ id: "web/nextjs", version: "1.0.0", options: {} }]
      })
    );
  });
});
