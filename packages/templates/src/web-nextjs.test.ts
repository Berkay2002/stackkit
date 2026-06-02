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
