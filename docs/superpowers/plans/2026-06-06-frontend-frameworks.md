# Frontend Frameworks (Vite + TanStack Start + Configurable ShadCN) Implementation Plan (v1 — draft)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task with superpowers:test-driven-development as the per-task spine. Steps use checkbox (`- [ ]`) syntax.
>
> **Ship-mode override:** This plan runs under the `ship` pipeline (user AFK). **No git commits, no worktree, stay on current branch.** Each milestone ends at a verification CHECKPOINT, not a commit. Review runs per milestone, not per task.

**Goal:** Add `web/vite` and `web/tanstack-start` managed frameworks at starter depth, and make ShadCN a configurable, framework-aware `ui` axis instead of a Next.js-only force-bundle.

**Architecture (verified against source):** Extend the existing `schemas → templates → registry → core → cli` seam. New modules in `packages/registry/src/index.ts`; new pure renderers in `packages/templates/src/index.ts`; a new `ui` axis + consolidated resolver in `packages/core/src/module-graph.ts` (with `customizer.ts` importing instead of duplicating); `renderCreateFiles` wiring in `packages/core/src/create.ts`; `--ui` flag in `packages/cli/src/index.ts`.

**Verified facts:**
- `web/nextjs` provides `["web-app","nextjs-app","react"]`; `ui/shadcn` requires `["react"]` only (registry/src/index.ts:68, :102).
- `deploy/vercel` requires `["web-app"]`; `deploy/docker` requires `["nextjs-app"]` (registry/src/index.ts:642, :788).
- `resolveStackAxes` force-appends `ui/shadcn` under `hasNext` (module-graph.ts:69-76) and is **duplicated** in customizer.ts:115-167 (customizer's copy lacks `dbProvider`).
- `renderCreateFiles` appends ShadCN (create.ts:219) **before** the web framework (create.ts:223); `appendSelectedFileOperations` filters ops by `selectedModuleIds.has(operation.owner)` and dedups by path via `seenPaths` (create.ts:580-591, 563-578).
- `renderShadcnUi` hardcodes `rsc:true` + `app/globals.css` (templates/src/index.ts:276-308); Next `layout.tsx` does NOT import globals.css (templates/src/index.ts:184-187).
- `module-graph.ts` imports only `@berkayorhan/stackkit-schemas` (pure → safe for the browser `/customizer` entry).
- TanStack Start (verified via TanStack docs): Vite-plugin based — `@tanstack/react-start` + `@tanstack/react-router` + `nitro` + `vite` + `@vitejs/plugin-react`; scripts `vite dev` / `vite build` / `node .output/server/index.mjs`; `vite.config.ts` runs `tanstackStart()` then `viteReact()`; root route uses `createRootRoute` with `HeadContent` + `Scripts`.

**Spec:** docs/superpowers/specs/2026-06-06-frontend-frameworks-design.md (authoritative).

**Package test commands:**
- registry: `pnpm --filter @berkayorhan/stackkit-registry test`
- templates: `pnpm --filter @berkayorhan/stackkit-templates test`
- core: `pnpm --filter @berkayorhan/stackkit-core test`
- cli: `pnpm --filter @berkayorhan/stackkit test`
- root: `pnpm test`, `pnpm typecheck`, `pnpm build`

---

## Milestone 1 — Registry: web/vite + web/tanstack-start modules + presets

Files: `packages/registry/src/index.ts`; tests `packages/registry/src/module-files.test.ts`, `packages/registry/src/presets.test.ts`, `packages/registry/src/web-frameworks.test.ts` (new).
Test cmd: `pnpm --filter @berkayorhan/stackkit-registry test`

### Task 1.1 — Add the two web modules with reciprocal conflicts

**Files:**
- Create: `packages/registry/src/web-frameworks.test.ts`
- Modify: `packages/registry/src/index.ts` (add modules after `web/nextjs` at :93; add `conflicts` to `web/nextjs`)

- [ ] **Step 1: Write the failing test**

```ts
// packages/registry/src/web-frameworks.test.ts
import { describe, expect, it } from "vitest";
import { builtinModules } from "./index.js";
import { resolveModuleGraph } from "@berkayorhan/stackkit-core";

function byId(id: string) {
  return builtinModules.find((m) => m.id === id);
}

describe("web framework modules", () => {
  it("registers web/vite and web/tanstack-start as react web apps", () => {
    const vite = byId("web/vite");
    const tanstack = byId("web/tanstack-start");
    expect(vite?.provides).toEqual(expect.arrayContaining(["web-app", "react"]));
    expect(vite?.provides).not.toContain("nextjs-app");
    expect(tanstack?.provides).toEqual(expect.arrayContaining(["web-app", "react", "ssr"]));
    expect(vite?.category).toBe("web");
    expect(tanstack?.category).toBe("web");
  });

  it("exposes unique friendly aliases", () => {
    expect(byId("web/vite")?.aliases).toContain("vite");
    expect(byId("web/tanstack-start")?.aliases).toEqual(
      expect.arrayContaining(["tanstack", "tanstack-start"])
    );
    const aliases = builtinModules.flatMap((m) => m.aliases ?? []);
    expect(new Set(aliases).size).toBe(aliases.length);
  });

  it("rejects selecting two web frameworks at once", () => {
    expect(() => resolveModuleGraph([byId("web/nextjs")!, byId("web/vite")!])).toThrow(/conflicts/);
    expect(() => resolveModuleGraph([byId("web/vite")!, byId("web/tanstack-start")!])).toThrow(/conflicts/);
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `pnpm --filter @berkayorhan/stackkit-registry test web-frameworks`
Expected: FAIL (`web/vite` undefined).

- [ ] **Step 3: Implement — add modules and reciprocal conflict on web/nextjs**

In `packages/registry/src/index.ts`, add `conflicts: ["web/vite", "web/tanstack-start"]` to the existing `web/nextjs` `defineModule` (after its `provides`, before `readme`), and insert two new modules immediately after the `web/nextjs` block:

```ts
defineModule({
  id: "web/vite",
  version: "1.0.0",
  title: "Vite",
  description: "Vite React web application",
  aliases: ["vite"],
  category: "web",
  icon: "vite",
  requires: ["workspace/node"],
  provides: ["web-app", "react"],
  conflicts: ["web/nextjs", "web/tanstack-start"],
  readme: {
    stack: ["Vite", "React"],
    layout: [{ path: "apps/web", description: "Vite React single-page application" }]
  },
  aiSkills: localGuidance("web/vite", "stackkit-vite-guidance", "Vite React app structure and build configuration guidance")
}),
defineModule({
  id: "web/tanstack-start",
  version: "1.0.0",
  title: "TanStack Start",
  description: "TanStack Start full-stack React application",
  aliases: ["tanstack", "tanstack-start"],
  category: "web",
  icon: "tanstack",
  requires: ["workspace/node"],
  provides: ["web-app", "react", "ssr"],
  conflicts: ["web/nextjs", "web/vite"],
  readme: {
    stack: ["TanStack Start", "React"],
    layout: [{ path: "apps/web", description: "TanStack Start full-stack React application" }]
  },
  aiSkills: localGuidance("web/tanstack-start", "stackkit-tanstack-start-guidance", "TanStack Start routing, SSR, and server-function guidance")
}),
```

Note: `localGuidance` is the existing helper at registry/src/index.ts:15. Local trust is used because no official/curated Vite or TanStack Start skill source has been verified (AGENTS.md requires verification before recording a source).

- [ ] **Step 4: Run → pass**

Run: `pnpm --filter @berkayorhan/stackkit-registry test web-frameworks`
Expected: PASS.

### Task 1.2 — Add vite and tanstack-start presets (ShadCN-bundled)

**Files:**
- Modify: `packages/registry/src/index.ts` (add presets after the `next` preset at :899)
- Modify: `packages/registry/src/presets.test.ts` (extend expected preset id list)

- [ ] **Step 1: Update the failing test**

In `packages/registry/src/presets.test.ts`, add `"vite"` and `"tanstack-start"` to the expected preset-id assertion (the existing `presets.test.ts:8-19` list). The "every preset resolves into a valid module graph" test (presets.test.ts:33-39) needs no change — it will now also cover the new presets.

- [ ] **Step 2: Run → fail**

Run: `pnpm --filter @berkayorhan/stackkit-registry test presets`
Expected: FAIL (missing preset ids).

- [ ] **Step 3: Implement — add the presets**

After the `next` preset (`definePreset({ id: "next", ... })` ending at :899) add:

```ts
definePreset({
  id: "vite",
  title: "Vite",
  description: "A pnpm and Turborepo workspace with a Vite React app and ShadCN UI",
  modules: ["workspace/pnpm-turbo", "workspace/typescript", "web/vite", "ui/shadcn", "quality/eslint", "quality/prettier"]
}),
definePreset({
  id: "tanstack-start",
  title: "TanStack Start",
  description: "A pnpm and Turborepo workspace with a TanStack Start app and ShadCN UI",
  modules: ["workspace/pnpm-turbo", "workspace/typescript", "web/tanstack-start", "ui/shadcn", "quality/eslint", "quality/prettier"]
}),
```

- [ ] **Step 4: Run → pass**

Run: `pnpm --filter @berkayorhan/stackkit-registry test`
Expected: PASS (all registry tests).

**M1 CHECKPOINT:** `pnpm --filter @berkayorhan/stackkit-registry test` and `pnpm --filter @berkayorhan/stackkit-registry typecheck` green → milestone review → M2.

---

## Milestone 2 — Templates: renderViteApp, renderTanStackStartApp, framework-aware ShadCN

Files: `packages/templates/src/index.ts`; tests `packages/templates/src/web-vite.test.ts` (new), `packages/templates/src/web-tanstack-start.test.ts` (new), `packages/templates/src/web-nextjs.test.ts` (extend for ShadCN framework param).
Test cmd: `pnpm --filter @berkayorhan/stackkit-templates test`

### Task 2.1 — Framework-aware `renderShadcnUi`

**Files:**
- Modify: `packages/templates/src/index.ts` (`renderShadcnUi` at :276; add `ShadcnUiOptions` type)
- Modify: `packages/templates/src/web-nextjs.test.ts` (add framework cases)

- [ ] **Step 1: Write the failing test**

Add to the existing ShadCN test (or `web-nextjs.test.ts`):

```ts
import { renderShadcnUi } from "./index.js";

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
```

- [ ] **Step 2: Run → fail**

Run: `pnpm --filter @berkayorhan/stackkit-templates test`
Expected: FAIL (`framework` ignored).

- [ ] **Step 3: Implement**

Replace `renderShadcnUi` and its option type in `packages/templates/src/index.ts`:

```ts
type ShadcnFramework = "nextjs" | "vite" | "tanstack-start";
type ShadcnUiOptions = { appName: string; framework?: ShadcnFramework };

const SHADCN_CSS_BY_FRAMEWORK: Record<ShadcnFramework, string> = {
  nextjs: "app/globals.css",
  vite: "src/index.css",
  "tanstack-start": "src/styles/app.css"
};

export function renderShadcnUi({ appName, framework = "nextjs" }: ShadcnUiOptions): FileOperation[] {
  const root = `apps/${appName}`;
  const cssPath = SHADCN_CSS_BY_FRAMEWORK[framework];
  const rsc = framework === "nextjs";

  return [
    writeFile(
      `${root}/components.json`,
      "ui/shadcn",
      `${JSON.stringify(
        {
          style: "new-york",
          rsc,
          tsx: true,
          tailwind: { css: cssPath, baseColor: "neutral", cssVariables: true },
          aliases: { components: "@/components", utils: "@/lib/utils" }
        },
        null,
        2
      )}\n`
    ),
    writeFile(`${root}/${cssPath}`, "ui/shadcn", '@import "tailwindcss";\n\n:root {\n  color-scheme: light;\n}\n')
  ];
}
```

This keeps the Next.js output byte-identical to today (rsc true, `app/globals.css`, same CSS body).

- [ ] **Step 4: Run → pass**

Run: `pnpm --filter @berkayorhan/stackkit-templates test`
Expected: PASS.

### Task 2.2 — `renderViteApp`

**Files:**
- Create: `packages/templates/src/web-vite.test.ts`
- Modify: `packages/templates/src/index.ts` (add `ViteAppOptions` + `renderViteApp`, export it)

- [ ] **Step 1: Write the failing test**

```ts
// packages/templates/src/web-vite.test.ts
import { describe, expect, it } from "vitest";
import { renderViteApp } from "./index.js";

describe("renderViteApp", () => {
  it("renders a create-vite react-ts starter owned by web/vite", () => {
    const files = renderViteApp({ appName: "web", withShadcn: false });
    const paths = files.map((f) => f.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "apps/web/package.json",
        "apps/web/index.html",
        "apps/web/vite.config.ts",
        "apps/web/tsconfig.json",
        "apps/web/tsconfig.node.json",
        "apps/web/src/main.tsx",
        "apps/web/src/App.tsx",
        "apps/web/src/vite-env.d.ts",
        "apps/web/src/index.css"
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
    // entry still imports the shadcn-owned css path
    expect(files.find((f) => f.path === "apps/web/src/main.tsx")!.content).toContain('import "./index.css"');
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `pnpm --filter @berkayorhan/stackkit-templates test web-vite`
Expected: FAIL (`renderViteApp` not exported).

- [ ] **Step 3: Implement**

Add to `packages/templates/src/index.ts`:

```ts
type ViteAppOptions = { appName: string; packageManagerField?: string; withShadcn?: boolean };

export function renderViteApp({ appName, packageManagerField, withShadcn = false }: ViteAppOptions): FileOperation[] {
  const root = `apps/${appName}`;
  const packageJson: Record<string, unknown> = {
    name: `@acme/${appName}`,
    private: true,
    type: "module",
    scripts: {
      dev: "vite",
      build: "vite build",
      preview: "vite preview",
      test: "vitest run --passWithNoTests",
      typecheck: "tsc --noEmit",
      lint: "eslint src",
      format: "prettier --write ."
    },
    dependencies: { react: "^19.0.0", "react-dom": "^19.0.0" },
    devDependencies: {
      "@types/react": "^19.0.0",
      "@types/react-dom": "^19.0.0",
      "@vitejs/plugin-react": "^4.3.4",
      typescript: "^5.9.3",
      vite: "^6.0.0"
    }
  };
  if (packageManagerField) {
    packageJson.packageManager = packageManagerField;
  }

  const files = [
    writeFile(`${root}/package.json`, "web/vite", `${JSON.stringify(packageJson, null, 2)}\n`),
    writeFile(
      `${root}/index.html`,
      "web/vite",
      '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Stackkit app</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>\n'
    ),
    writeFile(
      `${root}/vite.config.ts`,
      "web/vite",
      'import { fileURLToPath, URL } from "node:url";\nimport react from "@vitejs/plugin-react";\nimport { defineConfig } from "vite";\n\nexport default defineConfig({\n  plugins: [react()],\n  resolve: {\n    alias: {\n      "@": fileURLToPath(new URL("./src", import.meta.url))\n    }\n  }\n});\n'
    ),
    writeFile(
      `${root}/tsconfig.json`,
      "web/vite",
      `${JSON.stringify(
        {
          extends: "../../tsconfig.base.json",
          compilerOptions: {
            lib: ["ES2022", "DOM", "DOM.Iterable"],
            jsx: "react-jsx",
            noEmit: true,
            paths: { "@/*": ["./src/*"] }
          },
          include: ["src"],
          references: [{ path: "./tsconfig.node.json" }]
        },
        null,
        2
      )}\n`
    ),
    writeFile(
      `${root}/tsconfig.node.json`,
      "web/vite",
      `${JSON.stringify(
        {
          compilerOptions: { composite: true, module: "ESNext", moduleResolution: "Bundler", noEmit: true },
          include: ["vite.config.ts"]
        },
        null,
        2
      )}\n`
    ),
    writeFile(
      `${root}/src/main.tsx`,
      "web/vite",
      'import { StrictMode } from "react";\nimport { createRoot } from "react-dom/client";\nimport App from "./App";\nimport "./index.css";\n\ncreateRoot(document.getElementById("root")!).render(\n  <StrictMode>\n    <App />\n  </StrictMode>\n);\n'
    ),
    writeFile(
      `${root}/src/App.tsx`,
      "web/vite",
      'export default function App() {\n  return <main>Stackkit app</main>;\n}\n'
    ),
    writeFile(`${root}/src/vite-env.d.ts`, "web/vite", '/// <reference types="vite/client" />\n')
  ];

  if (!withShadcn) {
    files.push(writeFile(`${root}/src/index.css`, "web/vite", ":root {\n  color-scheme: light;\n}\n"));
  }

  return files;
}
```

- [ ] **Step 4: Run → pass**

Run: `pnpm --filter @berkayorhan/stackkit-templates test web-vite`
Expected: PASS.

### Task 2.3 — `renderTanStackStartApp`

**Files:**
- Create: `packages/templates/src/web-tanstack-start.test.ts`
- Modify: `packages/templates/src/index.ts` (add `renderTanStackStartApp`, export it)

- [ ] **Step 1: Write the failing test**

```ts
// packages/templates/src/web-tanstack-start.test.ts
import { describe, expect, it } from "vitest";
import { renderTanStackStartApp } from "./index.js";

describe("renderTanStackStartApp", () => {
  it("renders a vite-plugin TanStack Start starter owned by web/tanstack-start", () => {
    const files = renderTanStackStartApp({ appName: "web", withShadcn: false });
    const paths = files.map((f) => f.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "apps/web/package.json",
        "apps/web/vite.config.ts",
        "apps/web/tsconfig.json",
        "apps/web/src/router.tsx",
        "apps/web/src/routes/__root.tsx",
        "apps/web/src/routes/index.tsx",
        "apps/web/.gitignore",
        "apps/web/src/styles/app.css"
      ])
    );
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
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `pnpm --filter @berkayorhan/stackkit-templates test web-tanstack-start`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add to `packages/templates/src/index.ts`:

```ts
type TanStackStartAppOptions = { appName: string; packageManagerField?: string; withShadcn?: boolean };

export function renderTanStackStartApp({ appName, packageManagerField, withShadcn = false }: TanStackStartAppOptions): FileOperation[] {
  const root = `apps/${appName}`;
  const packageJson: Record<string, unknown> = {
    name: `@acme/${appName}`,
    private: true,
    type: "module",
    scripts: {
      dev: "vite dev",
      build: "vite build",
      start: "node .output/server/index.mjs",
      test: "vitest run --passWithNoTests",
      typecheck: "tsc --noEmit",
      lint: "eslint src",
      format: "prettier --write ."
    },
    dependencies: {
      "@tanstack/react-router": "^1.95.0",
      "@tanstack/react-start": "^1.95.0",
      react: "^19.0.0",
      "react-dom": "^19.0.0"
    },
    devDependencies: {
      "@types/react": "^19.0.0",
      "@types/react-dom": "^19.0.0",
      "@vitejs/plugin-react": "^4.3.4",
      nitro: "^2.10.0",
      typescript: "^5.9.3",
      vite: "^6.0.0"
    }
  };
  if (packageManagerField) {
    packageJson.packageManager = packageManagerField;
  }

  const files = [
    writeFile(`${root}/package.json`, "web/tanstack-start", `${JSON.stringify(packageJson, null, 2)}\n`),
    writeFile(
      `${root}/vite.config.ts`,
      "web/tanstack-start",
      'import { tanstackStart } from "@tanstack/react-start/plugin/vite";\nimport viteReact from "@vitejs/plugin-react";\nimport { defineConfig } from "vite";\n\nexport default defineConfig({\n  server: { port: 3000 },\n  plugins: [tanstackStart(), viteReact()]\n});\n'
    ),
    writeFile(
      `${root}/tsconfig.json`,
      "web/tanstack-start",
      `${JSON.stringify(
        {
          extends: "../../tsconfig.base.json",
          compilerOptions: {
            lib: ["ES2022", "DOM", "DOM.Iterable"],
            jsx: "react-jsx",
            moduleResolution: "Bundler",
            noEmit: true,
            paths: { "@/*": ["./src/*"] }
          },
          include: ["src"]
        },
        null,
        2
      )}\n`
    ),
    writeFile(
      `${root}/src/router.tsx`,
      "web/tanstack-start",
      'import { createRouter as createTanStackRouter } from "@tanstack/react-router";\nimport { routeTree } from "./routeTree.gen";\n\nexport function createRouter() {\n  return createTanStackRouter({ routeTree, scrollRestoration: true });\n}\n\ndeclare module "@tanstack/react-router" {\n  interface Register {\n    router: ReturnType<typeof createRouter>;\n  }\n}\n'
    ),
    writeFile(
      `${root}/src/routes/__root.tsx`,
      "web/tanstack-start",
      'import { Outlet, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";\nimport type { ReactNode } from "react";\n\nexport const Route = createRootRoute({\n  head: () => ({\n    meta: [\n      { charSet: "utf-8" },\n      { name: "viewport", content: "width=device-width, initial-scale=1" },\n      { title: "Stackkit app" }\n    ]\n  }),\n  component: RootComponent\n});\n\nfunction RootComponent() {\n  return (\n    <RootDocument>\n      <Outlet />\n    </RootDocument>\n  );\n}\n\nfunction RootDocument({ children }: Readonly<{ children: ReactNode }>) {\n  return (\n    <html>\n      <head>\n        <HeadContent />\n      </head>\n      <body>\n        {children}\n        <Scripts />\n      </body>\n    </html>\n  );\n}\n'
    ),
    writeFile(
      `${root}/src/routes/index.tsx`,
      "web/tanstack-start",
      'import { createFileRoute } from "@tanstack/react-router";\n\nexport const Route = createFileRoute("/")({\n  component: Home\n});\n\nfunction Home() {\n  return <main>Stackkit app</main>;\n}\n'
    ),
    writeFile(`${root}/.gitignore`, "web/tanstack-start", ".output\n.nitro\n.tanstack\nsrc/routeTree.gen.ts\n")
  ];

  if (!withShadcn) {
    files.push(writeFile(`${root}/src/styles/app.css`, "web/tanstack-start", ":root {\n  color-scheme: light;\n}\n"));
  }

  return files;
}
```

Note: `routeTree.gen.ts` is generated by the TanStack Start Vite plugin and is git-ignored (per spec §10). `router.tsx` references it; this compiles once the dev server has run, which matches the "no generated-app build in CI" non-goal (spec §11).

- [ ] **Step 4: Run → pass**

Run: `pnpm --filter @berkayorhan/stackkit-templates test`
Expected: PASS (all templates tests, incl. unchanged Next snapshot).

**M2 CHECKPOINT:** `pnpm --filter @berkayorhan/stackkit-templates test` + `... typecheck` green → milestone review → M3.

---

## Milestone 3 — Core: `ui` axis, resolver consolidation, renderCreateFiles wiring

Files: `packages/core/src/module-graph.ts`, `packages/core/src/customizer.ts`, `packages/core/src/create.ts`; tests `packages/core/src/module-graph.test.ts`, `packages/core/src/customizer-browser.test.ts`, `packages/core/src/create-plan.test.ts`, new `packages/core/src/ui-axis.test.ts`.
Test cmd: `pnpm --filter @berkayorhan/stackkit-core test`

### Task 3.1 — `ui` axis in `resolveStackAxes`

**Files:**
- Create: `packages/core/src/ui-axis.test.ts`
- Modify: `packages/core/src/module-graph.ts` (add `ui` to `StackAxes`; rewrite the web/UI append block at :65-79)

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/ui-axis.test.ts
import { describe, expect, it } from "vitest";
import { resolveStackAxes } from "./module-graph.js";
import { builtinModules } from "@berkayorhan/stackkit-registry";

const mods = builtinModules;

describe("ui axis", () => {
  it("defaults to shadcn for any react web framework", () => {
    expect(resolveStackAxes({ web: "vite" }, mods)).toContain("ui/shadcn");
    expect(resolveStackAxes({ web: "tanstack" }, mods)).toContain("ui/shadcn");
    expect(resolveStackAxes({ web: "next" }, mods)).toContain("ui/shadcn");
  });

  it("opts out with --ui none", () => {
    expect(resolveStackAxes({ web: "next", ui: "none" }, mods)).not.toContain("ui/shadcn");
    expect(resolveStackAxes({ web: "vite", ui: "none" }, mods)).not.toContain("ui/shadcn");
  });

  it("swaps to tailwind with --ui tailwind", () => {
    const resolved = resolveStackAxes({ web: "vite", ui: "tailwind" }, mods);
    expect(resolved).toContain("ui/tailwind");
    expect(resolved).not.toContain("ui/shadcn");
  });

  it("still appends workspace + eslint foundation for react web frameworks", () => {
    const resolved = resolveStackAxes({ web: "vite", ui: "none" }, mods);
    expect(resolved).toEqual(expect.arrayContaining(["workspace/pnpm-turbo", "workspace/typescript", "web/vite", "quality/eslint"]));
  });

  it("resolves vite with vercel deploy (web-app capability)", () => {
    expect(() =>
      resolveStackAxes({ web: "vite", ui: "none", deploy: ["vercel"] }, mods)
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run → fail**

Run: `pnpm --filter @berkayorhan/stackkit-core test ui-axis`
Expected: FAIL (`ui` unknown / vite defaults missing).

- [ ] **Step 3: Implement**

In `packages/core/src/module-graph.ts`:

(a) Add `ui?: string;` to the `StackAxes` type (after `dbProvider`).

(b) Replace the web/ShadCN block (currently :65-79) with a generalized version:

```ts
  const web = axes.web ? resolveModuleAlias(axes.web, modules) : undefined;
  const webModule = web ? modules.find((module) => module.id === web) : undefined;
  const webProvidesReact = webModule?.provides?.includes("react") ?? false;

  if (web) {
    if (webProvidesReact) {
      appendExistingModules(resolved, modules, ["workspace/pnpm-turbo", "workspace/typescript", web]);
      appendUiModule(resolved, modules, axes.ui, web);
      appendExistingModules(resolved, modules, ["quality/eslint"]);
    } else {
      appendModule(resolved, web);
    }
  }
```

Remove the now-dead `hasNext` constant usages for the UI append (keep `hasNext` only where auth still needs it — see note below). Add the helper:

```ts
function appendUiModule(
  resolved: string[],
  modules: readonly StackkitModule[],
  ui: string | undefined,
  web: string
): void {
  if (ui === "none") {
    return;
  }
  if (ui) {
    appendModule(resolved, resolveModuleAlias(ui, modules));
    return;
  }
  // Default UI for react web frameworks preserves the historical next+shadcn behavior.
  appendExistingModules(resolved, modules, ["ui/shadcn"]);
}
```

Note on `hasNext`: the auth block (`appendAuthProvider`, module-graph.ts:99-101, 177-202) still keys on `hasNext` for `auth/auth0-nextjs`. Keep `const hasNext = web === "web/nextjs";` for that path; only the UI append moves to `appendUiModule`. Verify the ordering still yields `web/nextjs` before `ui/shadcn` before `quality/eslint` (preserves create.ts ShadCN-before-web file ordering via the module graph's requirement ordering, which is independent — ordering in `resolved` here feeds `resolveModuleGraph` which re-orders by `requires`/`provides`).

- [ ] **Step 4: Run → pass**

Run: `pnpm --filter @berkayorhan/stackkit-core test ui-axis`
Expected: PASS. Also run the existing `module-graph.test.ts` and `module-aliases.test.ts` — Expected: PASS (no regressions; `--web next` still yields shadcn).

### Task 3.2 — Consolidate the duplicated resolver in customizer.ts

**Files:**
- Modify: `packages/core/src/customizer.ts` (delete duplicated `StackAxes`, `resolveStackAxes`, `resolveModuleGraph`, `resolveModuleAlias`, and the private helpers `normalizeSingleAuth`, `appendDatabaseClient`, `resolveDatabaseClientAlias`, `appendAuthProvider`, `resolveDeploymentModules`, `appendExistingModules`, `hasModule`, `appendModule`, `expandPresetModules`, `dedupeModules`, `orderModulesByRequirements`, `validateModuleRequirements`, `validateModuleConflicts`, `validateAuthProviderConflicts`, `authProviderKey`; re-export the shared ones from `./module-graph.js`)
- Verify: `packages/core/src/customizer-browser.test.ts` stays green

- [ ] **Step 1: Confirm the guard test exists / strengthen it**

Read `packages/core/src/customizer-browser.test.ts`. Ensure it asserts the `/customizer` entry imports no `node:` builtins. If it does not already, add an assertion importing `./customizer.js` and checking `resolveStackAxes` is callable with `{ web: "vite", ui: "none" }` returning the same result as `module-graph.ts`. (This is the consolidation regression guard.)

```ts
import { resolveStackAxes as fromCustomizer } from "./customizer.js";
import { resolveStackAxes as fromGraph } from "./module-graph.js";
import { builtinModules } from "@berkayorhan/stackkit-registry";

it("customizer re-exports the single resolveStackAxes implementation", () => {
  const axes = { web: "vite", ui: "none" } as const;
  expect(fromCustomizer(axes, builtinModules)).toEqual(fromGraph(axes, builtinModules));
});
```

- [ ] **Step 2: Run → (may already pass for equality; will fail if customizer's copy diverges, e.g. dbProvider)**

Run: `pnpm --filter @berkayorhan/stackkit-core test customizer-browser`
Expected: FAIL or drift on a `dbProvider`/`ui` case (customizer copy is stale).

- [ ] **Step 3: Implement — replace duplication with re-exports**

In `packages/core/src/customizer.ts`, remove the duplicated `StackAxes` type, `resolveStackAxes`, `resolveModuleGraph`, `resolveModuleAlias`, and every private resolver helper listed above. Replace the import block / add re-exports:

```ts
export {
  resolveModuleAlias,
  resolveModuleGraph,
  resolveStackAxes,
  type StackAxes,
  type ResolveModuleGraphOptions
} from "./module-graph.js";
```

Keep customizer-specific code only: `CustomizerCatalogChoice`, `CustomizerCatalog`, `buildCustomizerCatalog`, `compareCatalogChoices`, `defineModule`, `definePreset`, `encodeRecipe`, `decodeRecipe`, `toBase64Url`, `fromBase64Url`. Confirm `module-graph.ts` exports `ResolveModuleGraphOptions` and `StackAxes` (it does at :8 and :15); if `resolveModuleAlias`/`resolveStackAxes`/`resolveModuleGraph` are not yet exported by name from customizer's consumers, they are exported from module-graph.ts (:41, :59, :243).

Verify the `/customizer` entry remains node-free: `module-graph.ts` imports only `@berkayorhan/stackkit-schemas`.

- [ ] **Step 4: Run → pass**

Run: `pnpm --filter @berkayorhan/stackkit-core test`
Expected: PASS (customizer-browser, customizer-catalog, module-graph all green).

### Task 3.3 — Wire Vite/TanStack into `renderCreateFiles` with CSS coordination

**Files:**
- Modify: `packages/core/src/create.ts` (imports at :4-13; `renderCreateFiles` ShadCN block :219-221 and add web blocks after :230)
- Modify: `packages/core/src/create-plan.test.ts` (add Vite/TanStack/`--ui none` file-plan cases)

- [ ] **Step 1: Write the failing test**

Add to `packages/core/src/create-plan.test.ts` (use the existing create-plan harness pattern; build a config with modules `["workspace/pnpm-turbo","workspace/typescript","web/vite","ui/shadcn","quality/eslint"]`):

```ts
it("renders a Vite app with shadcn owning the single index.css", () => {
  const plan = createCreatePlan(viteShadcnInput()); // helper mirroring existing next input builders
  const paths = plan.filePlan.files.map((f) => f.path);
  expect(paths).toContain("apps/web/vite.config.ts");
  expect(paths).toContain("apps/web/components.json");
  const indexCss = plan.filePlan.files.filter((f) => f.path === "apps/web/src/index.css");
  expect(indexCss).toHaveLength(1);
  expect(indexCss[0].owner).toBe("ui/shadcn"); // shadcn owns it, vite omitted its own
});

it("renders a Vite app that owns its own index.css when shadcn absent", () => {
  const plan = createCreatePlan(viteNoUiInput()); // modules without ui/shadcn
  const indexCss = plan.filePlan.files.filter((f) => f.path === "apps/web/src/index.css");
  expect(indexCss).toHaveLength(1);
  expect(indexCss[0].owner).toBe("web/vite");
  expect(plan.filePlan.files.some((f) => f.path === "apps/web/components.json")).toBe(false);
});

it("renders TanStack Start routes", () => {
  const plan = createCreatePlan(tanstackInput());
  const paths = plan.filePlan.files.map((f) => f.path);
  expect(paths).toContain("apps/web/src/routes/__root.tsx");
  expect(paths).toContain("apps/web/src/router.tsx");
});
```

(Implement `viteShadcnInput`/`viteNoUiInput`/`tanstackInput` as small local helpers copying the shape of the file's existing `createCreatePlan` inputs.)

- [ ] **Step 2: Run → fail**

Run: `pnpm --filter @berkayorhan/stackkit-core test create-plan`
Expected: FAIL (vite files absent).

- [ ] **Step 3: Implement**

In `packages/core/src/create.ts`:

(a) Extend the templates import (`:4-13`) with `renderTanStackStartApp, renderViteApp`.

(b) Replace the ShadCN block (`:219-221`) and add the web blocks. Compute framework + withShadcn once:

```ts
  const hasShadcn = selectedModuleIds.has("ui/shadcn");
  const webFramework: "nextjs" | "vite" | "tanstack-start" | undefined =
    selectedModuleIds.has("web/nextjs")
      ? "nextjs"
      : selectedModuleIds.has("web/vite")
        ? "vite"
        : selectedModuleIds.has("web/tanstack-start")
          ? "tanstack-start"
          : undefined;

  if (hasShadcn) {
    appendSelectedFileOperations(
      operations,
      seenPaths,
      renderShadcnUi({ appName: "web", framework: webFramework ?? "nextjs" }),
      selectedModuleIds
    );
  }

  if (selectedModuleIds.has("web/nextjs")) {
    appendSelectedFileOperations(
      operations,
      seenPaths,
      renderNextjsApp({ appName: "web", packageManagerField: packageManager.packageManagerField }),
      selectedModuleIds
    );
  }

  if (selectedModuleIds.has("web/vite")) {
    appendSelectedFileOperations(
      operations,
      seenPaths,
      renderViteApp({ appName: "web", packageManagerField: packageManager.packageManagerField, withShadcn: hasShadcn }),
      selectedModuleIds
    );
  }

  if (selectedModuleIds.has("web/tanstack-start")) {
    appendSelectedFileOperations(
      operations,
      seenPaths,
      renderTanStackStartApp({ appName: "web", packageManagerField: packageManager.packageManagerField, withShadcn: hasShadcn }),
      selectedModuleIds
    );
  }
```

ShadCN is appended first (unchanged ordering), so when present it owns the CSS path and the framework renderer (called with `withShadcn: true`) omits its own — exactly one writer per path. `appendSelectedFileOperations` keeps the `ui/shadcn`-owned CSS because `ui/shadcn` is in `selectedModuleIds`.

- [ ] **Step 4: Run → pass**

Run: `pnpm --filter @berkayorhan/stackkit-core test`
Expected: PASS (all core tests).

**M3 CHECKPOINT:** `pnpm --filter @berkayorhan/stackkit-core test` + `... typecheck` green; `pnpm --filter @berkayorhan/stackkit-templates build` (core depends on templates dist) → milestone review → M4.

---

## Milestone 4 — CLI: `--ui` flag + threading

Files: `packages/cli/src/index.ts`; tests `packages/cli/src/*.test.ts` (the create-axes test file).
Test cmd: `pnpm --filter @berkayorhan/stackkit test`

### Task 4.1 — Thread `--ui` through create

**Files:**
- Modify: `packages/cli/src/index.ts` (option at :92-114; `CreateCommandOptions` :552-573; `CreateAxisOptions` :604-612; axes mapping :124-132; `hasCreateAxes` :730-740; `resolveCreateAxisModules` :711-728)
- Modify: the CLI create test (search for the test exercising `resolveCreateAxisModules`/`--web`)

- [ ] **Step 1: Write the failing test**

Add a CLI-level test asserting `createDryRunPlanFromConfig({ name: "x", axes: { web: "vite", ui: "none" } })` produces a plan whose modules exclude `ui/shadcn`, and `{ web: "vite" }` includes it:

```ts
it("threads --ui none through create axes", async () => {
  const plan = await createDryRunPlanFromConfig({ name: "demo", axes: { web: "vite", ui: "none" } });
  expect(plan.modules.map((m) => m.id)).not.toContain("ui/shadcn");
  expect(plan.modules.map((m) => m.id)).toContain("web/vite");
});
```

- [ ] **Step 2: Run → fail**

Run: `pnpm --filter @berkayorhan/stackkit test`
Expected: FAIL (`ui` not on axes type / not threaded).

- [ ] **Step 3: Implement**

In `packages/cli/src/index.ts`:
- Add `.option("--ui <alias>", "UI layer alias. (shadcn, tailwind, none)")` after `--web` (:102).
- Add `ui?: string;` to `CreateCommandOptions` (:552) and `CreateAxisOptions` (:604).
- Add `ui: options.ui,` to the axes object in the create action (:124-132).
- Add `ui: axes.ui,` to the `resolveStackAxes` call in `resolveCreateAxisModules` (:716-727).
- Add `axes.ui` to the `hasCreateAxes` OR-chain (:731-739): `axes.web || ... || axes.ui || ...`.

- [ ] **Step 4: Run → pass**

Run: `pnpm --filter @berkayorhan/stackkit test`
Expected: PASS.

**M4 CHECKPOINT:** `pnpm --filter @berkayorhan/stackkit test` + `... typecheck` green → milestone review → M5.

---

## Milestone 5 — Verify + live E2E

Files: `docs/status.md`.
Test cmd: root `pnpm test`, `pnpm typecheck`, `pnpm build`.

### Task 5.1 — Full workspace verification

- [ ] **Step 1:** Run `pnpm build` → Expected: all packages build, exit 0.
- [ ] **Step 2:** Run `pnpm typecheck` → Expected: exit 0.
- [ ] **Step 3:** Run `pnpm test` → Expected: exit 0; show summary.

### Task 5.2 — Live CLI end-to-end (real generated projects)

Use a temp dir under the OS temp root (PowerShell: `$env:TEMP`). Build first.

- [ ] **Step 1:** `node packages/cli/dist/index.js create vite-app --web vite -y --dir <temp>/vite-app`
  Expected: project created; assert `apps/web/vite.config.ts`, `apps/web/src/main.tsx`, and `apps/web/components.json` (with `"rsc": false`, `"css": "src/index.css"`) exist; `node packages/cli/dist/index.js doctor --dir <temp>/vite-app` → "Stackkit doctor passed".
- [ ] **Step 2:** `node packages/cli/dist/index.js create tanstack-app --web tanstack-start -y --dir <temp>/tanstack-app`
  Expected: `apps/web/src/routes/__root.tsx`, `apps/web/src/router.tsx` exist; doctor passes.
- [ ] **Step 3:** `node packages/cli/dist/index.js create next-plain --web next --ui none -y --dir <temp>/next-plain`
  Expected: NO `apps/web/components.json`; `apps/web/app/page.tsx` exists; doctor passes. (Configurable-ShadCN proof.)
- [ ] **Step 4:** `node packages/cli/dist/index.js create vite-preset --preset vite -y --dir <temp>/vite-preset`
  Expected: created; `components.json` present (preset bundles shadcn); doctor passes.

### Task 5.3 — Update status doc

- [ ] **Step 1:** Update `docs/status.md` frontend section: Stackkit now generates Next.js, Vite, and TanStack Start apps; ShadCN is a configurable `--ui` axis (default-on for React frameworks, `--ui none` to opt out, `--ui tailwind` to swap); note Docker remains Next-only.

**M5 CHECKPOINT:** root `pnpm test` + `pnpm typecheck` + `pnpm build` exit 0 (output shown); all four E2E projects generated and doctor-passing → ship contract satisfied.

---

## Self-review vs spec

- Spec §3.1 capability model ↔ Task 1.1 (provides arrays, no `nextjs-app` on new modules).
- Spec §3.2 pairwise conflicts ↔ Task 1.1 conflict assertions.
- Spec §3.3 deployment ↔ Task 3.1 vite+vercel test; Docker non-goal untouched.
- Spec §4 `ui` axis ↔ Task 3.1 (`appendUiModule`, default/none/tailwind) + Task 4.1 (CLI threading).
- Spec §5.1 Vite template ↔ Task 2.2; §5.2 TanStack ↔ Task 2.3; §5.3 framework-aware shadcn ↔ Task 2.1; §5.4 CSS ownership ↔ Task 2.2/2.3 `withShadcn` + Task 3.3 coordination.
- Spec §6 presets ↔ Task 1.2.
- Spec §7.3 consolidation ↔ Task 3.2; browser-safety guard ↔ Task 3.2 Step 1.
- Spec §7.4 CLI ↔ Task 4.1.
- Spec §8 testing ↔ tests in every task; E2E ↔ Task 5.2.
- Spec §10 routeTree.gen.ts ↔ Task 2.3 note + `.gitignore`.
- Spec §11 non-goals ↔ no Docker task; no generated-app install in E2E (doctor only).
