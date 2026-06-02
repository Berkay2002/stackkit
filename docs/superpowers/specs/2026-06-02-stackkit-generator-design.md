# Stackkit Generator Design

## Source

This spec is based on `stackkit-long-term-generator-plan.md` and the current repository state on 2026-06-02. The repository already has an initial TypeScript monorepo scaffold, schemas, a partial built-in registry, AI skill resolution, manifest writing, CLI command registration, and a config-driven create dry-run path.

## Goal

Build Stackkit into a public-grade TypeScript CLI that can generate, inspect, update, migrate, and maintain Stackkit-managed monorepos. It must support config-driven and interactive creation, record ownership metadata, install or generate AI guidance, and refuse unsafe changes.

Stackkit must be a registry-driven project engine, not a folder copier. Modules declare their capabilities, files, dependencies, commands, migrations, validation rules, and AI skill needs. The core engine turns those declarations into safe plans and applied changes.

## Product Scope

The remaining product work covers the full lifecycle CLI:

```text
stackkit create
stackkit add
stackkit remove
stackkit update
stackkit migrate
stackkit diff
stackkit doctor
stackkit skills sync
stackkit skills update
stackkit preset list
stackkit preset inspect
stackkit config validate
```

The CLI must support both interactive and config-driven flows. Every interactive answer must map to config so there is no wizard-only state.

## Architecture

`packages/core` owns orchestration and safety. It loads normalized inputs, resolves module graphs, validates requirements and conflicts, builds file plans, detects conflicts, writes files, hashes ownership, builds manifests, plans updates and migrations, runs doctor checks, and produces command execution plans.

`packages/registry` owns built-in modules and presets. It should stay declarative. It defines module metadata, capabilities, conflicts, file declarations, package changes, env vars, lifecycle hooks, migrations, validation rules, and AI skill dependencies. It must not perform filesystem writes.

`packages/templates` owns rendering helpers and reusable file fragments. Templates produce file operation data for core to stage and apply. They do not write directly to disk.

`packages/cli` owns Commander commands, prompts, output formatting, and user-facing errors. It should call core APIs rather than implement generation logic.

`packages/schemas` owns public schemas and types for config, manifests, modules, presets, file operations, package changes, env vars, migrations, AI skill data, doctor results, and execution plans.

## Generation Flow

`stackkit create` runs in this order:

1. Load config when `--config` is provided.
2. Prompt for missing values in interactive mode.
3. Resolve presets and selected modules into a module graph.
4. Validate required capabilities and conflicts.
5. Build an execution plan.
6. Print a human-readable summary and extractable JSON plan.
7. Render files into a staging model.
8. Detect conflicts with existing files.
9. Write project files when not in dry-run mode.
10. Install package dependencies when selected.
11. Run module post-create hooks.
12. Install official and curated AI skills.
13. Generate local AI guidance for modules without accepted skill sources.
14. Write `.stackkit/project.json`.
15. Write `skills-lock.json`.
16. Run `stackkit doctor`.
17. Print next commands.

Default target behavior: `stackkit create --config stackkit.config.json` creates `./<projectName>`, refuses if that directory exists and is non-empty, and supports dry-run planning without touching disk. `--dir <path>` overrides the target directory and must use the same conflict checks.

## Module System

Each module is a typed unit. It declares what it requires, what it provides, what files it owns, what package changes it needs, what env vars it introduces, what hooks it runs, what migrations it ships, what validations it can perform, and what AI skills it wants.

Core module graph behavior:

- Unknown module IDs fail during planning.
- Missing required capabilities fail during planning with actionable errors.
- Conflicting modules fail during planning.
- Presets expand into modules before validation.
- Module order is deterministic.
- Module options are preserved in the manifest.

