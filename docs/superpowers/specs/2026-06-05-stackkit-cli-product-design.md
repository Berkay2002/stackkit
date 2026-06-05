# Stackkit CLI Product Design

Last updated: 2026-06-05

## Purpose

Stackkit is a CLI for developers who build monorepos and want customizable boilerplates instantly. It should generate useful, runnable monorepos from polished presets, let developers customize those presets through flags, config, recipes, and later a visual customizer, and keep generated projects maintainable through manifests, doctor checks, diffs, updates, migrations, and AI skills.

The CLI should feel direct and technical. The primary labels are technology names, not marketing or use-case phrasing.

## Product Contract

Stackkit always resolves a declarative plan before changing files. It records what it owns. It refuses unsafe edits. It prints concrete next actions.

For v1, Stackkit should focus on new project generation, managed project inspection, deterministic config, offline recipes, AI skill installation, and a small set of polished presets. Existing-project adoption through `init` is deferred.

The full lifecycle command surface is intentional, but commands have different v1 stability levels:

- Stable v1: `create`, `doctor`, `info`, `diff`, `preset`, `module`, `recipe`, `config validate`, `skills sync`.
- Experimental v1: `add`, `remove`, `update`, `migrate`, `skills update`.
- Deferred: `init` and existing-project adoption.

Experimental lifecycle commands may ship read-only planning first. Any command that writes must support `--dry-run`, refuse unmanaged edits, and rely on `.stackkit/project.json` ownership.

## Primary User

The first user is a developer who already understands monorepos and wants a fast way to generate a conventional stack:

```bash
stackkit create acme --preset next-postgres-clerk
stackkit create acme --web next --api fastapi --db postgres --auth auth0
stackkit create acme --recipe <code>
```

The CLI should not over-explain basic technologies. It should show enough to make generated choices auditable.

## Command Model

Primary commands:

```bash
stackkit create [name]
stackkit add <module-or-alias>
stackkit remove <module-or-alias>
stackkit update [module-or-alias]
stackkit migrate [module-or-alias]
stackkit diff
stackkit doctor
stackkit info
stackkit skills sync
stackkit skills update
stackkit preset list
stackkit preset inspect <preset>
stackkit module list
stackkit module inspect <module-or-alias>
stackkit module search <query>
stackkit recipe encode
stackkit recipe decode <code>
stackkit recipe inspect <code>
stackkit config validate
```

Command groups use singular nouns: `preset`, `module`, `recipe`, `registry`.

`create` starts a new project. `init` is reserved for adopting an existing project later and should not be exposed as ready until it is implemented.

`info` describes the project. `doctor` validates the project and recommends concrete commands.

`update` and `migrate` default to a read-only plan. They only write with `--apply`.

## Create Behavior

`create` accepts a positional slug:

```bash
stackkit create acme-dashboard
```

V1 project names use a strict slug:

```text
^[a-z0-9][a-z0-9-]*$
```

Interactive mode may ask for a name and propose a slug, but scripted mode should fail on invalid names.

`create` writes after confirmation in interactive mode. In scripted mode, `--yes` means skip confirmation. `--dry-run` never writes.

`create` target policy:

- Missing directory: create it.
- Existing empty directory: write into it.
- Existing non-empty unmanaged directory: refuse.
- Existing Stackkit-managed directory: refuse and suggest `add`, `update`, or `diff`.

`--dir <path>` means exact target directory. `--cwd` can be added later if parent-directory semantics are needed.

`--config <path>` loads human-authored intent. Precedence is:

```text
defaults < preset < recipe < config < explicit CLI flags < positional name
```

`--config` may include `projectName`. A positional name overrides it after strict slug validation. `--config` and `--recipe` cannot be combined in v1. Without `--config`, a scripted `create <name>` must not enter interactive prompts; it must resolve from preset, recipe, or documented defaults. Interactive mode is only used when required inputs are missing and stdin is interactive.

## Presets, Axes, And Friendly Aliases

Presets are the documented fast path. Stack-axis flags are the advanced/custom path.

Examples:

```bash
stackkit create acme --preset next-postgres-clerk
stackkit create acme --web next --api fastapi --db postgres --auth auth0
stackkit create acme --preset next-postgres-clerk --with docker --deploy vercel
```

Friendly aliases are the public CLI surface. Slash module IDs remain internal and available for advanced escape hatches.

Examples:

