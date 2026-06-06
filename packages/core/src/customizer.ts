import {
  stackkitModuleSchema,
  stackkitPresetSchema,
  stackkitRecipeSchema,
  type StackkitModule,
  type StackkitModuleInput,
  type StackkitPreset,
  type StackkitPresetInput,
  type StackkitRecipe,
  type StackkitRecipeInput
} from "@berkayorhan/stackkit-schemas";

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
};

export type CustomizerCatalog = {
  presets: {
    id: string;
    title: string;
    description: string;
    modules: string[];
  }[];
  categories: Record<string, CustomizerCatalogChoice[]>;
};

export function defineModule(module: StackkitModuleInput): StackkitModule {
  return stackkitModuleSchema.parse(module);
}

export function definePreset(preset: StackkitPresetInput): StackkitPreset {
  return stackkitPresetSchema.parse(preset);
}

export function buildCustomizerCatalog(input: {
  modules: readonly StackkitModule[];
  presets: readonly StackkitPreset[];
}): CustomizerCatalog {
  const categories: Record<string, CustomizerCatalogChoice[]> = {};

  for (const module of input.modules) {
    const category = module.category ?? "other";
    const choice: CustomizerCatalogChoice = {
      id: module.id,
      alias: module.aliases[0] ?? module.id,
      title: module.title,
      description: module.description
    };

    if (module.icon) {
      choice.icon = module.icon;
    }

    categories[category] ??= [];
    categories[category].push(choice);
  }

  for (const choices of Object.values(categories)) {
    choices.sort(compareCatalogChoices);
  }

  return {
    presets: input.presets
      .map((preset) => ({
        id: preset.id,
        title: preset.title,
        description: preset.description,
        modules: [...preset.modules]
      }))
      .sort((left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id)),
    categories: Object.fromEntries(Object.entries(categories).sort(([left], [right]) => left.localeCompare(right)))
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
