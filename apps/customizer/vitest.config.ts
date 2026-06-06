import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@berkayorhan/stackkit-core/customizer": fileURLToPath(
        new URL("../../packages/core/src/customizer.ts", import.meta.url)
      ),
      "@berkayorhan/stackkit-core": fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)),
      "@berkayorhan/stackkit-registry": fileURLToPath(new URL("../../packages/registry/src/index.ts", import.meta.url)),
      "@berkayorhan/stackkit-schemas": fileURLToPath(new URL("../../packages/schemas/src/index.ts", import.meta.url)),
      "@berkayorhan/stackkit-templates": fileURLToPath(new URL("../../packages/templates/src/index.ts", import.meta.url))
    }
  }
});
