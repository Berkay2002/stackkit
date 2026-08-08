# Stackkit Status

Last updated: 2026-06-06

## Current State

Stackkit is usable locally as an internal alpha CLI. It can generate a managed Turborepo foundation project for pnpm, npm, yarn, or bun from config, write ownership metadata, and validate that generated project with `stackkit doctor`.

AI skill behavior is explicit during create. Codex `.agents` remains the default target, Claude Code `.claude` can be selected, and create can install, plan, or skip skill output.

Generated project depth now covers deterministic docs, environment examples, root quality scripts, and a FastAPI health endpoint/test path. Several lifecycle commands are wired, and several presets validate, but auth/database application integration is still mostly metadata-level.

Friendly aliases, stack-axis create flags, official preset IDs, and offline recipe codes are now wired through schemas, registry, core, and CLI. Output manifests and dry-run JSON still store canonical module IDs.

The web framework axis now offers three React frameworks: Next.js (`web/nextjs`), Vite (`web/vite`), and TanStack Start (`web/tanstack-start`), each with a starter-depth template. The three are mutually exclusive. ShadCN is now a configurable `ui` axis instead of a Next.js-only force-bundle: React frameworks default to ShadCN, `--ui none` opts out, and `--ui tailwind` swaps it. `--ui` applies to the stack-axis create path; `--recipe` and `--config` carry their own explicit module lists. The ShadCN template now uses the monorepo package layout expected by the shadcn CLI: app-level `components.json`, shared `packages/ui/components.json`, and shared CSS via `@workspace/ui/globals.css`. Create execution runs `shadcn@latest init -d --base radix --monorepo -t <token> --cwd .` through the selected package manager when ShadCN is selected; `<token>` resolves from the selected web framework (`next`, `vite`, or `start`).

The tooling axis now models quality tools as slot providers instead of one coarse quality bundle. TypeScript projects default to ESLint, Prettier, and `tsc`; `--ts-quality biome` swaps lint and format to Biome while keeping `tsc`. Python projects default to Ruff and mypy; `--py-typecheck pyright` swaps mypy for Pyright. Generated config files are owned by the matching quality module, so unselected tools do not leave config files behind. Vite, TanStack Start, Biome, and mypy use verified external skill sources; tooling entries without a verified official or curated source do not create placeholder local skills.

The local web customizer is now implemented in `apps/customizer`. It renders friendly technology choices from shared Stackkit catalog data, uses the shared resolver and recipe encoder, previews resolved modules, and outputs offline `stackkit create <name> --recipe <code>` commands.

Registry extension points are now present for local declarative registry files. The built-in registry is exposed as a registry object, project configs can declare local registry file paths, and `stackkit registry list --config <path>` can inspect those declarations read-only. Remote registry URLs are rejected because remote registry fetching is not supported yet.

Project inspection is now available through `stackkit info`, doctor actions, module discovery, and file-oriented diff/view output. JSON output keeps canonical IDs, while human module discovery shows friendly aliases where they exist.

## Verified

