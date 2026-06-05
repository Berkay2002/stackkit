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
});
