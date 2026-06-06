# Implementation Plan — Tooling Slots

Spec: [2026-06-06-tooling-slots-design.md](../specs/2026-06-06-tooling-slots-design.md) ·
Glossary: [docs/CONTEXT.md](../../CONTEXT.md) · [ADR-0001](../../adr/0001-tooling-choices-as-modules.md)

## Execution constraints (ship run, AFK)

- **Shared worktree.** A concurrent `frontend-frameworks` session edits `packages/registry/src/index.ts`
  and `packages/templates/src/index.ts` in this same checkout. Bias all new logic into **new files**;
  keep edits to those two `index.ts` files small and surgical, and **re-read each immediately before
  editing**. Never revert changes I didn't make.
- **No commits** (AFK). Leave changes in the working tree.
- TDD per task (red → green → refactor). **One** code review per milestone, no re-reviews.
- Done = whole plan + live E2E (default + Biome + pyright) passing.

## Slot capability names

`ts-lint ts-format ts-typecheck · py-lint py-format py-typecheck · rust-lint rust-format rust-typecheck`
Replace coarse `lint`/`format`/`python-quality`/`rust-quality` (verify nothing `requires` them first).

---

## Milestone 1 — Tooling catalog + derived Quality Modules (core, surfaced by registry)

> Catalog + builder live in **`packages/core/src/tooling.ts`** (NOT registry): core's gap-filling
> resolver needs them and core cannot import registry without a dependency cycle. Registry imports
> `buildQualityModules` from core and spreads the result into `builtinModules`.

New file `packages/core/src/tooling.ts`:
- `ToolingToolSpec` type + `toolingCatalog: ToolingToolSpec[]` (eslint, prettier, biome, tsc, ruff,
  mypy, pyright, clippy, rustfmt, cargo-check) with `language`, `slots`, `isDefault`, `title`,
  `description`, `aiSkills` (preserve existing local-guidance skills for eslint/prettier/ruff/cargo).
- `buildQualityModules(catalog)` → `StackkitModule[]`, deriving `provides` (slot caps),
  `requires` ([language cap]), `conflicts` (other same-language tools sharing ≥1 slot), `category: "quality"`.
- Helpers: `toolingDefaults(language, catalog)`, `slotCapabilitiesFor(spec)`, `languageOf(capability)`.

Tests `packages/registry/src/tooling.test.ts` (TDD first):
- exactly one default per (language, slot); biome conflicts eslint+prettier (both directions);
  ruff provides py-lint+py-format; mypy/pyright conflict; every module `requires` its language cap.

Edit `packages/registry/src/index.ts` (surgical): remove the 6 inline `quality/*` defineModule blocks
(eslint, prettier, ruff, cargo, plus add mypy/pyright/biome/tsc/clippy/rustfmt/cargo-check via catalog);
`import { buildQualityModules, toolingCatalog }` and spread `...buildQualityModules(toolingCatalog)`
into `builtinModules`. Keep `quality/pytest`, `quality/vitest` inline (not slots).

Capability rename: grep for `"lint"`, `"format"`, `"python-quality"`, `"rust-quality"` as `requires`;
none expected — confirm, then rename their `provides` to slot caps via the catalog.

Verify: `pnpm --filter @berkayorhan/stackkit-registry test` + `typecheck`.

## Milestone 2 — Gap-filling resolver + suppression (core)

Extend `packages/core/src/tooling.ts` (same file as M1):
- `applyDefaultTooling(modules, catalog)` → injects each present language's default tool into unfilled
  slots (language present = a module provides `typescript`/`python`/`rust`; slot filled = a present
  module provides that slot cap). Combined tools fill multiple slots. Injected modules are built via
  `buildQualityModules`, so it works even when `resolveModuleGraph` is called without `availableModules`.

Wire into BOTH duplicated resolvers — `core/module-graph.ts` `resolveModuleGraph` and
`core/customizer.ts` `resolveModuleGraph` — calling `applyDefaultTooling` after dedupe, before validate.
Remove the hardcoded `"quality/eslint"` append in BOTH `resolveStackAxes` copies (module-graph.ts ~L75,
customizer.ts ~L132).

