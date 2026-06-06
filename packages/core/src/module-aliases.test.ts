import { describe, expect, it } from "vitest";

import { defineModule, resolveModuleAlias, resolveStackAxes } from "./index.js";

const modules = [
  defineModule({
    id: "workspace/pnpm-turbo",
    version: "1.0.0",
    title: "pnpm",
    description: "workspace",
    provides: ["workspace/node"],
    aliases: ["workspace"]
  }),
  defineModule({
    id: "workspace/typescript",
    version: "1.0.0",
    title: "TypeScript",
    description: "ts",
    requires: ["workspace/node"],
    provides: ["typescript"],
    aliases: ["typescript"]
  }),
  defineModule({
    id: "web/nextjs",
    version: "1.0.0",
    title: "Next.js",
    description: "web",
    requires: ["workspace/node"],
    provides: ["web-app", "nextjs-app", "react"],
    aliases: ["next"]
  }),
  defineModule({
    id: "ui/shadcn",
    version: "1.0.0",
    title: "ShadCN",
    description: "ui",
    requires: ["react"],
    aliases: ["shadcn"]
  }),
  defineModule({
    id: "quality/eslint",
    version: "1.0.0",
    title: "ESLint",
    description: "lint",
    requires: ["typescript"],
    provides: ["lint"],
    aliases: ["eslint"]
  }),
  defineModule({
    id: "api/fastapi",
    version: "1.0.0",
    title: "FastAPI",
    description: "api",
    provides: ["api", "python", "fastapi"],
    aliases: ["fastapi"]
  }),
  defineModule({
    id: "rust/tokio",
    version: "1.0.0",
    title: "Tokio",
    description: "runtime",
    provides: ["rust-async"],
    aliases: ["tokio"]
  }),
  defineModule({
    id: "rust/axum",
    version: "1.0.0",
    title: "Axum",
    description: "api",
    requires: ["rust-async"],
    provides: ["api", "rust"],
    aliases: ["axum"]
  }),
  defineModule({
    id: "db/postgres",
    version: "1.0.0",
    title: "Postgres",
    description: "db",
    provides: ["postgres"],
    aliases: ["postgres"]
  }),
  defineModule({
    id: "db/drizzle",
    version: "1.0.0",
    title: "Drizzle",
    description: "db client",
    requires: ["postgres", "typescript"],
    aliases: ["drizzle"]
  }),
  defineModule({
    id: "db/sqlalchemy",
    version: "1.0.0",
    title: "SQLAlchemy",
    description: "db client",
    requires: ["postgres", "python"],
    aliases: ["sqlalchemy"]
  }),
  defineModule({
    id: "rust/sqlx",
    version: "1.0.0",
    title: "Rust SQLx",
    description: "db client",
    requires: ["postgres", "rust"],
    aliases: ["rust-sqlx"]
  }),
  defineModule({
    id: "auth/clerk",
    version: "1.0.0",
    title: "Clerk",
    description: "auth",
    requires: ["react"],
    aliases: ["clerk"]
  }),
  defineModule({
    id: "auth/auth0-nextjs",
    version: "1.0.0",
    title: "Auth0 Next.js",
    description: "auth",
    requires: ["react"]
  }),
  defineModule({
    id: "auth/auth0-fastapi",
    version: "1.0.0",
    title: "Auth0 FastAPI",
    description: "auth",
    requires: ["python"]
  }),
  defineModule({
    id: "deploy/docker",
    version: "1.0.0",
    title: "Docker",
    description: "container",
    requires: ["nextjs-app"],
    aliases: ["docker"]
  }),
  defineModule({
    id: "deploy/vercel",
    version: "1.0.0",
    title: "Vercel",
    description: "deploy",
    requires: ["web-app"],
    aliases: ["vercel"]
  }),
  defineModule({
    id: "deploy/kubernetes",
    version: "1.0.0",
    title: "Kubernetes",
    description: "deploy",
    requires: ["container"],
    aliases: ["kubernetes"]
  })
] as const;

describe("module aliases", () => {
  it("resolves a friendly alias to a module id", () => {
    expect(resolveModuleAlias("fastapi", modules)).toBe("api/fastapi");
    expect(resolveModuleAlias("api/fastapi", modules)).toBe("api/fastapi");
  });

  it("rejects unknown module aliases", () => {
    expect(() => resolveModuleAlias("unknown", modules)).toThrow("Unknown Stackkit module or alias: unknown");
  });

  it("resolves stack axes into coherent modules", () => {
    expect(
      resolveStackAxes(
        {
          web: "next",
          api: "fastapi",
          db: "postgres",
          auth: "auth0"
        },
        modules
      )
    ).toEqual([
      "workspace/pnpm-turbo",
      "workspace/typescript",
      "web/nextjs",
      "ui/shadcn",
      "api/fastapi",
      "db/postgres",
      "db/sqlalchemy",
      "auth/auth0-nextjs",
      "auth/auth0-fastapi"
    ]);
  });

  it("resolves Auth0 for Axum only to supported modules when no Axum Auth0 module exists", () => {
    expect(resolveStackAxes({ web: "next", api: "axum", db: "postgres", auth: "auth0" }, modules)).toEqual([
      "workspace/pnpm-turbo",
      "workspace/typescript",
      "web/nextjs",
      "ui/shadcn",
      "rust/tokio",
      "rust/axum",
      "db/postgres",
      "rust/sqlx",
      "auth/auth0-nextjs"
    ]);
  });

  it("rejects Auth0 when no selected framework has a concrete integration", () => {
    expect(() => resolveStackAxes({ auth: "auth0" }, modules)).toThrow(
      "Auth0 requires a supported framework context"
    );
  });

  it("rejects mutually exclusive auth selections", () => {
    expect(() => resolveStackAxes({ web: "next", auth: ["clerk", "auth0"] }, modules)).toThrow(
      "Select only one auth provider"
    );
  });

  it("resolves deploy and with axes to canonical module ids", () => {
    expect(resolveStackAxes({ web: "next", with: ["docker"], deploy: ["vercel", "kubernetes"] }, modules)).toEqual([
      "workspace/pnpm-turbo",
      "workspace/typescript",
      "web/nextjs",
      "ui/shadcn",
      "deploy/docker",
      "deploy/vercel",
      "deploy/kubernetes"
    ]);
  });
});
