import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@berkayorhan/stackkit-core/customizer": fileURLToPath(new URL("../core/src/customizer.ts", import.meta.url)),
      "@berkayorhan/stackkit-core": fileURLToPath(new URL("../core/src/index.ts", import.meta.url)),
      "@berkayorhan/stackkit-registry": fileURLToPath(new URL("./src/index.ts", import.meta.url)),
      "@berkayorhan/stackkit-schemas": fileURLToPath(new URL("../schemas/src/index.ts", import.meta.url)),
      "@berkayorhan/stackkit-templates": fileURLToPath(new URL("../templates/src/index.ts", import.meta.url))
    }
  }
});
