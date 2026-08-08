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
          support: { level: "supported" },
          aliases: ["vercel"],
          category: "deploy",
          icon: "vercel"
        }),
        defineModule({
          id: "web/nextjs",
          version: "1.0.0",
          title: "Next.js",
          description: "Next.js app",
          support: { level: "supported" },
          aliases: ["next", "nextjs"],
          category: "web",
          icon: "nextjs"
        }),
        defineModule({
          id: "api/fastapi",
          version: "1.0.0",
          title: "FastAPI",
          description: "FastAPI API service",
          support: { level: "supported" },
          aliases: ["fastapi"],
          category: "api",
          icon: "fastapi"
        }),
        defineModule({
          id: "docs/readme",
          version: "1.0.0",
          title: "README",
          description: "Project README documentation",
          support: { level: "supported" }
        })
      ],
      presets: [
        definePreset({
          id: "z-custom",
          title: "Custom",
          description: "Custom stack",
          support: { level: "supported" },
          modules: ["web/nextjs"]
        }),
        definePreset({
          id: "a-next",
          title: "Next.js",
          description: "Next.js app",
          support: { level: "supported" },
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
        support: { level: "supported" },
        icon: "nextjs"
      }
    ]);
    expect(catalog.categories.other).toEqual([
      {
        id: "docs/readme",
        alias: "docs/readme",
        title: "README",
        description: "Project README documentation",
        support: { level: "supported" }
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
          support: { level: "supported" },
          aliases: ["zeta"],
          category: "api"
        }),
        defineModule({
          id: "api/alpha",
          version: "1.0.0",
          title: "API",
          description: "Alpha API",
          support: { level: "supported" },
          aliases: ["alpha"],
          category: "api"
        })
      ],
      presets: []
    });

    expect(catalog.categories.api.map((choice) => choice.id)).toEqual(["api/alpha", "api/zeta"]);
  });

  it("separates preview choices when explicitly included and always hides planned entries", () => {
    const modules = [
      defineModule({
        id: "web/supported",
        version: "1.0.0",
        title: "Supported web",
        description: "Supported web",
        aliases: ["supported"],
        category: "web",
        support: { level: "supported" }
      }),
      defineModule({
        id: "web/preview",
        version: "1.0.0",
        title: "Preview web",
        description: "Preview web",
        aliases: ["preview"],
        category: "web",
        support: { level: "preview", reason: "Release verification is incomplete" }
      }),
      defineModule({
        id: "web/planned",
        version: "1.0.0",
        title: "Planned web",
        description: "Planned web",
        aliases: ["planned"],
        category: "web",
        support: { level: "planned", reason: "No generated app exists" }
      })
    ];

    const supportedOnly = buildCustomizerCatalog({ modules, presets: [] });
    const withPreview = buildCustomizerCatalog({ modules, presets: [], includePreview: true });

    expect(supportedOnly.categories.web.map((choice) => choice.id)).toEqual(["web/supported"]);
    expect(supportedOnly.previewCategories).toEqual({});
    expect(withPreview.categories.web.map((choice) => choice.id)).toEqual(["web/supported"]);
    expect(withPreview.previewCategories.web).toEqual([
      expect.objectContaining({
        id: "web/preview",
        support: { level: "preview", reason: "Release verification is incomplete" }
      })
    ]);
    expect(JSON.stringify(withPreview)).not.toContain("web/planned");
  });
});
