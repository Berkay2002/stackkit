import { describe, expect, it } from "vitest";

import type { StackkitManifest } from "@berkayorhan/stackkit-schemas";

import { createCreatePlan, defineModule, renderCreateFiles, validateProjectSlug } from "./index.js";
import { buildExpectedManagedFilePlan } from "./create.js";

const availableModules = [
  defineModule({
    id: "web/nextjs",
    version: "1.0.0",
    title: "Next.js",
    description: "Next.js web application",
    provides: ["web-app", "react"],
    aiSkills: [
      {
        source: "https://github.com/vercel-labs/agent-skills",
        skills: ["vercel-react-best-practices"],
        trust: "official",
        causedBy: "web/nextjs",
        reason: "React and Next.js app code"
      }
    ]
  }),
  defineModule({
    id: "deploy/kubernetes",
    version: "1.0.0",
    title: "Kubernetes",
    description: "Baseline Kubernetes deployment",
    provides: ["deploy"],
    aiSkills: [
      {
        skills: ["stackkit-kubernetes-guidance"],
        trust: "local",
        causedBy: "deploy/kubernetes",
        reason: "No accepted official or curated Kubernetes skill source is configured"
      }
    ]
  })
] as const;

describe("validateProjectSlug", () => {
  it("accepts lowercase slug names", () => {
    expect(validateProjectSlug("acme-dashboard")).toBe("acme-dashboard");
    expect(validateProjectSlug("app2")).toBe("app2");
  });

  it("rejects names that are not v1 Stackkit slugs", () => {
    expect(() => validateProjectSlug("Acme Dashboard")).toThrow('Invalid project name: "Acme Dashboard"');
    expect(() => validateProjectSlug("acme_dashboard")).toThrow('Invalid project name: "acme_dashboard"');
    expect(() => validateProjectSlug("@acme/dashboard")).toThrow('Invalid project name: "@acme/dashboard"');
  });
});

