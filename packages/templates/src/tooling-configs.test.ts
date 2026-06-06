import { describe, expect, it } from "vitest";

import {
  renderBiomeConfig,
  renderEslintConfig,
  renderMypyConfig,
  renderPrettierConfig,
  renderPyrightConfig,
  renderRuffConfig
} from "./tooling-configs.js";

describe("tooling config renderers", () => {
  it("renders an eslint.config.mjs owned by quality/eslint", () => {
    const files = renderEslintConfig();

    expect(files).toHaveLength(1);
    expect(files[0]).toEqual(
      expect.objectContaining({
        kind: "write",
        path: "eslint.config.mjs",
        owner: "quality/eslint",
        overwrite: "if-owned"
      })
    );
    expect(files[0].content).toContain("@eslint/js");
    expect(files[0].content).toContain("typescript-eslint");
    expect(files[0].content).toContain("export default");
  });

  it("renders a prettier.config.mjs owned by quality/prettier", () => {
    const files = renderPrettierConfig();

    expect(files).toHaveLength(1);
    expect(files[0]).toEqual(
      expect.objectContaining({
        kind: "write",
        path: "prettier.config.mjs",
        owner: "quality/prettier",
        overwrite: "if-owned"
      })
    );
    expect(files[0].content).toContain("export default");
  });

  it("renders a biome.json owned by quality/biome with linter and formatter enabled", () => {
    const files = renderBiomeConfig();

    expect(files).toHaveLength(1);
    expect(files[0]).toEqual(
      expect.objectContaining({
        kind: "write",
        path: "biome.json",
        owner: "quality/biome",
        overwrite: "if-owned"
      })
    );
    const biome = JSON.parse(files[0].content ?? "{}");
    expect(biome.$schema).toContain("biomejs.dev");
    expect(biome.linter.enabled).toBe(true);
    expect(biome.formatter.enabled).toBe(true);
  });

  it("renders a ruff.toml owned by quality/ruff with line-length and lint select", () => {
    const files = renderRuffConfig();

    expect(files).toHaveLength(1);
    expect(files[0]).toEqual(
      expect.objectContaining({
        kind: "write",
        path: "ruff.toml",
        owner: "quality/ruff",
        overwrite: "if-owned"
      })
    );
    expect(files[0].content).toContain("line-length");
    expect(files[0].content).toContain("[lint]");
    expect(files[0].content).toContain("select");
  });

  it("renders a mypy.ini owned by quality/mypy with strict mode", () => {
    const files = renderMypyConfig();

    expect(files).toHaveLength(1);
    expect(files[0]).toEqual(
      expect.objectContaining({
        kind: "write",
        path: "mypy.ini",
        owner: "quality/mypy",
        overwrite: "if-owned"
      })
    );
    expect(files[0].content).toContain("[mypy]");
    expect(files[0].content).toContain("strict = true");
  });

  it("renders a pyrightconfig.json owned by quality/pyright", () => {
    const files = renderPyrightConfig();

    expect(files).toHaveLength(1);
    expect(files[0]).toEqual(
      expect.objectContaining({
        kind: "write",
        path: "pyrightconfig.json",
        owner: "quality/pyright",
        overwrite: "if-owned"
      })
    );
    const pyright = JSON.parse(files[0].content ?? "{}");
    expect(pyright.typeCheckingMode).toBeDefined();
  });
});
