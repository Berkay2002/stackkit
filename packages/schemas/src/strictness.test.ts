import { describe, expect, it } from "vitest";

import {
  moduleIdSchema,
  semverSchema,
  stackkitConfigSchema,
  stackkitPresetSchema,
  stackkitRecipeSchema,
  stackkitRegistrySchema
} from "./index.js";

function issueMessages(result: { success: boolean; error?: { issues: { message: string }[] } }): string[] {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

const recipe = {
  schemaVersion: 1,
  modules: [],
  ai: { skillTargets: ["codex"], skillMode: "install", linkMode: "copy" }
} as const;

const module = (id: string, aliases: string[] = []) => ({
  id,
  version: "1.0.0",
  title: id,
  description: id,
  aliases
});

describe("user-authored config and recipe schemas", () => {
  it("rejects a misspelled config key instead of silently dropping the modules", () => {
    const result = stackkitConfigSchema.safeParse({ projectName: "a", modlues: ["web/nextjs"] });

    expect(result.success).toBe(false);
    expect(issueMessages(result).join("\n")).toMatch(/modlues/);
  });

  it("rejects a misspelled key inside the ai block", () => {
    expect(stackkitConfigSchema.safeParse({ projectName: "a", ai: { skilMode: "plan" } }).success).toBe(false);
  });

  it("accepts the $schema key that generated stackkit.config.json files carry", () => {
    expect(
      stackkitConfigSchema.safeParse({ $schema: "https://stackkit.dev/schema.json", projectName: "a" }).success
    ).toBe(true);
  });

  it("rejects unknown recipe keys", () => {
    expect(stackkitRecipeSchema.safeParse(recipe).success).toBe(true);
    expect(stackkitRecipeSchema.safeParse({ ...recipe, modlues: [] }).success).toBe(false);
  });
});

describe("registry contract validation", () => {
  it("rejects duplicate module ids, preset ids, and module aliases", () => {
    const preset = { id: "p", title: "P", description: "P", modules: ["web/a"] };
    const result = stackkitRegistrySchema.safeParse({
      schemaVersion: 1,
      namespace: "@acme",
      name: "Acme",
      modules: [module("web/a", ["a"]), module("web/a"), module("web/b", ["a"])],
      presets: [preset, preset]
    });

    expect(result.success).toBe(false);
    expect(issueMessages(result)).toEqual([
      "Duplicate module ID: web/a",
      "Duplicate preset ID: p",
      "Duplicate module alias: a"
    ]);
  });

  it("rejects presets that repeat a module", () => {
    expect(
      stackkitPresetSchema.safeParse({ id: "p", title: "P", description: "P", modules: ["web/a", "web/a"] }).success
    ).toBe(false);
  });

  it("requires semantic versions", () => {
    expect(semverSchema.safeParse("1.2.3").success).toBe(true);
    expect(semverSchema.safeParse("1.2.3-beta.1").success).toBe(true);
    expect(semverSchema.safeParse("banana").success).toBe(false);
    expect(semverSchema.safeParse("1.2").success).toBe(false);
  });

  it("requires lowercase slash-separated module ids", () => {
    expect(moduleIdSchema.safeParse("web/nextjs").success).toBe(true);
    expect(moduleIdSchema.safeParse("stackkit/config").success).toBe(true);
    expect(moduleIdSchema.safeParse("../../etc").success).toBe(false);
    expect(moduleIdSchema.safeParse("Web/Next").success).toBe(false);
    expect(moduleIdSchema.safeParse("web/").success).toBe(false);
  });
});
