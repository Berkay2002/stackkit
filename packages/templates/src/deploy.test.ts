import { describe, expect, it } from "vitest";

import { renderDockerFiles, renderKubernetesFiles, renderVercelFiles } from "./index.js";

describe("deploy templates", () => {
  it("renders Vercel, Docker, and Kubernetes files", () => {
    expect(renderVercelFiles()).toEqual([
      expect.objectContaining({
        kind: "write",
        path: "vercel.json",
        owner: "deploy/vercel",
        overwrite: "if-owned"
      })
    ]);

    expect(renderDockerFiles()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "write",
          path: "docker-compose.yml",
          owner: "deploy/docker",
          overwrite: "if-owned"
        }),
        expect.objectContaining({
          kind: "write",
          path: "apps/web/Dockerfile",
          owner: "deploy/docker",
          overwrite: "if-owned"
        })
      ])
    );

    expect(renderKubernetesFiles()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "write",
          path: "deploy/kubernetes/web-deployment.yaml",
          owner: "deploy/kubernetes",
          overwrite: "if-owned"
        })
      ])
    );
  });

  it("builds web from the repository root so workspace packages resolve", () => {
    const files = renderDockerFiles();
    const compose = files.find((file) => file.path === "docker-compose.yml")?.content ?? "";
    const dockerfile = files.find((file) => file.path === "apps/web/Dockerfile")?.content ?? "";

    // The build context must be the repo root, not ./apps/web, otherwise packages/* (referenced
    // through workspace:* dependencies) are absent and a frozen install fails.
    expect(compose).toContain("context: .");
    expect(compose).toContain("dockerfile: apps/web/Dockerfile");
    expect(compose).not.toContain("build: ./apps/web");
    // Install and build happen at the workspace root; the app is started from its own directory.
    expect(dockerfile).toContain("WORKDIR /app/apps/web");
  });

  it("renders Docker commands for the selected package manager", () => {
    const files = renderDockerFiles({
      packageManagerName: "bun",
      installCommand: ["bun", "install"],
      runBuildCommand: ["bun", "run", "build"],
      runStartCommand: ["bun", "run", "start"]
    });
    const dockerfile = files.find((file) => file.path === "apps/web/Dockerfile")?.content ?? "";

    expect(dockerfile).toContain("RUN bun install");
    expect(dockerfile).toContain("RUN bun run build");
    expect(dockerfile).toContain('CMD ["bun", "run", "start"]');
    expect(dockerfile).not.toContain("pnpm");
  });

  it("renders Docker Corepack setup for Yarn", () => {
    const files = renderDockerFiles({
      packageManagerName: "yarn",
      installCommand: ["corepack", "enable", "&&", "yarn", "install"],
      runBuildCommand: ["yarn", "build"],
      runStartCommand: ["yarn", "start"]
    });
    const dockerfile = files.find((file) => file.path === "apps/web/Dockerfile")?.content ?? "";

    expect(dockerfile).toContain("FROM node:22-alpine");
    expect(dockerfile).toContain("RUN corepack enable && yarn install");
    expect(dockerfile).toContain("RUN yarn build");
    expect(dockerfile).toContain('CMD ["yarn", "start"]');
  });

  it("renders FastAPI Docker and Kubernetes files when an API service is selected", () => {
    const dockerFiles = renderDockerFiles({ serviceTargets: ["api"] });
    const compose = dockerFiles.find((file) => file.path === "docker-compose.yml")?.content ?? "";
    const dockerfile = dockerFiles.find((file) => file.path === "apps/api/Dockerfile")?.content ?? "";

    expect(compose).toContain("api:");
    expect(compose).toContain("context: .");
    expect(compose).toContain("dockerfile: apps/api/Dockerfile");
    expect(compose).not.toContain("build: ./apps/api");
    expect(compose).toContain('"8000:8000"');
    expect(dockerfile).toContain("FROM python:3.13-slim");
    expect(dockerfile).toContain("WORKDIR /app/apps/api");
    expect(dockerfile).toContain('"uvicorn", "app.main:app"');

    expect(renderKubernetesFiles({ serviceTargets: ["api"] })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "write",
          path: "deploy/kubernetes/api-deployment.yaml",
          owner: "deploy/kubernetes",
          overwrite: "if-owned"
        })
      ])
    );
  });
});
