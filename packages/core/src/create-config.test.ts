import { builtinModules, builtinPresets, defaultPresetId } from "@berkayorhan/stackkit-registry";
import { describe, expect, it } from "vitest";

import { createSupportedCreatePlan, resolveCreateConfig, type ResolveCreateConfigInput } from "./index.js";

const catalog = { availableModules: builtinModules, availablePresets: builtinPresets };

function resolve(input: Omit<ResolveCreateConfigInput, "availableModules" | "availablePresets">) {
  return resolveCreateConfig({ defaultPreset: defaultPresetId, ...input, ...catalog });
}

describe("resolveCreateConfig", () => {
  it("accepts the golden preset with its own Postgres provider", () => {
    const { config } = resolve({ name: "app", preset: defaultPresetId, axes: { dbProvider: "postgres-local" } });

    expect(config.preset).toBe(defaultPresetId);
    expect(() => createSupportedCreatePlan({ config, ...catalog })).not.toThrow();
  });

  it("does not add a second database client when the preset already selects one", () => {
    const { config } = resolve({ name: "app", preset: defaultPresetId, axes: { db: "db/postgres", dbProvider: "postgres-local" } });
    const plan = createSupportedCreatePlan({ config, ...catalog });

    expect(plan.selectedModules.map((module) => module.id)).not.toContain("db/drizzle");
  });

  it("replaces the preset's Postgres provider with the requested one", () => {
    const { config } = resolve({ name: "app", preset: defaultPresetId, axes: { dbProvider: "neon" } });

    expect(config.preset).toBeUndefined();
    expect(config.modules).toContain("postgres/neon");
    expect(config.modules).not.toContain("postgres/local");
    expect(config.modules).toContain("db/sqlalchemy");
    expect(() => createSupportedCreatePlan({ config, ...catalog, includePreview: true })).not.toThrow();
  });

  it("requires Postgres for a provider when nothing selects it", () => {
    expect(() => resolve({ name: "app", axes: { web: "web/nextjs", dbProvider: "neon" } })).toThrow(
      "--db-provider requires a Postgres database"
    );
  });

  it("validates and applies --db-runtime for every create source", () => {
    expect(() => resolve({ name: "app", preset: "next-neon-drizzle", dbRuntime: "banana" })).toThrow(
      'Invalid --db-runtime value: "banana"'
    );
    expect(() => resolve({ name: "app", preset: defaultPresetId, dbRuntime: "edge" })).toThrow(
      "--db-runtime edge requires the Drizzle database client"
    );

    const { config } = resolve({ name: "app", preset: "next-neon-drizzle", dbRuntime: "edge" });
    expect(config.options?.["db/drizzle"]).toEqual(expect.objectContaining({ runtime: "edge" }));

    const fromConfig = resolve({
      name: "app",
      configFile: { path: "stackkit.config.json", content: { projectName: "app", preset: "next-neon-drizzle" } },
      dbRuntime: "edge"
    });
    expect(fromConfig.config.options?.["db/drizzle"]).toEqual(expect.objectContaining({ runtime: "edge" }));
  });

  it("rejects conflicting create sources", () => {
    expect(() =>
      resolve({ name: "app", preset: defaultPresetId, configFile: { path: "c.json", content: {} } })
    ).toThrow("Cannot combine --preset and --config");
    expect(() =>
      resolve({ name: "app", recipeCode: "x", configFile: { path: "c.json", content: {} } })
    ).toThrow("Cannot combine --recipe and --config");
  });

  it("records the config file path as provenance", () => {
    const { source } = resolve({
      configFile: { path: "configs/stackkit.json", content: { projectName: "app", preset: defaultPresetId } }
    });

    expect(source).toEqual({ kind: "config", path: "configs/stackkit.json" });
  });

  it("uses the supported default preset for a bare scripted create", () => {
    const { config } = resolve({ name: "app" });

    expect(config.preset).toBe(defaultPresetId);
    expect(() => createSupportedCreatePlan({ config, ...catalog })).not.toThrow();
  });
});
