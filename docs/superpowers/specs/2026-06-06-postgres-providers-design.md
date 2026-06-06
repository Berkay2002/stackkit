# Postgres Host/Provider Support — Design Spec

Date: 2026-06-06
Status: Approved (design phase, ship pipeline)
Scope owner: Stackkit registry/core/CLI/customizer

## 1. Problem

Today the scaffolder offers exactly one database axis: `db/postgres` (a "generic Postgres"
capability) plus an ORM client (`db/drizzle`, `db/prisma`, `db/sqlalchemy`, `rust/sqlx`,
`db/diesel`). Selecting Postgres generates **no running database, no provider provisioning,
and no connection wiring** — only a `DATABASE_URL` placeholder + AI skills. A `postgres/neon`
module exists but is skills-only.

Two real user journeys are unserved:

1. **Cloud Postgres (Neon / Supabase), no Docker.** The user wants a managed DB and a correct,
   provider-specific connection (pooled URL, SSL, and for Supabase+Prisma a separate
   `DIRECT_URL`). Today they get generic `pg` wiring and must know every provider quirk.
2. **Local Postgres / local Supabase.** The user wants a local DB. "Local Supabase" is *not*
   a Postgres container — it is the Supabase CLI stack (~10 Docker containers the CLI owns).
   "Local Postgres" is a single Docker service.

## 2. Scope

### In scope
- Provider/host selection for Postgres: **Neon**, **Supabase (cloud)**, **Supabase (local)**,
  **Postgres (local Docker)**, **BYO URL** (default / current behavior).
- Bounded, thin client codegen (≤3 templates — see §5).
- Correct env-var scaffolding per provider (the footgun-avoidance value).
- For Supabase-local: delegate to the Supabase CLI (generate `supabase/config.toml` +
  a `supabase start` script). **Do not** hand-author the Supabase stack.
- For Postgres-local: contribute a Postgres service to local Docker compose.
- Surfaces: customizer choice, CLI flags, core resolver, presets, tests.

### Explicitly OUT of scope (hard wall)
- **Supabase-as-BaaS**: `@supabase/supabase-js`, Supabase Auth (GoTrue), Storage, Realtime,
  Edge Functions. We support **Supabase as a Postgres host only**.
- The provider axis MUST NOT touch the `auth/*` axis. Auth stays fully independent.
- Neon branching automation, RLS generation, schema generation. Those remain AI-skill territory.
- MySQL / SQLite / Mongo. Postgres only, unchanged.

## 3. Architecture (stays on the existing declarative grain)

The repo's module shape (`packages/schemas/src/index.ts` `stackkitModuleSchema`) already supports
everything needed: `requires`, `provides`, `conflicts`, `files`, `envVars`, `packageChanges`,
`postCreate`, `aiSkills`. We add modules + a resolver axis; we do not invent a new mechanism.

### 3.1 New/extended provider modules

All provider modules: `requires: ["postgres"]`, `category: "database-provider"`, mutually
`conflicts` (so exactly one provider resolves), and attach provider AI skills.

| Module | State | Generates |
|--------|-------|-----------|
| `postgres/neon` | **extend** existing | `conflicts` + `category`; Neon skills (already present). No env var (clients-keep, §4). Connection shape in client comment/skill. |
| `postgres/supabase` | **new** (cloud) | `conflicts`; `envVars`: **`DIRECT_URL`** only (`target: "db"`); Supabase Postgres skills. |
| `postgres/supabase-local` | **new** | `conflicts`; `files`: `supabase/config.toml`; `envVars`: `DIRECT_URL`; note the Supabase CLI must be installed. |
| `postgres/local` | **new** | `conflicts`; `files`: `docker-compose.db.yml` with a `postgres:17` service (static, via `module.files`). |
| (none / `byo`) | default | **No provider module.** `DATABASE_URL` placeholder via the ORM client module (current behavior, unchanged). |

Mutual exclusion is enforced via `conflicts` listing the other provider module ids on each
provider module. The resolver also guarantees at most one is appended.

### 3.2 Provider conflicts set

Each provider module lists the other three in `conflicts`:
`["postgres/neon", "postgres/supabase", "postgres/supabase-local", "postgres/local"]` minus self.

