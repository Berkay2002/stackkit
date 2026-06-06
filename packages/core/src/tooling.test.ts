import { builtinModules } from "@berkayorhan/stackkit-registry";
import type { StackkitModule } from "@berkayorhan/stackkit-schemas";
import { describe, expect, it } from "vitest";

import { defineModule } from "./registry.js";
import {
  applyDefaultTooling,
  buildQualityModules,
  slotCapability,
  toolingCatalog,
  type ToolingLanguage,
  type ToolingSlot
} from "./tooling.js";

const LANGUAGES: ToolingLanguage[] = ["ts", "py", "rust"];
const SLOTS: ToolingSlot[] = ["lint", "format", "typecheck"];

const builtinById = new Map(builtinModules.map((module) => [module.id, module]));

function builtin(id: string): StackkitModule {
  const module = builtinById.get(id);
  if (!module) {
    throw new Error(`Test setup error: unknown builtin module ${id}`);
  }
  return module;
}

function ids(modules: readonly StackkitModule[]): string[] {
  return modules.map((module) => module.id);
}

describe("toolingCatalog", () => {
  it("declares exactly one default per language and slot", () => {
    for (const language of LANGUAGES) {
      for (const slot of SLOTS) {
        const defaults = toolingCatalog.filter(
          (spec) => spec.isDefault && spec.language === language && spec.slots.includes(slot)
        );
        expect(defaults, `${language}-${slot}`).toHaveLength(1);
      }
    }
  });

  it("only references the three known slots and languages", () => {
    for (const spec of toolingCatalog) {
      expect(LANGUAGES).toContain(spec.language);
      for (const slot of spec.slots) {
        expect(SLOTS).toContain(slot);
      }
    }
  });
});

describe("buildQualityModules", () => {
  const modules = buildQualityModules();
  const byId = new Map(modules.map((module) => [module.id, module]));

  it("derives slot capabilities as provides", () => {
    expect(byId.get("quality/eslint")?.provides).toContain("ts-lint");
    expect(byId.get("quality/prettier")?.provides).toContain("ts-format");
    expect(byId.get("quality/tsc")?.provides).toContain("ts-typecheck");
    expect(byId.get("quality/ruff")?.provides).toEqual(
      expect.arrayContaining(["py-lint", "py-format"])
    );
    expect(byId.get("quality/mypy")?.provides).toContain("py-typecheck");
    expect(byId.get("quality/clippy")?.provides).toContain("rust-lint");
  });

  it("requires each tool's language capability", () => {
    expect(byId.get("quality/eslint")?.requires).toContain("typescript");
    expect(byId.get("quality/mypy")?.requires).toContain("python");
    expect(byId.get("quality/clippy")?.requires).toContain("rust");
  });

  it("tags every quality module with the quality category", () => {
    for (const module of modules) {
      expect(module.category).toBe("quality");
    }
  });

  it("makes combined tools conflict with the single-slot tools they replace", () => {
    const biome = byId.get("quality/biome");
    expect(biome?.provides).toEqual(expect.arrayContaining(["ts-lint", "ts-format"]));
    expect(biome?.conflicts).toEqual(expect.arrayContaining(["quality/eslint", "quality/prettier"]));
    expect(byId.get("quality/eslint")?.conflicts).toContain("quality/biome");
    expect(byId.get("quality/prettier")?.conflicts).toContain("quality/biome");
  });

  it("makes typecheckers of the same language conflict", () => {
    expect(byId.get("quality/mypy")?.conflicts).toContain("quality/pyright");
    expect(byId.get("quality/pyright")?.conflicts).toContain("quality/mypy");
  });

  it("does not make independent single-slot tools conflict", () => {
    expect(byId.get("quality/tsc")?.conflicts ?? []).toEqual([]);
    expect(byId.get("quality/ruff")?.conflicts ?? []).toEqual([]);
    expect(byId.get("quality/clippy")?.conflicts ?? []).toEqual([]);
  });

  it("exposes the alternative tools by alias for --with", () => {
    expect(byId.get("quality/biome")?.aliases).toContain("biome");
    expect(byId.get("quality/pyright")?.aliases).toContain("pyright");
  });
});

describe("applyDefaultTooling", () => {
  it("injects eslint, prettier, and tsc for a TypeScript project", () => {
    const input = [builtin("workspace/typescript"), builtin("web/nextjs")];
    const result = applyDefaultTooling(input);

    expect(ids(result)).toEqual(
      expect.arrayContaining(["workspace/typescript", "web/nextjs", "quality/eslint", "quality/prettier", "quality/tsc"])
    );
    // input is unchanged
    expect(input).toHaveLength(2);
  });

  it("keeps explicit biome and only fills the remaining typecheck slot", () => {
    const input = [builtin("workspace/typescript"), builtin("quality/biome")];
    const result = applyDefaultTooling(input);
    const resultIds = ids(result);

    expect(resultIds).toContain("quality/biome");
    expect(resultIds).toContain("quality/tsc");
    expect(resultIds).not.toContain("quality/eslint");
    expect(resultIds).not.toContain("quality/prettier");
  });

  it("injects ruff and mypy for a Python project", () => {
    const input = [builtin("api/fastapi")];
    const result = applyDefaultTooling(input);
    const resultIds = ids(result);

    expect(resultIds).toContain("quality/ruff");
    expect(resultIds).toContain("quality/mypy");
  });

  it("keeps explicit pyright and only fills lint/format with ruff", () => {
    const input = [builtin("api/fastapi"), builtin("quality/pyright")];
    const result = applyDefaultTooling(input);
    const resultIds = ids(result);

    expect(resultIds).toContain("quality/pyright");
    expect(resultIds).toContain("quality/ruff");
    expect(resultIds).not.toContain("quality/mypy");
  });

  it("injects clippy, rustfmt, and cargo-check for a Rust project", () => {
    const rustModule = defineModule({
      id: "rust/service",
      version: "1.0.0",
      title: "Rust Service",
      description: "A rust service for testing",
      category: "api",
      provides: ["rust"]
    });
    const result = applyDefaultTooling([rustModule]);
    const resultIds = ids(result);

    expect(resultIds).toContain("quality/clippy");
    expect(resultIds).toContain("quality/rustfmt");
    expect(resultIds).toContain("quality/cargo-check");
  });

  it("injects nothing when all slots are already filled (idempotent)", () => {
    const input = [
      builtin("workspace/typescript"),
      builtin("quality/eslint"),
      builtin("quality/prettier"),
      builtin("quality/tsc")
    ];
    const first = applyDefaultTooling(input);
    expect(ids(first)).toEqual(ids(input));

    const second = applyDefaultTooling(first);
    expect(ids(second)).toEqual(ids(first));
  });

  it("injects nothing when no language is present", () => {
    const docker = defineModule({
      id: "deploy/docker-only",
      version: "1.0.0",
      title: "Docker",
      description: "Docker without a language",
      category: "deploy",
      provides: ["deploy"]
    });
    const result = applyDefaultTooling([docker]);
    expect(ids(result)).toEqual(["deploy/docker-only"]);
  });
});

describe("slotCapability", () => {
  it("namespaces the slot by language", () => {
    expect(slotCapability("ts", "lint")).toBe("ts-lint");
    expect(slotCapability("py", "typecheck")).toBe("py-typecheck");
    expect(slotCapability("rust", "format")).toBe("rust-format");
  });
});
