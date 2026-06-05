import { describe, expect, it } from "vitest";

import { builtinModules, builtinPresets } from "./index.js";

describe("builtinPresets", () => {
  it("contains exactly the official built-in preset ids", () => {
    expect(builtinPresets.map((preset) => preset.id)).toEqual([
      "next",
      "next-postgres-clerk",
      "next-postgres-better-auth",
      "next-fastapi-postgres-auth0",
      "next-axum-postgres-auth0",
      "containerized"
    ]);
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
