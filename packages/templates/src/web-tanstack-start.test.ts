import { describe, expect, it } from "vitest";
import { renderTanStackStartApp } from "./index.js";

describe("renderTanStackStartApp", () => {
  it("renders a vite-plugin TanStack Start starter owned by web/tanstack-start", () => {
    const files = renderTanStackStartApp({ appName: "web", withShadcn: false });
    const paths = files.map((f) => f.path);
    expect(paths).toEqual(expect.arrayContaining([
      "apps/web/package.json", "apps/web/vite.config.ts", "apps/web/tsconfig.json",
      "apps/web/src/router.tsx", "apps/web/src/routes/__root.tsx", "apps/web/src/routes/index.tsx",
      "apps/web/.gitignore", "apps/web/src/styles/app.css"
    ]));
    expect(files.every((f) => f.owner === "web/tanstack-start")).toBe(true);
    const pkg = JSON.parse(files.find((f) => f.path === "apps/web/package.json")!.content!);
    expect(pkg.scripts.dev).toBe("vite dev");
    expect(pkg.dependencies["@tanstack/react-start"]).toBeDefined();
    expect(pkg.dependencies["@tanstack/react-router"]).toBeDefined();
    const vite = files.find((f) => f.path === "apps/web/vite.config.ts")!.content!;
    expect(vite.indexOf("tanstackStart()")).toBeLessThan(vite.indexOf("viteReact()"));
    expect(files.find((f) => f.path === "apps/web/src/routes/__root.tsx")!.content).toContain("createRootRoute");
  });
  it("omits its own app.css when shadcn owns it", () => {
    const files = renderTanStackStartApp({ appName: "web", withShadcn: true });
    expect(files.some((f) => f.path === "apps/web/src/styles/app.css")).toBe(false);
    expect(files.find((f) => f.path === "apps/web/src/routes/__root.tsx")!.content).toContain(
      'import "@workspace/ui/globals.css"'
    );
    const pkg = JSON.parse(files.find((f) => f.path === "apps/web/package.json")!.content!);
    expect(pkg.dependencies["@workspace/ui"]).toBe("workspace:*");
  });
});
