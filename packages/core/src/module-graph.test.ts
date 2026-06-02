import { describe, expect, it } from "vitest";

import { defineModule, definePreset, resolveModuleGraph } from "./index.js";

const workspace = defineModule({
  id: "workspace/pnpm-turbo",
  version: "1.0.0",
  title: "pnpm and Turborepo",
  description: "Workspace foundation",
  provides: ["workspace/node"]
});

const next = defineModule({
  id: "web/nextjs",
  version: "1.0.0",
  title: "Next.js",
  description: "Next.js web application",
  requires: ["workspace/node"],
  provides: ["web-app", "react"]
});

const django = defineModule({
  id: "web/django",
  version: "1.0.0",
  title: "Django",
  description: "Django web application",
  conflicts: ["web/nextjs"],
  provides: ["web-app", "python"]
});

describe("resolveModuleGraph", () => {
  it("orders selected modules deterministically and validates requirements", () => {
    const graph = resolveModuleGraph([next, workspace]);

    expect(graph.map((module) => module.id)).toEqual(["workspace/pnpm-turbo", "web/nextjs"]);
  });

  it("fails when a required capability is missing", () => {
    expect(() => resolveModuleGraph([next])).toThrow("Module web/nextjs requires capability workspace/node");
  });

  it("fails when selected modules conflict", () => {
    expect(() => resolveModuleGraph([workspace, next, django])).toThrow("Module web/django conflicts with web/nextjs");
  });

  it("expands presets into modules before resolving", () => {
    const preset = definePreset({
      id: "next-only",
      title: "Next.js only",
      description: "A pnpm/Turborepo workspace with Next.js",
      modules: ["workspace/pnpm-turbo", "web/nextjs"]
    });

    const graph = resolveModuleGraph([], {
      presets: [preset],
      selectedPresets: ["next-only"],
      availableModules: [workspace, next]
    });

    expect(graph.map((module) => module.id)).toEqual(["workspace/pnpm-turbo", "web/nextjs"]);
  });
});
