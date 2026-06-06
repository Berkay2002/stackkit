# Native Initializers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a typed native initializer contract and migrate ShadCN to it while representing the researched official CLI candidates.

**Architecture:** Schemas own the declarative contract. Registry modules declare commands. Core resolves, plans, executes, and records resulting files. CLI remains thin because create already delegates to core.

**Tech Stack:** TypeScript, Zod, Vitest, pnpm, Stackkit core/registry/schemas.

---

### Task 1: Contract Tests

**Files:**
- Modify: `packages/schemas/src/index.ts`
- Test: `packages/core/src/create-execution.test.ts`
- Test: `packages/core/src/create-plan.test.ts`

- [ ] Add failing tests for parsing a module with `nativeInitializers`.
- [ ] Add failing tests showing a create plan exposes native initializer metadata.
- [ ] Add failing tests showing `applyCreatePlan` executes declared native initializers and refreshes modified file hashes.

### Task 2: Schema and Planner

**Files:**
- Modify: `packages/schemas/src/index.ts`
- Modify: `packages/core/src/create.ts`

- [ ] Add `nativeInitializerSchema` and exported types.
- [ ] Add native initializer summaries to `CreatePlan`.
- [ ] Keep `selectedModules` non-serializable.
- [ ] Resolve `when` gates from selected module ids and capabilities.

### Task 3: Executor

**Files:**
- Modify: `packages/core/src/create.ts`
- Modify: `packages/core/src/package-manager.ts` if needed

- [ ] Convert package-manager `dlx` tools to command/args.
- [ ] Support direct/system commands for Cargo, uv, Django, and future non-npm tools.
- [ ] Run initializers after file rendering and before manifest expected-file capture.
- [ ] Refresh managed hashes and append expected file records for declared files that exist.

### Task 4: Registry Migration

**Files:**
- Modify: `packages/registry/src/index.ts`
- Test: `packages/registry/src/*.test.ts` as needed

- [ ] Move ShadCN init command into `ui/shadcn.nativeInitializers`.
- [ ] Declare researched candidate initializers for Next.js, Vite, TanStack Start, Prisma, Supabase local, Clerk, Biome, Turborepo, Django, Cargo, and Tauri where module ids exist.
- [ ] Mark Clerk with `external-state`, `--keyless`, `--yes`, and `--no-skills`.
- [ ] Remove `planShadcnInitHooks`.

### Task 5: Verification

**Commands:**
- `pnpm --filter @berkayorhan/stackkit-schemas test`
- `pnpm --filter @berkayorhan/stackkit-core test`
- `pnpm --filter @berkayorhan/stackkit-registry test`
- `pnpm --filter @berkayorhan/stackkit-core typecheck`
- `pnpm --filter @berkayorhan/stackkit-registry typecheck`
- `pnpm build`

- [ ] Run focused tests first.
- [ ] Build the CLI.
- [ ] Generate real projects for ShadCN and at least one other enabled initializer path.
- [ ] Run `node packages/cli/dist/index.js doctor --dir <generated-project>` on generated projects.
- [ ] Remove generated `packages/**/dist` and `*.tsbuildinfo` artifacts before final report.
