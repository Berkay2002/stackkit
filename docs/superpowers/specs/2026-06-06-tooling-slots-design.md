# Tooling Slots — Configurable Lint / Format / Typecheck per Language

Date: 2026-06-06
Status: Approved design (ship run)
Glossary: [docs/CONTEXT.md](../../CONTEXT.md) · Decision: [ADR-0001](../../adr/0001-tooling-choices-as-modules.md)

## Problem

Stackkit hardcodes ESLint + Prettier as the TypeScript developer-tooling baseline, gives Python a
token Ruff setup baked into the FastAPI `pyproject.toml`, and gives Rust a single umbrella
`quality/cargo` module. There is **no typecheck concept anywhere** — `tsc --noEmit` is a bare
string in the Next.js app script, and Python/Rust have none. Tool choice is not configurable, and
the tools that exist (`quality/eslint`, `quality/ruff`, …) are metadata-only modules whose real
config files are emitted by hardcoded renderers.

We are expanding this into a uniform, configurable **Tooling Slot** model across all three
languages, with typecheck as a first-class slot.

## Goals

- Three Tooling Slots per language — `lint`, `format`, `typecheck` — each filled by a Quality Module.
- Typecheck becomes a real, default-on slot everywhere (presets, examples, bare `create`).
- Tool choice is selectable and recorded as **module identity** (diff/lifecycle-safe — see ADR-0001).
- TypeScript and Python are fully rendered and E2E-verified. Rust is modeled at the
  registry/capability layer only (no config rendering until a Rust crate generator exists).
- The hardcoded tooling output in the foundation/app renderers becomes **derived from the selected
  Quality Modules**, eliminating the "metadata module + hardcoded stub" split.

## Non-goals (YAGNI)

- No tools beyond the v1 matrix below (no Black, flake8, oxlint, dprint, cargo-deny).
- Test runners (`quality/pytest`, `quality/vitest`) are **not** slots — out of scope, left as-is.
- No "remove all tooling" opt-out in v1 (a future `quality/none`-style escape, mirroring
  `auth/none`, can be added later).
- No Rust config-file rendering and no Rust E2E this round.
- No new schema shapes are expected (capabilities and module ids are already freeform strings).

## v1 Tool Matrix

| Language | lint | format | typecheck |
|---|---|---|---|
| TypeScript | `quality/eslint` *(default)* | `quality/prettier` *(default)* | `quality/tsc` *(default, new)* |
| TypeScript (combined alt) | `quality/biome` → fills **lint + format**, conflicts ESLint & Prettier | | |
| Python | `quality/ruff` *(default, combined: lint + format)* | `quality/ruff` | `quality/mypy` *(default, new)* · `quality/pyright` *(alt)* |
| Rust *(model-only)* | `quality/clippy` → `rust-lint` | `quality/rustfmt` → `rust-format` | `quality/cargo-check` → `rust-typecheck` |

Default loadout = the most standard tool per slot: ESLint + Prettier + tsc (TS); Ruff + mypy (Py).

## Domain Model

### Slot capabilities

Slots are expressed as provided capabilities, namespaced by language:

```
ts-lint   ts-format   ts-typecheck
py-lint   py-format   py-typecheck
rust-lint rust-format rust-typecheck
```

These **replace** the current coarse capabilities (`lint`, `format`, `python-quality`,
`rust-quality`). Implementation must confirm nothing `requires` the old names before renaming
(grep shows they are terminal — provided but never required). Language gating keeps using the
existing `typescript` / `python` / `rust` capabilities via each Quality Module's `requires`.

A **Combined Tool** provides more than one slot capability (Biome → `ts-lint` + `ts-format`;
Ruff → `py-lint` + `py-format`) and `conflicts` with every single-slot module it replaces.

### Tooling-slot catalog (single source of truth)

A new declarative catalog in `packages/registry` is the one place tools are described. Each entry:

```ts
type ToolingToolSpec = {
  moduleId: string;                       // "quality/biome"
  title: string;
  description: string;
  language: "ts" | "py" | "rust";
  slots: ("lint" | "format" | "typecheck")[];  // ["lint","format"] for combined tools
  isDefault: boolean;                     // exactly one default per (language, slot)
  aiSkills?: AiSkillDependency[];         // per-tool guidance, as today
};
```

From this catalog the registry **derives** each Quality Module so facts are never duplicated:

