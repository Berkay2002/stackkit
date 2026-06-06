# Frontend Frameworks: Vite + TanStack Start + Configurable ShadCN — Design Spec

Date: 2026-06-06
Status: Approved
Scope owner: web framework axis (`web/*` modules, `ui/*` axis, templates, core resolution, CLI)

## 1. Problem

Stackkit generates exactly one frontend framework today: `web/nextjs`. The `--web` axis
hard-codes Next.js, and ShadCN is force-bundled whenever Next.js is selected
(`resolveStackAxes` always appends `ui/shadcn` when `hasNext`). This leaves two gaps:

1. **No framework choice.** Users cannot generate a Vite SPA or a TanStack Start app, even
   though both are first-class React starters and Stackkit is meant to be a multi-target
   generator platform, not a Next.js-only MVP.
2. **ShadCN is not configurable.** It is always coupled to Next.js — you cannot get Next.js
   without ShadCN, and there is no axis to swap or drop the UI layer.

This work adds `web/vite` and `web/tanstack-start` as managed modules with starter-depth
templates, and introduces a `ui` stack axis so ShadCN (and Tailwind) become an explicit,
swappable, opt-out-able choice across every React framework.

## 2. Scope

### In scope

- Two new registry modules: `web/vite`, `web/tanstack-start`, with aliases, capabilities,
  AI-skill metadata, and README layout.
- Two new starter templates: `renderViteApp` (matches `npm create vite@latest` React + TS)
  and `renderTanStackStartApp` (matches the current Vite-plugin TanStack Start starter).
- `renderShadcnUi` becomes **framework-aware** (correct `rsc` flag and CSS path per
  framework) so ShadCN renders correctly outside Next.js.
- A new `ui` stack axis (`--ui <alias>`) making ShadCN configurable: default-on for React
  frameworks (backward compatible), `--ui none` to opt out, `--ui tailwind` to swap.
- New presets bundling ShadCN: `vite`, `tanstack-start` (parity with the `next` preset).
- Consolidation of **only the pure graph functions** (`resolveStackAxes` /
  `resolveModuleGraph` / `resolveModuleAlias` / `StackAxes` / `ResolveModuleGraphOptions`)
  duplicated between `core/module-graph.ts` and `core/customizer.ts` into the single pure
  `module-graph.ts`, keeping the `/customizer` entry browser-safe (see §7.3 for the strict
  boundary).
- `renderCreateFiles` wiring for the new frameworks, including deterministic CSS-file
  ownership coordination.
- **Apps**: `apps/customizer` gains Vite/TanStack Start selectability and a UI choice
  (shadcn / tailwind / none); `apps/docs` documents the new frameworks and `--ui` flag.
- Full unit coverage at every layer plus a live CLI end-to-end check.

### Explicitly OUT of scope

- **Docker for the new frameworks.** `deploy/docker` requires the `nextjs-app` capability
  and its template renders a Next.js Dockerfile. Vite/TanStack Start do not provide
  `nextjs-app`; Docker stays Next-only this slice. (Vercel works — see §3.3.)
- **Installing or running the generated apps in CI.** Like the current Next.js starter, we
  verify deterministic file output + `doctor`, not `npm install` / `vite build` of the
  generated project.
- Deep app content (multi-route layouts, data fetching, example components). Starter-depth
  parity with the existing Next.js module only.
- Auth/database wiring specific to Vite or TanStack Start (e.g. TanStack Start server-side
  auth). Existing auth/db axes remain Next/FastAPI/Axum-oriented.
- Router choice for Vite (TanStack Router / React Router). Vite ships the plain
  `create vite` React + TS SPA, per product decision.

## 3. Architecture

The framework pieces follow the existing extension seam end-to-end:
`schemas` → `templates` → `registry` → `core` → `cli`. No new package, no new dependency
direction.

### 3.1 Capability model

