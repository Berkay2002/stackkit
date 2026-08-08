import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import nextConfig from "../next.config";

function relativeImportSpecifiers(source: string): string[] {
  return [...source.matchAll(/(?:from|import)\s+["'](\.[^"']+)["']/g)].map((match) => match[1]);
}

describe("Turbopack aliases", () => {
  it("keeps registry-relative aliases inside the registry package", () => {
    const aliases = nextConfig.turbopack?.resolveAlias ?? {};
    const customizerRoot = dirname(fileURLToPath(new URL("../next.config.ts", import.meta.url)));
    const registryRoot = fileURLToPath(new URL("../../../packages/registry", import.meta.url));
    const registryIndexPath = fileURLToPath(
      new URL("../../../packages/registry/src/index.ts", import.meta.url)
    );
    const registryImports = relativeImportSpecifiers(readFileSync(registryIndexPath, "utf8")).filter(
      (specifier) => specifier.endsWith(".js")
    );

    for (const specifier of registryImports) {
      const target = aliases[specifier];

      expect(target, `missing Turbopack alias for ${specifier}`).toBeTypeOf("string");
      expect(relative(registryRoot, resolve(customizerRoot, target as string)).startsWith("..")).toBe(false);
    }
  });
});
