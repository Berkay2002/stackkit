import { describe, expect, it } from "vitest";

import { stackkitRegistrySchema } from "@stackkit/schemas";

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
});
