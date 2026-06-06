# Postgres Host/Provider Support Implementation Plan (v2 — post-review)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development / TDD per task.
> **SHIP MODE:** No git commits (AFK). Tasks end with tests green in the working tree. No worktrees/branches.

**Goal:** Pick a Postgres host (Neon, Supabase cloud, Supabase local, local Docker, BYO) when scaffolding; generate correct connection scaffolding + ≤3 thin client templates. Host-only scope.

**Architecture (verified against source):** Declarative provider modules (`requires:["postgres"]`, mutual `conflicts`, provider skills). `db/drizzle`/`db/sqlalchemy` keep their generic `DATABASE_URL` unchanged (clients-keep model — avoids the `env.ts:37` merge collision); providers add only net-new vars (Supabase→`DIRECT_URL`). Static files (`docker-compose.db.yml`, `supabase/config.toml`) ride `module.files` (auto-emitted at `create.ts:252`). Parameterized client templates get new dispatch blocks in `renderCreateFiles`; provider derived from selected module ids, runtime from `config.options["db/drizzle"].runtime`.

**Verified facts:** resolver is single (`module-graph.ts:58`); env merge throws on incompatible dupes (`env.ts:37`); `config.options` exists + persists (`schemas:178`, `create.ts:180`); web app is App Router `apps/web/app/...` (no `src/`); CLI pkg = `@berkayorhan/stackkit`; conflicts enforced by `resolveModuleGraph`→`validateModuleConflicts` (`module-graph.ts:378`, throws).

**Spec:** `docs/superpowers/specs/2026-06-06-postgres-providers-design.md` (authoritative).

---

## Milestone 1 — Provider modules + presets (registry)
Files: `packages/registry/src/index.ts`; tests `packages/registry/src/database-providers.test.ts` (new), `presets.test.ts`, `module-files.test.ts` (frozen module-set — update for new ids).
Test cmd: `pnpm --filter @berkayorhan/stackkit-registry test`

### Task 1 — `postgres/supabase` (cloud)
- [ ] Test: module exists, `requires:["postgres"]`, `conflicts` ⊇ `[postgres/neon, postgres/supabase-local, postgres/local]`, declares **`DIRECT_URL`** (`target:"db"`) and **no `DATABASE_URL`**.
- [ ] Run → fail.
- [ ] Implement:
```ts
defineModule({
  id: "postgres/supabase",
  version: "1.0.0",
  title: "Supabase Postgres",
  description: "Supabase hosted Postgres (database host only)",
  aliases: ["supabase"],
  category: "database-provider",
  requires: ["postgres"],
  conflicts: ["postgres/neon", "postgres/supabase-local", "postgres/local"],
  envVars: [
    {
      name: "DIRECT_URL",
      description: "Supabase direct connection (session mode, port 5432) for migrations. App uses DATABASE_URL via the 6543 pooler with pgbouncer=true.",
      required: false,
      example: "postgres://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres",
      target: "db"
    }
  ],
  readme: { stack: ["Supabase Postgres"] },
  aiSkills: [{ source: "https://github.com/supabase/agent-skills", skills: ["supabase-postgres-best-practices"], trust: "official", causedBy: "postgres/supabase", reason: "Supabase Postgres connection pooling and schema guidance" }]
}),
```
- [ ] Run → pass.

### Task 2 — `postgres/local` (Docker)
- [ ] Test: exists, `requires:["postgres"]`, `conflicts` ⊇ `[postgres/neon, postgres/supabase, postgres/supabase-local]`, has `files` with a `docker-compose.db.yml` (owner `postgres/local`) whose content includes `postgres:17`. No env var.
- [ ] Run → fail.
- [ ] Implement (static `files`):
```ts
defineModule({
  id: "postgres/local",
  version: "1.0.0",
  title: "Local Postgres (Docker)",
  description: "Local Postgres via a Docker Compose service",
  aliases: ["postgres-local"],
  category: "database-provider",
  requires: ["postgres"],
  conflicts: ["postgres/neon", "postgres/supabase", "postgres/supabase-local"],
  files: [
    {
      kind: "write",
      path: "docker-compose.db.yml",
      owner: "postgres/local",
      overwrite: "if-owned",
      content: "services:\n  db:\n    image: postgres:17\n    environment:\n      POSTGRES_USER: postgres\n      POSTGRES_PASSWORD: postgres\n      POSTGRES_DB: app\n    ports:\n      - \"5432:5432\"\n    volumes:\n      - pgdata:/var/lib/postgresql/data\nvolumes:\n  pgdata:\n"
    }
  ],
  readme: { stack: ["Local Postgres (Docker)"] }
}),
```
- [ ] Run → pass.

