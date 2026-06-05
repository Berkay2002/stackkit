import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node"
  },
  resolve: {
    alias: {
      "@berkayorhan/stackkit-schemas": fileURLToPath(new URL("../schemas/src/index.ts", import.meta.url))
    }
  }
});
