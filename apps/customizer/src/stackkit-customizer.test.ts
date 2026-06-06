import { describe, expect, it } from "vitest";

import {
  applyPresetBaseline,
  buildCustomizerState,
  createInitialCustomizerState,
  normalizeCustomizerState,
  toCreateCommand
} from "./stackkit-customizer.js";

describe("Stackkit customizer state", () => {
  it("builds a default Next.js recipe command", () => {
    const result = buildCustomizerState(createInitialCustomizerState());

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.recipe.modules).toContain("web/nextjs");
    expect(result.recipe.modules).toContain("ui/shadcn");
    expect(result.command).toContain("npx @berkayorhan/stackkit@latest create my-stack --recipe sk_");
    expect(result.decoded).toEqual(result.recipe);
  });

  it("uses presets as editable baselines", () => {
    const state = applyPresetBaseline(createInitialCustomizerState(), "next-fastapi-postgres-auth0");
    const result = buildCustomizerState(state);

    expect(state.web).toBe("nextjs");
    expect(state.api).toBe("fastapi");
    expect(state.database).toBe("postgres");
    expect(state.auth).toBe("auth0");
    expect(state.deploy).toEqual(["vercel", "docker"]);
    expect(result.ok && result.recipe.modules).toEqual(
      expect.arrayContaining(["web/nextjs", "api/fastapi", "db/postgres", "auth/auth0-nextjs", "auth/auth0-fastapi"])
    );
  });

  it("customizes after applying a preset without keeping preset modules locked", () => {
    const state = normalizeCustomizerState({
      ...applyPresetBaseline(createInitialCustomizerState(), "next-postgres-clerk"),
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

  it("includes web/vite when web is vite", () => {
    const state = { ...createInitialCustomizerState(), web: "vite" as const, preset: "custom" };
    const result = buildCustomizerState(state);
    expect(result.ok && result.recipe.modules).toContain("web/vite");
  });

  it("drops ui/shadcn when ui is none", () => {
    const state = { ...createInitialCustomizerState(), web: "vite" as const, ui: "none" as const, preset: "custom" };
    const result = buildCustomizerState(state);
    expect(result.ok && result.recipe.modules).not.toContain("ui/shadcn");
  });

  it("swaps to ui/tailwind when ui is tailwind", () => {
    const state = { ...createInitialCustomizerState(), web: "tanstack" as const, ui: "tailwind" as const, preset: "custom" };
    const result = buildCustomizerState(state);
    expect(result.ok && result.recipe.modules).toContain("ui/tailwind");
    expect(result.ok && result.recipe.modules).not.toContain("ui/shadcn");
  });

  it("expands Auth0 for every selected supported framework", () => {
    const result = buildCustomizerState({
      ...createInitialCustomizerState(),
      api: "fastapi",
      database: "postgres",
      auth: "auth0"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.recipe.modules).toContain("auth/auth0-nextjs");
    expect(result.recipe.modules).toContain("auth/auth0-fastapi");
  });

  it("includes Docker for an API-only FastAPI project", () => {
    const result = buildCustomizerState({
      ...createInitialCustomizerState(),
      web: "none",
      api: "fastapi",
      deploy: ["docker"]
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.recipe.modules).toContain("api/fastapi");
    expect(result.recipe.modules).toContain("deploy/docker");
    expect(result.recipe.modules).not.toContain("web/nextjs");
  });

  it("clears deployment choices that do not match the selected app shape", () => {
    expect(
      normalizeCustomizerState({
        ...createInitialCustomizerState(),
        web: "none",
        api: "fastapi",
        deploy: ["vercel", "docker", "kubernetes"]
      }).deploy
    ).toEqual(["docker", "kubernetes"]);
    expect(
      normalizeCustomizerState({
        ...createInitialCustomizerState(),
        web: "django",
        deploy: ["vercel", "docker", "kubernetes"]
      }).deploy
    ).toEqual(["vercel"]);
  });

  it("allows Django projects to target Vercel", () => {
    const result = buildCustomizerState({
      ...createInitialCustomizerState(),
      web: "django",
      deploy: ["vercel"]
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.recipe.modules).toEqual(expect.arrayContaining(["web/django", "deploy/vercel"]));
  });

  it("includes the selected Postgres provider and edge runtime option", () => {
    const result = buildCustomizerState({
      ...createInitialCustomizerState(),
      database: "postgres",
      dbProvider: "supabase",
      dbRuntime: "edge"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.recipe.modules).toContain("postgres/supabase");
    expect(result.recipe.options).toEqual({ "db/drizzle": { runtime: "edge" } });
  });

  it("omits a provider module for the default BYO selection", () => {
    const result = buildCustomizerState({
      ...createInitialCustomizerState(),
      database: "postgres",
      dbProvider: "byo"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.recipe.modules.filter((id) => id.startsWith("postgres/"))).toEqual([]);
  });

  it("defaults to ESLint, Prettier, and mypy tooling", () => {
    const result = buildCustomizerState({
      ...createInitialCustomizerState(),
      api: "fastapi"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.recipe.modules).toContain("quality/eslint");
    expect(result.recipe.modules).toContain("quality/prettier");
    expect(result.recipe.modules).toContain("quality/mypy");
    expect(result.recipe.modules).not.toContain("quality/biome");
    expect(result.recipe.modules).not.toContain("quality/pyright");
  });

  it("swaps to Biome when tsQuality is biome", () => {
    const result = buildCustomizerState({
      ...createInitialCustomizerState(),
      tsQuality: "biome"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.recipe.modules).toContain("quality/biome");
    expect(result.recipe.modules).not.toContain("quality/eslint");
    expect(result.recipe.modules).not.toContain("quality/prettier");
  });

  it("swaps to Pyright when pyTypecheck is pyright with a Python API", () => {
    const result = buildCustomizerState({
      ...createInitialCustomizerState(),
      api: "fastapi",
      pyTypecheck: "pyright"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.recipe.modules).toContain("quality/pyright");
    expect(result.recipe.modules).not.toContain("quality/mypy");
  });

  it("ignores Python type checker choices when no Python app is selected", () => {
    const result = buildCustomizerState({
      ...createInitialCustomizerState(),
      api: "axum",
      pyTypecheck: "pyright"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.recipe.modules).not.toContain("quality/pyright");
    expect(result.recipe.modules).not.toContain("quality/mypy");
    expect(result.recipe.modules).toContain("quality/clippy");
  });

  it("ignores TypeScript quality choices when no TypeScript app is selected", () => {
    const result = buildCustomizerState({
      ...createInitialCustomizerState(),
      web: "none",
      api: "fastapi",
      tsQuality: "biome"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.recipe.modules).not.toContain("quality/biome");
    expect(result.recipe.modules).not.toContain("quality/eslint");
    expect(result.recipe.modules).toContain("quality/ruff");
  });

  it("normalizes unsupported auth and database choices", () => {
    const unsupportedAuth = normalizeCustomizerState({
      ...createInitialCustomizerState(),
      web: "none",
      api: "fastapi",
      auth: "clerk"
    });
    const unsupportedDatabase = normalizeCustomizerState({
      ...createInitialCustomizerState(),
      web: "none",
      api: "none",
      database: "postgres",
      dbProvider: "neon",
      dbRuntime: "edge"
    });

    expect(unsupportedAuth.auth).toBe("none");
    expect(unsupportedDatabase.database).toBe("none");
    expect(unsupportedDatabase.dbProvider).toBe("byo");
    expect(unsupportedDatabase.dbRuntime).toBe("node");
  });

  it("generates a shell-safe command with custom project and package manager", () => {
    const result = buildCustomizerState({
      ...createInitialCustomizerState(),
      projectName: "client portal",
      packageManager: "bun"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(toCreateCommand("client portal", result.recipeCode)).toBe(
      `npx @berkayorhan/stackkit@latest create "client portal" --recipe ${result.recipeCode}`
    );
    expect(result.recipe.packageManager).toBe("bun");
  });
});