### Task 3 — `postgres/supabase-local` (CLI)
- [ ] Test: exists, `requires:["postgres"]`, `conflicts` ⊇ `[postgres/neon, postgres/supabase, postgres/local]`, has `files` with `supabase/config.toml` (content includes `[db]` and `port = 54322`), declares `DIRECT_URL` (target db).
- [ ] Run → fail.
- [ ] Implement: like Task 1's env + `files:[{path:"supabase/config.toml", owner:"postgres/supabase-local", content:"project_id = \"app\"\n\n[db]\nport = 54322\n", overwrite:"if-owned", kind:"write"}]` + supabase skills. README note: requires Supabase CLI.
- [ ] Run → pass.

### Task 4 — extend `postgres/neon`
- [ ] Test: `conflicts` ⊇ `[postgres/supabase, postgres/supabase-local, postgres/local]`, `category:"database-provider"`. (No env var; keeps existing skills + `requires:["postgres"]`.)
- [ ] Run → fail. Implement: add `category` + `conflicts` to existing module. Run → pass.

### Task 5 — presets + frozen tests
- [ ] Test (`presets.test.ts`): `next-neon-drizzle` and `next-supabase-drizzle` exist; each has exactly one `postgres/*` provider id (`postgres/neon` / `postgres/supabase`) plus `db/postgres`,`db/drizzle`. Existing presets unchanged.
- [ ] Update `module-files.test.ts` frozen module-id/alias lists to include the 3 new modules.
- [ ] Run → fail → implement presets (copy `next-postgres-clerk` module list, swap auth out / add provider id) → pass.

**M1 CHECKPOINT:** `pnpm --filter @berkayorhan/stackkit-registry test` green → milestone review.

---

## Milestone 2 — Parameterized client templates (templates)
Files: `packages/templates/src/index.ts`; test `packages/templates/src/database-client.test.ts` (new).
Test cmd: `pnpm --filter @berkayorhan/stackkit-templates test`

### Task 6 — `renderDatabaseClient` standard Drizzle
- [ ] Test: `renderDatabaseClient({ client:"drizzle", runtime:"node" })` → file `apps/web/db/client.ts`, owner `db/drizzle`, content has `from "drizzle-orm/node-postgres"` and `from "pg"`.
- [ ] Run → fail.
- [ ] Implement `renderDatabaseClient({client, runtime, provider})` using `writeFile("apps/web/db/client.ts","db/drizzle", STANDARD_DRIZZLE)`:
```ts
const STANDARD_DRIZZLE = `import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool);
`;
```
- [ ] Run → pass.

### Task 7 — Neon serverless variant
- [ ] Test: `{client:"drizzle", runtime:"edge", provider:"postgres/neon"}` → content has `drizzle-orm/neon-http` + `@neondatabase/serverless`. `{runtime:"edge", provider:"postgres/supabase"}` → falls back to standard (`node-postgres`).
- [ ] Run → fail.
- [ ] Implement branch `runtime==="edge" && provider==="postgres/neon"` → NEON_SERVERLESS:
```ts
const NEON_SERVERLESS = `import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql);
`;
```
- [ ] Run → pass.

### Task 8 — Prisma datasource + `db/prisma` deps
- [ ] Test: `renderDatabaseClient({client:"prisma", provider:"postgres/supabase"})` → file `apps/web/prisma/schema.prisma`, owner `db/prisma`, content has `provider  = "postgresql"` and `directUrl = env("DIRECT_URL")`. `{client:"prisma", provider:"postgres/neon"}` → no `directUrl`.
- [ ] Run → fail.
- [ ] Implement Prisma branch (emit `schema.prisma`; include `directUrl` when `provider` is `postgres/supabase` or `postgres/supabase-local`). Add `packageChanges` to `db/prisma` in registry (`prisma`,`@prisma/client`) — covered by a registry test assertion too.
- [ ] Run → pass.

**M2 CHECKPOINT:** `pnpm --filter @berkayorhan/stackkit-templates test` green → review.

---

## Milestone 3 — Resolver + create wiring (core)
Files: `packages/core/src/module-graph.ts`, `packages/core/src/create.ts`; tests `module-graph.test.ts`, `create-plan.test.ts`.
Test cmd: `pnpm --filter @berkayorhan/stackkit-core test`

### Task 9 — `appendDatabaseProvider` + `StackAxes.dbProvider`
- [ ] Test (`module-graph.test.ts`): `resolveStackAxes({web:"web/nextjs", db:"db/postgres", dbProvider:"supabase"}, builtinModules)` includes exactly `["postgres/supabase"]` among `postgres/*`; omitting `dbProvider` includes none.
- [ ] Run → fail.
- [ ] Implement: add `dbProvider?: string` to `StackAxes`; in the `db === "db/postgres"` branch after `appendDatabaseClient`, call `appendDatabaseProvider(resolved, modules, axes.dbProvider)` which returns early when `!dbProvider || dbProvider==="byo"`, else `appendModule(resolved, resolveModuleAlias(dbProvider, modules))`.
- [ ] Run → pass.

