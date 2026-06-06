# Stackkit

Stackkit is a long-term, multi-language monorepo generator platform: a CLI plus shared
generator packages that scaffold and manage TypeScript, Python, and Rust projects from
declarative inputs. This glossary fixes the domain language so specs, code, and docs agree.

## Language

**Module**:
The atomic unit of generated behavior — a typed declaration (id like `quality/eslint`) that
can require/provide capabilities, own files, and patch package manifests. Selection is recorded
in the project manifest, so module identity is the durable record of a choice.
_Avoid_: plugin, package (a Module is not an npm package), feature

**Capability**:
A named string a Module `provides` or `requires` (e.g. `typescript`, `python`, `ts-lint`) used
to gate dependencies and ordering. Capabilities are the wiring between Modules; they are not
user-facing.
_Avoid_: tag, trait, flag

**Tooling Slot**:
A capability namespace for one developer-tooling responsibility for one language — `lint`,
`format`, or `typecheck` per language (e.g. `ts-typecheck`, `py-lint`). At most one selected
Module may fill a given slot; mutual exclusion is enforced by Module `conflicts`. A "slot" is a
modeling concept, not a schema field.
_Avoid_: tool category, tool group

**Quality Module**:
A Module that fills one or more Tooling Slots by owning its real config file(s) and the package
scripts that run it (e.g. `quality/eslint` owns `eslint.config.mjs` and the `lint` script).
Today these are metadata-only; the design makes them own their generated output.
_Avoid_: linter module, dev-tool module

**Combined Tool**:
A single Quality Module that fills more than one Tooling Slot at once (e.g. Biome provides both
`ts-lint` and `ts-format`) and therefore conflicts with the single-slot Modules it replaces.
_Avoid_: all-in-one, multi-tool

**Stack Axis**:
A user-facing selection dimension exposed as a CLI flag and resolved to Modules (`--web`,
`--api`, `--db`, `--auth`, `--deploy`). Tooling selection, if surfaced as flags, follows this
same axis pattern.
_Avoid_: option, parameter

**Preset**:
A named, ordered list of Module ids that expands into a starting selection (e.g. `next`,
`next-fastapi-postgres-auth0`).
_Avoid_: template, bundle, recipe (a Recipe is the offline-encoded form of a selection)

**Native CLI Delegation**:
Using a framework, library, or platform's official `create`, `init`, `setup`, or migration CLI as
the source of generated structure before applying Stackkit-specific composition and manifest
tracking. Prefer this over hand-written reimplementations when the upstream CLI is stable,
non-interactive, and compatible with Stackkit ownership.
_Avoid_: manual clone of upstream templates, hardcoded initializer

**Native Initializer**:
A typed Module declaration for a Native CLI Delegation command. It records the tool package or
system command, argv, working directory, gating conditions, mutation policy, expected files, and
redacted files. Core resolves these declarations through the selected package-manager adapter and
records resulting managed files in the manifest. Disabled Native Initializers can document researched
official CLIs before Stackkit is ready to execute that CLI safely.
_Avoid_: ad hoc lifecycle hook, hardcoded create special case
