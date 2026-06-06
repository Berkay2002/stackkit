import {
  stackkitModuleSchema,
  type AiSkillDependency,
  type StackkitModule,
  type StackkitModuleInput
} from "@berkayorhan/stackkit-schemas";

/**
 * Parse a module input into a validated {@link StackkitModule}. Defined locally (rather than imported
 * from `./registry.js`) so this module stays browser-safe and node-free — `resolveModuleGraph` pulls
 * it in via the `@berkayorhan/stackkit-core/customizer` entry that the customizer app runs in the
 * browser.
 */
function defineModule(module: StackkitModuleInput): StackkitModule {
  return stackkitModuleSchema.parse(module);
}

export type ToolingLanguage = "ts" | "py" | "rust";
export type ToolingSlot = "lint" | "format" | "typecheck";

export type ToolingToolSpec = {
  moduleId: string;
  title: string;
  description: string;
  language: ToolingLanguage;
  slots: ToolingSlot[];
  isDefault: boolean;
  aliases?: string[];
  aiSkills?: AiSkillDependency[];
};

/** Capability a Quality Module requires to gate it to a language. */
export const languageCapability: Record<ToolingLanguage, string> = {
  ts: "typescript",
  py: "python",
  rust: "rust"
};

/** Slot capability a Quality Module provides, e.g. `ts-lint`, `py-typecheck`. */
export function slotCapability(language: ToolingLanguage, slot: ToolingSlot): string {
  return `${language}-${slot}`;
}

function localGuidance(moduleId: string, skill: string, reason: string): AiSkillDependency[] {
  return [{ skills: [skill], trust: "local", causedBy: moduleId, reason }];
}

function curatedGuidance(moduleId: string, source: string, skills: string[], reason: string): AiSkillDependency[] {
  return [{ source, skills, trust: "curated", causedBy: moduleId, reason }];
}

/**
 * The single source of truth for developer-tooling choices. Each entry is a tool that fills one or
 * more Tooling Slots for a language. Exactly one tool is the default per (language, slot). Combined
 * tools (Biome, Ruff) fill more than one slot and therefore conflict with the single-slot tools they
 * replace — conflicts are derived in {@link buildQualityModules}, not hand-maintained.
 */
export const toolingCatalog: ToolingToolSpec[] = [
  {
    moduleId: "quality/eslint",
    title: "ESLint",
    description: "JavaScript and TypeScript linting",
    language: "ts",
    slots: ["lint"],
    isDefault: true,
    aliases: ["eslint"],
    aiSkills: localGuidance("quality/eslint", "stackkit-eslint-guidance", "ESLint configuration and rule maintenance guidance")
  },
  {
    moduleId: "quality/prettier",
    title: "Prettier",
    description: "Shared code formatting",
    language: "ts",
    slots: ["format"],
    isDefault: true,
    aliases: ["prettier"],
    aiSkills: localGuidance("quality/prettier", "stackkit-prettier-guidance", "Prettier configuration and formatting policy guidance")
  },
  {
    moduleId: "quality/biome",
    title: "Biome",
    description: "Combined linter and formatter for JavaScript and TypeScript",
    language: "ts",
    slots: ["lint", "format"],
    isDefault: false,
    aliases: ["biome"],
    aiSkills: curatedGuidance(
      "quality/biome",
      "https://github.com/paulrberg/agent-skills",
      ["biome-js"],
      "Biome lint and format configuration guidance"
    )
  },
  {
    moduleId: "quality/tsc",
    title: "TypeScript type checking",
    description: "Static type checking via tsc --noEmit",
    language: "ts",
    slots: ["typecheck"],
    isDefault: true,
    aliases: ["tsc"],
    aiSkills: localGuidance("quality/tsc", "stackkit-tsc-guidance", "TypeScript compiler and type-checking configuration guidance")
  },
  {
    moduleId: "quality/ruff",
    title: "Ruff",
    description: "Python linting and formatting",
    language: "py",
    slots: ["lint", "format"],
    isDefault: true,
    aliases: ["ruff"],
    aiSkills: localGuidance("quality/ruff", "stackkit-ruff-guidance", "Ruff linting and formatting guidance")
  },
  {
    moduleId: "quality/mypy",
    title: "mypy",
    description: "Python static type checker",
    language: "py",
    slots: ["typecheck"],
    isDefault: true,
    aliases: ["mypy"],
    aiSkills: curatedGuidance(
      "quality/mypy",
      "https://github.com/bobmatnyc/claude-mpm-skills",
      ["mypy"],
      "mypy configuration and type-annotation guidance"
    )
  },
  {
    moduleId: "quality/pyright",
    title: "Pyright",
    description: "Python static type checker",
    language: "py",
    slots: ["typecheck"],
    isDefault: false,
    aliases: ["pyright"],
    aiSkills: localGuidance("quality/pyright", "stackkit-pyright-guidance", "Pyright configuration and type-checking guidance")
  },
  {
    moduleId: "quality/clippy",
    title: "Clippy",
    description: "Rust linting",
    language: "rust",
    slots: ["lint"],
    isDefault: true,
    aliases: ["clippy"],
    aiSkills: localGuidance("quality/clippy", "stackkit-clippy-guidance", "Clippy lint configuration guidance")
  },
  {
    moduleId: "quality/rustfmt",
    title: "rustfmt",
    description: "Rust formatting",
    language: "rust",
    slots: ["format"],
    isDefault: true,
    aliases: ["rustfmt"],
    aiSkills: localGuidance("quality/rustfmt", "stackkit-rustfmt-guidance", "rustfmt formatting configuration guidance")
  },
  {
    moduleId: "quality/cargo-check",
    title: "cargo check",
    description: "Rust type and compile checking",
    language: "rust",
    slots: ["typecheck"],
    isDefault: true,
    aliases: ["cargo-check"],
    aiSkills: localGuidance("quality/cargo-check", "stackkit-cargo-check-guidance", "Cargo check and compile-verification guidance")
  }
];

/** Module ids that conflict with `spec` because they share a slot in the same language. */
function conflictingModuleIds(spec: ToolingToolSpec, catalog: readonly ToolingToolSpec[]): string[] {
  return catalog
    .filter(
      (other) =>
        other.moduleId !== spec.moduleId &&
        other.language === spec.language &&
        other.slots.some((slot) => spec.slots.includes(slot))
    )
    .map((other) => other.moduleId);
}

/**
 * Expand the tooling catalog into Quality Modules with derived `provides` (slot capabilities),
 * `requires` (language capability), and `conflicts` (other same-language tools sharing a slot).
 */
export function buildQualityModules(catalog: readonly ToolingToolSpec[] = toolingCatalog): StackkitModule[] {
  return catalog.map((spec) => {
    const conflicts = conflictingModuleIds(spec, catalog);

    return defineModule({
      id: spec.moduleId,
      version: "1.0.0",
      title: spec.title,
      description: spec.description,
      aliases: spec.aliases ?? [],
      category: "quality",
      requires: [languageCapability[spec.language]],
      provides: spec.slots.map((slot) => slotCapability(spec.language, slot)),
      conflicts: conflicts.length > 0 ? conflicts : undefined,
      aiSkills: spec.aiSkills
    });
  });
}

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