describe("createCreatePlan", () => {
  it("plans native initializers without serializing selected module details", () => {
    const plan = createCreatePlan({
      config: {
        projectName: "native-app",
        packageManager: "pnpm",
        workspace: "pnpm-turbo",
        modules: ["web/nextjs", "ui/shadcn"],
        ai: { skillTargets: ["codex"] }
      },
      availableModules: [
        defineModule({
          id: "web/nextjs",
          version: "1.0.0",
          title: "Next.js",
          description: "Next.js app",
          provides: ["react"]
        }),
        defineModule({
          id: "ui/shadcn",
          version: "1.0.0",
          title: "ShadCN",
          description: "ShadCN UI",
          requires: ["react"],
          nativeInitializers: [
            {
              name: "shadcn init",
              phase: "integration",
              tool: { execution: "package-manager-dlx", package: "shadcn@latest" },
              args: [
                "init",
                "-t",
                { token: "web-framework", values: { nextjs: "next", vite: "vite", "tanstack-start": "start" } }
              ],
              cwd: ".",
              mutationPolicy: "merge-owned",
              expectedFiles: ["apps/web/components.json"]
            }
          ]
        })
      ]
    });

    expect(plan.nativeInitializers).toEqual([
      expect.objectContaining({
        moduleId: "ui/shadcn",
        name: "shadcn init",
        command: "pnpm",
        args: ["dlx", "shadcn@latest", "init", "-t", "next"],
        mutationPolicy: "merge-owned"
      })
    ]);
    expect(JSON.parse(JSON.stringify(plan))).toHaveProperty("nativeInitializers");
    expect(JSON.parse(JSON.stringify(plan))).not.toHaveProperty("selectedModules");
  });

  it("builds a dry-run create plan from parsed config and available modules", () => {
    const plan = createCreatePlan({
      config: {
        projectName: "acme-dashboard",
        packageManager: "pnpm",
        workspace: "pnpm-turbo",
        modules: ["web/nextjs", "deploy/kubernetes"],
        ai: {
          skillTargets: ["codex", "claude-code"]
        }
      },
      availableModules
    });

    expect(plan).toMatchObject({
      schemaVersion: 1,
      operation: "create",
      dryRun: true,
      projectName: "acme-dashboard",
      targetDirectoryName: "acme-dashboard",
      warnings: [],
      modules: [
        { id: "web/nextjs", version: "1.0.0" },
        { id: "deploy/kubernetes", version: "1.0.0" }
      ],
      aiSkills: {
        targets: [
          { agent: "codex", directory: ".agents", enabled: true },
          { agent: "claude-code", directory: ".claude", enabled: true }
        ],
        resolved: [
          {
            source: "https://github.com/vercel-labs/agent-skills",
            skills: ["vercel-react-best-practices"],
            trust: "official",
            causedBy: "web/nextjs",
            reason: "React and Next.js app code"
          },
          {
            skills: ["stackkit-kubernetes-guidance"],
            trust: "local",
            causedBy: "deploy/kubernetes",
            reason: "No accepted official or curated Kubernetes skill source is configured"
          }
        ],
        local: [
          {
            skills: ["stackkit-kubernetes-guidance"],
            trust: "local",
            causedBy: "deploy/kubernetes",
            reason: "No accepted official or curated Kubernetes skill source is configured"
          }
        ],
        unresolved: []
      },
      skillInstallCommands: [
        {
          command: "npx",
          args: [
            "-y",
            "skills",
            "add",
            "https://github.com/vercel-labs/agent-skills",
            "--skill",
            "vercel-react-best-practices",
            "--agent",
            "codex",
            "-y",
            "--copy"
          ],
          target: { agent: "codex", directory: ".agents", enabled: true },
          skill: {
            source: "https://github.com/vercel-labs/agent-skills",
            skills: ["vercel-react-best-practices"],
            trust: "official",
            causedBy: "web/nextjs",
            reason: "React and Next.js app code"
          }
        },
        {
          command: "npx",
          args: [
            "-y",
            "skills",
            "add",
            "https://github.com/vercel-labs/agent-skills",
            "--skill",
            "vercel-react-best-practices",
            "--agent",
            "claude-code",
            "-y",
            "--copy"
          ],
          target: { agent: "claude-code", directory: ".claude", enabled: true },
          skill: {
            source: "https://github.com/vercel-labs/agent-skills",
            skills: ["vercel-react-best-practices"],
            trust: "official",
            causedBy: "web/nextjs",
            reason: "React and Next.js app code"
          }
        }
      ]
    });
    expect(plan.filePlan.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "stackkit.config.json",
          owner: "stackkit/config",
          overwrite: "never"
        }),
        expect.objectContaining({
          path: "apps/web/package.json",
          owner: "web/nextjs",
          overwrite: "if-owned"
        }),
        expect.objectContaining({
          path: "deploy/kubernetes/web-deployment.yaml",
          owner: "deploy/kubernetes",
          overwrite: "if-owned"
        })
      ])
    );
  });

  it("plans a human-editable stackkit.config.json", () => {
    const plan = createCreatePlan({
      config: {
        projectName: "acme",
        packageManager: "pnpm",
        workspace: "pnpm-turbo",
        modules: ["workspace/pnpm-turbo", "workspace/typescript"],
        ai: { skillTargets: ["codex"] }
      },
      availableModules: [
        defineModule({
          id: "workspace/pnpm-turbo",
          version: "1.0.0",
          title: "pnpm and Turborepo",
          description: "pnpm workspace with Turborepo task orchestration",
          provides: ["workspace/node"]
        }),
        defineModule({
          id: "workspace/typescript",
          version: "1.0.0",
          title: "TypeScript",
          description: "TypeScript config",
          requires: ["workspace/node"],
          provides: ["typescript"]
        })
      ],
      curatedSkillSourceAllowlist: []
    });

    const configFile = plan.filePlan.files.find((file) => file.path === "stackkit.config.json");

    expect(configFile).toEqual(
      expect.objectContaining({
        owner: "stackkit/config",
        overwrite: "never"
      })
    );
    expect(JSON.parse(configFile?.content ?? "{}")).toEqual(
      expect.objectContaining({
        $schema: "https://stackkit.dev/schema.json",
        projectName: "acme",
        packageManager: "pnpm",
        ai: { skillTargets: ["codex"] }
      })
    );
  });

  it("plans foundation template files, generated README, and keeps earlier duplicate paths", () => {
    const plan = createCreatePlan({
      config: {
        projectName: "acme-dashboard",
        packageManager: "pnpm",
        workspace: "pnpm-turbo",
        modules: ["workspace/pnpm-turbo", "workspace/typescript", "custom/readme"],
        ai: {
          skillTargets: ["codex"]
        }
      },
      availableModules: [
        defineModule({
          id: "workspace/pnpm-turbo",
          version: "1.0.0",
          title: "pnpm and Turborepo",
          description: "pnpm workspace with Turborepo task orchestration",
          provides: ["workspace/node"]
        }),
        defineModule({
          id: "workspace/typescript",
          version: "1.0.0",
          title: "TypeScript",
          description: "TypeScript config",
          requires: ["workspace/node"],
          provides: ["typescript"]
        }),
        defineModule({
          id: "custom/readme",
          version: "1.0.0",
          title: "Readme",
          description: "Project readme",
          files: [
            {
              kind: "write",
              path: "README.md",
              owner: "custom/readme",
              content: "# Acme\n"
            },
            {
              kind: "write",
              path: "package.json",
              owner: "custom/readme",
              content: "{\"name\":\"wrong\"}\n"
            }
          ]
        })
      ]
    });

    expect(plan.targetDirectoryName).toBe("acme-dashboard");
    expect(plan.warnings).toEqual([]);
    expect(plan.filePlan.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "package.json",
          owner: "workspace/pnpm-turbo",
          overwrite: "if-owned"
        }),
        expect.objectContaining({
          path: "pnpm-workspace.yaml",
          owner: "workspace/pnpm-turbo"
        }),
        expect.objectContaining({
          path: "tsconfig.base.json",
          owner: "workspace/typescript"
        }),
        expect.objectContaining({
          path: "README.md",
          owner: "docs/readme",
          content: expect.stringContaining("# acme-dashboard")
        })
      ])
    );
    expect(plan.filePlan.files.filter((file) => file.path === "package.json")).toHaveLength(1);
  });

  it("uses package-manager adapter metadata when planning foundation files", () => {
    const plan = createCreatePlan({
      config: {
        projectName: "bun-app",
        packageManager: "bun",
        workspace: "pnpm-turbo",
        modules: ["workspace/pnpm-turbo"],
        ai: {
          skillTargets: ["codex"]
        }
      },
      availableModules: [
        defineModule({
          id: "workspace/pnpm-turbo",
          version: "1.0.0",
          title: "pnpm and Turborepo",
          description: "Workspace foundation",
          provides: ["workspace/node"]
        })
      ]
    });
    const packageJson = JSON.parse(plan.filePlan.files.find((file) => file.path === "package.json")?.content ?? "{}");

    expect(plan.packageManager).toBe("bun");
    expect(packageJson.packageManager).toBe("bun@1.2.15");
    expect(packageJson.workspaces).toEqual(["apps/*", "packages/*"]);
    expect(plan.filePlan.files.some((file) => file.path === "pnpm-workspace.yaml")).toBe(false);
  });

  it("uses package-manager adapter commands when planning Docker files", () => {
    const plan = createCreatePlan({
      config: {
        projectName: "bun-docker",
        packageManager: "bun",
        workspace: "pnpm-turbo",
        modules: ["workspace/pnpm-turbo", "web/nextjs", "deploy/docker"],
        ai: {
          skillTargets: ["codex"]
        }
      },
      availableModules: [
        defineModule({
          id: "workspace/pnpm-turbo",
          version: "1.0.0",
          title: "pnpm and Turborepo",
          description: "Workspace foundation",
          provides: ["workspace/node"]
        }),
        defineModule({
          id: "web/nextjs",
          version: "1.0.0",
          title: "Next.js",
          description: "Next.js app",
          requires: ["workspace/node"],
          provides: ["nextjs-app"]
        }),
        defineModule({
          id: "deploy/docker",
          version: "1.0.0",
          title: "Docker",
          description: "Docker deployment",
          requires: ["nextjs-app"]
        })
      ]
    });
    const dockerfile = plan.filePlan.files.find((file) => file.path === "apps/web/Dockerfile")?.content ?? "";

    expect(dockerfile).toContain("RUN bun install");
    expect(dockerfile).toContain("RUN bun run build");
    expect(dockerfile).toContain('CMD ["bun", "run", "start"]');
    expect(dockerfile).not.toContain("pnpm");
  });

  it("enables Corepack for Yarn when planning Docker files", () => {
    const plan = createCreatePlan({
      config: {
        projectName: "yarn-docker",
        packageManager: "yarn",
        workspace: "pnpm-turbo",
        modules: ["workspace/pnpm-turbo", "web/nextjs", "deploy/docker"],
        ai: {
          skillTargets: ["codex"]
        }
      },
      availableModules: [
        defineModule({
          id: "workspace/pnpm-turbo",
          version: "1.0.0",
          title: "pnpm and Turborepo",
          description: "Workspace foundation",
          provides: ["workspace/node"]
        }),
        defineModule({
          id: "web/nextjs",
          version: "1.0.0",
          title: "Next.js",
          description: "Next.js app",
          requires: ["workspace/node"],
          provides: ["nextjs-app"]
        }),
        defineModule({
          id: "deploy/docker",
          version: "1.0.0",
          title: "Docker",
          description: "Docker deployment",
          requires: ["nextjs-app"]
        })
      ]
    });
    const dockerCompose = plan.filePlan.files.find((file) => file.path === "docker-compose.yml")?.content ?? "";
    const dockerfile = plan.filePlan.files.find((file) => file.path === "apps/web/Dockerfile")?.content ?? "";
    const appPackageJson = JSON.parse(
      plan.filePlan.files.find((file) => file.path === "apps/web/package.json")?.content ?? "{}"
    );

    expect(dockerCompose).toContain("dockerfile: apps/web/Dockerfile");
    expect(dockerCompose).not.toContain("build: ./apps/web");
    expect(appPackageJson.packageManager).toBe("yarn@4.9.4");
    expect(dockerfile).toContain("RUN corepack enable && yarn install");
    expect(dockerfile).toContain("RUN yarn build");
    expect(dockerfile).toContain('CMD ["yarn", "start"]');
    expect(dockerfile).not.toContain("pnpm");
  });

  it("only plans foundation files owned by selected foundation modules", () => {
    const plan = createCreatePlan({
      config: {
        projectName: "typescript-only",
        packageManager: "pnpm",
        workspace: "pnpm-turbo",
        modules: ["workspace/typescript"],
        ai: {
          skillTargets: ["codex"]
        }
      },
      availableModules: [
        defineModule({
          id: "workspace/typescript",
          version: "1.0.0",
          title: "TypeScript",
          description: "TypeScript config",
          provides: ["typescript"]
        })
      ]
    });

    // TypeScript is present, so default lint/format tooling (eslint + prettier) is gap-filled.
    expect(plan.filePlan.files.map((file) => file.path)).toEqual([
      "stackkit.config.json",
      "README.md",
      "tsconfig.base.json",
      "tsconfig.json",
      "eslint.config.mjs",
      "prettier.config.mjs"
    ]);
    expect(plan.filePlan.files).toEqual([
      expect.objectContaining({
        path: "stackkit.config.json",
        owner: "stackkit/config"
      }),
      expect.objectContaining({
        path: "README.md",
        owner: "docs/readme"
      }),
      expect.objectContaining({
        path: "tsconfig.base.json",
        owner: "workspace/typescript"
      }),
      expect.objectContaining({
        path: "tsconfig.json",
        owner: "workspace/typescript"
      }),
      expect.objectContaining({
        path: "eslint.config.mjs",
        owner: "quality/eslint"
      }),
      expect.objectContaining({
        path: "prettier.config.mjs",
        owner: "quality/prettier"
      })
    ]);
  });

  it("filters renderer files to selected module owners", () => {
    const plan = createCreatePlan({
      config: {
        projectName: "api-only",
        packageManager: "pnpm",
        workspace: "pnpm-turbo",
        modules: ["api/fastapi"],
        ai: {
          skillTargets: ["codex"]
        }
      },
      availableModules: [
        defineModule({
          id: "api/fastapi",
          version: "1.0.0",
          title: "FastAPI",
          description: "FastAPI API service",
          provides: ["api", "python"]
        })
      ]
    });

    // FastAPI provides `python`, so the default Python tooling (ruff lint/format + mypy typecheck) is
    // gap-filled and its config files are dispatched.
    expect(plan.filePlan.files.map((file) => file.path)).toEqual([
      "stackkit.config.json",
      "README.md",
      "apps/api/package.json",
      "apps/api/pyproject.toml",
      "apps/api/app/main.py",
      "apps/api/tests/test_health.py",
      "ruff.toml",
      "mypy.ini"
    ]);
    expect(plan.filePlan.files.some((file) => file.owner === "quality/pytest")).toBe(false);
    expect(plan.filePlan.files.find((file) => file.path === "ruff.toml")?.owner).toBe("quality/ruff");
    expect(plan.filePlan.files.find((file) => file.path === "mypy.ini")?.owner).toBe("quality/mypy");
  });

  it("renders Docker and Kubernetes files for an API-only FastAPI project", () => {
    const plan = createCreatePlan({
      config: {
        projectName: "api-deploy",
        packageManager: "pnpm",
        workspace: "pnpm-turbo",
        modules: ["api/fastapi", "deploy/docker", "deploy/kubernetes"],
        ai: {
          skillTargets: ["codex"]
        }
      },
      availableModules: [
        defineModule({
          id: "api/fastapi",
          version: "1.0.0",
          title: "FastAPI",
          description: "FastAPI API service",
          provides: ["api", "python", "container-app"]
        }),
        defineModule({
          id: "deploy/docker",
          version: "1.0.0",
          title: "Docker",
          description: "Docker deployment",
          requires: ["container-app"],
          provides: ["container"]
        }),
        defineModule({
          id: "deploy/kubernetes",
          version: "1.0.0",
          title: "Kubernetes",
          description: "Kubernetes deployment",
          requires: ["container"]
        })
      ]
    });

    const files = plan.filePlan.files.map((file) => file.path);
    const compose = plan.filePlan.files.find((file) => file.path === "docker-compose.yml")?.content ?? "";

    expect(files).toEqual(expect.arrayContaining(["apps/api/Dockerfile", "deploy/kubernetes/api-deployment.yaml"]));
    expect(files).not.toContain("apps/web/Dockerfile");
    expect(compose).toContain("api:");
    expect(compose).toContain("dockerfile: apps/api/Dockerfile");
    expect(compose).not.toContain("build: ./apps/api");
  });

  it("fails for unknown module IDs", () => {
    expect(() =>
      createCreatePlan({
        config: {
          projectName: "acme-dashboard",
          packageManager: "pnpm",
          workspace: "pnpm-turbo",
          modules: ["missing/module"],
          ai: {
            skillTargets: ["codex"]
          }
        },
        availableModules
      })
    ).toThrow("Unknown Stackkit module: missing/module");
  });
});

