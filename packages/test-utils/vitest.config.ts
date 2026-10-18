import { defineConfig } from "vitest/config";

import { workspaceAlias } from "../../vitest.shared";

export default defineConfig(({ mode }) => ({
  test: {
    // These tests create whole projects on disk; Windows CI runners need far more than the 5s default.
    testTimeout: 60_000,
    // `vitest --mode e2e` (pnpm smoke) enables the real-toolchain tests; plain `pnpm test` stays offline.
    env: mode === "e2e" ? { STACKKIT_E2E: "1" } : {}
  },
  resolve: {
    alias: workspaceAlias
  }
}));