### Task 10 — conflicts enforcement test
- [ ] Test (`module-graph.test.ts`): `resolveModuleGraph([db/postgres, postgres/neon, postgres/supabase])` throws `/conflicts with/`.
- [ ] Run → pass (metadata already enforces; if not, fix `conflicts`). Documents enforcement point.

### Task 11 — `renderCreateFiles` client dispatch
- [ ] Test (`create-plan.test.ts`): a config with modules `[...,web/nextjs,db/postgres,db/drizzle,postgres/neon]` + `options:{"db/drizzle":{runtime:"edge"}}` → plan file `apps/web/db/client.ts` with neon-http import. Same without options → standard. With `db/prisma` → `apps/web/prisma/schema.prisma`. With `db/sqlalchemy` (api stack) → **no** TS client file.
- [ ] Run → fail.
- [ ] Implement in `renderCreateFiles` after the existing dispatch blocks, before the `module.files` loop:
```ts
if (selectedModuleIds.has("web/nextjs") && selectedModuleIds.has("db/drizzle")) {
  const provider = [...selectedModuleIds].find((id) => id.startsWith("postgres/"));
  const runtime = (config.options?.["db/drizzle"]?.runtime as string) === "edge" ? "edge" : "node";
  appendSelectedFileOperations(operations, seenPaths, renderDatabaseClient({ client: "drizzle", runtime, provider }), selectedModuleIds);
}
if (selectedModuleIds.has("web/nextjs") && selectedModuleIds.has("db/prisma")) {
  const provider = [...selectedModuleIds].find((id) => id.startsWith("postgres/"));
  appendSelectedFileOperations(operations, seenPaths, renderDatabaseClient({ client: "prisma", runtime: "node", provider }), selectedModuleIds);
}
```
  Import `renderDatabaseClient` from `@berkayorhan/stackkit-templates`.
- [ ] Run → pass.

**M3 CHECKPOINT:** `pnpm --filter @berkayorhan/stackkit-core test` green → review.

---

## Milestone 4 — Surfaces (customizer + CLI)

### Task 12 — Customizer
Files: `apps/customizer/src/stackkit-customizer.ts`. Test cmd: `pnpm --filter @berkayorhan/stackkit-customizer typecheck` (+ existing tests).
- [ ] Add `DatabaseProviderChoice = "byo"|"neon"|"supabase"|"supabase-local"|"postgres-local"`; add `dbProvider`/`dbRuntime` to state; map into `resolveStackAxes` axes (`dbProvider` alias, `byo`→undefined). Runtime affects the generated CLI command string (`--db-runtime edge`), not resolver.
- [ ] Typecheck + tests green.

### Task 13 — CLI flags
Files: `packages/cli/src/index.ts`. Test cmd: `pnpm --filter @berkayorhan/stackkit test`.
- [ ] Test: `--db-provider supabase` resolves `postgres/supabase`; `--db-runtime edge` sets `config.options["db/drizzle"].runtime="edge"`; lone `--db-provider` triggers axis resolution (`hasCreateAxes`).
- [ ] Run → fail.
- [ ] Implement: add `.option("--db-provider <alias>", ...)` + `.option("--db-runtime <mode>", "...", "node")`; extend `CreateAxisOptions`, `resolveCreateAxisModules` (pass `dbProvider`), `hasCreateAxes` (include `dbProvider`), and set `config.options` from `--db-runtime`. Warn if `edge` without Neon+Drizzle.
- [ ] Run → pass.

**M4 CHECKPOINT:** `pnpm --filter @berkayorhan/stackkit test` green → review.

---

## Milestone 5 — E2E + verification (DONE gate)
### Task 14 — Per-provider scaffold E2E
- [ ] E2E test (extend test-utils create-integration): for `byo, neon, supabase, supabase-local, postgres-local` build a create plan via the real path and assert:
  - Supabase/supabase-local → `.env.example` has `DIRECT_URL`; Drizzle → `apps/web/db/client.ts`; `--db-runtime edge`+neon → neon-http import.
  - `postgres-local` → `docker-compose.db.yml`; `supabase-local` → `supabase/config.toml`.
  - api stack (sqlalchemy) → no TS client file.
- [ ] Run → fail → fix gaps.
- [ ] Run gates, show output: `pnpm typecheck` · `pnpm test` · `pnpm build` (+ `pnpm smoke`). All exit 0.
- [ ] `superpowers:verification-before-completion`; report E2E PASS with evidence. No commits.

---

## Self-review vs spec
- §3 modules → T1–T4 ✅ · §4 env (clients-keep, DIRECT_URL) → T1/T3 + T14 ✅ · §5 ≤3 templates + wiring + runtime → T6–T8/T11 ✅ · §6 static files → T2/T3 ✅ · §7 surfaces (single resolver, CLI touch points) → T9/T12/T13 ✅ · §8 testing/E2E → all + T14 ✅. Package names verified. Paths (`apps/web/...`, no `src/`) verified.
