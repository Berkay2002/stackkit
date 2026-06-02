import { describe, expect, it } from "vitest";

import { builtinModules } from "./index.js";

describe("builtin module file declarations", () => {
  it("keeps foundation module IDs available for template rendering", () => {
    expect(builtinModules.map((module) => module.id)).toEqual(expect.arrayContaining(["workspace/pnpm-turbo", "workspace/typescript"]));
  });
});
