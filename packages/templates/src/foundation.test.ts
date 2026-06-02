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
        })
      ])
    );

    const byPath = new Map(files.map((file) => [file.path, file]));

    expect(byPath.get("package.json")?.content).toContain('"name": "acme-app"');
    expect(byPath.get("package.json")?.content).toContain('"packageManager": "pnpm@10.5.1"');
    expect(byPath.get("package.json")?.content).toContain('"build": "turbo run build"');
    expect(byPath.get("package.json")?.content).toContain('"test": "turbo run test"');
    expect(byPath.get("package.json")?.content).toContain('"typecheck": "turbo run typecheck"');
    expect(byPath.get("package.json")?.content).toContain('"@types/node"');
    expect(byPath.get("package.json")?.content).toContain('"turbo"');
    expect(byPath.get("package.json")?.content).toContain('"typescript"');
    expect(byPath.get("package.json")?.content).toContain('"vitest"');
    expect(byPath.get("turbo.json")?.content).toContain('"build"');
    expect(byPath.get("tsconfig.base.json")?.content).toContain('"moduleResolution": "Bundler"');
    expect(byPath.get(".gitignore")?.content).toContain("node_modules");
  });
});
