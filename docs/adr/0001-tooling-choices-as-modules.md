---
status: accepted
---

# Tooling choices are modeled as modules, not config options

Developer-tooling selections (lint, format, typecheck per language) are each modeled as a
distinct Quality Module (e.g. `quality/eslint`, `quality/biome`, `quality/mypy`), with a
"Tooling Slot" expressed as a provided capability (`ts-lint`, `py-typecheck`, …) and
mutual exclusion enforced by module `conflicts` — the same shape already used for auth and
Postgres providers. We deliberately did **not** use the existing per-module `options` field,
even though it looks like the obvious home for "which typechecker."

The deciding reason is provenance: a selection stored in `config.options` is dropped by
`manifestModuleToStackkitModule`, so `stackkit diff` and managed-update reproduction
(`buildExpectedManagedFilePlan`) would silently fail to regenerate tooling files. Module
identity *is* persisted in the manifest `modules[]` array, so modeling tools as modules keeps
diff and lifecycle (`add`/`remove`) correct for free. The trade-off accepted: a combined tool
(Biome, Ruff) must provide multiple slot capabilities and conflict with each single-slot module
it replaces, and adding a tool means adding a module rather than an enum value.

## Consequences

- A new resolver rule (slot-aware suppression) is required: an explicitly-selected module drops
  a conflicting *default-injected* module instead of erroring; only two explicit conflicting
  selections error.
- The hardcoded tooling output in `renderPnpmTurboFoundation` / `renderNextjsApp` /
  `renderFastApiService` must become derived from the selected Quality Modules so it stays
  diff-reproducible.