```text
next -> web/nextjs
fastapi -> api/fastapi
postgres -> db/postgres
clerk -> auth/clerk
docker -> deploy/docker
kubernetes -> deploy/kubernetes
```

Output should show human titles by default:

```text
Next.js
FastAPI
Postgres
Auth0
Docker
```

JSON output includes IDs, aliases, titles, categories, and versions.

## Official Presets

The preset list should be small and polished. Official presets are baselines that can be customized further in CLI flags and later in the UI.

Initial official presets:

- `next`: Next.js, shadcn, TypeScript.
- `next-postgres-clerk`: Next.js, shadcn, Postgres, Drizzle, Clerk.
- `next-postgres-better-auth`: Next.js, shadcn, Postgres, Drizzle, Better Auth.
- `next-fastapi-postgres-auth0`: Next.js, FastAPI, Postgres, SQLAlchemy, Auth0.
- `next-axum-postgres-auth0`: Next.js, Axum, Postgres, SQLx, Auth0.
- `containerized`: a Docker-ready full-stack baseline.

Official preset rule:

```text
If a preset is official, Stackkit must be able to generate it, install it where applicable, run its verification commands, and pass doctor.
```

AI skill installation does not make `create` fail by default. For official preset verification, unresolved AI skills are allowed only as doctor warnings unless the run uses `--skills require` or an equivalent strict verification mode. Non-AI project checks must pass.

## Package Managers

Stackkit supports multiple package managers at create time:

```bash
--pm pnpm
--pm npm
--pm yarn
--pm bun
```

`pnpm` remains the default. Internally, package-manager behavior belongs in a shared adapter. Templates must not scatter package-manager conditionals.

The adapter owns:

- lockfile name
- workspace file strategy
- `packageManager` field
- install command
- run command
- add command
- dlx command

Changing package manager after generation is deferred.

Support matrix:

| Manager | v1 support |
| --- | --- |
| pnpm | default; full generated-project verification target |
| npm | create-time metadata, install/run/add/dlx commands, workspace package support |
| yarn | create-time metadata, install/run/add/dlx commands, workspace package support |
| bun | create-time metadata, install/run/add/dlx commands, workspace package support |

If a generated module cannot honestly support all package managers yet, the module must declare that limitation and doctor must report it. Do not silently emit pnpm-only commands for a non-pnpm project.

## Config, Manifest, And Locks

Generated projects should contain three files with separate responsibilities:

```text
stackkit.config.json      Human-editable intent
.stackkit/project.json    Machine manifest and ownership record
skills-lock.json          AI skills lock and retry state
```

`stackkit.config.json` is user-facing and root-level, similar in role to shadcn's `components.json`.

`.stackkit/project.json` is Stackkit-owned. It records:

- schema version
- Stackkit version
- project name
- package manager
- source provenance
- resolved modules and versions
- module options
- paths
- managed file hashes
- AI skill state
- applied migrations

`skills-lock.json` is always written unless the user explicitly skips all AI skill output.

The manifest records canonical module IDs, package manager, source provenance, local paths, managed file hashes, AI skill targets, AI skill mode, link mode, installed skills, planned skills, and unresolved skills. Friendly aliases are never stored as canonical ownership state.

Hash-only ownership is acceptable only when the generator can deterministically re-render the expected content from recorded module IDs, versions, options, and registry source. Remote registry content is deferred unless the manifest stores a content-addressed registry/template lock. Built-in registry modules use built-in versioned content.

## Offline Recipes

Recipes are self-contained offline encoded config. They are not remote lookup IDs in v1.

Examples:

```bash
stackkit create acme --recipe <code>
stackkit recipe encode --config stackkit.config.json
stackkit recipe decode <code>
stackkit recipe inspect <code>
```

Recipes exclude project name so the same recipe can generate multiple projects.

`--config` and `--recipe` should not be combined in v1. `--recipe` may be combined with explicit override flags.

Generated manifests should store both resolved state and recipe provenance. Future updates depend on resolved state, not on re-decoding the recipe.

## AI Skills

AI skills are part of the generated boilerplate, not an optional afterthought.

Defaults:

- `.agents/skills` is written by default for Codex-compatible skills.
- If Claude Code is selected, `.claude/skills` is also written.
- `skills-lock.json` is always written unless skills are explicitly skipped.
- Link mode defaults to copy.
- Symlink mode is available for advanced users.

CLI shape:

