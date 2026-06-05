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
