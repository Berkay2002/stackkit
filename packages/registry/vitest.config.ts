import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@stackkit/core": fileURLToPath(new URL("../core/src/index.ts", import.meta.url)),
      "@stackkit/schemas": fileURLToPath(new URL("../schemas/src/index.ts", import.meta.url)),
      "@stackkit/templates": fileURLToPath(new URL("../templates/src/index.ts", import.meta.url))
    }
  }
});
