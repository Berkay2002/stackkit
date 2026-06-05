# Stackkit Status

Last updated: 2026-06-05

## Current State

Stackkit is usable locally as an internal alpha CLI. It can generate a managed pnpm/Turborepo foundation project from config, write ownership metadata, and validate that generated project with `stackkit doctor`.

The command surface is broader than the generated project depth. Several lifecycle commands are wired, and several presets validate, but full-stack app generation is still skeletal.

## Verified

- `pnpm typecheck` passes.
- `pnpm test` passes.
- `pnpm smoke` passes.
- `stackkit create --config ... --dir ...` can generate a foundation project.
- A generated foundation project supports `pnpm install --lockfile-only`.
- `stackkit doctor` passes on a generated foundation project.
- Example configs validate for:
  - `examples/next-shadcn/stackkit.config.json`
  - `examples/next-fastapi-postgres-auth0/stackkit.config.json`
  - `examples/next-rust-postgres-auth0/stackkit.config.json`
  - `examples/docker-kubernetes/stackkit.config.json`

## Usable Today

- `stackkit create --config <path>`
- `stackkit create --dry-run --config <path>`
- `stackkit doctor`
- `stackkit preset list`
- `stackkit preset inspect <preset>`
- `stackkit config validate <path>`

The CLI also exposes `add`, `remove`, `update`, `migrate`, `diff`, `skills sync`, and `skills update`. These paths have tests, but they need more real generated-project verification before they should be treated as stable.

## Known Gaps

- Generated apps are minimal. The foundation, Next.js, ShadCN, FastAPI, Vercel, Docker, and Kubernetes modules emit real files, but the output is still starter-level.
- Auth and database modules mostly resolve metadata and AI skills. They do not yet generate meaningful application integration code.
- Rust modules are declared, but Rust service templates are not implemented yet.
- `stackkit create` can run real `npx skills add` commands during generation. There is no user-facing flag to skip or only plan skill installation.
- `init` is registered in the CLI but not implemented.
- Full-stack generated projects still need install, build, test, and Docker verification.

## Next Steps

1. Add `stackkit create --no-skills` or `--skills <plan|apply|skip>`.
2. Verify `next-shadcn` as a generated project with install, typecheck, and build checks.
3. Verify `next-fastapi-postgres-auth0` as a generated project with install and service-level checks.
4. Add real database templates for Drizzle, SQLAlchemy, and Postgres env setup.
5. Add real auth integration templates for Clerk, Auth0, and Better Auth.
6. Add Rust service templates for Tokio, Axum, and SQLx.
7. Expand smoke tests from foundation-only generation to representative full-stack generation.
8. Decide which lifecycle commands are ready for alpha use and document the rest as experimental.

## Readiness Estimate

- Internal alpha CLI: about 70 percent.
- Public monorepo generator: about 35 to 45 percent.

The main reason for the gap is that the platform mechanics are mostly in place, while the generated app implementations still need depth.