- `provides` = `${language}-${slot}` for each slot.
- `requires` = the language capability (`typescript` | `python` | `rust`).
- `conflicts` = every other catalog tool in the same language that shares ≥1 slot.

A `defineQualityModule(spec, catalog)` helper performs this expansion. The catalog also drives the
resolver's default-injection, the CLI flag option values, and the render dispatch — one source,
four consumers.

## Resolution: gap-filling default injection

The slot-aware override rule from the design becomes a single, simple mechanism: **gap-filling**.

In `resolveModuleGraph` (core), after the explicit module set is assembled (from config / preset /
stack-axis flags / `--with` / recipe):

1. Determine which languages are present (a module provides `typescript` / `python` / `rust`).
2. For each present language, compute which of its three slots are already filled by a present
   module (via the slot capabilities those modules provide).
3. For each **unfilled** slot, inject that language's **default** tool from the catalog.

Consequences:

- Selecting Biome (explicit) fills `ts-lint` + `ts-format`, so ESLint/Prettier defaults are simply
  never injected — no conflict, no error. `ts-typecheck` is still unfilled → `quality/tsc` injected.
- Two *explicit* conflicting selections still error via the existing `validateModuleConflicts`.
- The current hardcoded `quality/eslint` append in `resolveStackAxes` (customizer.ts ~line 132) is
  **removed**; tooling now comes entirely from gap-filling, applied uniformly to every entry path.
- Rust tooling modules get injected when a Rust language module is present, but render nothing
  (no Rust renderers) — exactly the "modeled-only" outcome, consistent with today's `quality/cargo`.

## Rendering: renderers become tooling-aware

Config files are owned by Quality Modules and emitted through `renderCreateFiles` dispatch (the same
pattern already used for `web/nextjs`, `api/fastapi`, etc.), so they are reproducible by the diff
engine (`buildExpectedManagedFilePlan`) because selection is module identity reconstructable from
the manifest.

New/!moved template renderers in `packages/templates`:

- `renderEslintConfig()` → `eslint.config.mjs` (moved **out** of `renderPnpmTurboFoundation`).
- `renderPrettierConfig()` → `prettier.config.mjs` (moved out of foundation).
- `renderBiomeConfig()` → `biome.json`.
- `renderRuffConfig()` → `ruff.toml` (moved out of the FastAPI `pyproject.toml`).
- `renderMypyConfig()` → `mypy.ini`.
- `renderPyrightConfig()` → `pyrightconfig.json`.
- `quality/tsc` owns **no** standalone config file (tsc reuses `tsconfig.base.json` / per-app
  `tsconfig.json`); it contributes only the typecheck **script** wiring.

Python tool configs are **separate files** (`ruff.toml`, `mypy.ini`, `pyrightconfig.json`), never
merged into `pyproject.toml`, because `mergeCreateFileOperations` only merges `package.json` and
`.env.example` — multiple owners writing one `pyproject.toml` would collide.

Scripts and dependencies (which the diff path *does* re-render via the foundation/app renderers)
become **derived from the selected Quality Modules**, passed into the renderers from
`renderCreateFiles` (which knows `selectedModuleIds`):

- `renderPnpmTurboFoundation` — root `devDependencies` (eslint/prettier/typescript-eslint, or
  `@biomejs/biome`) and any root scripts become conditional on the selected TS Quality Modules.
- `renderNextjsApp` — `lint` / `format` / `typecheck` scripts reflect the selected tool
  (`eslint …` / `prettier …` vs `biome lint` / `biome format`; `tsc --noEmit` for typecheck).
- `renderFastApiService` — `pyproject.toml` dev dependency group and the `lint`/`format`/`typecheck`
  scripts reflect Ruff + (mypy | pyright).

Because tool choice is derived from `selectedModuleIds` (present in the manifest), every one of these
remains diff-reproducible. Tooling deliberately does **not** use `packageChanges`/`envVars` for its
output, since those are absent from the diff path.

## CLI surface

Two namespaced convenience flags in `packages/cli`, validated against the catalog:

- `--ts-quality <eslint-prettier | biome>` (default `eslint-prettier`) → selects the TS lint+format
  module(s): `eslint-prettier` → `quality/eslint` + `quality/prettier`; `biome` → `quality/biome`.
- `--py-typecheck <mypy | pyright>` (default `mypy`) → selects the Python typecheck module.

TS typecheck is always `quality/tsc` and Python lint/format is always `quality/ruff` (single tool,
no flag). Flags are sugar over module selection; `stackkit.config.json` `modules` and the existing
`--with` continue to work, all riding the same gap-filling rule. Flag values, plan JSON, and the
written `stackkit.config.json` keep canonical module ids, consistent with existing axis behavior.

