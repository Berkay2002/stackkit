import { describe, expect, it } from "vitest";

import { stackkitConfigSchema } from "@berkayorhan/stackkit-schemas";

import { formatCliError } from "./index.js";

describe("formatCliError", () => {
  it("renders schema issues one per line instead of a JSON dump", () => {
    const result = stackkitConfigSchema.safeParse({ projectName: "acme", modlues: [], ai: { skilMode: "plan" } });

    expect(formatCliError(result.error)).toBe(
      ['Invalid Stackkit input:', '  - ai: Unrecognized key: "skilMode"', '  - Unrecognized key: "modlues"'].join("\n")
    );
  });

  it("passes plain errors through", () => {
    expect(formatCliError(new Error("boom"))).toBe("boom");
  });
});
