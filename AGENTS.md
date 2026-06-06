# AGENTS.md

## Task Completion Requirements

Before changing code, inspect the relevant package, docs, tests, and existing patterns. Do not patch from memory when local code can answer the question.

Keep work in the current checkout unless the user explicitly asks for a branch or worktree. For large Stackkit changes, work in reviewable chunks and verify each meaningful milestone before moving on.

When there is a product, CLI UX, output-format, or lifecycle-contract uncertainty, surface it instead of guessing. Stackkit should be designed as a long-term generator platform, not a narrow frontend-only TypeScript MVP.

Run the narrowest useful verification first. For package-scoped changes, start with that package's `pnpm --filter <package> test` and `pnpm --filter <package> typecheck` where applicable. For shared contracts, generated output, or CLI behavior, also run the relevant root checks: `pnpm test`, `pnpm typecheck`, `pnpm build`, or `pnpm smoke`.

For app-scoped changes, run the app's package checks first: `pnpm --filter @berkayorhan/stackkit-customizer test`, `pnpm --filter @berkayorhan/stackkit-customizer typecheck`, `pnpm --filter @berkayorhan/stackkit-customizer build`, or the equivalent `@berkayorhan/stackkit-docs` commands. For visual or routing changes, also run the relevant dev server and verify the page in a browser.

For CLI entrypoint changes, build and run a direct CLI smoke check such as `node packages/cli/dist/index.js --help`. For generated-project behavior, verify a real generated project path when the change affects files, manifests, doctor, diff, lifecycle, skills, package-manager output, or end-to-end commands.

Do not call lifecycle work done just because core APIs exist. Add, remove, update, migrate, skills sync, and skills update are only complete when the CLI surface, manifest behavior, dry-run behavior, and verification path all agree.

Do not leave generated `packages/**/dist` output or `*.tsbuildinfo` files in the review unless the user explicitly asked for build artifacts.

## Project Snapshot

Stackkit is a TypeScript pnpm/Turborepo monorepo for a CLI, shared generator packages, and first-party apps around a long-term multi-language monorepo generator platform.

The CLI creates managed projects from presets, stack-axis flags, config files, and offline recipes. It records ownership and provenance in `.stackkit/project.json`, tracks AI skill state in `skills-lock.json`, and uses deterministic templates so doctor, diff, add, remove, update, and migration flows can reason about generated files.

Stackkit is currently an internal alpha. The platform mechanics are partly wired: create, config validation, presets, recipes, module discovery, registry listing, info, doctor, diff, AI skill planning, several lifecycle command paths, a local recipe customizer, and a docs app exist. Generated app implementations are still uneven: Next.js, ShadCN, FastAPI, Postgres metadata, Auth0 metadata, Vercel, Docker, and Kubernetes have starter-level support, while deeper auth, database, and Rust service templates still need work.

Python and Rust are first-class Stackkit targets. Do not collapse planning or package boundaries into a Next.js-only or TypeScript-only view.

AI skills are part of the product contract. Prefer official skills first, curated skills second, and local Stackkit guidance when no suitable external skill exists. Verify real `npx skills` behavior before changing skill-install logic.

Proposing sweeping changes that improve long-term maintainability is encouraged.

## Core Priorities

1. Performance first.
2. Reliability first.
3. Keep behavior predictable under load and during failures (session restarts, reconnects, partial streams).

If a tradeoff is required, choose correctness and robustness over short-term convenience.

## Maintainability

Long term maintainability is a core priority. If you add new functionality, first check if there is shared logic that can be extracted to a separate module. Duplicate logic across multiple files is a code smell and should be avoided. Don't be afraid to change existing code. Don't take shortcuts by just adding local logic to solve a problem.

Prefer native CLI delegation for framework, library, and platform initialization. Before hand-writing generated files for a tool that has an official `create`, `init`, `setup`, or migration command, start with a short research pass: install or execute the current official CLI, read its help/docs, generate a throwaway project, and map the files and commands it produces against Stackkit's monorepo and manifest model. If it can run non-interactively and fits Stackkit's ownership model, delegate to it through the package-manager adapter or lifecycle hooks, then record the resulting files in the manifest. Handwritten templates are acceptable for Stackkit-specific composition, small policy configs, or tools without a stable non-interactive initializer, but they should be the fallback rather than the default.

