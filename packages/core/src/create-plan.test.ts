import { describe, expect, it } from "vitest";

import { createCreatePlan, defineModule, renderCreateFiles, validateProjectSlug } from "./index.js";

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

    expect(dockerCompose).toContain("build: ./apps/web");
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

    expect(plan.filePlan.files.map((file) => file.path)).toEqual(["stackkit.config.json", "README.md", "tsconfig.base.json"]);
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

    expect(plan.filePlan.files.map((file) => file.path)).toEqual([
      "stackkit.config.json",
      "README.md",
      "apps/api/package.json",
      "apps/api/pyproject.toml",
      "apps/api/app/main.py",
      "apps/api/tests/test_health.py"
    ]);
    expect(plan.filePlan.files.some((file) => file.owner === "quality/pytest")).toBe(false);
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
