import { defineConfig } from "vitest/config";

import { workspaceAlias } from "../../vitest.shared";

export default defineConfig({
  resolve: {
    alias: workspaceAlias
  }
});