describe("renderCreateFiles database client codegen", () => {
  const mod = (id: string, extra: Record<string, unknown> = {}) =>
    defineModule({ id, version: "1.0.0", title: id, description: id, ...extra });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfg = (modules: any[], options?: Record<string, Record<string, unknown>>): any => ({
    projectName: "acme",
    packageManager: "pnpm",
    workspace: "pnpm-turbo",
    modules: modules.map((m) => m.id),
    registries: {},
    options,
    ai: { skillTargets: ["codex"], skillMode: "install", linkMode: "copy" }
  });

  const find = (files: ReturnType<typeof renderCreateFiles>, path: string) => files.find((file) => file.path === path);

  it("emits a standard Drizzle client for a Next.js + Drizzle + Neon stack (node default)", () => {
    const modules = [mod("web/nextjs", { provides: ["nextjs-app"] }), mod("db/postgres", { provides: ["postgres"] }), mod("db/drizzle"), mod("postgres/neon")];
    const client = find(renderCreateFiles(cfg(modules), modules), "apps/web/db/client.ts");

    expect(client).toBeDefined();
    expect(client!.owner).toBe("db/drizzle");
    expect(client!.content).toContain("drizzle-orm/node-postgres");
  });

  it("emits the Neon serverless client when options set runtime=edge", () => {
    const modules = [mod("web/nextjs", { provides: ["nextjs-app"] }), mod("db/postgres", { provides: ["postgres"] }), mod("db/drizzle"), mod("postgres/neon")];
    const client = find(renderCreateFiles(cfg(modules, { "db/drizzle": { runtime: "edge" } }), modules), "apps/web/db/client.ts");

    expect(client!.content).toContain("@neondatabase/serverless");
  });

  it("emits a Prisma datasource with directUrl for Supabase", () => {
    const modules = [mod("web/nextjs", { provides: ["nextjs-app"] }), mod("db/postgres", { provides: ["postgres"] }), mod("db/prisma"), mod("postgres/supabase")];
    const schema = find(renderCreateFiles(cfg(modules), modules), "apps/web/prisma/schema.prisma");

    expect(schema).toBeDefined();
    expect(schema!.owner).toBe("db/prisma");
    expect(schema!.content).toContain('directUrl = env("DIRECT_URL")');
  });

  it("emits no TypeScript client for an API + SQLAlchemy stack", () => {
    const modules = [mod("api/fastapi", { provides: ["api"] }), mod("db/postgres", { provides: ["postgres"] }), mod("db/sqlalchemy")];
    const files = renderCreateFiles(cfg(modules), modules);

    expect(find(files, "apps/web/db/client.ts")).toBeUndefined();
    expect(find(files, "apps/web/prisma/schema.prisma")).toBeUndefined();
  });
});

