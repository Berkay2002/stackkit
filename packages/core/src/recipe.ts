import {
  stackkitRecipeSchema,
  type ModuleId,
  type StackkitConfig,
  type StackkitModule,
  type StackkitPreset,
  type StackkitRecipe,
  type StackkitRecipeInput
} from "@berkayorhan/stackkit-schemas";

import { resolveModuleGraph } from "./module-graph.js";
import { assertCreateSupport } from "./support.js";

export type RecipeInspectView = {
  recipe: StackkitRecipe;
  expandedPresets: {
    id: string;
    title: string;
    modules: ModuleId[];
  }[];
  resolvedModules: {
    id: ModuleId;
    title: string;
  }[];
  capabilities: string[];
  conflicts: {
    moduleId: ModuleId;
    conflictsWith: ModuleId;
  }[];
  warnings: string[];
};

export type InspectRecipeOptions = {
  availableModules: readonly StackkitModule[];
  availablePresets: readonly StackkitPreset[];
};

// One browser-safe codec shared with the customizer entry.
export { decodeRecipe, encodeRecipe } from "./customizer.js";

export function recipeFromConfig(config: StackkitConfig): StackkitRecipe {
  return stackkitRecipeSchema.parse({
    schemaVersion: 1,
    preset: config.preset,
    packageManager: config.packageManager,
    modules: config.modules,
    options: config.options ?? {},
    ai: config.ai
  });
}

/** A recipe for a bare preset. Refuses preview presets without `includePreview`, like create does. */
export function createPresetRecipe(
  presetId: string,
  presets: readonly StackkitPreset[],
  includePreview = false
): StackkitRecipe {
  const preset = presets.find((candidate) => candidate.id === presetId);

  if (!preset) {
    throw new Error(`Unknown Stackkit preset: ${presetId}`);
  }

  assertCreateSupport({ modules: [], presets: [preset], includePreview });

  return stackkitRecipeSchema.parse({ schemaVersion: 1, preset: presetId, ai: {} });
}

export function inspectRecipe(recipe: StackkitRecipeInput, options: InspectRecipeOptions): RecipeInspectView {
  const parsed = stackkitRecipeSchema.parse(recipe);
  const selectedPresets = parsed.preset ? [parsed.preset] : [];
  const expandedPresets = expandRecipePresets(selectedPresets, options.availablePresets);
  const selectedModules = resolveRecipeModules(parsed.modules, options.availableModules);
  const warnings: string[] = [];
  let resolved: StackkitModule[] = [];

  try {
    resolved = resolveModuleGraph(selectedModules, {
      selectedPresets,
      availableModules: options.availableModules,
      availablePresets: options.availablePresets
    });
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : String(error));
  }

  return {
    recipe: parsed,
    expandedPresets,
    resolvedModules: resolved.map((module) => ({ id: module.id, title: module.title })),
    capabilities: unique(resolved.flatMap((module) => module.provides ?? [])),
    conflicts: resolved.flatMap((module) => (module.conflicts ?? []).map((conflict) => ({ moduleId: module.id, conflictsWith: conflict }))),
    warnings
  };
}

function expandRecipePresets(
  selectedPresets: readonly string[],
  availablePresets: readonly StackkitPreset[]
): RecipeInspectView["expandedPresets"] {
  const presetById = new Map(availablePresets.map((preset) => [preset.id, preset]));

  return selectedPresets.map((presetId) => {
    const preset = presetById.get(presetId);

    if (!preset) {
      throw new Error(`Unknown Stackkit preset: ${presetId}`);
    }

    return {
      id: preset.id,
      title: preset.title,
      modules: [...preset.modules]
    };
  });
}

function resolveRecipeModules(moduleIds: readonly ModuleId[], availableModules: readonly StackkitModule[]): StackkitModule[] {
  const moduleById = new Map(availableModules.map((module) => [module.id, module]));

  return moduleIds.map((moduleId) => {
    const module = moduleById.get(moduleId);

    if (!module) {
      throw new Error(`Unknown Stackkit module: ${moduleId}`);
    }

    return module;
  });
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