Built-in modules should eventually cover the full target set from the long-term plan: pnpm/Turborepo, TypeScript, GitHub Actions, Docker Compose, Next.js, ShadCN, Tailwind, FastAPI, Flask, Litestar, Django, Axum, Actix, Rocket, Tokio, Tauri, Postgres, Drizzle, Prisma, SQLAlchemy, sqlx, Diesel, Clerk, Auth0, Better Auth, Vercel, Docker, Kubernetes, docs modules, AI skills, and quality tooling.

The first real generation milestone should implement the pnpm/Turborepo foundation before stack-specific modules expand on it.

## File Planning And Ownership

The generator stages file operations before writing. A file operation includes the target path, owner module, generated content or structured JSON patch, mode when needed, and overwrite policy.

Core computes a content hash for every generated file it owns. `.stackkit/project.json` records the file path, owner module, and hash. That manifest is the source of truth for subsequent remove, update, diff, and migrate behavior.

Safety rules:

- Never overwrite an existing non-owned file silently.
- Never overwrite a user-modified owned file silently.
- Removal is allowed only for clearly owned unchanged files.
- Updates prefer additive changes.
- Destructive migrations require explicit confirmation.
- Dry-run output must show file writes, external commands, AI skill installs, and warnings.

## Manifest And Lock Files

Every generated project gets:

```text
.stackkit/project.json
skills-lock.json
```

`.stackkit/project.json` records schema version, Stackkit version, project name, created timestamp, selected modules and options, owned file hashes, AI skill targets, installed skills, unresolved skill failures, and applied migrations.

`skills-lock.json` records the selected AI skill targets and the official, curated, local, and unresolved skill selections needed for repeatable sync/update behavior.

## AI Skills

AI skills are selected from the module graph. Official sources are preferred. Curated sources are accepted only when allowlisted. Modules without accepted installable skills generate local guidance. Failed installs warn and continue, and failures are recorded as unresolved.

Rules:

- Default skill target is Codex-compatible `.agents/skills`.
- Claude Code `.claude/skills` is opt-in.
- Installs use `npx -y skills add ... --agent <agent> -y --copy`.
- No untrusted free-form skill URL is accepted in the normal wizard.
- Failed installs do not fail project generation.
- `stackkit skills sync` retries missing or failed skills from the lock file.
- `stackkit skills update` updates installed official and curated skills.

Local generated guidance should be written into the selected project-local skill target when possible, and into project docs when no target is enabled.

## Lifecycle Commands

`add` adds modules to an existing Stackkit project. It reads the manifest, validates the new graph, plans file/package/env changes, detects conflicts, applies safe changes, runs post-add hooks, updates skills, and rewrites manifest data.

`remove` removes only safely owned generated files and manifest entries. If a file was modified or ownership is ambiguous, it refuses and explains what needs manual review.

`diff` shows planned file, manifest, package, migration, and AI skill changes without applying them.

`update` plans module version updates and migrations. It is dry-run capable, never silently overwrites user changes, and marks conflicted changes as review-required.

`migrate` applies pending module migrations that are automatic or explicitly approved.

`doctor` validates repo health, module compatibility, manifest integrity, package manager state, dependency versions, env examples, generated file hashes, migration state, and AI skill state.

`preset list` and `preset inspect` expose registry presets.

`config validate` parses and validates a config file, reports schema errors, and validates module IDs, presets, requirements, conflicts, and AI skill target choices.

## Built-In Output

The built-in modules should generate practical project files rather than empty folders.

Foundation output includes:

- root `package.json`
- `pnpm-workspace.yaml`
- `turbo.json`
- `tsconfig.base.json`
- `.gitignore`
- base README or docs handoff where selected
- `.stackkit/project.json`
- `skills-lock.json`

Stack modules incrementally add app/service folders, package manifests, env examples, config files, Dockerfiles, compose files, Kubernetes manifests, docs, quality tooling, and framework-specific starter code.

## Interactive Flow

Interactive `create` should use concise prompts that map directly to config:

- project name
- preset or custom module selection
- frontend choice
- API choice
- database provider and access library
- auth provider
- deployment targets
- quality tooling
- AI skill targets

Defaults:

