import type { PackageManager, StackkitModule, StackkitPreset, SupportMetadata } from "@berkayorhan/stackkit-schemas";

export type AssertCreateSupportInput = {
  modules: readonly StackkitModule[];
  presets?: readonly StackkitPreset[];
  includePreview?: boolean;
  packageManager?: PackageManager;
};

export function assertCreateSupport(input: AssertCreateSupportInput): void {
  if (input.packageManager && input.packageManager !== "pnpm" && !input.includePreview) {
    throw new Error(`Package manager ${input.packageManager} is preview. Re-run with --include-preview to opt in.`);
  }

  for (const preset of input.presets ?? []) {
    assertEntryCanBeCreated("Preset", preset.id, preset.support, input.includePreview ?? false);
  }

  for (const module of input.modules) {
    assertEntryCanBeCreated("Module", module.id, module.support, input.includePreview ?? false);
  }
}

export function isPubliclySelectable(support: SupportMetadata, includePreview = false): boolean {
  return support.level === "supported" || (includePreview && support.level === "preview");
}

function assertEntryCanBeCreated(
  kind: "Module" | "Preset",
  id: string,
  support: SupportMetadata,
  includePreview: boolean
): void {
  if (support.level === "planned") {
    throw new Error(`${kind} ${id} is planned and cannot be created${support.reason ? `: ${support.reason}` : "."}`);
  }

  if (support.level === "preview" && !includePreview) {
    throw new Error(`${kind} ${id} is preview. Re-run with --include-preview to opt in.`);
  }
}
