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

    expect(plan).toEqual({
      schemaVersion: 1,
      operation: "create",
      dryRun: true,
      projectName: "acme-dashboard",
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
