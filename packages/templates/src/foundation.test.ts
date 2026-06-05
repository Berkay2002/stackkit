import { describe, expect, it } from "vitest";

import { renderPnpmTurboFoundation } from "./index.js";

describe("renderPnpmTurboFoundation", () => {
  it("renders root pnpm and Turborepo foundation files", () => {
    const files = renderPnpmTurboFoundation({ projectName: "acme-app" });

    expect(files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "write",
          path: "package.json",
          owner: "workspace/pnpm-turbo",
          overwrite: "if-owned"
        }),
        {
          kind: "write",
          path: "pnpm-workspace.yaml",
          owner: "workspace/pnpm-turbo",
          content: "packages:\n  - apps/*\n  - packages/*\n",
          overwrite: "if-owned"
        },
        expect.objectContaining({
          kind: "write",
          path: "turbo.json",
          owner: "workspace/pnpm-turbo",
          overwrite: "if-owned"
        }),
        expect.objectContaining({
          kind: "write",
          path: "tsconfig.base.json",
          owner: "workspace/typescript",
          overwrite: "if-owned"
        }),
        expect.objectContaining({
          kind: "write",
          path: ".gitignore",
          owner: "workspace/pnpm-turbo",
          overwrite: "if-owned"
        }),
        expect.objectContaining({
          kind: "write",
          path: "eslint.config.mjs",
          owner: "quality/eslint",
          overwrite: "if-owned"
        }),
        expect.objectContaining({
          kind: "write",
          path: "prettier.config.mjs",
          owner: "quality/prettier",
          overwrite: "if-owned"
        })
      ])
    );

    const byPath = new Map(files.map((file) => [file.path, file]));

    expect(byPath.get("package.json")?.content).toContain('"name": "acme-app"');
    expect(byPath.get("package.json")?.content).toContain('"packageManager": "pnpm@10.5.1"');
    expect(byPath.get("package.json")?.content).toContain('"dev": "turbo run dev"');
    expect(byPath.get("package.json")?.content).toContain('"build": "turbo run build"');
    expect(byPath.get("package.json")?.content).toContain('"test": "turbo run test"');
    expect(byPath.get("package.json")?.content).toContain('"typecheck": "turbo run typecheck"');
    expect(byPath.get("package.json")?.content).toContain('"lint": "turbo run lint"');
    expect(byPath.get("package.json")?.content).toContain('"format": "turbo run format"');
    expect(byPath.get("package.json")?.content).toContain('"@types/node"');
    expect(byPath.get("package.json")?.content).toContain('"turbo"');
    expect(byPath.get("package.json")?.content).toContain('"typescript"');
    expect(byPath.get("package.json")?.content).toContain('"vitest"');
    expect(byPath.get("turbo.json")?.content).toContain('"build"');
    expect(byPath.get("turbo.json")?.content).toContain('"dev"');
    expect(byPath.get("turbo.json")?.content).toContain('"test"');
    expect(byPath.get("turbo.json")?.content).toContain('"typecheck"');
    expect(byPath.get("turbo.json")?.content).toContain('"lint"');
    expect(byPath.get("turbo.json")?.content).toContain('"format"');
    expect(byPath.get("tsconfig.base.json")?.content).toContain('"moduleResolution": "Bundler"');
    expect(byPath.get(".gitignore")?.content).toContain("node_modules");
    expect(byPath.get("eslint.config.mjs")?.content).toContain("@eslint/js");
    expect(byPath.get("prettier.config.mjs")?.content).toContain("export default");
  });

  it("renders npm workspaces without pnpm-workspace.yaml", () => {
    const files = renderPnpmTurboFoundation({
      projectName: "acme-app",
      packageManagerField: "npm@11.5.2"
    });
    const byPath = new Map(files.map((file) => [file.path, file]));
    const pkg = JSON.parse(byPath.get("package.json")?.content ?? "{}");

    expect(byPath.has("pnpm-workspace.yaml")).toBe(false);
    expect(pkg.packageManager).toBe("npm@11.5.2");
    expect(pkg.workspaces).toEqual(["apps/*", "packages/*"]);
  });

  it("renders bun package manager metadata", () => {
    const files = renderPnpmTurboFoundation({
      projectName: "acme-app",
      packageManagerField: "bun@1.2.15"
    });
    const pkg = JSON.parse(files.find((file) => file.path === "package.json")?.content ?? "{}");

    expect(pkg.packageManager).toBe("bun@1.2.15");
    expect(pkg.workspaces).toEqual(["apps/*", "packages/*"]);
  });
});
