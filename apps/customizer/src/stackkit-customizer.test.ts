import { describe, expect, it } from "vitest";

import { buildCustomizerState, createInitialCustomizerState, normalizeCustomizerState, toCreateCommand } from "./stackkit-customizer.js";

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

  it("omits Docker when the selected app shape cannot support it", () => {
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

    expect(result.recipe.modules).not.toContain("deploy/docker");
  });

  it("clears deployment choices that do not match the selected app shape", () => {
    expect(
      normalizeCustomizerState({
        ...createInitialCustomizerState(),
        web: "none",
        api: "fastapi",
        deploy: ["vercel"]
      }).deploy
    ).toEqual([]);
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
