import { describe, expect, it } from "vitest";
import { builtinModules } from "./index.js";
import { resolveModuleGraph } from "@berkayorhan/stackkit-core";

function byId(id: string) {
  return builtinModules.find((m) => m.id === id);
}

describe("web framework modules", () => {
  it("registers web/vite and web/tanstack-start as react web apps", () => {
    const vite = byId("web/vite");
    const tanstack = byId("web/tanstack-start");
    expect(vite?.provides).toEqual(expect.arrayContaining(["web-app", "react"]));
    expect(vite?.provides).not.toContain("nextjs-app");
    expect(tanstack?.provides).toEqual(expect.arrayContaining(["web-app", "react", "ssr"]));
    expect(vite?.category).toBe("web");
    expect(tanstack?.category).toBe("web");
  });

  it("exposes unique friendly aliases", () => {
    expect(byId("web/vite")?.aliases).toContain("vite");
    expect(byId("web/tanstack-start")?.aliases).toEqual(
      expect.arrayContaining(["tanstack", "tanstack-start"])
    );
    const aliases = builtinModules.flatMap((m) => m.aliases ?? []);
    expect(new Set(aliases).size).toBe(aliases.length);
  });

  it("rejects selecting two web frameworks at once", () => {
    const workspace = byId("workspace/pnpm-turbo")!;
    expect(() => resolveModuleGraph([workspace, byId("web/nextjs")!, byId("web/vite")!])).toThrow(/conflicts/);
    expect(() => resolveModuleGraph([workspace, byId("web/vite")!, byId("web/tanstack-start")!])).toThrow(/conflicts/);
  });
});
