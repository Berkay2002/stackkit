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
});
