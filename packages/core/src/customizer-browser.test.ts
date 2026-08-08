import { describe, expect, it } from "vitest";

import {
  buildCustomizerCatalog,
  decodeRecipe,
  encodeRecipe,
  resolveModuleGraph,
  resolveStackAxes
} from "./customizer.js";
import { defineModule, definePreset } from "./index.js";

describe("browser-safe customizer API", () => {
  const modules = [
    defineModule({
      id: "workspace/pnpm-turbo",
      version: "1.0.0",
      title: "pnpm and Turborepo",
      description: "Workspace",
      aliases: ["workspace"],
      category: "workspace",
      support: { level: "supported" },
      provides: ["workspace/node"]
    }),
    defineModule({
      id: "workspace/typescript",
      version: "1.0.0",
      title: "TypeScript",
      description: "TypeScript",
      category: "workspace",
      support: { level: "supported" },
      requires: ["workspace/node"],
      provides: ["typescript"]
    }),
    defineModule({
      id: "web/nextjs",
      version: "1.0.0",
      title: "Next.js",
      description: "Next app",
      aliases: ["next"],
      category: "web",
      icon: "nextjs",
      support: { level: "supported" },
      requires: ["workspace/node"],
      provides: ["web-app", "nextjs-app", "react"]
    }),
    defineModule({
      id: "ui/shadcn",
      version: "1.0.0",
      title: "ShadCN",
      description: "UI components",
      category: "ui",
      support: { level: "supported" },
      requires: ["react"]
    }),
    defineModule({
      id: "api/fastapi",
      version: "1.0.0",
      title: "FastAPI",
      description: "Python API",
      aliases: ["fastapi"],
      category: "api",
      support: { level: "supported" },
      requires: ["workspace/node"],
      provides: ["api", "python"]
    }),
    defineModule({
      id: "db/postgres",
      version: "1.0.0",
      title: "Postgres",
      description: "Database",
      aliases: ["postgres"],
      category: "database",
      support: { level: "supported" },
      provides: ["postgres"]
    }),
    defineModule({
      id: "db/sqlalchemy",
      version: "1.0.0",
      title: "SQLAlchemy",
      description: "Python database client",
      aliases: ["sqlalchemy"],
      category: "database-client",
      support: { level: "supported" },
      requires: ["postgres", "python"]
    }),
    defineModule({
      id: "auth/auth0-nextjs",
      version: "1.0.0",
      title: "Auth0 for Next.js",
      description: "Next auth",
      category: "auth",
      support: { level: "supported" },
      requires: ["react"],
      provides: ["auth"]
    }),
    defineModule({
      id: "auth/auth0-fastapi",
      version: "1.0.0",
      title: "Auth0 for FastAPI",
      description: "API auth",
      category: "auth",
      support: { level: "supported" },
      requires: ["python"],
      provides: ["auth"]
    }),
    defineModule({
      id: "deploy/docker",
      version: "1.0.0",
      title: "Docker",
      description: "Container files",
      aliases: ["docker"],
      category: "deploy",
      support: { level: "supported" },
      requires: ["nextjs-app"]
    })
  ];

  it("builds catalog data, resolves axes, and round-trips recipes without Node-only imports", () => {
    const catalog = buildCustomizerCatalog({
      modules,
      presets: [
        definePreset({
          id: "next-fastapi",
          title: "Next.js and FastAPI",
          description: "Full-stack app",
          support: { level: "supported" },
          modules: ["web/nextjs", "api/fastapi"]
        })
      ]
    });

    const moduleIds = resolveStackAxes(
      { web: "next", api: "fastapi", db: "postgres", auth: "auth0", deploy: ["docker"] },
      modules
    );
    const graph = resolveModuleGraph(
      moduleIds.map((id) => modules.find((module) => module.id === id)!),
      { availableModules: modules }
    );
    const recipe = {
      schemaVersion: 1 as const,
      packageManager: "pnpm" as const,
      modules: graph.map((module) => module.id),
      ai: { skillTargets: ["codex" as const], skillMode: "install" as const, linkMode: "copy" as const }
    };
    const code = encodeRecipe(recipe);

    expect(catalog.categories.web?.[0]).toMatchObject({ id: "web/nextjs", alias: "next", icon: "nextjs" });
    expect(graph.map((module) => module.id)).toContain("auth/auth0-nextjs");
    expect(graph.map((module) => module.id)).toContain("auth/auth0-fastapi");
    expect(decodeRecipe(code)).toEqual({ ...recipe, options: {} });
  });
});
