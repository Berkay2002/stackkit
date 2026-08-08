import { describe, expect, it } from "vitest";

import { decodeRecipe, defineModule, definePreset, encodeRecipe, inspectRecipe } from "./index.js";

describe("offline recipes", () => {
  it("round-trips config without project name", () => {
    const code = encodeRecipe({
      schemaVersion: 1,
      preset: "next-postgres-clerk",
      packageManager: "pnpm",
      modules: ["deploy/docker"],
      ai: { skillTargets: ["codex"], skillMode: "install", linkMode: "copy" }
    });

    expect(code).toMatch(/^sk_/);
    expect(decodeRecipe(code)).toEqual({
      schemaVersion: 1,
      preset: "next-postgres-clerk",
      packageManager: "pnpm",
      modules: ["deploy/docker"],
      options: {},
      ai: { skillTargets: ["codex"], skillMode: "install", linkMode: "copy" }
    });
  });

  it("rejects invalid recipe codes", () => {
    expect(() => decodeRecipe("bad")).toThrow("Invalid Stackkit recipe code");
  });

  it("inspects recipes through module resolution", () => {
    const workspace = defineModule({
      id: "workspace/pnpm-turbo",
      version: "1.0.0",
      title: "pnpm Turborepo",
      description: "Workspace foundation",
      provides: ["workspace"]
    });
    const next = defineModule({
      id: "web/nextjs",
      version: "1.0.0",
      title: "Next.js",
      description: "React web app",
      requires: ["workspace"],
      provides: ["web-app", "react"],
      conflicts: ["web/vite"]
    });
    const preset = definePreset({
      id: "next",
      title: "Next starter",
      description: "Next.js starter",
      modules: ["workspace/pnpm-turbo", "web/nextjs"]
    });

    const view = inspectRecipe(
      {
        schemaVersion: 1,
        preset: "next",
        packageManager: "pnpm",
        modules: [],
        options: {},
        ai: { skillTargets: ["codex"], skillMode: "install", linkMode: "copy" }
      },
      {
        availableModules: [workspace, next],
        availablePresets: [preset]
      }
    );

    expect(view.expandedPresets).toEqual([{ id: "next", title: "Next starter", modules: ["workspace/pnpm-turbo", "web/nextjs"] }]);
    expect(view.resolvedModules).toEqual([
      { id: "workspace/pnpm-turbo", title: "pnpm Turborepo" },
      { id: "web/nextjs", title: "Next.js" }
    ]);
    expect(view.capabilities).toEqual(["workspace", "web-app", "react"]);
    expect(view.conflicts).toEqual([{ moduleId: "web/nextjs", conflictsWith: "web/vite" }]);
    expect(view.warnings).toEqual([]);
  });
});
