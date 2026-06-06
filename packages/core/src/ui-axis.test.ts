import { describe, expect, it } from "vitest";
import { resolveStackAxes } from "./module-graph.js";
import { builtinModules } from "@berkayorhan/stackkit-registry";

const mods = builtinModules;

describe("ui axis", () => {
  it("defaults to shadcn for any react web framework", () => {
    expect(resolveStackAxes({ web: "vite" }, mods)).toContain("ui/shadcn");
    expect(resolveStackAxes({ web: "tanstack" }, mods)).toContain("ui/shadcn");
    expect(resolveStackAxes({ web: "next" }, mods)).toContain("ui/shadcn");
  });
  it("opts out with ui none", () => {
    expect(resolveStackAxes({ web: "next", ui: "none" }, mods)).not.toContain("ui/shadcn");
    expect(resolveStackAxes({ web: "vite", ui: "none" }, mods)).not.toContain("ui/shadcn");
  });
  it("swaps to tailwind with ui tailwind", () => {
    const r = resolveStackAxes({ web: "vite", ui: "tailwind" }, mods);
    expect(r).toContain("ui/tailwind");
    expect(r).not.toContain("ui/shadcn");
  });
  it("keeps the workspace foundation for react web frameworks (tooling gap-filled later)", () => {
    const r = resolveStackAxes({ web: "vite", ui: "none" }, mods);
    expect(r).toEqual(expect.arrayContaining(["workspace/pnpm-turbo", "workspace/typescript", "web/vite"]));
    // resolveStackAxes no longer hardcodes tooling; defaults are injected by resolveModuleGraph.
    expect(r).not.toContain("quality/eslint");
  });
  it("resolves vite with vercel deploy (web-app capability)", () => {
    expect(() => resolveStackAxes({ web: "vite", ui: "none", deploy: ["vercel"] }, mods)).not.toThrow();
  });
  it("BACKWARD-COMPAT: --web next yields the foundation list and order (tooling gap-filled later)", () => {
    expect(resolveStackAxes({ web: "next" }, mods)).toEqual([
      "workspace/pnpm-turbo", "workspace/typescript", "web/nextjs", "ui/shadcn"
    ]);
  });
});