| Module | requires | provides |
|--------|----------|----------|
| `web/nextjs` (existing) | `workspace/node` | `web-app`, `nextjs-app`, `react` |
| `web/vite` (new) | `workspace/node` | `web-app`, `react` |
| `web/tanstack-start` (new) | `workspace/node` | `web-app`, `react`, `ssr` |
| `ui/shadcn` (existing) | `react` | — |

`ui/shadcn` already requires only `react` (not `nextjs-app`), so it attaches to any React
framework with no module-graph change. The Next.js coupling lives entirely in the
**template** (`renderShadcnUi`) and in `resolveStackAxes`, both addressed here.

### 3.2 The three web frameworks conflict pairwise

Only one `web/*` app can occupy `apps/web`. Each new module declares
`conflicts: [<the other two web modules>]` so the module graph rejects two frontends at
once with a clear error, mirroring how auth providers are kept mutually exclusive.

### 3.3 Deployment compatibility

- `deploy/vercel` requires `web-app` → satisfied by all three frameworks. No change needed;
  add a test asserting `--web vite --deploy vercel` resolves.
- `deploy/docker` requires `nextjs-app` → unsatisfied by Vite/TanStack Start. Selecting it
  with a non-Next framework already throws `requires capability nextjs-app`. Documented
  non-goal; no behavior change.

## 4. The `ui` stack axis (configurable ShadCN)

A new optional axis makes the UI layer explicit. It lives alongside `web`, `api`, `db`,
`auth`, `with`, `deploy` in `StackAxes` and as `--ui <alias>` on `create`.

Resolution rules in `resolveStackAxes` (replacing the unconditional ShadCN append):

1. Resolve the selected `web` module. Compute `webProvidesReact` = the resolved web module
   provides `react`.
2. UI selection:
   - `--ui none` → append no UI module.
   - `--ui <alias>` (e.g. `shadcn`, `tailwind`) → resolve and append that module.
   - `--ui` omitted **and** `webProvidesReact` → default to `ui/shadcn` (preserves today's
     `--web next` behavior; extends it to `vite` and `tanstack-start`).
   - `--ui` omitted and no React web framework → no UI module.

This keeps the foundation modules (`workspace/pnpm-turbo`, `workspace/typescript`,
`quality/eslint`) appended for any React web framework, exactly as the `hasNext` branch does
today, generalized to all three.

Notes:
- Presets are unaffected — they list modules explicitly. The `next` preset still ships
  ShadCN; new `vite` / `tanstack-start` presets ship it too (§6).
- `ui/tailwind` already exists and provides `css`/`tailwind`; `--ui tailwind` is therefore a
  valid swap with no new module.
- **`--ui` only affects the axis-built module set.** The `--recipe` and `--config` create
  paths merge-add their declared modules (`cli/src/index.ts` `mergeModuleIds`) and never
  remove; `--ui none` therefore cannot strip a `ui/shadcn` already baked into a recipe code
  or config file. This is the existing axis-vs-recipe contract, documented here and in
  `docs/status.md` so it is not surprising.
- Backward-compat invariant: the `--web next` axis with default UI must produce the **exact
  same module list and order** as today's `hasNext` branch (`workspace/pnpm-turbo`,
  `workspace/typescript`, `web/nextjs`, `ui/shadcn`, `quality/eslint`). Note `quality/prettier`
  is **not** in the axis path today (only in presets) and must not be added.

## 5. Templates

All renderers are pure `(...options) => FileOperation[]`, owner-tagged, `overwrite: if-owned`,
matching `renderNextjsApp`. Paths root at `apps/web`.

### 5.1 `renderViteApp({ appName, packageManagerField })`