describe("renderCreateFiles tooling dispatch", () => {
  const mod = (id: string, extra: Record<string, unknown> = {}) =>
    defineModule({ id, version: "1.0.0", title: id, description: id, ...extra });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cfg = (modules: { id: string }[]): any => ({
    projectName: "acme",
    packageManager: "pnpm",
    workspace: "pnpm-turbo",
    modules: modules.map((m) => m.id),
    registries: {},
    ai: { skillTargets: ["codex"], skillMode: "install", linkMode: "copy" }
  });

  const find = (files: ReturnType<typeof renderCreateFiles>, path: string) => files.find((file) => file.path === path);

  it("dispatches eslint + prettier configs and eslint/prettier devDeps for a default TS stack", () => {
    const modules = [
      mod("workspace/pnpm-turbo", { provides: ["workspace/node"] }),
      mod("workspace/typescript", { provides: ["typescript"] }),
      mod("quality/eslint", { category: "quality", provides: ["ts-lint"], requires: ["typescript"] }),
      mod("quality/prettier", { category: "quality", provides: ["ts-format"], requires: ["typescript"] }),
      mod("quality/tsc", { category: "quality", provides: ["ts-typecheck"], requires: ["typescript"] })
    ];
    const files = renderCreateFiles(cfg(modules), modules);

    expect(find(files, "eslint.config.mjs")?.owner).toBe("quality/eslint");
    expect(find(files, "prettier.config.mjs")?.owner).toBe("quality/prettier");
    expect(find(files, "biome.json")).toBeUndefined();

    const pkg = JSON.parse(find(files, "package.json")?.content ?? "{}");
    expect(pkg.devDependencies).toEqual(
      expect.objectContaining({ eslint: expect.any(String), prettier: expect.any(String) })
    );
    expect(pkg.devDependencies["@biomejs/biome"]).toBeUndefined();
  });

  it("dispatches biome.json (and no eslint/prettier) when quality/biome is selected", () => {
    const modules = [
      mod("workspace/pnpm-turbo", { provides: ["workspace/node"] }),
      mod("workspace/typescript", { provides: ["typescript"] }),
      mod("quality/biome", { category: "quality", provides: ["ts-lint", "ts-format"], requires: ["typescript"] }),
      mod("quality/tsc", { category: "quality", provides: ["ts-typecheck"], requires: ["typescript"] })
    ];
    const files = renderCreateFiles(cfg(modules), modules);

    expect(find(files, "biome.json")?.owner).toBe("quality/biome");
    expect(find(files, "eslint.config.mjs")).toBeUndefined();
    expect(find(files, "prettier.config.mjs")).toBeUndefined();

    const pkg = JSON.parse(find(files, "package.json")?.content ?? "{}");
    expect(pkg.devDependencies["@biomejs/biome"]).toEqual(expect.any(String));
    expect(pkg.devDependencies.eslint).toBeUndefined();
  });

  it("dispatches pyrightconfig.json (and no mypy.ini) when quality/pyright is selected", () => {
    const modules = [
      mod("api/fastapi", { provides: ["api", "python"] }),
      mod("quality/ruff", { category: "quality", provides: ["py-lint", "py-format"], requires: ["python"] }),
      mod("quality/pyright", { category: "quality", provides: ["py-typecheck"], requires: ["python"] })
    ];
    const files = renderCreateFiles(cfg(modules), modules);

    expect(find(files, "pyrightconfig.json")?.owner).toBe("quality/pyright");
    expect(find(files, "mypy.ini")).toBeUndefined();
    expect(find(files, "ruff.toml")?.owner).toBe("quality/ruff");

    const apiPkg = JSON.parse(find(files, "apps/api/package.json")?.content ?? "{}");
    expect(apiPkg.scripts.typecheck).toBe("uv run pyright .");
  });
});

