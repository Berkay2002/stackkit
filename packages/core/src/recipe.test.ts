import { describe, expect, it } from "vitest";

import { decodeRecipe, encodeRecipe } from "./index.js";

describe("offline recipes", () => {
  it("round-trips config without project name", () => {
    const code = encodeRecipe({
      schemaVersion: 1,
      preset: "next-postgres-clerk",
      packageManager: "pnpm",
      modules: ["deploy/docker"],
      ai: { skillTargets: ["codex"], skillMode: "install", linkMode: "copy" }
    });

    expect(code).toMatch(/^sk_/);
    expect(decodeRecipe(code)).toEqual({
      schemaVersion: 1,
      preset: "next-postgres-clerk",
      packageManager: "pnpm",
      modules: ["deploy/docker"],
      options: {},
      ai: { skillTargets: ["codex"], skillMode: "install", linkMode: "copy" }
    });
  });

  it("rejects invalid recipe codes", () => {
    expect(() => decodeRecipe("bad")).toThrow("Invalid Stackkit recipe code");
  });
});
