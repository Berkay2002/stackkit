import { describe, expect, it } from "vitest";

import { createCreatePlan, defineModule } from "./index.js";

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

  it("plans foundation template files and keeps earlier duplicate paths", () => {
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
          owner: "custom/readme",
          content: "# Acme\n"
        })
      ])
    );
    expect(plan.filePlan.files.filter((file) => file.path === "package.json")).toHaveLength(1);
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

    expect(plan.filePlan.files.map((file) => file.path)).toEqual(["tsconfig.base.json"]);
    expect(plan.filePlan.files).toEqual([
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

    expect(plan.filePlan.files.map((file) => file.path)).toEqual(["apps/api/pyproject.toml", "apps/api/app/main.py"]);
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
