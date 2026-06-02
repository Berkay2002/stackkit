import { describe, expect, it } from "vitest";

import { resolveModuleGraph } from "@stackkit/core";

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
        "quality/ruff",
        "quality/pytest",
        "quality/cargo",
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
});
