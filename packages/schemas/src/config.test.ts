import { describe, expect, it } from "vitest";

import { stackkitConfigSchema, stackkitManifestSchema } from "./index.js";

describe("stackkitConfigSchema", () => {
  it("accepts lowercase slug project names", () => {
    expect(
      stackkitConfigSchema.parse({
        projectName: "acme-dashboard"
      }).projectName
    ).toBe("acme-dashboard");
  });

  it("rejects project names that are not v1 Stackkit slugs", () => {
    expect(() =>
      stackkitConfigSchema.parse({
        projectName: "Acme Dashboard"
      })
    ).toThrow();
    expect(() =>
      stackkitConfigSchema.parse({
        projectName: "acme_dashboard"
      })
    ).toThrow();
    expect(() =>
      stackkitConfigSchema.parse({
        projectName: "@acme/dashboard"
      })
    ).toThrow();
  });

  it("defaults AI skills to the Codex-compatible project target", () => {
    expect(
      stackkitConfigSchema.parse({
        projectName: "example"
      }).ai
    ).toEqual({
      skillTargets: ["codex"],
      skillMode: "install",
      linkMode: "copy"
    });
  });

  it("accepts Claude Code when it is explicitly selected", () => {
    expect(
      stackkitConfigSchema.parse({
        projectName: "example",
        ai: {
          skillTargets: ["codex", "claude-code"]
        }
      }).ai
    ).toEqual({
      skillTargets: ["codex", "claude-code"],
      skillMode: "install",
      linkMode: "copy"
    });
  });

  it("accepts AI skill mode and link mode", () => {
    const parsed = stackkitConfigSchema.parse({
      projectName: "acme",
      modules: ["workspace/pnpm-turbo"],
      ai: {
        skillTargets: ["codex", "claude-code"],
        skillMode: "install",
        linkMode: "copy"
      }
    });

    expect(parsed.ai).toEqual(
      expect.objectContaining({
        skillTargets: ["codex", "claude-code"],
        skillMode: "install",
        linkMode: "copy"
      })
    );
  });

  it("accepts a first-class config preset", () => {
    expect(
      stackkitConfigSchema.parse({
        projectName: "example",
        preset: "next-fastapi-postgres-auth0"
      }).preset
    ).toBe("next-fastapi-postgres-auth0");
  });

  it("accepts project-level registry declarations", () => {
    const parsed = stackkitConfigSchema.parse({
      projectName: "acme",
      modules: [],
      registries: {
        "@acme": "./stackkit.registry.json"
      }
    });

    expect(parsed.registries).toEqual({ "@acme": "./stackkit.registry.json" });
  });

  it("accepts supported package managers and defaults to pnpm", () => {
    expect(
      stackkitConfigSchema.parse({
        projectName: "example",
        modules: [],
        packageManager: "bun"
      }).packageManager
    ).toBe("bun");
    expect(
      stackkitConfigSchema.parse({
        projectName: "example",
        modules: []
      }).packageManager
    ).toBe("pnpm");
    expect(() =>
      stackkitConfigSchema.parse({
        projectName: "example",
        modules: [],
        packageManager: "bad"
      })
    ).toThrow();
  });
});

describe("stackkitManifestSchema", () => {
  it("accepts create provenance and project paths", () => {
    expect(
      stackkitManifestSchema.parse({
        schemaVersion: 1,
        stackkitVersion: "0.1.0",
        projectName: "acme-dashboard",
        packageManager: "pnpm",
        source: { kind: "config", path: "stackkit.config.json" },
        paths: { root: "." },
        createdAt: "2026-06-02T00:00:00.000Z",
        modules: [],
        files: [],
        aiSkills: {
          targets: [],
          installed: [],
          unresolved: []
        },
        migrations: {
          applied: []
        }
      })
    ).toEqual(
      expect.objectContaining({
        packageManager: "pnpm",
        source: { kind: "config", path: "stackkit.config.json" },
        paths: { root: "." }
      })
    );
  });

  it("accepts supported package managers in manifests", () => {
    expect(
      stackkitManifestSchema.parse({
        schemaVersion: 1,
        stackkitVersion: "0.1.0",
        projectName: "acme-dashboard",
        packageManager: "npm",
        source: { kind: "config", path: "stackkit.config.json" },
        paths: { root: "." },
        createdAt: "2026-06-02T00:00:00.000Z",
        modules: [],
        files: [],
        aiSkills: {
          targets: [],
          installed: [],
          unresolved: []
        },
        migrations: {
          applied: []
        }
      }).packageManager
    ).toBe("npm");
  });

  it("accepts recipe source provenance in manifests", () => {
    expect(
      stackkitManifestSchema.parse({
        schemaVersion: 1,
        stackkitVersion: "0.1.0",
        projectName: "acme-dashboard",
        packageManager: "pnpm",
        source: { kind: "recipe", code: "sk_example" },
        paths: { root: "." },
        createdAt: "2026-06-02T00:00:00.000Z",
        modules: [],
        files: [],
        aiSkills: {
          targets: [],
          installed: [],
          unresolved: []
        },
        migrations: {
          applied: []
        }
      }).source
    ).toEqual({ kind: "recipe", code: "sk_example" });
  });
});
