import { describe, expect, it } from "vitest";

import { stackkitRegistrySchema } from "@berkayorhan/stackkit-schemas";

import { builtinModules, builtinPresets, builtinRegistry } from "./index.js";

describe("builtinRegistry", () => {
  it("exposes built-in modules and presets through registry shape", () => {
    expect(builtinRegistry).toEqual(
      expect.objectContaining({
        schemaVersion: 1,
        namespace: "@stackkit",
        name: "Stackkit built-in registry",
        modules: builtinModules,
        presets: builtinPresets
      })
    );
  });

  // builtinRegistry is assembled from already-parsed modules, so this is where registry-level
  // invariants (unique module, preset, and alias ids) are enforced for the built-ins.
  it("satisfies the shared registry contract", () => {
    const result = stackkitRegistrySchema.safeParse(builtinRegistry);

    expect(result.error?.issues ?? []).toEqual([]);
  });

  it("never lets an alias shadow another module id", () => {
    const moduleIds = new Set(builtinModules.map((module) => module.id));

    for (const module of builtinModules) {
      for (const alias of module.aliases) {
        expect(moduleIds.has(alias), `${module.id} alias ${alias}`).toBe(false);
      }
    }
  });

  it("provides every required capability from some built-in module", () => {
    const provided = new Set(builtinModules.flatMap((module) => module.provides ?? []));

    for (const module of builtinModules) {
      for (const capability of module.requires ?? []) {
        expect(provided.has(capability), `${module.id} requires ${capability}`).toBe(true);
      }
    }
  });

  it("only declares conflicts with built-in modules", () => {
    const moduleIds = new Set(builtinModules.map((module) => module.id));

    for (const module of builtinModules) {
      for (const conflict of module.conflicts ?? []) {
        expect(moduleIds.has(conflict), `${module.id} conflicts with ${conflict}`).toBe(true);
      }
    }
  });
});