- `pnpm typecheck` passes.
- `pnpm test` passes.
- `pnpm smoke` passes.
- `stackkit create --config ... --dir ...` can generate a foundation project.
- `stackkit create <name> --dry-run` produces a non-interactive, JSON-extractable plan.
- `stackkit create <name> --pm bun --dry-run` selects Bun in human output, plan JSON, and generated root package metadata.
- `stackkit create <name> --ai codex,claude-code --dry-run` selects Codex and Claude Code skill targets.
- `stackkit create <name> --skills <install|plan|skip> --dry-run` exposes explicit AI skill mode in human output and plan JSON.
- `stackkit create <name> --skill-link <copy|symlink> --dry-run` records link-mode metadata. Copy mode passes `--copy`; symlink mode omits a copy override and relies on the verified `npx skills` default behavior.
- `stackkit create <name> --web next --api fastapi --db postgres --auth auth0 --dry-run` resolves to canonical module IDs for Next.js, FastAPI, Postgres, SQLAlchemy, and framework-specific Auth0 modules.
- `stackkit create <name> --preset next-postgres-clerk --with docker --deploy vercel --dry-run` merges preset modules with stack-axis additions.
- `stackkit create <name> --api fastapi --with docker --deploy k8s --dry-run` resolves an API-only FastAPI stack with Docker and Kubernetes modules, including `apps/api/Dockerfile` and `deploy/kubernetes/api-deployment.yaml`.
- `stackkit recipe encode --preset next`, `stackkit recipe decode <code> --json`, and `stackkit create <name> --recipe <code> --dry-run` round-trip offline recipe data without embedding `projectName`.
- `apps/customizer` can generate an offline recipe command from friendly technology choices, including Vite and TanStack Start web frameworks and a ShadCN/Tailwind/none UI choice.
- `stackkit create <name> --web vite` and `--web tanstack-start` generate starter-depth projects (doctor passes); `--web next --ui none` omits ShadCN; the `vite` preset bundles ShadCN. Verified by generating real projects and running `stackkit doctor`.
- `stackkit create <name> --web next --api fastapi --db postgres --skills skip` generates ESLint, Prettier, Ruff, and mypy config; a live generated project passed `pnpm install`, `pnpm typecheck`, `pnpm lint`, and `pnpm format`.
- `stackkit create <name> --web next --api fastapi --db postgres --ts-quality biome --skills skip` generates `biome.json`, omits ESLint/Prettier config, and a live generated project passed `pnpm install`, `pnpm typecheck`, and `pnpm lint`.
- `stackkit create <name> --web next --api fastapi --db postgres --py-typecheck pyright --skills skip` generates `pyrightconfig.json`, omits `mypy.ini`, and a live generated project passed `pnpm install` and `pnpm typecheck`.
- Verified skill-source mappings include `antfu/skills@vite`, `deckardger/tanstack-agent-skills@tanstack-start-best-practices`, `paulrberg/agent-skills@biome-js`, and `bobmatnyc/claude-mpm-skills@mypy`.
- Official built-in presets include `next`, `vite`, `tanstack-start`, `next-postgres-clerk`, `next-postgres-better-auth`, `next-fastapi-postgres-auth0`, `next-axum-postgres-auth0`, and `containerized`.
- Generated projects include a root `stackkit.config.json` and manifest source provenance.
- `stackkit create` refuses existing non-empty or already Stackkit-managed target directories.
- A generated foundation project supports `pnpm install --lockfile-only`.
- `stackkit doctor` passes on a generated foundation project.
- `stackkit info --json --cwd <project>` reports manifest/config/skills-lock inventory for a generated project.
- `stackkit doctor` recommends concrete follow-up commands for unresolved skills and modified managed files.
- `stackkit diff --file <path> --cwd <project>` shows a structured managed-file diff.
- `stackkit create <name> --dry-run --view <path>` prints planned file content without the full JSON plan.
- `stackkit create <name> --dry-run --diff` prints file-oriented planned changes.
- `stackkit module list`, `stackkit module search <query>`, and `stackkit module inspect <alias-or-id> --json` expose registry discovery with canonical IDs in JSON.
- `stackkit registry list`, `stackkit registry list --json`, and `stackkit registry list --config <path>` expose the built-in registry and local declarative registry files read-only.
- Generated projects include deterministic `README.md` and `.env.example` files composed from module metadata.
- Generated root `package.json` and `turbo.json` wire `dev`, `build`, `test`, `typecheck`, `lint`, and `format`.
- `next-fastapi-postgres-auth0` generates Next.js, FastAPI, SQLAlchemy-owned Postgres metadata, Auth0 env metadata, Docker files, `apps/api/package.json`, and `apps/api/tests/test_health.py`.
- `next-fastapi-postgres-auth0` generated-project verification covers `pnpm install --lockfile-only`, dependency install, `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm lint`, `pnpm --dir apps/api exec uv run pytest` when `uv` is available, and `stackkit doctor` after the lifecycle checks.
- Example configs validate for:
  - `examples/next-shadcn/stackkit.config.json`
  - `examples/next-fastapi-postgres-auth0/stackkit.config.json`
  - `examples/next-rust-postgres-auth0/stackkit.config.json`
  - `examples/docker-kubernetes/stackkit.config.json`

## Usable Today

- `stackkit create --config <path>`
- `stackkit create --dry-run --config <path>`
- `stackkit create <name> --dry-run`
- `stackkit create <name> --pm <pnpm|npm|yarn|bun> --dry-run`
- `stackkit create <name> --ai <codex|claude-code[,target...]> --dry-run`
- `stackkit create <name> --skills <install|plan|skip> --dry-run`
- `stackkit create <name> --skill-link <copy|symlink> --dry-run`
- `stackkit create <name> --web <alias> --api <alias> --db <alias> --auth <alias> --dry-run`
- `stackkit create <name> --preset <preset> --with <aliases> --deploy <aliases> --dry-run`
- `stackkit create <name> --recipe <code> --dry-run`
- `stackkit create --config <path> --yes`
- `stackkit recipe encode --preset <preset>`
- `stackkit recipe encode --config <path>`
- `stackkit recipe decode <code> --json`
- `stackkit recipe inspect <code>`
- `stackkit doctor`
- `stackkit info --cwd <project>`
- `stackkit info --json --cwd <project>`
- `stackkit diff --file <path> --cwd <project>`
- `stackkit create <name> --dry-run --view <path>`
- `stackkit create <name> --dry-run --diff`
- `stackkit add <module> --dry-run --view <path> --dir <project>`
- `stackkit add <module> --dry-run --diff --dir <project>`
- `stackkit module list`
- `stackkit module search <query>`
- `stackkit module inspect <alias-or-id>`
- `stackkit registry list`
- `stackkit registry list --json`
- `stackkit registry list --config <path>`
- `stackkit preset list`
- `stackkit preset inspect <preset>`
- `stackkit config validate <path>`
- `pnpm --filter @berkayorhan/stackkit-customizer dev`

