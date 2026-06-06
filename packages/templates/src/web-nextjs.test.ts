import { describe, expect, it } from "vitest";

import { renderNextjsApp, renderShadcnUi } from "./index.js";

describe("web templates", () => {
  it("renders a Next.js app package and App Router files", () => {
    const files = renderNextjsApp({ appName: "web" });

    expect(files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "write",
          path: "apps/web/package.json",
          owner: "web/nextjs",
          overwrite: "if-owned"
        }),
        expect.objectContaining({
          kind: "write",
          path: "apps/web/app/layout.tsx",
          owner: "web/nextjs",
          content: expect.stringContaining("export default function RootLayout"),
          overwrite: "if-owned"
        }),
        expect.objectContaining({
          kind: "write",
          path: "apps/web/app/page.tsx",
          owner: "web/nextjs",
          content: expect.stringContaining("export default function Page"),
          overwrite: "if-owned"
        }),
        expect.objectContaining({
          kind: "write",
          path: "apps/web/next.config.ts",
          owner: "web/nextjs",
          overwrite: "if-owned"
        })
      ])
    );
  });

  it("renders package manager metadata in the app package when provided", () => {
    const files = renderNextjsApp({ appName: "web", packageManagerField: "yarn@4.9.4" });
    const packageJson = JSON.parse(files.find((file) => file.path === "apps/web/package.json")?.content ?? "{}");

    expect(packageJson.packageManager).toBe("yarn@4.9.4");
  });

  it("renders Next.js package bridge scripts for root orchestration", () => {
    const files = renderNextjsApp({ appName: "web" });
    const packageJson = JSON.parse(files.find((file) => file.path === "apps/web/package.json")?.content ?? "{}");

    expect(packageJson.scripts).toEqual(
      expect.objectContaining({
        dev: "next dev",
        build: "next build",
        test: "vitest run --passWithNoTests",
        typecheck: "tsc --noEmit",
        lint: "eslint --config ../../eslint.config.mjs app next.config.ts",
        format: "prettier --write ."
      })
    );
  });

  it("renders biome lint/format scripts when the biome tooling choice is selected", () => {
    const files = renderNextjsApp({ appName: "web", tsTooling: "biome" });
    const packageJson = JSON.parse(files.find((file) => file.path === "apps/web/package.json")?.content ?? "{}");

    expect(packageJson.scripts).toEqual(
      expect.objectContaining({
        lint: "biome lint .",
        format: "biome format --write .",
        typecheck: "tsc --noEmit"
      })
    );
  });

  it("renders a Next.js tsconfig that does not need build-time rewrites", () => {
    const files = renderNextjsApp({ appName: "web" });
    const tsconfig = JSON.parse(files.find((file) => file.path === "apps/web/tsconfig.json")?.content ?? "{}");

    expect(tsconfig).toEqual(
      expect.objectContaining({
        extends: "../../tsconfig.base.json",
        exclude: ["node_modules"]
      })
    );
    expect(tsconfig.compilerOptions).toEqual(
      expect.objectContaining({
        lib: ["dom", "dom.iterable", "esnext"],
        allowJs: true,
        incremental: true,
        esModuleInterop: true,
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: "preserve",
        noEmit: true,
        plugins: [{ name: "next" }]
      })
    );
    expect(tsconfig.include).toEqual(["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"]);
  });

  it("renders ShadCN and Tailwind support files", () => {
    const files = renderShadcnUi({ appName: "web" });

    expect(files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "write",
          path: "apps/web/components.json",
          owner: "ui/shadcn",
          overwrite: "if-owned"
        }),
        expect.objectContaining({
          kind: "write",
          path: "apps/web/app/globals.css",
          owner: "ui/shadcn",
          content: expect.stringContaining('@import "tailwindcss"'),
          overwrite: "if-owned"
        })
      ])
    );
  });
});

describe("renderShadcnUi framework awareness", () => {
  it("defaults to Next.js (rsc true, app/globals.css)", () => {
    const files = renderShadcnUi({ appName: "web" });
    const components = files.find((f) => f.path === "apps/web/components.json")!;
    expect(JSON.parse(components.content!).rsc).toBe(true);
    expect(JSON.parse(components.content!).tailwind.css).toBe("app/globals.css");
    expect(files.some((f) => f.path === "apps/web/app/globals.css")).toBe(true);
  });
  it("renders Vite shadcn (rsc false, src/index.css)", () => {
    const files = renderShadcnUi({ appName: "web", framework: "vite" });
    const components = JSON.parse(files.find((f) => f.path === "apps/web/components.json")!.content!);
    expect(components.rsc).toBe(false);
    expect(components.tailwind.css).toBe("src/index.css");
    const css = files.find((f) => f.path === "apps/web/src/index.css")!;
    expect(css.owner).toBe("ui/shadcn");
    expect(css.content).toContain('@import "tailwindcss";');
  });
  it("renders TanStack Start shadcn (rsc false, src/styles/app.css)", () => {
    const files = renderShadcnUi({ appName: "web", framework: "tanstack-start" });
    const components = JSON.parse(files.find((f) => f.path === "apps/web/components.json")!.content!);
    expect(components.tailwind.css).toBe("src/styles/app.css");
    expect(files.some((f) => f.path === "apps/web/src/styles/app.css")).toBe(true);
  });
});
