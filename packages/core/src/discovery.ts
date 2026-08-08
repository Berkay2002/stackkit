import { join } from "node:path";

import {
  stackkitConfigSchema,
  type StackkitConfig,
  type StackkitManifestSource,
  type StackkitModule,
  type ModuleRemovalPolicy,
  type SupportMetadata
} from "@berkayorhan/stackkit-schemas";

import { readExistingFile } from "./fs-utils.js";
import { type PackageManagerName } from "./package-manager.js";
import { resolveModuleAlias } from "./module-graph.js";
import { readManifest, readOptionalSkillsLock } from "./manifest.js";
import { isPubliclySelectable } from "./support.js";

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
  support: SupportMetadata;
  removalPolicy: ModuleRemovalPolicy;
};

export type ModuleDiscoveryOptions = {
  includePreview?: boolean;
};

export function listStackkitModules(
  modules: readonly StackkitModule[],
  options: ModuleDiscoveryOptions = {}
): ModuleDiscoveryEntry[] {
  return modules
    .filter((module) => isPubliclySelectable(module.support, options.includePreview))
    .map(moduleDiscoveryEntry);
}

export function searchStackkitModules(
  query: string,
  modules: readonly StackkitModule[],
  options: ModuleDiscoveryOptions = {}
): ModuleDiscoveryEntry[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery.length === 0) {
    return [];
  }

  return listStackkitModules(modules, options).filter((module) =>
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
    category: module.category,
    support: module.support,
    removalPolicy: module.removalPolicy
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