```bash
--ai codex
--ai codex,claude-code
--skills install
--skills plan
--skills skip
--skills require
--skill-link copy
--skill-link symlink
```

Default behavior should attempt skill installation, record failures as unresolved, and continue project creation. Skill install failures do not fail `create`.

`--skills plan` records installable skills as planned and does not run external install commands. `--skills skip` writes no skill lock, `.agents/skills`, `.claude/skills`, or local skill guidance. `--skills require` fails if any required skill cannot be installed.

## Generated Project Standards

Generated projects should be runnable, structured, typed where applicable, documented enough to start, and verifiable with clear commands.

No quality levels such as `minimal`, `standard`, or `production` are needed. Stackkit should have one expected quality bar.

Baseline:

- Root `dev`, `build`, `test`, `typecheck`, `lint`, and `format` scripts where applicable.
- App-level scripts bridged into Turbo.
- Basic tests where they prove service wiring.
- Health endpoint for API services.
- Deterministic README.
- `.env.example`.
- `.gitignore`.
- No editor config by default.
- No fake dashboards, fake CRUD, fake user pages, or placeholder business domain.

## Service Boundaries

Official presets use one database owner by default.

Examples:

- Next.js-only DB preset: Next.js owns DB access through Drizzle.
- Next.js plus FastAPI preset: FastAPI owns DB access through SQLAlchemy.
- Next.js plus Axum preset: Axum owns DB access through SQLx.

Auth providers are mutually exclusive in v1, but one provider can target multiple services. Auth0 with Next.js and FastAPI resolves to both service-specific modules.

Provider-specific auth code should live behind service-local auth boundaries, such as:

```text
apps/web/lib/auth.ts
apps/api/app/auth.py
```

Do not generate visible protected demo pages by default.

## Environment Variables

Each module declares env vars as structured metadata. Stackkit writes `.env.example` and README env tables from the same metadata.

Rules:

- Never write `.env`.
- Real secrets are blank.
- Non-secret identifiers may use example values.
- Local Docker-only development passwords may use deterministic local values.
- Duplicate env vars must be compatible or produce a validation error.

## README

Every generated project gets a deterministic stack-aware README by default.

README content comes from module-owned metadata and templates. No LLM-generated README text at create time.

The README includes:

- stack summary
- project layout
- prerequisites
- install commands
- dev commands
- verification commands
- environment variable table
- brief Stackkit section

Generated `docs/architecture.md` is not included in v1.

## Deployment, Docker, And CI

Deployment modules generate configuration and docs. They do not run deployment commands.

Docker is selected explicitly through `--with docker`, `--deploy docker`, or a containerized preset.

Kubernetes is explicit and requires container capability.

CI is optional through `--with ci`. If generated, it runs the same verification commands Stackkit reports.

## Diff, Info, And Doctor

`info` prints inventory. `doctor` validates health.

`doctor` warnings and errors should include concrete next commands when possible.

`diff` should support summary and focused file views:

```bash
stackkit diff
stackkit diff --file apps/web/package.json
stackkit create acme --preset next --dry-run --diff
stackkit create acme --preset next --dry-run --view apps/web/package.json
```

Core should return structured diff data. CLI owns color and formatting.

Stackkit should not store full file snapshots in `.stackkit`. It should rely on hashes and deterministic re-rendering from recorded module versions and options.

`doctor` may recommend `stackkit diff --file <path>` only after `diff --file` exists.

## Registries

Registry support should exist as an advanced extension point, but should not dominate the default product.

V1 should design the schema and make the built-in registry use the same shape as external registries. Full external registry commands can follow after create/config/recipe/generation are stable.

Security rules:

- Built-in registry is trusted.
- External registries are declarative by default.
- Remote registries are deferred in v1 unless content-addressed locking is implemented first.
- Local registry folders may reference local template files.
- Remote registry template fetching, arbitrary code, and lifecycle hooks require explicit future trust design.

## Future Customizer

A visual customizer should exist later as `apps/customizer`, likely Next.js plus shadcn/ui.

It should feel like onboarding: large toggle buttons with framework and service icons. It outputs an offline recipe command and decoded config. It must use the same registry/config/recipe resolver as the CLI and must not duplicate choices.

The customizer is designed now but implemented after the CLI generation path is solid.

The first customizer implementation should consume shared catalog, resolver, and recipe APIs only. It should not introduce hosted preset IDs, remote recipe storage, accounts, or duplicated registry logic.