The CLI also exposes `add`, `remove`, `update`, `migrate`, `skills sync`, and `skills update`. These paths have tests, but they need more real generated-project verification before they should be treated as stable.

## Planning Artifacts

- Product spec: `docs/superpowers/specs/2026-06-05-stackkit-cli-product-design.md`
- Implementation slices:
  - `docs/superpowers/plans/2026-06-05-stackkit-slice-01-create-ux-config.md`
  - `docs/superpowers/plans/2026-06-05-stackkit-slice-02-package-manager-adapters.md`
  - `docs/superpowers/plans/2026-06-05-stackkit-slice-03-ai-skills-modes.md`
  - `docs/superpowers/plans/2026-06-05-stackkit-slice-04-recipes-aliases-presets.md`
  - `docs/superpowers/plans/2026-06-05-stackkit-slice-05-generated-project-depth.md`
  - `docs/superpowers/plans/2026-06-05-stackkit-slice-06-info-doctor-diff-discovery.md`
  - `docs/superpowers/plans/2026-06-05-stackkit-slice-07-registry-extension-points.md`
  - `docs/superpowers/plans/2026-06-05-stackkit-slice-08-customizer-prep.md`
- Execution branch: `codex/stackkit-cli-v1`
- Merge strategy: squash merge the all-in-one feature branch after the ship contract passes.

## Known Gaps

- Generated apps are still starter-level, but the foundation, Next.js, ShadCN, FastAPI, Vercel, Docker, and Kubernetes modules now emit coherent docs, scripts, and baseline checks.
- Auth and database modules mostly resolve metadata and AI skills. They do not yet generate meaningful application integration code.
- Auth0 provider selection resolves to the supported framework modules. `next --api axum --auth auth0` includes Auth0 for Next.js; an Axum Auth0 module will only be added after that module exists.
- Rust modules are declared, but Rust service templates are not implemented yet.
- Docker and Kubernetes deployment support the containerizable generated targets currently backed by templates: Next.js and FastAPI. Vite, TanStack Start, and Rust API container templates are not implemented yet.
- Vite and TanStack Start templates are starter-depth (entry, config, one route/page). TanStack Start's `routeTree.gen.ts` is generated by its Vite plugin at dev/build time and is git-ignored, so the generated app is not dependency-installed or built in CI.
- The web customizer is local-only. It does not host recipe IDs, persist configurations, or provide accounts.
- Remote registries are not supported yet. Configured `http` and `https` registry URLs are rejected instead of fetched.
- `--skill-link symlink` omits `--copy` from external install commands. Stackkit does not emit a separate `--symlink` flag because the verified `npx skills` behavior handles the non-copy path by default.
- `init` is registered in the CLI but not implemented.
- Managed file diff currently re-renders deterministic create-time files from the manifest. Files whose expected content depends on module metadata not stored in the manifest may need richer manifest provenance before diff can reproduce them perfectly.
- Full-stack generated projects still need Docker verification beyond the representative install, test, typecheck, build, lint, API pytest, and doctor checks.

## Next Steps

1. Verify `next-shadcn` as a generated project with install, typecheck, and build checks.
2. Add real database templates for Drizzle, SQLAlchemy, and Postgres env setup.
3. Add real auth integration templates for Clerk, Auth0, and Better Auth.
4. Add Rust service templates for Tokio, Axum, and SQLx.
5. Expand smoke tests from foundation-only generation to representative full-stack generation.
6. Add Docker build verification for the representative full-stack path.
7. Decide which lifecycle commands are ready for alpha use and document the rest as experimental.

## Readiness Estimate

- Internal alpha CLI: about 70 percent.
- Public monorepo generator: about 35 to 45 percent.

The main reason for the gap is that the platform mechanics are mostly in place, while the generated app implementations still need depth.
