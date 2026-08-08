import { describe, expect, it } from "vitest";

import { expandExpectedFiles, matchGlob } from "./glob-match.js";

describe("matchGlob", () => {
  it("matches native initializer expectedFiles globs against project paths", () => {
    expect(matchGlob("apps/web/app/page.tsx", "apps/web/**/*.tsx")).toBe(true);
    expect(matchGlob("apps/web/x.ts", "apps/web/**/*.tsx")).toBe(false);
    expect(matchGlob("apps/web/a.tsx", "apps/web/?.tsx")).toBe(true);
    expect(matchGlob("apps/web/ab.tsx", "apps/web/?.tsx")).toBe(false);
    expect(matchGlob("apps/web/app/page.tsx", "apps/web/*.tsx")).toBe(false);
  });
});

describe("expandExpectedFiles", () => {
  it("expands glob patterns against a project file set", () => {
    expect(
      expandExpectedFiles(["apps/web/**/*.tsx", "components.json"], [
        "apps/web/app/page.tsx",
        "apps/web/app/layout.tsx",
        "apps/web/app/page.ts",
        "components.json"
      ])
    ).toEqual(["apps/web/app/page.tsx", "apps/web/app/layout.tsx", "components.json"]);
  });
});