describe("renderCreateFiles web framework wiring", () => {
  const foundationModules = [
    defineModule({
      id: "workspace/pnpm-turbo",
      version: "1.0.0",
      title: "pnpm and Turborepo",
      description: "Workspace foundation",
      provides: ["workspace/node"]
    }),
    defineModule({
      id: "workspace/typescript",
      version: "1.0.0",
      title: "TypeScript",
      description: "TypeScript config",
      requires: ["workspace/node"],
      provides: ["typescript"]
    }),
    defineModule({
      id: "quality/eslint",
      version: "1.0.0",
      title: "ESLint",
      description: "ESLint config",
      provides: ["lint"]
    })
  ];

  const viteModule = defineModule({
    id: "web/vite",
    version: "1.0.0",
    title: "Vite",
    description: "Vite React app",
    requires: ["typescript"],
    provides: ["web-app", "react"]
  });

  const tanstackModule = defineModule({
    id: "web/tanstack-start",
    version: "1.0.0",
    title: "TanStack Start",
    description: "TanStack Start app",
    requires: ["typescript"],
    provides: ["web-app", "react", "ssr"]
  });

  const shadcnModule = defineModule({
    id: "ui/shadcn",
    version: "1.0.0",
    title: "shadcn/ui",
    description: "shadcn/ui components",
    requires: ["react"]
  });

  const baseConfig = (moduleIds: string[]) => ({
    projectName: "acme",
    packageManager: "pnpm" as const,
    workspace: "pnpm-turbo" as const,
    modules: moduleIds,
    registries: {},
    ai: { skillTargets: ["codex"] as const, skillMode: "install" as const, linkMode: "copy" as const }
  });

  const viteShadcnInput = () => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config: baseConfig(["workspace/pnpm-turbo", "workspace/typescript", "web/vite", "ui/shadcn", "quality/eslint"]) as any,
    availableModules: [...foundationModules, viteModule, shadcnModule]
  });

  const viteNoUiInput = () => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config: baseConfig(["workspace/pnpm-turbo", "workspace/typescript", "web/vite", "quality/eslint"]) as any,
    availableModules: [...foundationModules, viteModule]
  });

  const tanstackInput = () => ({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config: baseConfig(["workspace/pnpm-turbo", "workspace/typescript", "web/tanstack-start", "ui/shadcn", "quality/eslint"]) as any,
    availableModules: [...foundationModules, tanstackModule, shadcnModule]
  });

  const manifestFromPlan = (plan: ReturnType<typeof createCreatePlan>): StackkitManifest => ({
    schemaVersion: 1,
    stackkitVersion: "0.0.0",
    projectName: plan.projectName,
    packageManager: plan.packageManager,
    source: { kind: "scripted" },
    paths: { root: "." },
    createdAt: "2026-06-06T00:00:00.000Z",
    modules: plan.modules.map((module) => ({ ...module, options: {} })),
    files: [],
    aiSkills: {
      mode: plan.aiSkills.mode,
      linkMode: plan.aiSkills.linkMode,
      targets: [],
      installed: [],
      planned: [],
      local: [],
      unresolved: []
    },
    migrations: { applied: [] }
  });

  it("renders a Vite app with shadcn using the shared UI package CSS", () => {
    const plan = createCreatePlan(viteShadcnInput());
    const paths = plan.filePlan.files.map((f) => f.path);
    expect(paths).toContain("apps/web/vite.config.ts");
    expect(paths).toContain("apps/web/components.json");
    expect(paths).toContain("packages/ui/components.json");
    expect(paths).toContain("packages/ui/src/styles/globals.css");
    expect(plan.filePlan.files.some((f) => f.path === "apps/web/src/index.css")).toBe(false);
    const main = plan.filePlan.files.find((f) => f.path === "apps/web/src/main.tsx")?.content ?? "";
    expect(main).toContain('import "@workspace/ui/globals.css"');
  });

  it("renders a Vite app that owns its own index.css when shadcn absent", () => {
    const plan = createCreatePlan(viteNoUiInput());
    const indexCss = plan.filePlan.files.filter((f) => f.path === "apps/web/src/index.css");
    expect(indexCss).toHaveLength(1);
    expect(indexCss[0].owner).toBe("web/vite");
    expect(plan.filePlan.files.some((f) => f.path === "apps/web/components.json")).toBe(false);
  });

  it("renders TanStack Start routes", () => {
    const plan = createCreatePlan(tanstackInput());
    const paths = plan.filePlan.files.map((f) => f.path);
    expect(paths).toContain("apps/web/src/routes/__root.tsx");
    expect(paths).toContain("apps/web/src/router.tsx");
  });

  it("DOCTOR: manifest reconstruction reproduces the Vite+ShadCN file plan", () => {
    const plan = createCreatePlan(viteShadcnInput());
    const manifest = manifestFromPlan(plan);
    const expected = buildExpectedManagedFilePlan(manifest);
    expect(expected.files.map((f) => `${f.path}:${f.owner}`).sort())
      .toEqual(plan.filePlan.files.map((f) => `${f.path}:${f.owner}`).sort());
  });
});
