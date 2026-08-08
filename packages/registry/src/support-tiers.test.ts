import { describe, expect, it } from "vitest";

import { builtinModules, builtinPresets } from "./index.js";

const supportedModuleIds = [
  "workspace/pnpm-turbo",
  "workspace/typescript",
  "web/nextjs",
  "ui/shadcn",
  "api/fastapi",
  "quality/eslint",
  "quality/prettier",
  "quality/tsc",
  "quality/ruff",
  "quality/mypy",
  "quality/pytest",
  "db/postgres",
  "db/sqlalchemy",
  "postgres/local",
  "auth/auth0-nextjs",
  "auth/auth0-fastapi",
  "deploy/docker"
].sort();

describe("built-in support tiers", () => {
  it("exposes only the golden-path modules and preset as supported", () => {
    expect(
      builtinModules
        .filter((module) => module.support.level === "supported")
        .map((module) => module.id)
        .sort()
    ).toEqual(supportedModuleIds);

    expect(builtinPresets.filter((preset) => preset.support.level === "supported").map((preset) => preset.id)).toEqual([
      "next-fastapi-postgres-auth0"
    ]);
  });

  it("documents why every non-supported entry is not supported", () => {
    for (const entry of [...builtinModules, ...builtinPresets]) {
      if (entry.support.level !== "supported") {
        expect(entry.support.reason, `${entry.id} support reason`).toBeTruthy();
      }
    }
  });

  it("declares a removal policy for every supported module", () => {
    for (const module of builtinModules.filter((entry) => entry.support.level === "supported")) {
      expect(module.removalPolicy.mode, module.id).toBe("managed-files-only");
      expect(module.removalPolicy.retainedData, module.id).toBeInstanceOf(Array);
      expect(module.removalPolicy.manualCleanup, module.id).toBeInstanceOf(Array);
    }
    expect(builtinModules.find((module) => module.id === "postgres/local")?.removalPolicy.retainedData).toContain(
      "The Docker pgdata volume and its PostgreSQL data are retained."
    );
  });
});
