import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

describe("registry package dependencies", () => {
  it("does not depend on @berkayorhan/stackkit-core", () => {
    const pkgPath = fileURLToPath(new URL("../package.json", import.meta.url));
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      dependencies?: Record<string, string>;
    };

    expect(pkg.dependencies ?? {}).not.toHaveProperty("@berkayorhan/stackkit-core");
  });
});
