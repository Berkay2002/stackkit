import { describe, expect, it } from "vitest";

import { resolveModuleGraph } from "./index.js";
import type { SupportLevel } from "@berkayorhan/stackkit-schemas";

import { builtinModules, builtinPresets, toolingCatalog } from "@berkayorhan/stackkit-registry";

const goldenPresetId = "next-fastapi-postgres-auth0";
const moduleById = new Map(builtinModules.map((module) => [module.id, module]));
const tierRank: Record<SupportLevel, number> = { planned: 0, preview: 1, supported: 2 };

function resolveGolden() {
  return resolveModuleGraph([], {
    availableModules: builtinModules,
    availablePresets: builtinPresets,
    selectedPresets: [goldenPresetId]
  });
}

describe("built-in support tiers", () => {
  it("supports exactly the modules the golden-path preset resolves to", () => {
    const golden = resolveGolden();

    expect(
      builtinModules
        .filter((module) => module.support.level === "supported")
        .map((module) => module.id)
        .sort()
    ).toEqual(golden.map((module) => module.id).sort());

    expect(builtinPresets.filter((preset) => preset.support.level === "supported").map((preset) => preset.id)).toEqual([
      goldenPresetId
    ]);
  });

  it("takes Quality Module support from the tooling catalog", () => {
    for (const spec of toolingCatalog) {
      expect(moduleById.get(spec.moduleId)?.support, spec.moduleId).toEqual(spec.support);
    }
  });

  it("documents why every non-supported entry is not supported", () => {
    for (const entry of [...builtinModules, ...builtinPresets]) {
      if (entry.support.level !== "supported") {
        expect(entry.support.reason, `${entry.id} support reason`).toBeTruthy();
      }
    }
  });

  it("never rates a preset above its weakest module", () => {
    for (const preset of builtinPresets) {
      for (const moduleId of preset.modules) {
        const module = moduleById.get(moduleId)!;
        expect(
          tierRank[preset.support.level] <= tierRank[module.support.level],
          `${preset.id} (${preset.support.level}) includes ${moduleId} (${module.support.level})`
        ).toBe(true);
      }
    }
  });

  it("pins every third-party AI skill source on the golden path to a git ref", () => {
    const unpinned = resolveGolden()
      .flatMap((module) => module.aiSkills ?? [])
      .filter((skill) => skill.trust !== "official" && !/\/tree\/[^/]+$/.test(skill.source ?? ""));

    expect(unpinned).toEqual([]);
  });
});