Mirrors `npm create vite@latest` with the **react-ts** template, trimmed to starter essentials
(no demo SVG/`App.css`, consistent with the Next.js starter's minimalism):

- `apps/web/package.json` — owner `web/vite`. Scripts: `dev: vite`, `build: vite build`,
  `preview: vite preview`, `test: vitest run --passWithNoTests`, `typecheck: tsc --noEmit`,
  `lint: eslint src`, `format: prettier --write .`. Deps `react`, `react-dom`; devDeps
  `@vitejs/plugin-react`, `vite`, `@types/react`, `@types/react-dom`, `typescript`.
- `apps/web/index.html` — owner `web/vite`. Root div + `module` script to `/src/main.tsx`.
- `apps/web/vite.config.ts` — owner `web/vite`. `@vitejs/plugin-react`, plus `@/* → ./src/*`
  resolve alias (so ShadCN aliases work).
- `apps/web/tsconfig.json` — owner `web/vite`. Extends `../../tsconfig.base.json`; `jsx:
  react-jsx`; `paths: { "@/*": ["./src/*"] }`; references `tsconfig.node.json`.
- `apps/web/tsconfig.node.json` — owner `web/vite`. For the Vite config file.
- `apps/web/src/main.tsx` — owner `web/vite`. Creates the React root, imports `./index.css`.
- `apps/web/src/App.tsx` — owner `web/vite`. Minimal `Stackkit app` component.
- `apps/web/src/vite-env.d.ts` — owner `web/vite`. `/// <reference types="vite/client" />`.
- `apps/web/src/index.css` — owner `web/vite`, **emitted only when ShadCN is absent**
  (see §5.4).

### 5.2 `renderTanStackStartApp({ appName, packageManagerField })`

Matches the current (Vite-plugin, post-vinxi) TanStack Start starter, verified against
TanStack Start docs:

- `apps/web/package.json` — owner `web/tanstack-start`. Scripts: `dev: vite dev`,
  `build: vite build`, `start: node .output/server/index.mjs`,
  `test: vitest run --passWithNoTests`, `typecheck: tsc --noEmit`, `lint`, `format`. Deps
  `@tanstack/react-router`, `@tanstack/react-start`, `react`, `react-dom`; devDeps `nitro`,
  `vite`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`, `typescript`.
- `apps/web/vite.config.ts` — owner `web/tanstack-start`. `tanstackStart()` **then**
  `viteReact()` (plugin order matters).
- `apps/web/src/router.tsx` — owner `web/tanstack-start`. `createRouter({ routeTree })`.
- `apps/web/src/routes/__root.tsx` — owner `web/tanstack-start`. `createRootRoute` with
  `HeadContent` + `Scripts` + `RootDocument`.
- `apps/web/src/routes/index.tsx` — owner `web/tanstack-start`. `createFileRoute('/')` home
  route rendering `Stackkit app`.
- `apps/web/tsconfig.json` — owner `web/tanstack-start`. Extends base; `jsx: react-jsx`;
  `paths: { "@/*": ["./src/*"] }`.
- `apps/web/src/styles/app.css` — owner `web/tanstack-start`, **emitted only when ShadCN is
  absent** (see §5.4).

`routeTree.gen.ts` is generated by the TanStack Start Vite plugin at dev/build time and is
not hand-emitted; it is added to the app `.gitignore`. (Final handling — seed file vs. pure
gitignore — is an open implementation detail, §10.)

### 5.3 `renderShadcnUi({ appName, framework })` — framework-aware

`framework: "nextjs" | "vite" | "tanstack-start"`, defaulting to `"nextjs"` so existing call
sites and snapshots are unchanged. Emits `apps/web/components.json` (owner `ui/shadcn`) with
per-framework values, plus the CSS entry file it owns:

| framework | `rsc` | `tailwind.css` | CSS file emitted by ShadCN |
|-----------|-------|----------------|----------------------------|
| `nextjs` | `true` | `app/globals.css` | `apps/web/app/globals.css` (unchanged) |
| `vite` | `false` | `src/index.css` | `apps/web/src/index.css` |
| `tanstack-start` | `false` | `src/styles/app.css` | `apps/web/src/styles/app.css` |

The emitted CSS file contains `@import "tailwindcss";`. Aliases (`@/components`,
`@/lib/utils`) are unchanged across frameworks.

### 5.4 CSS-file ownership coordination

Exactly one module must own each CSS path. `renderCreateFiles` knows whether `ui/shadcn` is
selected, so it coordinates:

- **ShadCN present**: ShadCN owns the framework's CSS entry (§5.3). The framework renderer is
  called with `withShadcn: true` and **does not** emit its CSS file. The framework entry still
  imports the same path (e.g. `main.tsx` imports `./index.css`), which ShadCN provides.
- **ShadCN absent**: the framework renderer (`withShadcn: false`) emits its own base CSS at
  that path (a minimal reset), so the app is self-contained.

Either way the import path is stable and single-owned. Next.js keeps its current behavior
(its `layout.tsx` does not import `globals.css`, so no coordination flag is needed for Next —
ShadCN owns `app/globals.css` exactly as today). This scopes the new coordination to the two
new frameworks and leaves the Next.js manifest/ownership untouched.

**Derivation invariant (load-bearing for doctor/diff).** `renderCreateFiles` must derive
both `framework` and `withShadcn` **purely from the selected module ID set**
(`selectedModuleIds.has("web/vite")`, `…has("ui/shadcn")`) — never from a module's `provides`
capabilities or from config options. `buildExpectedManagedFilePlan` (`create.ts`) reconstructs
the expected file plan from the manifest via `manifestModuleToStackkitModule`, which yields
modules carrying only `id/version/title/description` (no `provides`). Keying off module IDs
ensures doctor/diff reconstruction reproduces byte-identical files. §8 adds an explicit
reconstruction-equality test for a `--web vite` project.

## 6. Registry: modules and presets

New modules (abbreviated; full shape mirrors `web/nextjs`):

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
  readme: { stack: ["Vite", "React"], layout: [{ path: "apps/web", description: "Vite React SPA" }] },
  aiSkills: [/* local Vite guidance — no verified official skill source */]
})

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
  readme: { stack: ["TanStack Start", "React"], layout: [{ path: "apps/web", description: "TanStack Start app" }] },
  aiSkills: [/* local TanStack guidance — no verified official skill source */]
})
```

`web/nextjs` gains the reciprocal `conflicts: ["web/vite", "web/tanstack-start"]`.

AI-skill sources must be verified before being recorded (per AGENTS.md). Absent a verified
official/curated source for Vite or TanStack Start, both ship `trust: "local"` guidance
entries; upgrading to an official source is a follow-up.

New presets (ShadCN-bundled, parity with `next`):

```ts
definePreset({ id: "vite", title: "Vite",
  description: "A pnpm and Turborepo workspace with a Vite React app and ShadCN UI",
  modules: ["workspace/pnpm-turbo", "workspace/typescript", "web/vite", "ui/shadcn", "quality/eslint", "quality/prettier"] })

definePreset({ id: "tanstack-start", title: "TanStack Start",
  description: "A pnpm and Turborepo workspace with a TanStack Start app and ShadCN UI",
  modules: ["workspace/pnpm-turbo", "workspace/typescript", "web/tanstack-start", "ui/shadcn", "quality/eslint", "quality/prettier"] })
```

## 7. Surfaces

### 7.1 Schemas (`packages/schemas`)

No schema change required. `StackAxes` is a core type (not a Zod schema); module IDs already
permit `web/*` and `ui/*`. `moduleIdSchema` accepts the new IDs as-is.

### 7.2 Templates (`packages/templates/src/index.ts`)

Add `renderViteApp`, `renderTanStackStartApp`; extend `renderShadcnUi` signature with
`framework` and the per-framework table (§5.3); add `withShadcn` to the Vite/TanStack option
types (§5.4). Export the two new renderers.

### 7.3 Core resolution (`packages/core`)

- `module-graph.ts`: add `ui?: string` to `StackAxes`; replace the `hasNext` UI append with
  the §4 `ui`-axis logic generalized to any React web framework.
- `customizer.ts`: delete **only** its duplicated pure-graph code — `resolveStackAxes`,
  `resolveModuleGraph`, `resolveModuleAlias`, the `StackAxes` / `ResolveModuleGraphOptions`
  types, and the private graph helpers (`normalizeSingleAuth`, `appendDatabaseClient`,
  `resolveDatabaseClientAlias`, `appendAuthProvider`, `resolveDeploymentModules`,
  `appendExistingModules`, `hasModule`, `appendModule`, `expandPresetModules`,
  `dedupeModules`, `orderModulesByRequirements`, `validateModuleRequirements`,
  `validateModuleConflicts`, `validateAuthProviderConflicts`, `authProviderKey`) — and
  **re-export the graph symbols from `./module-graph.js`** (safe: it imports only
  `@berkayorhan/stackkit-schemas`).

  **Strict boundary (do NOT collapse these):** `encodeRecipe`/`decodeRecipe`,
  `defineModule`/`definePreset`, and `buildCustomizerCatalog` MUST remain **local
  browser-safe implementations in `customizer.ts`**. They are deliberate reimplementations of
  Node-only siblings — `recipe.ts` uses `node:buffer` (`Buffer…base64url`) while
  `customizer.ts` uses `btoa`/`atob`/`TextEncoder`; `registry.ts` (`defineModule`) and
  `discovery.ts` (`buildCustomizerCatalog`) import `node:fs`/`node:path`. Re-exporting these
  five from the Node-side modules would pull `node:*` into the `/customizer` bundle and break
  the browser entry. Only the pure graph symbols may be re-exported.

  Live `/customizer` consumers that must keep working: `registry/src/index.ts:1`
  (`defineModule`, `definePreset`), `apps/customizer` (`buildCustomizerCatalog`,
  `encodeRecipe`, `decodeRecipe`, `resolveModuleGraph`, `resolveStackAxes`,
  `CustomizerCatalog`), and `customizer-browser.test.ts`.
- `create.ts` `renderCreateFiles`: derive `framework` and `withShadcn` from the selected
  module set; call `renderShadcnUi({ appName: "web", framework })`; add `web/vite` and
  `web/tanstack-start` blocks calling their renderers with `withShadcn`.

### 7.4 CLI (`packages/cli/src/index.ts`)

Add `--ui <alias>` to `create`; add `ui` to `CreateCommandOptions`, `CreateAxisOptions`,
`createDryRunPlanFromConfig` axes, `hasCreateAxes`, and `resolveCreateAxisModules` →
`resolveStackAxes`. `--ui` is honored on the **axis-built path only** (§4 note); the
`--recipe` and `--config` paths are unchanged (merge-add semantics).

### 7.5 Apps (`apps/customizer`, `apps/docs`)

**`apps/customizer`** (`@berkayorhan/stackkit-customizer`). The app hard-codes its own
choice state machine (it does not yet drive the UI off `buildCustomizerCatalog`). Changes,
confined to `src/stackkit-customizer.ts`, `app/page.tsx`, and their tests:

- `WebChoice` (`stackkit-customizer.ts:12`) gains `"vite" | "tanstack"`; `webModule()`
  (`:169-175`) maps `vite → "vite"`, `tanstack → "tanstack"`.
- New `UiChoice = "shadcn" | "tailwind" | "none"` and a `ui` field on `CustomizerState`
  (default `"shadcn"`, set in `createInitialCustomizerState`).
- `resolveStateModuleIds` (`:141-163`) threads `ui: uiModule(state.ui)` into
  `resolveStackAxes` — which now understands the axis because of the §7.3 consolidation, so
  no app-side resolution logic is duplicated.
- `app/page.tsx`: add `vite`/`tanstack` entries to `webChoices` and a `uiChoices` grid
  (single-select: ShadCN / Tailwind / None) rendered in the "Application shape" section.
  Icons: reuse `simple-icons` (`siVite`; if no TanStack brand icon is exported, fall back to
  the existing `iconLabel` text path — `ChoiceIcon` already degrades to text). No icon-key →
  SVG registry is introduced (out of scope; the app keeps its hard-coded `simple-icons`
  imports).
- `isDeployChoiceSupported` (`:81-87`) is unchanged: Docker stays gated to `web === "nextjs"`
  (matches the §2 Docker non-goal); Vercel stays gated to `web !== "none"` so Vite/TanStack
  get Vercel.

**`apps/docs`** (`@berkayorhan/stackkit-docs`, hand-written MDX, no registry auto-sync):

- `content/docs/cli-reference.mdx`: document `--ui <shadcn|tailwind|none>`; add `--web vite`
  and `--web tanstack` examples; note ShadCN is now optional via `--ui`.
- `content/docs/getting-started.mdx`: add a Vite and a TanStack Start example; mention the UI
  choice.
- `content/docs/index.mdx`: status line updated to list Next.js, Vite, and TanStack Start as
  generated web apps.

## 8. Testing

### Unit

- **registry**: `web/vite` and `web/tanstack-start` present; aliases unique
  (`vite`, `tanstack`, `tanstack-start`); both provide `web-app`+`react`; pairwise
  `conflicts` reject two web frameworks; new `vite`/`tanstack-start` presets resolve via the
  existing "every preset resolves" test.
- **templates**: `web-vite.test.ts` and `web-tanstack-start.test.ts` assert key files,
  owners, and `withShadcn` CSS toggling; `renderShadcnUi` produces correct `rsc`/css per
  framework (extend existing ShadCN test).
- **core**: `resolveStackAxes` — default ShadCN for `--web vite`/`--web tanstack-start`;
  `--ui none` drops it; `--ui tailwind` swaps it; `--web vite --deploy vercel` resolves;
  pairwise web conflict throws. **Backward-compat lock:** assert `resolveStackAxes({ web:
  "next" })` returns the exact same module list **and order** as before the generalization
  (`workspace/pnpm-turbo`, `workspace/typescript`, `web/nextjs`, `ui/shadcn`, `quality/eslint`
  — no `quality/prettier`). `renderCreateFiles` emits Vite/TanStack files with correct single
  CSS owner under ShadCN-present and ShadCN-absent.
- **doctor reconstruction**: assert `buildExpectedManagedFilePlan` (manifest reconstruction,
  modules without `provides`) reproduces the same file plan as `renderCreateFiles` for a
  `--web vite` + ShadCN project — proving `framework`/`withShadcn` derive from module IDs
  (§5.4 invariant).
- **consolidation**: a regression test asserts `customizer.resolveStackAxes` and
  `module-graph.resolveStackAxes` return identical output. **Browser-safety guard (new):** a
  static check that the built `dist/customizer.js` contains no `node:` import specifiers — the
  existing `customizer-browser.test.ts` runs under a Node env and would NOT fail on a leaked
  `node:*` import, so a build-output scan (or a Node-builtin-stubbed environment) is added as
  the real guard.
- **customizer app** (`apps/customizer`): `buildCustomizerState` with `web: "vite"` includes
  `web/vite`; with `ui: "none"` excludes `ui/shadcn`; with `ui: "tailwind"` includes
  `ui/tailwind`; existing default-Next test updated to reflect the explicit `ui` default.

### E2E

Live CLI run (built `packages/cli/dist/index.js`) generating real projects into a temp dir:

1. `create vite-app --web vite -y` → `apps/web/vite.config.ts`, `src/main.tsx`,
   ShadCN `components.json` (`rsc:false`, `src/index.css`) exist; `doctor` passes.
2. `create tanstack-app --web tanstack-start -y` → `src/routes/__root.tsx`, `src/router.tsx`
   exist; `doctor` passes.
3. `create next-plain --web next --ui none -y` → no `components.json`; Next files present;
   `doctor` passes (configurable-ShadCN proof).

### Commands

- `pnpm --filter @berkayorhan/stackkit-registry test`
- `pnpm --filter @berkayorhan/stackkit-templates test`
- `pnpm --filter @berkayorhan/stackkit-core test`
- `pnpm --filter @berkayorhan/stackkit test`
- Root: `pnpm test`, `pnpm typecheck`, `pnpm build`
- E2E: build, then run the three `create … --dry-run`/apply checks above.

## 9. Milestones

1. **Registry** — `web/vite`, `web/tanstack-start`, reciprocal conflicts, `vite`/
   `tanstack-start` presets; registry tests green.
2. **Templates** — `renderViteApp`, `renderTanStackStartApp`, framework-aware
   `renderShadcnUi`, `withShadcn` CSS coordination; template tests green.
3. **Core** — `ui` axis in `resolveStackAxes`; `customizer.ts` consolidation;
   `renderCreateFiles` wiring; core tests + `customizer-browser` green.
4. **CLI** — `--ui` flag threaded through to `resolveStackAxes`; CLI tests green.
5. **Apps** — `apps/customizer` Vite/TanStack/UI-choice; `apps/docs` `--ui` + framework
   docs; customizer tests green, both apps build + typecheck.
6. **Verify + E2E** — `pnpm test`/`typecheck`/`build`; live four-project E2E;
   update `docs/status.md`.

## 10. Open implementation details

- **TanStack `routeTree.gen.ts`**: emit a minimal seed file for a clean first typecheck, or
  rely purely on plugin generation + `.gitignore`. Default: `.gitignore` only (generated
  file is a build artifact), revisit if the E2E `doctor` path needs it.
- **Exact pinned versions** for new deps (`vite`, `@vitejs/plugin-react`,
  `@tanstack/*`, `nitro`) — pin in the plan to current majors, consistent with the repo's
  `react@^19` / `typescript@^5.9` pins.
- **Vite ESLint config**: reuse the workspace root `eslint.config.mjs` (as Next does) vs. a
  per-app config. Default: reuse root, `lint: eslint src`.

## 11. Non-goals / tech-debt ceiling

- No Docker support for Vite/TanStack Start (requires a generic `web-app` container template
  — separate slice).
- No generated-app dependency install or build in CI.
- No router/data/auth depth for the new frameworks beyond a compiling starter.
- ShadCN `components.json` is emitted correctly but `npx shadcn add` wiring (registry
  resolution, component install) remains a runtime user step, exactly as for Next today.

## Self-review vs spec

- §2 scope ↔ §9 milestones: registry (M1), templates (M2), core/axis/consolidation (M3),
  CLI (M4), verify/E2E (M5) — every in-scope item maps to a milestone.
- §4 `ui` axis ↔ §7.3 core ↔ §7.4 CLI ↔ §8 core tests — configurable ShadCN covered end to
  end including `--ui none` E2E proof.
- §5.4 CSS ownership ↔ §8 `renderCreateFiles` single-owner tests — the one real integration
  risk has explicit coverage.
- §3.3 deployment ↔ §8 `--web vite --deploy vercel` test and §11 Docker non-goal — no silent
  capability gap.
- §7.3 consolidation ↔ §8 parity test + build-output `node:` scan — dedup is verified and
  the browser boundary is statically guarded, not assumed. Strict boundary keeps
  recipe/define/catalog as local browser-safe impls.
- §7.5 apps ↔ §8 customizer-app tests ↔ §9 M5 — Vite/TanStack/UI-choice reach the visual
  composer and the docs, satisfying the "update apps/" requirement.
- §5.4 derivation invariant ↔ §8 doctor-reconstruction test — `framework`/`withShadcn`
  keyed off module IDs so manifest reconstruction stays byte-identical.
- §4 `--ui` recipe/config caveat ↔ §8 axis-path E2E (`--web next --ui none`) — the honored
  path is exercised; the merge-add limitation is documented, not silently assumed.
