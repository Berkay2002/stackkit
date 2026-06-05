import { describe, expect, it } from "vitest";

import { buildCustomizerCatalog, defineModule, definePreset } from "./index.js";

describe("buildCustomizerCatalog", () => {
  it("returns JSON-serializable choices grouped by sorted category", () => {
    const catalog = buildCustomizerCatalog({
      modules: [
        defineModule({
          id: "deploy/vercel",
          version: "1.0.0",
          title: "Vercel",
          description: "Vercel deployment",
          aliases: ["vercel"],
          category: "deploy",
          icon: "vercel"
        }),
        defineModule({
          id: "web/nextjs",
          version: "1.0.0",
          title: "Next.js",
          description: "Next.js app",
          aliases: ["next", "nextjs"],
          category: "web",
          icon: "nextjs"
        }),
        defineModule({
          id: "api/fastapi",
          version: "1.0.0",
          title: "FastAPI",
          description: "FastAPI API service",
          aliases: ["fastapi"],
          category: "api",
          icon: "fastapi"
        }),
        defineModule({
          id: "docs/readme",
          version: "1.0.0",
          title: "README",
          description: "Project README documentation"
        })
      ],
      presets: [
        definePreset({
          id: "z-custom",
          title: "Custom",
          description: "Custom stack",
          modules: ["web/nextjs"]
        }),
        definePreset({
          id: "a-next",
          title: "Next.js",
          description: "Next.js app",
          modules: ["web/nextjs", "deploy/vercel"]
        })
      ]
    });

    expect(catalog.presets.map((preset) => preset.id)).toEqual(["z-custom", "a-next"]);
    expect(Object.keys(catalog.categories)).toEqual(["api", "deploy", "other", "web"]);
    expect(catalog.categories.web).toEqual([
      {
        id: "web/nextjs",
        alias: "next",
        title: "Next.js",
        description: "Next.js app",
        icon: "nextjs"
      }
    ]);
    expect(catalog.categories.other).toEqual([
      {
        id: "docs/readme",
        alias: "docs/readme",
        title: "README",
        description: "Project README documentation"
      }
    ]);
    expect(JSON.parse(JSON.stringify(catalog))).toEqual(catalog);
  });

  it("sorts choices by title and then canonical ID", () => {
    const catalog = buildCustomizerCatalog({
      modules: [
        defineModule({
          id: "api/zeta",
          version: "1.0.0",
          title: "API",
          description: "Zeta API",
          aliases: ["zeta"],
          category: "api"
        }),
        defineModule({
          id: "api/alpha",
          version: "1.0.0",
          title: "API",
          description: "Alpha API",
          aliases: ["alpha"],
          category: "api"
        })
      ],
      presets: []
    });

    expect(catalog.categories.api.map((choice) => choice.id)).toEqual(["api/alpha", "api/zeta"]);
  });
});
