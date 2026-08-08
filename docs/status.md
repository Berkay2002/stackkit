# Stackkit status

Last updated: 2026-08-08

## Public alpha contract

Stackkit 0.3.0 has one supported generation path:

- preset: `next-fastapi-postgres-auth0`
- package manager: pnpm
- web: Next.js App Router with ShadCN
- API: FastAPI
- database: PostgreSQL with SQLAlchemy and Alembic
- auth: Auth0 for Next.js and bearer-token verification for FastAPI
- local runtime: Docker Compose

The supported preset is the default for `stackkit create <name>`. Other modules, presets, and package managers are either preview or planned. Preview generation requires `--include-preview`; planned entries cannot be generated.

The local customizer follows the same matrix. It shows supported choices by default, reveals preview choices only after explicit opt-in, and copies a pinned `@berkayorhan/stackkit@0.3.0` command. Preview commands include `--include-preview` so they round-trip through the CLI.

## Supported generated behavior

The golden path generates a pnpm/Turborepo workspace with:

- an Auth0-enabled Next.js application and Todo UI
- a FastAPI service with JWT/JWKS validation
- owner-isolated Todo CRUD backed by SQLAlchemy and PostgreSQL
- Alembic migrations and root database scripts
- Dockerfiles and a Compose topology that waits for PostgreSQL health before API migration and startup
- deterministic `.env.example`, `.gitignore`, `.dockerignore`, README, quality configuration, and workspace scripts
- `.stackkit/project.json` ownership and provenance, `skills-lock.json`, and a resumable `.stackkit/apply-state.json` journal

Create plans are hashed together with selected module snapshots. Deterministic files are applied from the reviewed plan. Lifecycle hooks and native initializers are checkpointed individually so resume does not repeat completed steps.

`stackkit doctor` checks managed-file integrity, declared files, and runnable `command-succeeds` validations when invoked through the CLI. The generated `pnpm stackkit:doctor` script pins Stackkit 0.3.0.

## Verification gates

The repository gate covers:

- package and app tests, typechecks, and builds
- root `pnpm test`, `pnpm typecheck`, and `pnpm smoke`
- Ubuntu and Windows CI
- public-package tarball packing and installation
- creation through the packed CLI
- generated-project install, test, typecheck, lint, build, doctor, and migration behavior
- Compose build and runtime readiness in the release workflow
- a scheduled pinned-versus-latest initializer canary

## Preview and planned areas

Vite, TanStack Start, alternative auth and database providers, Rust services, Kubernetes, Vercel, and non-pnpm package managers are not part of the supported 0.3.0 contract. Their registry metadata remains available behind preview discovery where applicable, but they do not inherit the golden path's release guarantee.

Lifecycle commands beyond create, resume, doctor, info, and diff have unit and integration coverage but remain preview until their CLI, manifest, dry-run, and real generated-project paths share the same release proof.

The customizer remains local and offline. Remote registries, hosted recipes, accounts, persistence, and telemetry are not supported.

## Release state

The workspace packages and changelogs are prepared at version 0.3.0. Publishing is a separate maintainer action and is not performed by implementation or verification work.