## 4. Env-var scaffolding (clients-keep model — resolves the `DATABASE_URL` merge collision)

**Verified constraint:** `normalizeEnvVars`/`isCompatibleEnvVar` (`packages/core/src/env.ts:13,37`)
throw `"Incompatible environment variable metadata for <NAME>"` if two **selected** modules declare
the same env var with a different description/required/example/target. `db/drizzle` and
`db/sqlalchemy` already own `DATABASE_URL` (target `web` / `api`, empty example). Therefore a
provider module MUST NOT redeclare `DATABASE_URL` with a different shape, or every provider+client
combo fails at plan time.

**Resolution (low-churn, on-architecture):**
- `db/drizzle` / `db/sqlalchemy` keep their generic `DATABASE_URL` **unchanged**. No provider
  redeclares `DATABASE_URL`.
- Provider modules add only **net-new, non-colliding** env vars:
  - `postgres/supabase` & `postgres/supabase-local` add **`DIRECT_URL`** (`target: "db"`) — the one
    genuinely non-obvious footgun (Prisma migrations / direct connection).
  - `postgres/neon`, `postgres/local` add **no** env var.
- **Provider-specific connection-string shapes** (Neon pooled host + `sslmode=require`; Supabase
  6543 pooled `pgbouncer=true`; localhost ports) are surfaced via (a) a comment block in the
  generated client file (§5) and (b) the provider AI skill / README — **not** by overriding the
  `.env.example` `DATABASE_URL` line. This keeps a single owner per env var.
- `byo` = **no provider module** (current behavior). There is no `postgres/byo` module.

Verified env values (context7 `/supabase/supabase`, `/neondatabase/serverless`, 2026-06-06):

**Supabase `DIRECT_URL`** (session mode, port 5432; `DATABASE_URL` itself uses 6543 pooled
`pgbouncer=true`, documented in client comment/skill):
```
DIRECT_URL="postgres://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
```

> Implementation note: example strings are `.env.example` placeholders only (no secrets).
> A clean future enhancement (out of scope here) is provider-owned `DATABASE_URL` (requires moving
> ownership off the client modules + a default provider) to show provider-shaped examples inline.

## 5. Client codegen — bounded to ≤3 templates

This is the only place we cross from declarative into generated code. The matrix collapses
because only **Drizzle** has a driver fork, and only **Neon** offers a serverless driver:

| # | Template | Used when |
|---|----------|-----------|
| 1 | **Standard Drizzle client** (`drizzle-orm/node-postgres` + `pg`) | Drizzle + any provider, `--db-runtime node` (default). |
| 2 | **Neon-serverless Drizzle client** (`drizzle-orm/neon-http` + `@neondatabase/serverless`) | Drizzle + Neon + `--db-runtime edge` (opt-in). |
| 3 | **Prisma datasource block** in `schema.prisma` (`url` + `directUrl` when provider is Supabase) | Prisma + any provider. |

- **Python (SQLAlchemy) / Rust (SQLx/Diesel): NO client codegen.** The serverless driver is
  JS-only; for these, a provider is "just Postgres with a connection string + SSL". Provider
  selection only adjusts their `envVars`.
- Template #2 is gated behind `--db-runtime edge` and only applies to Neon+Drizzle. Any other
  combination with `edge` falls back to template #1 (standard) and logs a note.
**Wiring (verified):** `renderCreateFiles(config, modules)` (`packages/core/src/create.ts:189`)
already auto-emits any module's static `module.files` (loop at `create.ts:252`). The
*parameterized* client templates cannot be static, so they get **new dispatch blocks** in
`renderCreateFiles` (mirroring the `if (selectedModuleIds.has("deploy/docker"))` pattern at
`create.ts:244`):
- **Provider** is derived inside `renderCreateFiles` from `selectedModuleIds` (which `postgres/*`
  id is present) — no new parameter needed.
- **Runtime** (node/edge) is read from `config.options?.["db/drizzle"]?.runtime` (config carries
  `options`, schema `:178`, persisted to `stackkit.config.json` and recipes). Default `"node"`.
- Generated files use `writeFile(path, owner, content)` (`templates/src/index.ts:28`), owner =
  the **client** module id. The web app is App Router at `apps/web/app/...` (no `src/`).

