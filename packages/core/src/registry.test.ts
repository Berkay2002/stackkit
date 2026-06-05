import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadProjectRegistries } from "./index.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("loadProjectRegistries", () => {
  it("loads a local declarative registry file", async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), "stackkit-registry-"));
    tempDirectories.push(projectDirectory);
    const registryPath = join(projectDirectory, "stackkit.registry.json");
    await writeFile(
      registryPath,
      JSON.stringify(
        {
          schemaVersion: 1,
          namespace: "@acme",
          name: "Acme",
          modules: [],
          presets: []
        },
        null,
        2
      ),
      "utf8"
    );

    const registries = await loadProjectRegistries(projectDirectory, { "@acme": "./stackkit.registry.json" });

    expect(registries).toEqual([expect.objectContaining({ namespace: "@acme", name: "Acme" })]);
  });

  it("rejects remote registry URLs", async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), "stackkit-registry-"));
    tempDirectories.push(projectDirectory);

    await expect(loadProjectRegistries(projectDirectory, { "@acme": "https://example.com/registry.json" })).rejects.toThrow(
      "Remote registries are not supported yet"
    );
  });

  it("rejects local registries whose namespace does not match the config key", async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), "stackkit-registry-"));
    tempDirectories.push(projectDirectory);
    await writeFile(
      join(projectDirectory, "stackkit.registry.json"),
      JSON.stringify({
        schemaVersion: 1,
        namespace: "@other",
        name: "Other",
        modules: [],
        presets: []
      }),
      "utf8"
    );

    await expect(loadProjectRegistries(projectDirectory, { "@acme": "./stackkit.registry.json" })).rejects.toThrow(
      "Registry namespace mismatch"
    );
  });
});
