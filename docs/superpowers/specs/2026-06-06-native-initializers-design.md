# Native Initializers Design

## Goal

Stackkit modules can declare official CLI initialization commands instead of hiding them in
core-specific special cases. ShadCN is the first migration target: its current hardcoded create
hook moves into registry metadata and uses the same execution path as future `create-next-app`,
`create-vite`, TanStack CLI, Prisma, Supabase, Clerk, and other native initializers.

## Research Map

Verified non-interactive initializer candidates:

| Module | CLI | Notes |
| --- | --- | --- |
| `ui/shadcn` | `shadcn@latest init --monorepo` | Official monorepo mode creates app and `packages/ui` configs. |
| `web/nextjs` | `create-next-app@latest` | Works with `--skip-install --disable-git --yes`; parent `apps` must exist. |
| `web/vite` | `create-vite@latest` | Works with `--template react-ts --no-interactive`. |
| `web/tanstack-start` | `@tanstack/cli create` | Works with `--non-interactive`; use `--no-intent` so Stackkit owns skill state. |
| `db/prisma` | `prisma init` | Creates `prisma/`, `prisma.config.ts`, `.env`, and `.gitignore`. |
| `postgres/supabase-local` | `supabase init` | Creates `supabase/config.toml`; `--workdir` controls location. |
| `auth/clerk` | `clerk init` | Supports framework, package manager, keyless, yes, and no-skills flags. Treat as external-state aware. |
| `quality/biome` | `biome init` | Creates `biome.json`. |
| `workspace/pnpm-turbo` | `create-turbo` | Root scaffold candidate; needs a root-scaffold phase. |
| `web/django` | `django-admin startproject` | Python scaffold candidate for active Django work. |
| Rust modules | `cargo new/init` | Good base crate initializer; framework overlays still belong to Stackkit. |
| `desktop/tauri` | `create-tauri-app` | Good desktop scaffold candidate. |

Deferred or rejected for now:

| Module | Reason |
| --- | --- |
| `auth/better-auth` | `auth init` still prompts in current probe, so it is not safe yet. |
| `api/fastapi` | CLI is runtime/discovery, not project scaffolding. |
| `api/flask` | No stable official scaffold command for this module shape. |
| `api/litestar` | CLI is runtime/schema/session oriented. |
| `db/drizzle` | `drizzle-kit` is migration/runtime tooling, not project init. |
| `quality/eslint` | Current create-config flow is interactive; Stackkit keeps monorepo config ownership. |
| `deploy/vercel` | `vercel link` depends on account/project state, not deterministic create output. |

## Contract

Add `nativeInitializers?: NativeInitializer[]` to `StackkitModule`.

The initializer describes:

- `name`: user-facing command label.
- `phase`: `root-scaffold`, `app-scaffold`, `integration`, or `tool-config`.
- `tool`: package-manager `dlx` package or direct/system command.
- `args`: argv entries, including typed tokens for package manager, selected framework, project name,
  or literal values.
- `cwd`: project-relative working directory.
- `when`: optional selected-module/capability gates.
- `mutationPolicy`: `generated-subtree`, `known-files`, `merge-owned`, or `external-state`.
- `expectedFiles`: project-relative files or globs Stackkit should track after the command.
- `redactExpectedFiles`: files to keep out of `expectedFiles` content snapshots, such as `.env.local`.

The core execution layer resolves selected modules' initializers, filters by `when`, converts tool
descriptors through the package-manager adapter, runs them after deterministic file rendering, then
refreshes manifest hashes and expected files. Dry-run output should include the planned native
initializers without serializing private `selectedModules`.

## First Ship Slice

This slice implements the generic contract and migrates ShadCN off `planShadcnInitHooks`.

Registry entries may declare researched initializers for the other candidates, including Clerk. Core
can plan all declarations, but execution is limited by the declared mutation policy and test coverage.
Clerk is included as `external-state` with `--keyless --yes --no-skills`; Stackkit must not let Clerk
install agent skills because Stackkit already owns skill state.

## Verification

Focused tests:

- schema accepts native initializers and rejects invalid mutation/tool fields.
- create plans include native initializer dry-run metadata.
- apply create runs initializers through the package-manager adapter.
- ShadCN command is produced from registry metadata, not a hardcoded function.
- expected files and hashes refresh after a mocked initializer mutates files.

E2E smoke:

- Build the CLI.
- Generate at least one real ShadCN monorepo project and run `stackkit doctor`.
- Generate at least one real Clerk-enabled project if the command can run non-interactively without
  account prompts and without leaking secrets into tracked expected files.