- workspace: pnpm + Turborepo
- frontend: Next.js
- UI: ShadCN when Next.js is selected
- database: Postgres
- TypeScript DB: Drizzle
- Python DB: SQLAlchemy
- Rust DB: sqlx
- personal hosted auth: Clerk
- work-friendly OIDC auth: Auth0
- self-hosted TypeScript auth: Better Auth
- web deployment: Vercel
- services deployment: Docker
- Kubernetes: optional
- AI skills: Codex-compatible project skills by default

## Public API

Public exports should include stable types and helpers for module authors:

```ts
export type StackkitConfig;
export type StackkitManifest;
export type StackkitModule;
export type StackkitPreset;
export type AiSkillTrust;
export type AiSkillDependency;
export type AiSkillRegistryEntry;
export type ModuleMigration;

export function defineModule(module: StackkitModule): StackkitModule;
export function definePreset(preset: StackkitPreset): StackkitPreset;
export function defineSkillSource(entry: AiSkillRegistryEntry): AiSkillRegistryEntry;
export function resolveAiSkills(modules: StackkitModule[]): AiSkillDependency[];
```

Internal engine details should not be required for basic module authoring.

## Documentation And Open Source Readiness

The repository should be ready for public release without a documentation rewrite. It needs:

```text
README.md
LICENSE
CONTRIBUTING.md
SECURITY.md
CODE_OF_CONDUCT.md
CHANGELOG.md
docs/architecture.md
docs/modules.md
docs/skills.md
docs/managed-updates.md
docs/contributing.md
```

Governance should stay light. The project can be personal-first while still having clean contributor expectations, security reporting, and module authoring docs.

## Testing Strategy

Use TDD for engine behavior and lifecycle commands. Unit tests should cover module graph resolution, capability validation, conflict detection, config schema parsing, file planning, manifest writing, AI skill resolution, command planning, migration planning, file ownership hashing, and doctor checks.

Integration tests should cover config-driven project creation, AI skill sync with mocked command execution, skill install failure recording, add/remove/update/diff safety, and generated project snapshots.

Representative end-to-end fixtures should include:

- Next.js + ShadCN
- Next.js + FastAPI + Postgres + Auth0
- Next.js + Rust + Postgres
- Docker-enabled project
- Kubernetes-enabled project

End-to-end verification should run generated project checks where practical: `pnpm install`, lint, test, build, `docker compose config`, and `stackkit doctor`.

## Phasing

The implementation plan should cover all remaining work, but in milestones that leave the product testable after each phase:

1. Move create planning fully into `packages/core`.
2. Add file operation schemas, render planning, hashing, and conflict detection.
3. Implement real `create` writing for the pnpm/Turborepo foundation.
4. Add manifest and `skills-lock.json` ownership recording.
5. Add built-in module outputs incrementally.
6. Add AI skill install, sync, update, local guidance, and failure recording.
7. Add lifecycle commands: `add`, `remove`, `diff`, `update`, `migrate`, and `doctor`.
8. Add presets and interactive prompts.
9. Add public docs and open-source readiness files.
10. Add broad integration and end-to-end fixtures.

## Acceptance Criteria

Stackkit is complete when:

- A user can generate a complete multi-language monorepo from interactive prompts.
- The same project can be generated from config without prompts.
- Selected modules produce matching files, dependencies, env docs, scripts, and AI skills.
- `.stackkit/project.json` records enough metadata to support updates.
- `skills-lock.json` supports skill sync and update.
- AI skills are installed from official sources first, curated allowlisted sources second, and local guidance fallback third.
- Failed skill installs do not break project generation.
- `doctor` explains missing or inconsistent project state.
- Updates are dry-run capable and do not silently overwrite user changes.
- Python and Rust modules participate in AI skill resolution the same way TypeScript modules do.
- Curated skills require explicit allowlisting.
- Modules without accepted skills generate local guidance instead of being ignored.
- The repository is public-open-source ready without a documentation rewrite.
