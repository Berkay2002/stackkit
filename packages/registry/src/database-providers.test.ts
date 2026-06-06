import { describe, expect, it } from "vitest";

import { resolveModuleGraph } from "@berkayorhan/stackkit-core";

import { builtinModules } from "./index.js";

const byId = (id: string) => builtinModules.find((module) => module.id === id);

const PROVIDERS = ["postgres/neon", "postgres/supabase", "postgres/supabase-local", "postgres/local"];

describe("postgres provider modules", () => {
  it("every provider requires postgres and conflicts with the other providers", () => {
    for (const id of PROVIDERS) {
      const module = byId(id);
      expect(module, id).toBeDefined();
      expect(module!.requires, id).toContain("postgres");
      expect(module!.category, id).toBe("database-provider");

      const others = PROVIDERS.filter((other) => other !== id);
      expect(module!.conflicts ?? [], id).toEqual(expect.arrayContaining(others));
    }
  });

  it("supabase declares DIRECT_URL (target db) and no DATABASE_URL", () => {
    for (const id of ["postgres/supabase", "postgres/supabase-local"]) {
      const envVars = byId(id)!.envVars ?? [];
      const names = envVars.map((envVar) => envVar.name);
      expect(names, id).toContain("DIRECT_URL");
      expect(names, id).not.toContain("DATABASE_URL");
      expect(envVars.find((envVar) => envVar.name === "DIRECT_URL")!.target, id).toBe("db");
    }
  });

  it("neon and local declare no env vars (clients keep DATABASE_URL)", () => {
    expect(byId("postgres/neon")!.envVars ?? []).toEqual([]);
    expect(byId("postgres/local")!.envVars ?? []).toEqual([]);
  });

  it("postgres/local emits a static docker-compose.db.yml service", () => {
    const files = byId("postgres/local")!.files ?? [];
    const compose = files.find((file) => file.path === "docker-compose.db.yml");
    expect(compose).toBeDefined();
    expect(compose!.owner).toBe("postgres/local");
    expect(compose!.content).toContain("postgres:17");
  });

  it("postgres/supabase-local emits a static supabase/config.toml", () => {
    const files = byId("postgres/supabase-local")!.files ?? [];
    const config = files.find((file) => file.path === "supabase/config.toml");
    expect(config).toBeDefined();
    expect(config!.owner).toBe("postgres/supabase-local");
    expect(config!.content).toContain("[db]");
    expect(config!.content).toContain("port = 54322");
  });

  it("two providers in one graph conflict (mutual exclusion enforced)", () => {
    expect(() => resolveModuleGraph([byId("db/postgres")!, byId("postgres/neon")!, byId("postgres/supabase")!])).toThrow(
      /conflicts with/
    );
  });
});