> Known v1 limitation: `buildExpectedManagedFilePlan` (`create.ts:419`) rebuilds config from the
> manifest without `options`, so `stackkit diff` cannot detect the `edge` runtime later (it would
> regenerate the standard client). Provider IS recoverable from manifest module ids, so only the
> edge variant is affected. Out of scope; documented.

### Template #1 — standard Drizzle client
```ts
// apps/web/db/client.ts  (owner: db/drizzle)
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool);
```

### Template #2 — Neon serverless (runtime: edge)
```ts
// apps/web/db/client.ts  (owner: db/drizzle, runtime: edge)
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql);
```

### Template #3 — Prisma datasource
```prisma
// apps/web/prisma/schema.prisma  (owner: db/prisma)
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL") // emitted only when provider is Supabase / Supabase-local
}
```

**Dependencies (deliberate scope choice):** the generated client is a documented **starter** file
with an `// Install: ...` hint comment; v1 does **not** add a runtime-conditional `packageChanges`
deps pipeline. This matches the repo's current philosophy (ORM modules already don't install their
deps; integration is intentionally shallow — `docs/status.md`) and avoids a provider × runtime deps
matrix. Installing the listed deps is a one-line step surfaced in the file + the provider AI skill.
A `packageChanges`-based auto-install is a clean future enhancement.

## 6. Local Docker integration

- `postgres/local` writes a **separate** `docker-compose.db.yml` (owner `postgres/local`) rather
  than mutating `deploy/docker`'s `docker-compose.yml`. Rationale: `FileOperation` ownership —
  two modules writing one path collides; a separate compose file avoids it and is composable
  (`docker compose -f docker-compose.yml -f docker-compose.db.yml up`). A `postCreate`/README note
  documents the combined command.
- `postgres/supabase-local` writes `supabase/config.toml` (the `supabase init` output) and adds a
  `db:start` script running `supabase start`. It does **not** generate a compose file — the
  Supabase CLI owns its stack. README note: requires the Supabase CLI installed.
- Cloud providers (`neon`, `supabase`) generate **no** Docker artifacts.

## 7. Surfaces

### 7.1 Customizer (`apps/customizer/src/stackkit-customizer.ts`)
- Add `DatabaseProviderChoice = "byo" | "neon" | "supabase" | "supabase-local" | "postgres-local"`.
- Add `dbProvider: DatabaseProviderChoice` and `dbRuntime: "node" | "edge"` to `CustomizerState`.
- `DatabaseChoice` stays `"none" | "postgres"`; provider only meaningful when `database==="postgres"`.
- Pass `dbProvider` / `dbRuntime` into `resolveStackAxes`.

### 7.2 Core resolver (`packages/core/src/module-graph.ts` — single resolver, verified)
- `resolveStackAxes` lives **only** in `module-graph.ts:58` (exported via the barrel). There is no
  second copy. Extend `StackAxes` (`module-graph.ts:15`) with `dbProvider?: string`.
- Inside the existing `db === "db/postgres"` branch (`:88`), after `appendDatabaseClient`, append
  exactly one provider via a new `appendDatabaseProvider(resolved, modules, axes.dbProvider)` that
  skips when `dbProvider` is undefined/`"byo"` and resolves aliases (`supabase` → `postgres/supabase`).
- Runtime is **not** a resolver axis (it backs no module); it travels via `config.options` (§5).
- Mutual exclusion is enforced downstream by `resolveModuleGraph` → `validateModuleConflicts`
  (`module-graph.ts:378`, throws). The single `dbProvider` axis already guarantees ≤1 provider.

### 7.3 CLI (`packages/cli/src/index.ts`)
- Add `--db-provider <alias>` (`neon|supabase|supabase-local|postgres-local`; absent ⇒ `byo`).
- Add `--db-runtime <mode>` (`node|edge`; default `node`) → sets `config.options["db/drizzle"] = { runtime }`.
- Touch points (verified): the `.option()` block, the `axes:` literal, **`CreateAxisOptions`**,
  **`resolveCreateAxisModules`**, and **`hasCreateAxes`** (a lone `--db-provider` must trigger axis
  resolution). Validate `edge` is only meaningful with Neon+Drizzle (warn otherwise; fall back to node).
