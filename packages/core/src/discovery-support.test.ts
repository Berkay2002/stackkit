import { describe, expect, it } from "vitest";

import { defineModule, listStackkitModules, searchStackkitModules } from "./index.js";

const modules = [
  defineModule({
    id: "web/supported",
    version: "1.0.0",
    title: "Supported web",
    description: "Supported web",
    aliases: ["supported"],
    support: { level: "supported" }
  }),
  defineModule({
    id: "web/preview",
    version: "1.0.0",
    title: "Preview web",
    description: "Preview web",
    aliases: ["preview"],
    support: { level: "preview", reason: "Release verification is incomplete" }
  }),
  defineModule({
    id: "web/planned",
    version: "1.0.0",
    title: "Planned web",
    description: "Planned web",
    aliases: ["planned"],
    support: { level: "planned", reason: "No generated app exists" }
  })
];

describe("module discovery support tiers", () => {
  it("lists supported entries by default and preview entries only on opt-in", () => {
    expect(listStackkitModules(modules).map((module) => module.id)).toEqual(["web/supported"]);
    expect(listStackkitModules(modules, { includePreview: true }).map((module) => module.id)).toEqual([
      "web/supported",
      "web/preview"
    ]);
    expect(listStackkitModules(modules, { includePreview: true })[1].support).toEqual({
      level: "preview",
      reason: "Release verification is incomplete"
    });
    expect(searchStackkitModules("web", modules, { includePreview: true }).map((module) => module.id)).not.toContain(
      "web/planned"
    );
  });
});
