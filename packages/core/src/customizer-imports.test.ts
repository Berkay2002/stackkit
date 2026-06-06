import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveStackAxes as fromCustomizer } from "./customizer.js";
import { resolveStackAxes as fromGraph } from "./module-graph.js";
import { builtinModules } from "@berkayorhan/stackkit-registry";

function importSpecifiers(relPath: string): string[] {
  const src = readFileSync(fileURLToPath(new URL(relPath, import.meta.url)), "utf8");
  return [...src.matchAll(/(?:from|import)\s+["']([^"']+)["']/g)].map((m) => m[1]);
}

describe("/customizer entry is browser-safe", () => {
  const ALLOWED = new Set(["./module-graph.js", "@berkayorhan/stackkit-schemas"]);
  it("customizer.ts imports only pure, node-free modules", () => {
    for (const spec of importSpecifiers("./customizer.ts")) {
      expect(spec.startsWith("node:"), `leaked node import: ${spec}`).toBe(false);
      if (spec.startsWith(".")) {
        expect(ALLOWED.has(spec), `disallowed relative import: ${spec}`).toBe(true);
      }
    }
  });
  it("module-graph.ts imports only browser-safe modules", () => {
    const ALLOWED_RELATIVE = new Set(["./tooling.js"]);
    for (const spec of importSpecifiers("./module-graph.ts")) {
      expect(spec.startsWith("node:"), `leaked node import: ${spec}`).toBe(false);
      if (spec.startsWith(".") && !ALLOWED_RELATIVE.has(spec)) {
        throw new Error(`module-graph.ts must stay browser-safe, found disallowed relative import ${spec}`);
      }
    }
  });
  it("tooling.ts (pulled in by module-graph.ts) stays node-free", () => {
    for (const spec of importSpecifiers("./tooling.ts")) {
      expect(spec.startsWith("node:"), `leaked node import: ${spec}`).toBe(false);
      if (spec.startsWith(".")) throw new Error(`tooling.ts must stay relative-import-free, found ${spec}`);
    }
  });
  it("customizer re-exports the single resolveStackAxes implementation", () => {
    const axes = { web: "vite", ui: "none" } as const;
    expect(fromCustomizer(axes, builtinModules)).toEqual(fromGraph(axes, builtinModules));
  });
});
