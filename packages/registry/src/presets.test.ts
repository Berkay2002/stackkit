import { describe, expect, it } from "vitest";

import { builtinModules, builtinPresets } from "./index.js";

describe("builtinPresets", () => {
  it("contains named compositions of built-in modules", () => {
    const moduleIds = new Set(builtinModules.map((module) => module.id));

    expect(builtinPresets.map((preset) => preset.id)).toEqual(
      expect.arrayContaining([
        "next-only",
        "next-postgres-clerk",
        "next-fastapi-postgres-auth0",
        "next-rust-postgres-auth0",
        "fullstack-containerized",
        "work-kubernetes-ready"
      ])
    );

    for (const preset of builtinPresets) {
      for (const moduleId of preset.modules) {
        expect(moduleIds.has(moduleId), `${preset.id} references ${moduleId}`).toBe(true);
      }
    }
  });
});