- Package name for `pnpm --filter`: **`@berkayorhan/stackkit`** (no `-cli` suffix).

### 7.4 Presets (`packages/registry/src/index.ts`)
- Add at least: `next-supabase-drizzle` (Supabase cloud + Drizzle) and `next-neon-drizzle`
  (Neon + Drizzle). Each includes exactly one provider module. Existing presets unchanged.

## 8. Testing

Framework: **Vitest** (`pnpm test` → `turbo run test`).

### Unit
- **Registry** (`packages/registry/src/*.test.ts`): each provider module `requires:["postgres"]`,
  carries the full mutual `conflicts` set, and attaches expected skills. New presets include exactly
  one provider module.
- **Core resolver** (`packages/core/src/*.test.ts`): `resolveStackAxes` appends exactly one provider;
  `byo` appends none; provider conflicts reject two-provider configs; `dbRuntime:"edge"` only changes
  output for Neon+Drizzle.
- **Env scaffolding**: Supabase ⇒ both `DATABASE_URL` (`pgbouncer=true`) and `DIRECT_URL`; Neon ⇒
  `sslmode=require`; locals ⇒ localhost URLs.
- **Client templates** (`packages/templates/src/*.test.ts`): correct template per
  provider×client×runtime; Python/Rust emit no client file; Supabase Prisma datasource includes
  `directUrl`; `postgres/local` emits `docker-compose.db.yml`; `postgres/supabase-local` emits
  `supabase/config.toml`.

### E2E ("done" gate)
Scaffold one project per provider via the real CLI create path (`create --dry-run --diff` into a
temp dir, or full create in a temp dir) for: `neon`, `supabase`, `supabase-local`, `postgres-local`,
`byo`. Assert generated `.env.example`, client file (or absence), and config files match expectations.
Shown PASSING.

### Commands (must exit 0 with output shown)
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- E2E via the create path (and/or `pnpm smoke`).

## 9. Milestones

1. **Registry**: provider modules (`supabase`, `supabase-local`, `local`) + extend `neon`;
   conflicts; skills; presets. Unit tests green.
2. **Templates**: 3 client templates + `docker-compose.db.yml` + `supabase/config.toml` emitters.
   Unit tests green.
3. **Core resolver**: `appendDatabaseProvider`, `dbProvider`/`dbRuntime` axes, conflict enforcement.
   Unit tests green.
4. **Surfaces**: customizer types/state, CLI flags, validation. Unit tests green.
5. **E2E + verification**: per-provider scaffold assertions; `pnpm test/typecheck/build` green.

Code review runs after each milestone (not each task). No git commits (AFK).

## 10. Open implementation details (resolve during build, document the choice)
- Exact path of the generated Drizzle client (`apps/web/src/db/client.ts` vs existing convention) —
  follow whatever path the current web template uses; verify before writing.
- Whether `DIRECT_URL` is emitted for Supabase+Drizzle (proposed: yes, documented optional).
- Default Postgres image tag for `postgres/local` (proposed `postgres:17`).
- Confirm Supabase-local default port (`54322`) against the installed CLI version.

## 10b. Pre-existing tech debt surfaced (follow-ups, not introduced here)
- **Duplicated resolver:** `resolveStackAxes`/`StackAxes`/`appendDatabaseClient` are byte-duplicated
  between `packages/core/src/module-graph.ts` (barrel `.` entry → CLI/E2E) and
  `packages/core/src/customizer.ts` (`/customizer` subpath → customizer app); `defineModule` is also
  duplicated in `registry.ts`. This feature's resolver change had to be applied to **both** copies.
  Recommended follow-up: collapse `customizer.ts` to re-export the resolver from `module-graph.ts`.
- **`--db-runtime` on recipe/config paths:** the flag only affects scripted-axis creates; with
  `--recipe`/`--config` the persisted `options` win. Documented in the flag help text.

## 11. Non-goals / tech-debt ceiling (restated)
The maximum generated-code surface introduced by this feature is **3 client templates + 2 config
file emitters**. If an approach would require a per-framework × per-provider × per-runtime explosion
of generated files, that is a signal the scope wall in §2 is being violated — stop and reduce.
