import { Buffer } from "node:buffer";

import {
  stackkitRecipeSchema,
  type ModuleId,
  type StackkitModule,
  type StackkitPreset,
  type StackkitRecipe,
  type StackkitRecipeInput
} from "@berkayorhan/stackkit-schemas";

import { resolveModuleGraph } from "./module-graph.js";

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

export function encodeRecipe(recipe: StackkitRecipeInput): string {
  const json = JSON.stringify(stackkitRecipeSchema.parse(recipe));

  return `sk_${Buffer.from(json, "utf8").toString("base64url")}`;
}

export function decodeRecipe(code: string): StackkitRecipe {
  if (!code.startsWith("sk_")) {
    throw new Error("Invalid Stackkit recipe code");
  }

  try {
    const json = Buffer.from(code.slice(3), "base64url").toString("utf8");

    return stackkitRecipeSchema.parse(JSON.parse(json));
  } catch {
    throw new Error("Invalid Stackkit recipe code");
  }
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
