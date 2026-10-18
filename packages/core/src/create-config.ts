import {
  stackkitConfigSchema,
  type StackkitConfig,
  type StackkitManifestSource,
  type StackkitModule,
  type StackkitPreset
} from "@berkayorhan/stackkit-schemas";

import { createCreatePlan, type CreatePlan, type CreatePlanInput } from "./create.js";
import { decodeRecipe } from "./customizer.js";
import {
  pyTypecheckChoices,
  resolveStackAxes,
  tsQualityChoices,
  validateProjectSlug,
  type StackAxes
} from "./module-graph.js";
import { assertCreateSupport } from "./support.js";

export const dbRuntimeChoices = ["node", "edge"] as const;

/** Stack-axis flags as typed by a user; enum-like values are validated during resolution. */
export type CreateAxesInput = Omit<StackAxes, "tsQuality" | "pyTypecheck"> & {
  tsQuality?: string;
  pyTypecheck?: string;
};

export type ResolveCreateConfigInput = {
  name?: string;
  /** A parsed config file and the path to record as provenance. */
  configFile?: { path: string; content: unknown };
  recipeCode?: string;
  preset?: string;
  /** Preset used for a scripted create that names neither a preset nor any stack axis. */
  defaultPreset?: string;
  packageManager?: string;
  ai?: { skillTargets?: string[]; skillMode?: string; linkMode?: string };
  axes?: CreateAxesInput;
  dbRuntime?: string;
  availableModules: readonly StackkitModule[];
  availablePresets: readonly StackkitPreset[];
};

export type ResolvedCreateConfig = {
  config: StackkitConfig;
  source: StackkitManifestSource;
};

/**
 * Merge a create source (config file, recipe, or scripted flags) with CLI overrides and stack axes into
 * one validated config. Axes are resolved against the preset/config selection, so a provider flag
 * composes with a preset that already selects Postgres.
 */
export function resolveCreateConfig(input: ResolveCreateConfigInput): ResolvedCreateConfig {
  if (input.recipeCode && input.configFile) {
    throw new Error("Cannot combine --recipe and --config");
  }
  if (input.preset && (input.recipeCode || input.configFile)) {
    throw new Error(`Cannot combine --preset and ${input.recipeCode ? "--recipe" : "--config"}`);
  }

  const projectName = input.name === undefined ? undefined : validateProjectSlug(input.name);

  if (!projectName && !input.configFile) {
    throw new Error(
      input.recipeCode ? "A project name is required when using --recipe" : "A project name is required"
    );
  }

  const { base, source } = resolveCreateSource(input);
  const raw: Record<string, unknown> = { ...base };

  if (projectName) {
    raw.projectName = projectName;
  }
  if (input.packageManager) {
    raw.packageManager = input.packageManager;
  }

  const ai = Object.fromEntries(Object.entries(input.ai ?? {}).filter(([, value]) => value !== undefined));
  if (Object.keys(ai).length > 0) {
    raw.ai = { ...asOptionalObject(raw.ai), ...ai };
  }

  return {
    config: applyCreateAxes(stackkitConfigSchema.parse(raw), input),
    source
  };
}

/** Plan a create and enforce the support policy (preview and planned modules, presets, package managers). */
export function createSupportedCreatePlan(input: CreatePlanInput & { includePreview?: boolean }): CreatePlan {
  const plan = createCreatePlan(input);
  const preset = input.config.preset
    ? input.availablePresets?.find((candidate) => candidate.id === input.config.preset)
    : undefined;

  assertCreateSupport({
    modules: plan.selectedModules,
    presets: preset ? [preset] : [],
    packageManager: input.config.packageManager,
    includePreview: input.includePreview
  });

  return plan;
}

function resolveCreateSource(input: ResolveCreateConfigInput): { base: Record<string, unknown>; source: StackkitManifestSource } {
  if (input.recipeCode) {
    // Recipes carry their own schemaVersion; the strict config schema has no such key.
    const { schemaVersion: _recipeSchemaVersion, ...recipe } = decodeRecipe(input.recipeCode);
    return { base: recipe, source: { kind: "recipe", code: input.recipeCode } };
  }

  if (input.configFile) {
    return { base: asObject(input.configFile.content), source: { kind: "config", path: input.configFile.path } };
  }

  return {
    base: { preset: input.preset ?? (hasCreateAxes(input.axes) ? undefined : input.defaultPreset) },
    source: { kind: "scripted" }
  };
}

function applyCreateAxes(config: StackkitConfig, input: ResolveCreateConfigInput): StackkitConfig {
  const presetModules = config.preset
    ? (input.availablePresets.find((preset) => preset.id === config.preset)?.modules ?? [])
    : [];
  const axisModules = hasCreateAxes(input.axes)
    ? resolveStackAxes(
        {
          ...input.axes,
          tsQuality: parseChoice(input.axes?.tsQuality, tsQualityChoices, "--ts-quality"),
          pyTypecheck: parseChoice(input.axes?.pyTypecheck, pyTypecheckChoices, "--py-typecheck")
        },
        input.availableModules,
        [...presetModules, ...config.modules]
      )
    : [];
  let preset = config.preset;
  let modules = unique([...config.modules, ...axisModules]);

  // A requested Postgres provider replaces the preset's own provider (providers conflict). The preset is
  // expanded into explicit modules so the replaced provider is no longer selected.
  const provider = axisModules.find(isPostgresProvider);
  const replaced = provider ? presetModules.find((id) => isPostgresProvider(id) && id !== provider) : undefined;
  if (replaced) {
    preset = undefined;
    modules = unique([...presetModules.filter((id) => id !== replaced), ...modules]);
  }

  return { ...config, preset, modules, options: applyDbRuntime(config, input.dbRuntime, [...presetModules, ...modules]) };
}

function applyDbRuntime(
  config: StackkitConfig,
  value: string | undefined,
  selected: readonly string[]
): StackkitConfig["options"] {
  const runtime = parseChoice(value, dbRuntimeChoices, "--db-runtime");

  if (!runtime) {
    return config.options;
  }

  if (!selected.includes("db/drizzle")) {
    if (runtime === "edge") {
      throw new Error("--db-runtime edge requires the Drizzle database client (db/drizzle).");
    }
    return config.options;
  }

  return { ...config.options, "db/drizzle": { ...config.options?.["db/drizzle"], runtime } };
}

function hasCreateAxes(axes: CreateAxesInput | undefined): boolean {
  return Object.values(axes ?? {}).some((value) => (Array.isArray(value) ? value.length > 0 : Boolean(value)));
}

function isPostgresProvider(moduleId: string): boolean {
  return moduleId.startsWith("postgres/");
}

function parseChoice<T extends string>(value: string | undefined, choices: readonly T[], flag: string): T | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!choices.includes(value as T)) {
    throw new Error(`Invalid ${flag} value: "${value}". Expected one of: ${choices.join(", ")}.`);
  }

  return value as T;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Stackkit config must be a JSON object");
  }

  return value as Record<string, unknown>;
}

function asOptionalObject(value: unknown): Record<string, unknown> {
  return value === undefined ? {} : asObject(value);
}
