import { resolveModuleGraph } from "@berkayorhan/stackkit-core/customizer";
import { builtinModules, builtinPresets } from "@berkayorhan/stackkit-registry";
import { describe, expect, it } from "vitest";

import cliPackage from "../../../packages/cli/package.json";
import {
  applyPresetBaseline,
  buildCustomizerState,
  choiceError,
  choiceSupportLevel,
  createInitialCustomizerState,
  customizerPresets,
  normalizeCustomizerState,
  projectNameError,
  type CustomizerState
} from "./stackkit-customizer.js";

function custom(overrides: Partial<CustomizerState>): CustomizerState {
  return { ...createInitialCustomizerState(), preset: "custom", ...overrides };
}

function presetModuleIds(presetId: string): string[] {
  return resolveModuleGraph([], {
    presets: builtinPresets,
    selectedPresets: [presetId],
    availableModules: builtinModules
  }).map((module) => module.id);
}

describe("Stackkit customizer state", () => {
  it("builds the golden-path preset exactly as the CLI resolves it, pinned to the CLI version", () => {
    const result = buildCustomizerState(createInitialCustomizerState());

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.recipe.preset).toBe("next-fastapi-postgres-auth0");
    expect(result.recipe.modules).toEqual(presetModuleIds("next-fastapi-postgres-auth0"));
    expect(result.recipe.modules).toContain("quality/pytest");
    expect(result.command).toBe(
      `npx @berkayorhan/stackkit@${cliPackage.version} create my-stack --recipe ${result.recipeCode}`
    );
    expect(result.decoded).toEqual(result.recipe);
  });

  it("offers every non-planned registry preset and derives its baseline from the preset modules", () => {
    expect(customizerPresets(false).map((preset) => preset.id)).toEqual(["next-fastapi-postgres-auth0"]);

    const previewPresets = customizerPresets(true);
    expect(previewPresets.map((preset) => preset.id)).toEqual(
      builtinPresets.filter((preset) => preset.support.level !== "planned").map((preset) => preset.id)
    );

    for (const preset of previewPresets) {
      const state = applyPresetBaseline({ ...createInitialCustomizerState(), includePreview: true }, preset.id);
      const result = buildCustomizerState(state);

      expect(result.ok, preset.id).toBe(true);
      expect(result.ok && result.recipe.modules, preset.id).toEqual(presetModuleIds(preset.id));
    }

    const clerk = applyPresetBaseline({ ...createInitialCustomizerState(), includePreview: true }, "next-postgres-clerk");
    expect(clerk).toEqual(
      expect.objectContaining({ web: "nextjs", ui: "shadcn", database: "postgres", auth: "clerk", deploy: ["vercel"] })
    );
  });

  it("reads preview flags from registry support levels", () => {
    expect(choiceSupportLevel("web", "nextjs")).toBe("supported");
    expect(choiceSupportLevel("web", "vite")).toBe("preview");
    expect(choiceSupportLevel("deploy", "kubernetes")).toBe("preview");
    expect(choiceSupportLevel("tsQuality", "biome")).toBe("preview");
  });

  it("drops preview choices when preview mode is off", () => {
    expect(normalizeCustomizerState(custom({ web: "vite", includePreview: false })).web).toBe("none");

    const withPreviewTools = custom({ includePreview: true, tsQuality: "biome", pyTypecheck: "pyright" });
    expect(normalizeCustomizerState(withPreviewTools)).toEqual(
      expect.objectContaining({ tsQuality: "biome", pyTypecheck: "pyright" })
    );

    const previewOff = applyPresetBaseline({ ...withPreviewTools, includePreview: false }, "next-fastapi-postgres-auth0");
    expect(previewOff).toEqual(expect.objectContaining({ tsQuality: "eslint-prettier", pyTypecheck: "mypy" }));
    expect(buildCustomizerState(previewOff).ok).toBe(true);
  });

  it("customizes after applying a preset without keeping preset modules locked", () => {
    const state = normalizeCustomizerState({
      ...applyPresetBaseline({ ...createInitialCustomizerState(), includePreview: true }, "next-postgres-clerk"),
      preset: "custom",
      ui: "none",
      auth: "none"
    });
    const result = buildCustomizerState(state);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.recipe.preset).toBeUndefined();
    expect(result.recipe.modules).toContain("web/nextjs");
    expect(result.recipe.modules).toContain("db/postgres");
    expect(result.recipe.modules).not.toContain("ui/shadcn");
    expect(result.recipe.modules).not.toContain("auth/clerk");
  });

  it("maps web and UI choices to modules", () => {
    const vite = buildCustomizerState(custom({ includePreview: true, web: "vite", api: "none", database: "none", auth: "none", deploy: [] }));
    expect(vite.ok && vite.recipe.modules).toContain("web/vite");

    const viteNoUi = buildCustomizerState(custom({ includePreview: true, web: "vite", ui: "none", api: "none", database: "none", auth: "none", deploy: [] }));
    expect(viteNoUi.ok && viteNoUi.recipe.modules).not.toContain("ui/shadcn");

    // ui/tailwind is declaration-only, so even preview mode drops it and says why.
    const tailwindState = custom({ includePreview: true, web: "tanstack", ui: "none", api: "none", database: "none", auth: "none", deploy: [] });
    const tailwind = buildCustomizerState({ ...tailwindState, ui: "tailwind" });
    expect(tailwind.ok && tailwind.recipe.modules).not.toContain("ui/tailwind");
    expect(choiceSupportLevel("ui", "tailwind")).toBe("planned");
    expect(choiceError(tailwindState, { ui: "tailwind" })).toMatch(/ui\/tailwind is planned/);
  });

  it("expands Auth0 for every selected supported framework", () => {
    const result = buildCustomizerState(custom({ api: "fastapi", database: "postgres", auth: "auth0" }));

    expect(result.ok && result.recipe.modules).toEqual(expect.arrayContaining(["auth/auth0-nextjs", "auth/auth0-fastapi"]));
  });

  it("includes Docker for an API-only FastAPI project", () => {
    const result = buildCustomizerState(custom({ web: "none", api: "fastapi", deploy: ["docker"] }));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.recipe.modules).toContain("api/fastapi");
    expect(result.recipe.modules).toContain("deploy/docker");
    expect(result.recipe.modules).not.toContain("web/nextjs");
  });

  it("drops choices core rejects for the selected app shape", () => {
    const apiOnly = normalizeCustomizerState(
      custom({ includePreview: true, web: "none", api: "fastapi", auth: "clerk", deploy: ["vercel", "docker", "kubernetes"] })
    );
    expect(apiOnly.deploy).toEqual(["docker", "kubernetes"]);
    expect(apiOnly.auth).toBe("none");

    const empty = normalizeCustomizerState(
      custom({ includePreview: true, web: "none", api: "none", database: "postgres", dbProvider: "neon", dbRuntime: "edge" })
    );
    expect(empty).toEqual(expect.objectContaining({ database: "none", dbProvider: "byo", dbRuntime: "node" }));
  });

  it("explains disabled choices with the core error and keeps choices that other axes can absorb", () => {
    const apiOnly = custom({ web: "none", api: "fastapi", auth: "none", database: "none", deploy: [] });

    expect(choiceError(apiOnly, { auth: "clerk" })).toEqual(expect.any(String));
    expect(choiceError(apiOnly, { auth: "auth0" })).toBeUndefined();
    expect(choiceError(createInitialCustomizerState(), { web: "none" })).toBeUndefined();
  });

  it("emits the edge runtime option only for Neon", () => {
    const neon = buildCustomizerState(
      custom({ includePreview: true, api: "none", auth: "none", database: "postgres", dbProvider: "neon", dbRuntime: "edge" })
    );
    expect(neon.ok && neon.recipe.options).toEqual({ "db/drizzle": { runtime: "edge" } });

    const supabaseState = normalizeCustomizerState(
      custom({ includePreview: true, api: "none", auth: "none", database: "postgres", dbProvider: "supabase", dbRuntime: "edge" })
    );
    expect(supabaseState.dbRuntime).toBe("node");

    const supabase = buildCustomizerState(supabaseState);
    expect(supabase.ok && supabase.recipe.modules).toContain("postgres/supabase");
    expect(supabase.ok && supabase.recipe.options).toEqual({});
  });

  it("omits a provider module for the default BYO selection", () => {
    const result = buildCustomizerState(custom({ database: "postgres", dbProvider: "byo" }));

    expect(result.ok && result.recipe.modules.filter((id) => id.startsWith("postgres/"))).toEqual([]);
  });

  it("swaps quality tools and ignores them when their language is absent", () => {
    const defaults = buildCustomizerState(custom({ api: "fastapi" }));
    expect(defaults.ok && defaults.recipe.modules).toEqual(
      expect.arrayContaining(["quality/eslint", "quality/prettier", "quality/mypy"])
    );

    const biome = buildCustomizerState(custom({ includePreview: true, tsQuality: "biome" }));
    expect(biome.ok && biome.recipe.modules).toContain("quality/biome");
    expect(biome.ok && biome.recipe.modules).not.toContain("quality/eslint");

    const pyright = buildCustomizerState(custom({ includePreview: true, api: "fastapi", pyTypecheck: "pyright" }));
    expect(pyright.ok && pyright.recipe.modules).toContain("quality/pyright");
    expect(pyright.ok && pyright.recipe.modules).not.toContain("quality/mypy");

    const noPython = buildCustomizerState(
      custom({ includePreview: true, api: "none", database: "none", auth: "none", deploy: [], pyTypecheck: "pyright" })
    );
    expect(noPython.ok && noPython.recipe.modules).not.toContain("quality/pyright");

    const noTypeScript = buildCustomizerState(custom({ includePreview: true, web: "none", api: "fastapi", tsQuality: "biome" }));
    expect(noTypeScript.ok && noTypeScript.recipe.modules).not.toContain("quality/biome");
    expect(noTypeScript.ok && noTypeScript.recipe.modules).toContain("quality/ruff");
  });

  it("rejects project names the CLI would reject instead of quoting them", () => {
    expect(projectNameError("client-portal")).toBeUndefined();
    expect(projectNameError("my $(whoami) app")).toContain("Invalid project name");

    const result = buildCustomizerState({ ...createInitialCustomizerState(), projectName: "client portal" });
    expect(result).toEqual(expect.objectContaining({ ok: false, error: expect.stringContaining("Invalid project name") }));
  });

  it("adds --include-preview and the selected package manager for preview stacks", () => {
    const result = buildCustomizerState({ ...createInitialCustomizerState(), projectName: "client-portal", packageManager: "bun", includePreview: true });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.command).toBe(
      `npx @berkayorhan/stackkit@${cliPackage.version} create client-portal --recipe ${result.recipeCode} --include-preview`
    );
    expect(result.recipe.packageManager).toBe("bun");
    expect(normalizeCustomizerState({ ...createInitialCustomizerState(), packageManager: "bun" }).packageManager).toBe("pnpm");
  });
});
