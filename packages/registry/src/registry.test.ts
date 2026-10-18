import { describe, expect, it } from "vitest";

import { stackkitRegistrySchema } from "@berkayorhan/stackkit-schemas";

import { builtinRegistry } from "./index.js";

describe("builtinRegistry", () => {
  it("exposes built-in modules and presets through registry shape", () => {
    expect(builtinRegistry).toEqual(
      expect.objectContaining({
        schemaVersion: 1,
        namespace: "@stackkit",
        name: "Stackkit built-in registry",
        modules: expect.any(Array),
        presets: expect.any(Array)
      })
    );
    expect(builtinRegistry.modules.length).toBeGreaterThan(0);
    expect(builtinRegistry.presets.length).toBeGreaterThan(0);
  });

  it("matches the shared Stackkit registry schema", () => {
    expect(stackkitRegistrySchema.parse(builtinRegistry)).toEqual(builtinRegistry);
  });

  it("never ships a migration that a fresh project at the module's own version would see as pending", () => {
    const semver = (version: string) => version.split(".").map(Number);
    const compare = (a: string, b: string) => {
      const [x, y] = [semver(a), semver(b)];
      return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
    };

    for (const module of builtinRegistry.modules) {
      for (const migration of module.migrations ?? []) {
        expect(compare(migration.from, migration.to), `${module.id}: ${migration.title}`).toBeLessThan(0);
        expect(compare(migration.to, module.version), `${module.id}: ${migration.title}`).toBeLessThanOrEqual(0);
      }
    }
  });
});
