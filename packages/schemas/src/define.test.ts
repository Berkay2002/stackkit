import { describe, expect, it } from "vitest";

import { defineModule, definePreset, stackkitManifestSchema } from "./index.js";

describe("defineModule", () => {
  it("parses a minimal valid module and applies defaults", () => {
    const module = defineModule({
      id: "quality/example",
      version: "1.0.0",
      title: "Example",
      description: "An example module"
    });

    expect(module.id).toBe("quality/example");
    // `aliases` defaults to [] via the schema.
    expect(module.aliases).toEqual([]);
    expect(module.support).toEqual({ level: "planned" });
  });

  it("parses explicit support evidence", () => {
    const module = defineModule({
      id: "web/example",
      version: "1.0.0",
      title: "Example web",
      description: "An example web module",
      support: {
        level: "supported",
        verifiedAt: "2026-08-08",
        verificationProfile: "golden-path"
      }
    });

    expect(module.support).toEqual({
      level: "supported",
      verifiedAt: "2026-08-08",
      verificationProfile: "golden-path"
    });
  });

  it("throws on invalid module input", () => {
    expect(() =>
      defineModule({
        // missing required title/description
        id: "quality/broken",
        version: "1.0.0"
      } as never)
    ).toThrow();
  });
});

describe("definePreset", () => {
  it("parses a minimal valid preset", () => {
    const preset = definePreset({
      id: "next",
      title: "Next.js",
      description: "Next.js preset",
      modules: ["web/nextjs"]
    });

    expect(preset.id).toBe("next");
    expect(preset.modules).toEqual(["web/nextjs"]);
    expect(preset.support).toEqual({ level: "planned" });
  });

  it("throws on invalid preset input (empty modules)", () => {
    expect(() =>
      definePreset({
        id: "broken",
        title: "Broken",
        description: "Broken preset",
        modules: []
      })
    ).toThrow();
  });
});

describe("stackkitManifestSchema", () => {
  it("defaults skippedInitializers to an empty array", () => {
    const manifest = stackkitManifestSchema.parse({
      schemaVersion: 1,
      stackkitVersion: "0.0.0",
      projectName: "acme",
      createdAt: "2026-06-02T00:00:00.000Z",
      modules: [],
      files: [],
      aiSkills: { targets: [], installed: [], unresolved: [] },
      migrations: { applied: [] }
    });

    expect(manifest.skippedInitializers).toEqual([]);
  });

  it("parses skipped native initializers", () => {
    const manifest = stackkitManifestSchema.parse({
      schemaVersion: 1,
      stackkitVersion: "0.0.0",
      projectName: "acme",
      createdAt: "2026-06-02T00:00:00.000Z",
      modules: [],
      files: [],
      skippedInitializers: [
        {
          name: "clerk init",
          moduleId: "auth/clerk",
          mutationPolicy: "external-state",
          reason: "Requires --allow-external-state"
        }
      ],
      aiSkills: { targets: [], installed: [], unresolved: [] },
      migrations: { applied: [] }
    });

    expect(manifest.skippedInitializers).toEqual([
      expect.objectContaining({
        name: "clerk init",
        moduleId: "auth/clerk",
        mutationPolicy: "external-state"
      })
    ]);
  });
});
