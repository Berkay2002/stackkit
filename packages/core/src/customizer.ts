import {
  stackkitRecipeSchema,
  type StackkitModule,
  type StackkitPreset,
  type StackkitRecipe,
  type StackkitRecipeInput,
  type SupportMetadata
} from "@berkayorhan/stackkit-schemas";

// `defineModule`/`definePreset` live canonically in schemas; re-exported here for back-compat so the
// browser customizer entry and `@berkayorhan/stackkit-core/customizer` consumers keep working.
export { defineModule, definePreset } from "@berkayorhan/stackkit-schemas";
export { assertCreateSupport, isPubliclySelectable } from "./support.js";

export {
  resolveModuleAlias,
  resolveModuleGraph,
  resolveStackAxes,
  type StackAxes,
  type ResolveModuleGraphOptions
} from "./module-graph.js";

export type {
  ToolingLanguage,
  ToolingSlot,
  ToolingToolSpec
} from "./tooling.js";
export {
  buildQualityModules,
  toolingCatalog,
  slotCapability,
  languageCapability
} from "./tooling.js";

export type CustomizerCatalogChoice = {
  id: string;
  alias: string;
  title: string;
  description: string;
  icon?: string;
  support: SupportMetadata;
};

export type CustomizerCatalog = {
  presets: {
    id: string;
    title: string;
    description: string;
    modules: string[];
    support: SupportMetadata;
  }[];
  previewPresets: {
    id: string;
    title: string;
    description: string;
    modules: string[];
    support: SupportMetadata;
  }[];
  categories: Record<string, CustomizerCatalogChoice[]>;
  previewCategories: Record<string, CustomizerCatalogChoice[]>;
};

export function buildCustomizerCatalog(input: {
  modules: readonly StackkitModule[];
  presets: readonly StackkitPreset[];
  includePreview?: boolean;
}): CustomizerCatalog {
  const categories: Record<string, CustomizerCatalogChoice[]> = {};
  const previewCategories: Record<string, CustomizerCatalogChoice[]> = {};

  for (const module of input.modules) {
    if (module.support.level === "planned") {
      continue;
    }

    const target = module.support.level === "preview" ? previewCategories : categories;
    if (module.support.level === "preview" && !input.includePreview) {
      continue;
    }

    const category = module.category ?? "other";
    const choice: CustomizerCatalogChoice = {
      id: module.id,
      alias: module.aliases[0] ?? module.id,
      title: module.title,
      description: module.description,
      support: module.support
    };

    if (module.icon) {
      choice.icon = module.icon;
    }

    target[category] ??= [];
    target[category].push(choice);
  }

  for (const choices of [...Object.values(categories), ...Object.values(previewCategories)]) {
    choices.sort(compareCatalogChoices);
  }

  const mapPresets = (level: "supported" | "preview") =>
    input.presets
      .filter((preset) => preset.support.level === level)
      .map((preset) => ({
        id: preset.id,
        title: preset.title,
        description: preset.description,
        modules: [...preset.modules],
        support: preset.support
      }))
      .sort((left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id));

  return {
    presets: mapPresets("supported"),
    previewPresets: input.includePreview ? mapPresets("preview") : [],
    categories: sortCategories(categories),
    previewCategories: input.includePreview ? sortCategories(previewCategories) : {}
  };
}

export function encodeRecipe(recipe: StackkitRecipeInput): string {
  const json = JSON.stringify(stackkitRecipeSchema.parse(recipe));

  return `sk_${toBase64Url(json)}`;
}

export function decodeRecipe(code: string): StackkitRecipe {
  if (!code.startsWith("sk_")) {
    throw new Error("Invalid Stackkit recipe code");
  }

  try {
    return stackkitRecipeSchema.parse(JSON.parse(fromBase64Url(code.slice(3))));
  } catch {
    throw new Error("Invalid Stackkit recipe code");
  }
}

function compareCatalogChoices(left: CustomizerCatalogChoice, right: CustomizerCatalogChoice): number {
  return left.title.localeCompare(right.title) || left.id.localeCompare(right.id);
}

function sortCategories(
  categories: Record<string, CustomizerCatalogChoice[]>
): Record<string, CustomizerCatalogChoice[]> {
  return Object.fromEntries(Object.entries(categories).sort(([left], [right]) => left.localeCompare(right)));
}

function toBase64Url(value: string): string {
  const binary = String.fromCodePoint(...new TextEncoder().encode(value));

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}
