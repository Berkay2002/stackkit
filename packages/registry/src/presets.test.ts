import { describe, expect, it } from "vitest";

import { resolveModuleGraph } from "@berkayorhan/stackkit-core";

import { builtinModules, builtinPresets } from "./index.js";

describe("builtinPresets", () => {
  it("contains exactly the official built-in preset ids", () => {
    expect(builtinPresets.map((preset) => preset.id)).toEqual([
      "next",
      "vite",
      "tanstack-start",
      "next-postgres-clerk",
      "next-postgres-better-auth",
      "next-fastapi-postgres-auth0",
      "next-axum-postgres-auth0",
      "containerized",
      "next-neon-drizzle",
      "next-supabase-drizzle"
    ]);
  });

  it("provider presets include exactly one postgres provider", () => {
    const presetById = new Map(builtinPresets.map((preset) => [preset.id, preset.modules]));

    const neon = presetById.get("next-neon-drizzle")!;
    expect(neon.filter((id) => id.startsWith("postgres/"))).toEqual(["postgres/neon"]);
    expect(neon).toEqual(expect.arrayContaining(["db/postgres", "db/drizzle"]));

    const supabase = presetById.get("next-supabase-drizzle")!;
    expect(supabase.filter((id) => id.startsWith("postgres/"))).toEqual(["postgres/supabase"]);
    expect(supabase).toEqual(expect.arrayContaining(["db/postgres", "db/drizzle"]));
  });

  it("every preset resolves into a valid module graph", () => {
    const moduleById = new Map(builtinModules.map((module) => [module.id, module]));

    for (const preset of builtinPresets) {
      const modules = preset.modules.map((id) => moduleById.get(id)!);
      expect(() => resolveModuleGraph(modules), preset.id).not.toThrow();
    }
  });

  it("contains named compositions of built-in modules", () => {
    const moduleIds = new Set(builtinModules.map((module) => module.id));

    for (const preset of builtinPresets) {
      for (const moduleId of preset.modules) {
        expect(moduleIds.has(moduleId), `${preset.id} references ${moduleId}`).toBe(true);
      }
    }
  });

  it("uses one database owner per official preset", () => {
    const presetById = new Map(builtinPresets.map((preset) => [preset.id, preset.modules]));

    expect(presetById.get("next-postgres-clerk")).toEqual(expect.arrayContaining(["db/postgres", "db/drizzle"]));
    expect(presetById.get("next-postgres-clerk")).not.toEqual(expect.arrayContaining(["db/sqlalchemy", "rust/sqlx"]));

    expect(presetById.get("next-postgres-better-auth")).toEqual(expect.arrayContaining(["db/postgres", "db/drizzle"]));
    expect(presetById.get("next-postgres-better-auth")).not.toEqual(expect.arrayContaining(["db/sqlalchemy", "rust/sqlx"]));

    expect(presetById.get("next-fastapi-postgres-auth0")).toEqual(expect.arrayContaining(["db/postgres", "db/sqlalchemy"]));
    expect(presetById.get("next-fastapi-postgres-auth0")).not.toEqual(expect.arrayContaining(["db/drizzle", "rust/sqlx"]));

    expect(presetById.get("next-axum-postgres-auth0")).toEqual(expect.arrayContaining(["db/postgres", "rust/sqlx"]));
    expect(presetById.get("next-axum-postgres-auth0")).not.toEqual(expect.arrayContaining(["db/drizzle", "db/sqlalchemy"]));
  });
});
