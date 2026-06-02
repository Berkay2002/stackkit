import { describe, expect, it } from "vitest";

import { stackkitConfigSchema } from "./index.js";

describe("stackkitConfigSchema", () => {
  it("defaults AI skills to the Codex-compatible project target", () => {
    expect(
      stackkitConfigSchema.parse({
        projectName: "example"
      }).ai
    ).toEqual({
      skillTargets: ["codex"]
    });
  });

  it("accepts Claude Code when it is explicitly selected", () => {
    expect(
      stackkitConfigSchema.parse({
        projectName: "example",
        ai: {
          skillTargets: ["codex", "claude-code"]
        }
      }).ai
    ).toEqual({
      skillTargets: ["codex", "claude-code"]
    });
  });

  it("accepts a first-class config preset", () => {
    expect(
      stackkitConfigSchema.parse({
        projectName: "example",
        preset: "next-fastapi-postgres-auth0"
      }).preset
    ).toBe("next-fastapi-postgres-auth0");
  });
});
