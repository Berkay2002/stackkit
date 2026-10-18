import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

describe("registry package dependencies", () => {
  it("does not depend on @berkayorhan/stackkit-core", () => {
    const pkgPath = fileURLToPath(new URL("../package.json", import.meta.url));
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(pkg.dependencies ?? {}).not.toHaveProperty("@berkayorhan/stackkit-core");
    expect(pkg.devDependencies ?? {}).not.toHaveProperty("@berkayorhan/stackkit-core");
  });

  it("does not import @berkayorhan/stackkit-core from source or tests", () => {
    const srcDirectory = new URL("./", import.meta.url);
    const importers = readdirSync(srcDirectory, { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".ts"))
      .filter((file) => /from\s+["']@berkayorhan\/stackkit-core/.test(readFileSync(new URL(file.replaceAll("\\", "/"), srcDirectory), "utf8")));

    expect(importers).toEqual([]);
  });
});