Tests `packages/core/src/tooling.test.ts` (TDD first):
- nextjs → injects eslint+prettier+tsc; +biome explicit → biome only, tsc still injected, no conflict;
  fastapi → ruff+mypy; +pyright → ruff+pyright (no mypy); two explicit conflicting tools still throw;
  rust module present → rust tools injected (provide-only, no files).
- Update existing `module-graph.test.ts` / `create-plan.test.ts` expected module lists.

Verify: `pnpm --filter @berkayorhan/stackkit-core test` + `typecheck`.

## Milestone 3 — Tooling-aware renderers + config files (templates + core dispatch)

New file `packages/templates/src/tooling-configs.ts`: `renderEslintConfig`, `renderPrettierConfig`,
`renderBiomeConfig` (`biome.json`), `renderRuffConfig` (`ruff.toml`), `renderMypyConfig` (`mypy.ini`),
`renderPyrightConfig` (`pyrightconfig.json`). Each returns `FileOperation[]` owned by its module id.

Edit `packages/templates/src/index.ts` (surgical):
- `renderPnpmTurboFoundation` takes selected-tooling info; root `devDependencies` for eslint/prettier/
  typescript-eslint OR `@biomejs/biome` become conditional; **stop emitting** `eslint.config.mjs`/
  `prettier.config.mjs` here (moved to tooling-configs).
- `renderNextjsApp` takes tooling info; `lint`/`format`/`typecheck` scripts reflect eslint/prettier vs biome.
- `renderFastApiService` takes tooling info; pyproject dev group + `lint`/`format`/`typecheck` scripts
  reflect ruff + (mypy|pyright); **stop embedding** ruff config in pyproject (moved to ruff.toml).

Edit `packages/core/src/create.ts` `renderCreateFiles`: derive selected tooling from `selectedModuleIds`,
pass into foundation/nextjs/fastapi renderers, and dispatch per-tool config renderers (like nextjs/docker).

Tests (TDD first): per-config snapshots in `tooling-configs.test.ts`; update `web-nextjs.test.ts` and
foundation/fastapi tests for tool-aware scripts/deps; a `create`-level test asserting biome path drops
eslint config + a pyright path test.

Verify: `pnpm --filter @berkayorhan/stackkit-templates test`, `pnpm --filter @berkayorhan/stackkit-core test`.

## Milestone 4 — CLI flags + presets/examples/defaults

- `packages/cli/src/index.ts`: add `--ts-quality <eslint-prettier|biome>` and `--py-typecheck <mypy|pyright>`;
  map to module ids via the catalog; thread into the axes→modules resolution. Validate values.
- `packages/registry/src/index.ts` presets: add `quality/tsc` to TS presets, `quality/mypy` to Python
  presets, split `quality/cargo` → clippy/rustfmt/cargo-check in `next-axum-postgres-auth0`.
- `examples/*/stackkit.config.json`: add tooling modules explicitly.
- Update `presets.test.ts` and any CLI flag tests.

Verify: `pnpm --filter @berkayorhan/stackkit-cli test`; `node packages/cli/dist/index.js create demo --web next --api fastapi --db postgres --dry-run` after build.

## Milestone 5 — Web apps

- `apps/customizer`: Quality Modules now have `category: "quality"` → appear in catalog. Add tooling
  selections (TS lint+format, Py typecheck) that drive the shared resolver + recipe encoder; preview
  shows resolved tooling. No slot logic re-implemented in UI. Update its tests.
- `apps/docs`: `content/docs/cli-reference.mdx` documents `--ts-quality`/`--py-typecheck`; add/extend a
  tooling-slots section on the modules/registry page from verified CLI output.

Verify: `pnpm --filter @berkayorhan/stackkit-customizer test typecheck build`; docs `typecheck build`.

## Milestone 6 — Verification + E2E

- Root: `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm smoke`.
- E2E generate-and-run (gate tool availability like existing smoke does for `uv`):
  1. default `--web next --api fastapi --db postgres` → install, `pnpm typecheck`, `pnpm lint`, `pnpm format` pass; eslint/prettier/ruff/mypy configs present, no biome.
  2. `--ts-quality biome` → `biome.json` present, eslint/prettier gone, `pnpm typecheck`+`pnpm lint` pass.
  3. `--py-typecheck pyright` → `pyrightconfig.json` present, `mypy.ini` gone.
- Update `docs/status.md` tooling section.
