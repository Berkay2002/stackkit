import { describe, expect, it } from "vitest";

import { defineModule, definePreset, resolveModuleGraph, resolveStackAxes } from "./index.js";

const workspace = defineModule({
  id: "workspace/pnpm-turbo",
  version: "1.0.0",
  title: "pnpm and Turborepo",
  description: "Workspace foundation",
  provides: ["workspace/node"]
});

const next = defineModule({
  id: "web/nextjs",
  version: "1.0.0",
  title: "Next.js",
  description: "Next.js web application",
  requires: ["workspace/node"],
  provides: ["web-app", "react"]
});

const django = defineModule({
  id: "web/django",
  version: "1.0.0",
  title: "Django",
  description: "Django web application",
  conflicts: ["web/nextjs"],
  provides: ["web-app", "python"]
});

const fastapi = defineModule({
  id: "api/fastapi",
  version: "1.0.0",
  title: "FastAPI",
  description: "FastAPI API",
  provides: ["api", "python"]
});

const clerk = defineModule({
  id: "auth/clerk",
  version: "1.0.0",
  title: "Clerk",
  description: "Clerk auth",
  category: "auth",
  requires: ["react"],
  provides: ["auth"]
});

const auth0Nextjs = defineModule({
  id: "auth/auth0-nextjs",
  version: "1.0.0",
  title: "Auth0 for Next.js",
  description: "Auth0 Next.js auth",
  category: "auth",
  requires: ["react"],
  provides: ["auth"]
});

const auth0Fastapi = defineModule({
  id: "auth/auth0-fastapi",
  version: "1.0.0",
  title: "Auth0 for FastAPI",
  description: "Auth0 FastAPI auth",
  category: "auth",
  requires: ["python"],
  provides: ["auth"]
});

describe("resolveModuleGraph", () => {
  it("orders selected modules deterministically and validates requirements", () => {
    const graph = resolveModuleGraph([next, workspace]);

    expect(graph.map((module) => module.id)).toEqual(["workspace/pnpm-turbo", "web/nextjs"]);
  });

  it("fails when a required capability is missing", () => {
    expect(() => resolveModuleGraph([next])).toThrow("Module web/nextjs requires capability workspace/node");
  });

  it("fails when selected modules conflict", () => {
    expect(() => resolveModuleGraph([workspace, next, django])).toThrow("Module web/django conflicts with web/nextjs");
  });

  it("fails when concrete auth modules select different providers", () => {
    expect(() => resolveModuleGraph([workspace, next, clerk, auth0Nextjs])).toThrow(
      "Conflicting auth providers: clerk, auth0"
    );
  });

  it("allows multiple concrete Auth0 modules for selected frameworks", () => {
    const graph = resolveModuleGraph([workspace, next, fastapi, auth0Nextjs, auth0Fastapi]);

    expect(graph.map((module) => module.id)).toEqual([
      "workspace/pnpm-turbo",
      "web/nextjs",
      "api/fastapi",
      "auth/auth0-nextjs",
      "auth/auth0-fastapi"
    ]);
  });

  it("expands presets into modules before resolving", () => {
    const preset = definePreset({
      id: "next-only",
      title: "Next.js only",
      description: "A pnpm/Turborepo workspace with Next.js",
      modules: ["workspace/pnpm-turbo", "web/nextjs"]
    });

    const graph = resolveModuleGraph([], {
      presets: [preset],
      selectedPresets: ["next-only"],
      availableModules: [workspace, next]
    });

    expect(graph.map((module) => module.id)).toEqual(["workspace/pnpm-turbo", "web/nextjs"]);
  });
});

describe("resolveStackAxes database provider", () => {
  const postgres = defineModule({ id: "db/postgres", version: "1.0.0", title: "Postgres", description: "Postgres", aliases: ["postgres"], provides: ["postgres"] });
  const drizzle = defineModule({ id: "db/drizzle", version: "1.0.0", title: "Drizzle", description: "Drizzle", aliases: ["drizzle"], requires: ["postgres"] });
  const neon = defineModule({ id: "postgres/neon", version: "1.0.0", title: "Neon", description: "Neon", aliases: ["neon"], requires: ["postgres"], conflicts: ["postgres/supabase"] });
  const supabase = defineModule({ id: "postgres/supabase", version: "1.0.0", title: "Supabase", description: "Supabase", aliases: ["supabase"], requires: ["postgres"], conflicts: ["postgres/neon"] });
  const modules = [postgres, drizzle, neon, supabase];

  it("appends exactly one provider module for dbProvider", () => {
    const resolved = resolveStackAxes({ db: "db/postgres", dbProvider: "supabase" }, modules);

    expect(resolved.filter((id) => id.startsWith("postgres/"))).toEqual(["postgres/supabase"]);
    expect(resolved).toEqual(expect.arrayContaining(["db/postgres", "db/drizzle"]));
  });

  it("resolves provider aliases", () => {
    const resolved = resolveStackAxes({ db: "db/postgres", dbProvider: "neon" }, modules);

    expect(resolved.filter((id) => id.startsWith("postgres/"))).toEqual(["postgres/neon"]);
  });

  it("appends no provider for byo or when dbProvider is omitted", () => {
    expect(resolveStackAxes({ db: "db/postgres" }, modules).filter((id) => id.startsWith("postgres/"))).toEqual([]);
    expect(resolveStackAxes({ db: "db/postgres", dbProvider: "byo" }, modules).filter((id) => id.startsWith("postgres/"))).toEqual([]);
  });
});
