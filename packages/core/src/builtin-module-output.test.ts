import { describe, expect, it } from "vitest";

import { builtinModules, builtinPresets } from "@berkayorhan/stackkit-registry";
import { stackkitConfigSchema } from "@berkayorhan/stackkit-schemas";

import { createCreatePlan, type CreatePlan } from "./create.js";

// Marker modules record a choice and intentionally generate nothing.
const markerModuleIds = new Set(["auth/none"]);

function tryPlan(preset: string, modules: string[]): CreatePlan | undefined {
  try {
    return createCreatePlan({
      config: stackkitConfigSchema.parse({
        projectName: "acme",
        preset,
        modules,
        // Neon's output is the edge Drizzle client, which only renders with this option.
        options: { "db/drizzle": { runtime: "edge" } },
        ai: { skillMode: "skip" }
      }),
      availableModules: builtinModules,
      availablePresets: builtinPresets
    });
  } catch {
    // Not every module composes with every preset; those combinations are simply skipped.
    return undefined;
  }
}

// These files list every selected module, so they change for any module and prove nothing.
const moduleListingOwners = new Set(["stackkit/config", "docs/readme"]);

function fileFingerprint(plan: CreatePlan): string {
  return JSON.stringify(
    plan.filePlan.files
      .filter((file) => !moduleListingOwners.has(file.owner))
      .map((file) => [file.path, file.content])
  );
}

/** A module has generated output when it owns a file or initializer, or changes other modules' files. */
function generatesOutput(moduleId: string, presetId: string, presetModules: readonly string[]): boolean {
  const withModule = tryPlan(presetId, [moduleId]);
  if (!withModule) {
    return false;
  }
  if (
    withModule.filePlan.files.some((file) => file.owner === moduleId) ||
    withModule.nativeInitializers.some((initializer) => initializer.moduleId === moduleId)
  ) {
    return true;
  }
  const withoutModule = presetModules.includes(moduleId) ? undefined : tryPlan(presetId, []);
  return withoutModule !== undefined && fileFingerprint(withModule) !== fileFingerprint(withoutModule);
}

describe("built-in module generated output", () => {
  it("every preview module generates output in at least one creatable preset", () => {
    const creatablePresets = builtinPresets.filter((preset) => preset.support.level !== "planned");
    const withoutOutput = builtinModules
      .filter((module) => module.support.level === "preview" && !markerModuleIds.has(module.id))
      .filter(
        (module) => !creatablePresets.some((preset) => generatesOutput(module.id, preset.id, preset.modules))
      )
      .map((module) => module.id);

    expect(withoutOutput).toEqual([]);
  });
});
