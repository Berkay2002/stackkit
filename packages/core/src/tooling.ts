import type { StackkitModule } from "@berkayorhan/stackkit-schemas";

import {
  buildQualityModules,
  languageCapability,
  slotCapability,
  toolingCatalog,
  type ToolingLanguage,
  type ToolingSlot,
  type ToolingToolSpec
} from "@berkayorhan/stackkit-registry";

/**
 * The tooling catalog + Quality Module builders live in `@berkayorhan/stackkit-registry` (the package
 * that owns "what modules exist"). This module keeps the catalog-driven *injection into resolution*
 * (`applyDefaultTooling`, used by `resolveModuleGraph`) in core and re-exports the registry pieces so
 * the browser-safe `@berkayorhan/stackkit-core/customizer` entry keeps a stable import surface.
 *
 * `core → registry` is the documented dependency arrow; registry imports only schemas, so it stays
 * node-free and this module stays browser-safe.
 */
export {
  buildQualityModules,
  toolingCatalog,
  slotCapability,
  languageCapability,
  type ToolingLanguage,
  type ToolingSlot,
  type ToolingToolSpec
};

const TOOLING_LANGUAGES: ToolingLanguage[] = ["ts", "py", "rust"];
const TOOLING_SLOTS: ToolingSlot[] = ["lint", "format", "typecheck"];

/**
 * Gap-fill default developer tooling. For every language that is present in `modules` (a module
 * provides that language's capability), inject the catalog's default tool into any of its three
 * Tooling Slots that no present module already fills. Choosing an alternative tool (e.g. Biome,
 * Pyright) therefore suppresses the default for the slots it covers instead of conflicting.
 *
 * The injected modules are built from the catalog itself via {@link buildQualityModules}, so this
 * needs no `availableModules` list. The result is the original modules followed by injected
 * defaults, deduped by id; the input is never mutated.
 */
export function applyDefaultTooling(
  modules: readonly StackkitModule[],
  catalog: readonly ToolingToolSpec[] = toolingCatalog
): StackkitModule[] {
  const providedCapabilities = new Set<string>();
  for (const module of modules) {
    for (const capability of module.provides ?? []) {
      providedCapabilities.add(capability);
    }
  }

  const presentLanguages = TOOLING_LANGUAGES.filter((language) =>
    providedCapabilities.has(languageCapability[language])
  );

  const injectedSpecIds = new Set<string>();
  for (const language of presentLanguages) {
    for (const slot of TOOLING_SLOTS) {
      if (providedCapabilities.has(slotCapability(language, slot))) {
        continue;
      }

      const defaultSpec = catalog.find(
        (spec) => spec.isDefault && spec.language === language && spec.slots.includes(slot)
      );

      if (defaultSpec) {
        injectedSpecIds.add(defaultSpec.moduleId);
      }
    }
  }

  if (injectedSpecIds.size === 0) {
    return [...modules];
  }

  const existingIds = new Set(modules.map((module) => module.id));
  const injected = buildQualityModules(catalog).filter(
    (module) => injectedSpecIds.has(module.id) && !existingIds.has(module.id)
  );

  return [...modules, ...injected];
}
