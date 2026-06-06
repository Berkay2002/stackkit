import { describe, expect, it } from "vitest";

import { resolveModuleGraph } from "@berkayorhan/stackkit-core";

import { builtinModules } from "./index.js";

describe("builtin module file declarations", () => {
  it("keeps foundation module IDs available for template rendering", () => {
    expect(builtinModules.map((module) => module.id)).toEqual(expect.arrayContaining(["workspace/pnpm-turbo", "workspace/typescript"]));
  });

  it("contains the full long-term built-in module set", () => {
    expect(builtinModules.map((module) => module.id)).toEqual(
      expect.arrayContaining([
        "workspace/pnpm-turbo",
        "workspace/typescript",
        "workspace/github-actions",
        "workspace/docker-compose",
        "web/nextjs",
        "ui/shadcn",
        "ui/tailwind",
        "api/fastapi",
        "api/flask",
        "api/litestar",
        "web/django",
        "rust/axum",
        "rust/actix",
        "rust/rocket",
        "rust/tokio",
        "rust/sqlx",
        "rust/diesel",
        "desktop/tauri",
        "db/postgres",
        "db/drizzle",
        "db/prisma",
        "db/sqlalchemy",
        "db/sqlx",
        "db/diesel",
        "auth/clerk",
        "auth/auth0-nextjs",
        "auth/auth0-fastapi",
        "auth/auth0-flask",
        "auth/better-auth",
        "auth/none",
        "deploy/vercel",
        "deploy/docker",
        "deploy/kubernetes",
        "docs/readme",
        "docs/architecture",
        "docs/env",
        "docs/local-dev",
        "ai/skills",
        "quality/eslint",
        "quality/prettier",
        "quality/biome",
        "quality/tsc",
        "quality/ruff",
        "quality/mypy",
        "quality/pyright",
        "quality/clippy",
        "quality/rustfmt",
        "quality/cargo-check",
        "quality/pytest",
        "quality/vitest"
      ])
    );
  });

  it("requires a Next.js app before Docker deployment files are generated", () => {
    const docker = builtinModules.find((module) => module.id === "deploy/docker");
    const django = builtinModules.find((module) => module.id === "web/django");

    expect(docker).toBeDefined();
    expect(django).toBeDefined();
    expect(() => resolveModuleGraph([docker!])).toThrow("Module deploy/docker requires capability nextjs-app");
    expect(() => resolveModuleGraph([django!, docker!])).toThrow("Module deploy/docker requires capability nextjs-app");
  });

  it("declares unique friendly aliases for public modules", () => {
    const aliases = builtinModules.flatMap((module) => module.aliases ?? []);

    expect(aliases).toEqual(
      expect.arrayContaining([
        "next",
        "shadcn",
        "tailwind",
        "fastapi",
        "flask",
        "django",
        "postgres",
        "drizzle",
        "sqlalchemy",
        "sqlx",
        "clerk",
        "better-auth",
        "vercel",
        "docker",
        "kubernetes",
        "axum",
        "rust"
      ])
    );
    expect(aliases).not.toContain("auth0");
    expect(new Set(aliases).size).toBe(aliases.length);
  });

  it("declares icon keys for common customizer choices", () => {
    const iconByModuleId = Object.fromEntries(builtinModules.map((module) => [module.id, module.icon]));

    expect(iconByModuleId).toEqual(
      expect.objectContaining({
        "web/nextjs": "nextjs",
        "ui/shadcn": "shadcn",
        "api/fastapi": "fastapi",
        "db/postgres": "postgres",
        "db/drizzle": "drizzle",
        "db/sqlalchemy": "sqlalchemy",
        "auth/clerk": "clerk",
        "auth/auth0-nextjs": "auth0",
        "auth/auth0-fastapi": "auth0",
        "auth/auth0-flask": "auth0",
        "auth/better-auth": "better-auth",
        "deploy/vercel": "vercel",
        "deploy/docker": "docker",
        "deploy/kubernetes": "kubernetes"
      })
    );
  });

  it("declares README metadata for the representative full-stack preset modules", () => {
    const requiredModules = [
      "workspace/pnpm-turbo",
      "workspace/typescript",
      "web/nextjs",
      "ui/shadcn",
      "api/fastapi",
      "db/postgres",
      "db/sqlalchemy",
      "auth/auth0-nextjs",
      "auth/auth0-fastapi",
      "deploy/vercel",
      "deploy/docker"
    ];

    for (const moduleId of requiredModules) {
      const module = builtinModules.find((item) => item.id === moduleId);

      expect(module?.readme?.stack.length, `${moduleId} stack metadata`).toBeGreaterThan(0);
    }
  });

  it("declares targeted env metadata for full-stack Auth0 and SQLAlchemy ownership", () => {
    const sqlalchemy = builtinModules.find((module) => module.id === "db/sqlalchemy");
    const auth0Nextjs = builtinModules.find((module) => module.id === "auth/auth0-nextjs");
    const auth0Fastapi = builtinModules.find((module) => module.id === "auth/auth0-fastapi");

    expect(sqlalchemy?.envVars).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "DATABASE_URL",
          target: "api"
        })
      ])
    );
    expect(auth0Nextjs?.envVars).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "AUTH0_CLIENT_SECRET",
          target: "web"
        })
      ])
    );
    expect(auth0Fastapi?.envVars).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "AUTH0_AUDIENCE",
          target: "api"
        })
      ])
    );
  });
});
