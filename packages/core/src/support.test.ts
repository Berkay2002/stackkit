import { describe, expect, it } from "vitest";

import { assertCreateSupport, defineModule, definePreset } from "./index.js";

const supported = defineModule({
  id: "web/supported",
  version: "1.0.0",
  title: "Supported web",
  description: "Supported web module",
  support: { level: "supported", verifiedAt: "2026-08-08", verificationProfile: "golden-path" }
});

const preview = defineModule({
  id: "web/preview",
  version: "1.0.0",
  title: "Preview web",
  description: "Preview web module",
  support: { level: "preview", reason: "Runtime smoke is not in the release gate yet" }
});

const planned = defineModule({
  id: "web/planned",
  version: "1.0.0",
  title: "Planned web",
  description: "Planned web module",
  support: { level: "planned", reason: "No generated application exists" }
});

describe("assertCreateSupport", () => {
  it("allows supported modules, gates preview, and refuses planned entries", () => {
    expect(() => assertCreateSupport({ modules: [supported] })).not.toThrow();
    expect(() => assertCreateSupport({ modules: [preview] })).toThrow(
      "Module web/preview is preview. Re-run with --include-preview"
    );
    expect(() => assertCreateSupport({ modules: [preview], includePreview: true })).not.toThrow();
    expect(() => assertCreateSupport({ modules: [planned], includePreview: true })).toThrow(
      "Module web/planned is planned and cannot be created: No generated application exists"
    );

    const previewPreset = definePreset({
      id: "preview-preset",
      title: "Preview preset",
      description: "Preview preset",
      support: { level: "preview", reason: "Release verification is incomplete" },
      modules: [supported.id]
    });

    expect(() => assertCreateSupport({ modules: [supported], presets: [previewPreset] })).toThrow(
      "Preset preview-preset is preview. Re-run with --include-preview"
    );
  });

  it("treats non-pnpm package managers as preview", () => {
    expect(() => assertCreateSupport({ modules: [supported], packageManager: "npm" })).toThrow(
      "Package manager npm is preview. Re-run with --include-preview"
    );
    expect(() =>
      assertCreateSupport({ modules: [supported], packageManager: "npm", includePreview: true })
    ).not.toThrow();
  });
});
