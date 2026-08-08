import {
  defineModule,
  type AiSkillDependency,
  type NativeInitializerInput,
  type StackkitModule,
  type SupportMetadata
} from "@berkayorhan/stackkit-schemas";

export type ToolingLanguage = "ts" | "py" | "rust";
export type ToolingSlot = "lint" | "format" | "typecheck";

export type ToolingToolSpec = {
  moduleId: string;
  title: string;
  description: string;
  icon?: string;
  language: ToolingLanguage;
  slots: ToolingSlot[];
  isDefault: boolean;
  aliases?: string[];
  aiSkills?: AiSkillDependency[];
  nativeInitializers?: NativeInitializerInput[];
  support: SupportMetadata;
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

function curatedGuidance(moduleId: string, source: string, skills: string[], reason: string): AiSkillDependency[] {
  return [{ source, skills, trust: "curated", causedBy: moduleId, reason }];
}

/**
 * The single source of truth for developer-tooling choices. Each entry is a tool that fills one or
 * more Tooling Slots for a language. Exactly one tool is the default per (language, slot). Combined
 * tools (Biome, Ruff) fill more than one slot and therefore conflict with the single-slot tools they
 * replace — conflicts are derived in {@link buildQualityModules}, not hand-maintained.
 *
 * Lives in the registry (the package that owns "what modules exist") so `core` consumes it via the
 * documented `core → registry` arrow rather than registry importing core.
 */
export const toolingCatalog: ToolingToolSpec[] = [
  {
    moduleId: "quality/eslint",
    title: "ESLint",
    description: "JavaScript and TypeScript linting",
    icon: "eslint",
    language: "ts",
    slots: ["lint"],
    isDefault: true,
    support: { level: "supported" },
    aliases: ["eslint"]
  },
  {
    moduleId: "quality/prettier",
    title: "Prettier",
    description: "Shared code formatting",
    icon: "prettier",
    language: "ts",
    slots: ["format"],
    isDefault: true,
    support: { level: "supported" },
    aliases: ["prettier"]
  },
  {
    moduleId: "quality/biome",
    title: "Biome",
    description: "Combined linter and formatter for JavaScript and TypeScript",
    icon: "biome",
    language: "ts",
    slots: ["lint", "format"],
    isDefault: false,
    support: { level: "preview", reason: "This alternative has not passed the golden-path release profile." },
    aliases: ["biome"],
    nativeInitializers: [
      {
        name: "biome init",
        enabled: false,
        disabledReason:
          "Researched and mapped, but not enabled until Stackkit replaces the matching deterministic template path.",
        phase: "tool-config",
        tool: { execution: "package-manager-dlx", package: "@biomejs/biome@2.5.7" },
        args: ["init"],
        cwd: ".",
        mutationPolicy: "known-files",
        expectedFiles: ["biome.json"]
      }
    ],
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
    icon: "typescript",
    language: "ts",
    slots: ["typecheck"],
    isDefault: true,
    support: { level: "supported" },
    aliases: ["tsc"]
  },
  {
    moduleId: "quality/ruff",
    title: "Ruff",
    description: "Python linting and formatting",
    icon: "ruff",
    language: "py",
    slots: ["lint", "format"],
    isDefault: true,
    support: { level: "supported" },
    aliases: ["ruff"]
  },
  {
    moduleId: "quality/mypy",
    title: "mypy",
    description: "Python static type checker",
    icon: "python",
    language: "py",
    slots: ["typecheck"],
    isDefault: true,
    support: { level: "supported" },
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
    icon: "pyright",
    language: "py",
    slots: ["typecheck"],
    isDefault: false,
    support: { level: "preview", reason: "This alternative has not passed the golden-path release profile." },
    aliases: ["pyright"]
  },
  {
    moduleId: "quality/clippy",
    title: "Clippy",
    description: "Rust linting",
    icon: "rust",
    language: "rust",
    slots: ["lint"],
    isDefault: true,
    support: { level: "planned", reason: "Rust application templates are not implemented." },
    aliases: ["clippy"]
  },
  {
    moduleId: "quality/rustfmt",
    title: "rustfmt",
    description: "Rust formatting",
    icon: "rust",
    language: "rust",
    slots: ["format"],
    isDefault: true,
    support: { level: "planned", reason: "Rust application templates are not implemented." },
    aliases: ["rustfmt"]
  },
  {
    moduleId: "quality/cargo-check",
    title: "cargo check",
    description: "Rust type and compile checking",
    icon: "rust",
    language: "rust",
    slots: ["typecheck"],
    isDefault: true,
    support: { level: "planned", reason: "Rust application templates are not implemented." },
    aliases: ["cargo-check"]
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
      icon: spec.icon,
      aliases: spec.aliases ?? [],
      category: "quality",
      support: spec.support,
      requires: [languageCapability[spec.language]],
      provides: spec.slots.map((slot) => slotCapability(spec.language, slot)),
      conflicts: conflicts.length > 0 ? conflicts : undefined,
      nativeInitializers: spec.nativeInitializers,
      aiSkills: spec.aiSkills
    });
  });
}