## Defaults, presets, examples

- All TS presets gain `quality/tsc`; all Python presets gain `quality/mypy`.
- `next-axum-postgres-auth0` swaps `quality/cargo` → `quality/clippy`, `quality/rustfmt`,
  `quality/cargo-check`.
- `examples/*/stackkit.config.json` are updated to list the tooling modules explicitly (gap-filling
  would add them anyway; explicit listing keeps the examples self-documenting and the resolution
  tests precise).
- The FastAPI `readme` stack metadata adds mypy.

## Web apps

Both first-party apps must reflect the new slot model rather than hand-copying tooling truth.

**`apps/customizer`** (visual composer, consumes `buildCustomizerCatalog` + the shared resolver and
recipe encoder):

- Quality Modules gain a `category` (`"quality"`) so they surface as selectable choices in the
  catalog (today eslint/prettier/ruff/cargo have no category and fall into `"other"`).
- The customizer exposes the two real choices — TS lint+format (`eslint-prettier` | `biome`) and
  Python typecheck (`mypy` | `pyright`) — as selections that resolve through the same gap-filling
  rule and encode into the offline `--recipe` command. It must **not** re-implement slot logic;
  it drives the shared core resolver so defaults/suppression stay identical to the CLI.
- Preview reflects the resolved tooling modules (e.g. selecting Biome drops ESLint/Prettier).

**`apps/docs`** (Fumadocs):

- `content/docs/cli-reference.mdx` documents `--ts-quality` and `--py-typecheck` (values, defaults).
- Tooling-slot model documented (lint/format/typecheck per language, default tools, Biome combined
  alt, Rust modeled-only) on the relevant modules/registry page, sourced from verified CLI output.

## Diff / provenance

No regression: all tooling files and the tool-aware scripts/deps are produced inside
`renderCreateFiles`, which the diff engine already replays from manifest module ids. The existing
known gap (`packageChanges`/`envVars` not in the diff path) is **not** widened because tooling avoids
those mechanisms.

## Testing strategy

Unit / package tests:

- Catalog: exactly one default per (language, slot); derived `provides`/`requires`/`conflicts` are
  correct; combined tools conflict with the single-slot modules they replace.
- Gap-filling resolver: defaults injected only into unfilled slots; Biome suppresses ESLint/Prettier;
  pyright suppresses mypy; two explicit conflicting tools still error; Rust tools inject but render
  nothing.
- Renderers: snapshot each config file; foundation/app renderers emit the right scripts+deps per
  selected tool (ESLint vs Biome; mypy vs pyright).
- CLI: `--ts-quality biome` and `--py-typecheck pyright` resolve to the right module ids in plan JSON;
  defaults applied when flags omitted.
- Update existing resolution/foundation tests for the new default module lists and de-hardcoded deps.

Root checks: `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm smoke`.

## E2E (defines done)

Build the CLI, then generate real projects and run their own scripts:

1. **Default path** — `create … --web next --api fastapi --db postgres`: `pnpm install`,
   `pnpm typecheck`, `pnpm lint`, `pnpm format` (check) exit 0; `ruff`/`mypy`/`pytest` run via `uv`
   where available. Verify `eslint.config.mjs`, `prettier.config.mjs`, `ruff.toml`, `mypy.ini` exist;
   no `biome.json`.
2. **Biome path** — same with `--ts-quality biome`: `biome.json` present, ESLint/Prettier config and
   devDeps absent, app `lint`/`format` scripts use Biome, `pnpm typecheck` + `pnpm lint` exit 0.
3. **pyright path** — `--py-typecheck pyright`: `pyrightconfig.json` present, `mypy.ini` absent.

Tool availability is gated as the existing smoke does for `uv`; dry-run/plan-JSON assertions always
run. Done = the whole plan implemented, every milestone reviewed, and the live E2E shown passing.

## Rollout / milestones (for the plan)

1. Catalog + derived Quality Modules + capability rename (registry, schemas check).
2. Gap-filling resolver + suppression (core), remove hardcoded axis injection.
3. Tooling-aware renderers + config-file renderers (templates) + render dispatch (core).
4. CLI flags + preset/example/default updates.
5. Web apps — customizer catalog/category + tooling selections; docs CLI-reference + tooling-model page.
6. Verification + E2E (default, Biome, pyright).
