import { join } from "node:path";

import {
  stackkitConfigSchema,
  type StackkitConfig,
  type StackkitManifestSource,
  type StackkitModule,
  type StackkitPreset
} from "@berkayorhan/stackkit-schemas";

import { readExistingFile } from "./fs-utils.js";
import { type PackageManagerName } from "./package-manager.js";
import { resolveModuleAlias } from "./module-graph.js";
import { readManifest, readOptionalSkillsLock } from "./manifest.js";

export type StackkitInfo = {
  project: {
    name: string;
    packageManager: PackageManagerName;
    stackkitVersion: string;
  };
  source:
    | {
        kind: StackkitManifestSource["kind"];
        path?: string;
        preset?: string;
        recipeCode?: string;
      }
    | null;
  modules: {
    id: string;
    title?: string;
    version: string;
  }[];
  paths: Record<string, string>;
  ai: {
    targets: string[];
    installed: number;
    local: number;
    unresolved: number;
  };
};

export type ModuleDiscoveryEntry = {
  id: string;
  version: string;
  title: string;
  description: string;
  aliases: string[];
  category?: string;
};

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

function compareCatalogChoices(left: CustomizerCatalogChoice, right: CustomizerCatalogChoice): number {
  return left.title.localeCompare(right.title) || left.id.localeCompare(right.id);
}

export function listStackkitModules(modules: readonly StackkitModule[]): ModuleDiscoveryEntry[] {
  return modules.map(moduleDiscoveryEntry);
}

export function searchStackkitModules(query: string, modules: readonly StackkitModule[]): ModuleDiscoveryEntry[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery.length === 0) {
    return [];
  }

  return listStackkitModules(modules).filter((module) =>
    [module.id, module.title, module.description, module.category ?? "", ...module.aliases].some((value) =>
      value.toLowerCase().includes(normalizedQuery)
    )
  );
}

export function inspectStackkitModule(input: string, modules: readonly StackkitModule[]): ModuleDiscoveryEntry {
  const id = resolveModuleAlias(input, modules);
  const module = modules.find((candidate) => candidate.id === id);

  if (!module) {
    throw new Error(`Unknown Stackkit module: ${input}`);
  }

  return moduleDiscoveryEntry(module);
}

function moduleDiscoveryEntry(module: StackkitModule): ModuleDiscoveryEntry {
  return {
    id: module.id,
    version: module.version,
    title: module.title,
    description: module.description,
    aliases: module.aliases,
    category: module.category
  };
}

export async function collectInfo(projectDirectory: string): Promise<StackkitInfo> {
  const manifest = await readManifest(projectDirectory);
  const config = await readOptionalStackkitConfig(projectDirectory);
  const lock = await readOptionalSkillsLock(projectDirectory);
  const aiSkills = lock ?? manifest.aiSkills;

  return {
    project: {
      name: manifest.projectName,
      packageManager: manifest.packageManager,
      stackkitVersion: manifest.stackkitVersion
    },
    source: collectInfoSource(manifest.source, config),
    modules: manifest.modules.map((module) => ({
      id: module.id,
      version: module.version
    })),
    paths: manifest.paths,
    ai: {
      targets: aiSkills.targets.filter((target) => target.enabled).map((target) => target.agent),
      installed: aiSkills.installed.length,
      local: aiSkills.local.length,
      unresolved: aiSkills.unresolved.length
    }
  };
}

async function readOptionalStackkitConfig(projectDirectory: string): Promise<StackkitConfig | undefined> {
  const content = await readExistingFile(join(projectDirectory, "stackkit.config.json"));

  if (content === undefined) {
    return undefined;
  }

  try {
    return stackkitConfigSchema.parse(JSON.parse(content));
  } catch {
    return undefined;
  }
}

function collectInfoSource(
  source: StackkitManifestSource,
  config: StackkitConfig | undefined
): StackkitInfo["source"] {
  if (source.kind === "config") {
    return {
      kind: source.kind,
      path: source.path,
      preset: config?.preset
    };
  }

  if (source.kind === "recipe") {
    return {
      kind: source.kind,
      recipeCode: source.code
    };
  }

  return { kind: source.kind };
}
