import { describe, expect, it } from "vitest";
import { renderViteApp } from "./index.js";

describe("renderViteApp", () => {
  it("renders a create-vite react-ts starter owned by web/vite", () => {
    const files = renderViteApp({ appName: "web", withShadcn: false });
    const paths = files.map((f) => f.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "apps/web/package.json", "apps/web/index.html", "apps/web/vite.config.ts",
        "apps/web/tsconfig.json", "apps/web/tsconfig.node.json", "apps/web/src/main.tsx",
        "apps/web/src/App.tsx", "apps/web/src/vite-env.d.ts", "apps/web/src/index.css"
      ])
    );
    expect(files.every((f) => f.owner === "web/vite")).toBe(true);
    const pkg = JSON.parse(files.find((f) => f.path === "apps/web/package.json")!.content!);
    expect(pkg.scripts.dev).toBe("vite");
    expect(pkg.dependencies.react).toBeDefined();
    expect(pkg.devDependencies.vite).toBeDefined();
    expect(files.find((f) => f.path === "apps/web/src/main.tsx")!.content).toContain('import "./index.css"');
  });
  it("omits its own index.css when shadcn owns it", () => {
    const files = renderViteApp({ appName: "web", withShadcn: true });
    expect(files.some((f) => f.path === "apps/web/src/index.css")).toBe(false);
    expect(files.find((f) => f.path === "apps/web/src/main.tsx")!.content).toContain('import "@workspace/ui/globals.css"');
    const pkg = JSON.parse(files.find((f) => f.path === "apps/web/package.json")!.content!);
    expect(pkg.dependencies["@workspace/ui"]).toBe("workspace:*");
  });
});
