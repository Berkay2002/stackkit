import { describe, expect, it } from "vitest";

import { writeFile } from "./file-operations.js";

describe("writeFile", () => {
  it("returns an if-owned write FileOperation", () => {
    const op = writeFile("biome.json", "quality/biome", "{}\n");

    expect(op).toEqual({
      kind: "write",
      path: "biome.json",
      owner: "quality/biome",
      content: "{}\n",
      overwrite: "if-owned"
    });
  });
});