## Package Roles

`packages/schemas` owns public Zod schemas and TypeScript types. Put shared config, manifest, lifecycle, registry, file-operation, and command data shapes here when multiple packages need the contract. Avoid importing runtime planning, CLI, or template behavior into schemas.

`packages/templates` owns deterministic file rendering from typed inputs. Keep generated file content, package-manager-aware output, README/env composition, Docker/deploy files, and starter app templates here when they are pure rendering concerns. Templates should not resolve modules, mutate disk, parse CLI flags, or make registry policy decisions.

`packages/registry` owns built-in modules, presets, aliases, capability declarations, conflicts, AI-skill metadata, and local declarative registry shape. It should describe what exists and what it requires; it should not write files or own CLI formatting.

`packages/core` owns resolution, planning, safety checks, file plans, manifests, skill-install planning, doctor, diff, info, recipes, customizer catalog data, and lifecycle engines. Shared behavior belongs here before it is duplicated in CLI commands or tests.

`packages/cli` owns command registration, flags, prompts, stdout/stderr formatting, JSON markers, process exit behavior, and user-facing command flow. Keep business logic thin here; delegate validation, planning, and execution to core.

`packages/test-utils` is private test infrastructure. Use it for generated-project fixtures, integration helpers, and smoke paths that should not leak into published packages.

Dependency direction should stay predictable: schemas are the contract base; templates and registry consume schemas; core consumes schemas, templates, and registry-facing contracts; CLI consumes core, registry, and schemas. Do not introduce cycles.

## App Roles

`apps/customizer` is a local Next.js app for composing Stackkit projects visually and copying offline `stackkit create <name> --recipe <code>` commands. It should consume the shared customizer catalog, resolver, registry, and recipe APIs from `@berkayorhan/stackkit-core/customizer`, `@berkayorhan/stackkit-core`, and `@berkayorhan/stackkit-registry`. Do not duplicate module resolution, preset expansion, recipe encoding, or registry policy in UI code. Keep it offline unless the product contract changes: no accounts, hosted recipe IDs, persistence, telemetry, or backend storage.

`apps/docs` is the Fumadocs/Next.js documentation app for Stackkit. Keep docs content and docs routing inside the app's Fumadocs conventions, and keep package behavior aligned with the workspace contracts rather than hand-copying CLI, registry, or generated-project truth into isolated app logic. When documenting current behavior, prefer verified CLI output, package tests, and `docs/status.md` over stale assumptions.

## Autonomous build runs (the `ship` workflow)

When a build is driven end-to-end with no human gate (the `ship` skill — user AFK), these overrides hold for that run:

- **Reviewer approval is the only gate.** Never block on the human to approve a spec or plan; proceed the moment reviewers approve.
- **No git worktrees, ever.** No feature branch until explicitly told to make one.
- **AFK is not default → you may commits.**
- **Review per milestone, not per task** — code/spec review runs after each chunk, never after every individual task (too slow/costly).
- **Done = whole plan implemented *and* a live end-to-end test passes** — not unit tests + typecheck alone.
- Pipeline: (brainstorm to diverge → grill to converge) → spec → (spec review ∥ plan draft) → revise → (spec ∥ plan review) → implement (subagent-driven + TDD) → milestone review → E2E. Invoke with `/ship`.

## Reference Repos

No external reference repositories are pinned here yet.

When adding or using a reference repo, record the repo URL, commit or release, why it is relevant, and which Stackkit package or generated-project path it informs. Treat reference repos as evidence, not authority: verify behavior against current Stackkit contracts before copying patterns.

For AI-skill and framework behavior, prefer primary sources and official docs where possible. For curated skill sources, verify repo existence, skill names, and install behavior with `npx skills ... --list`, `npx skills find <query>`, or `gh repo view <owner/repo>` before recording the source in Stackkit docs or registry metadata.

## Contexts

- [Stackkit](./docs/CONTEXT.md) — the multi-language monorepo generator platform: modules,
  capabilities, tooling slots, presets, and recipes.
