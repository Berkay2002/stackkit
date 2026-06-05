# Stackkit Slice 05 Generated Project Depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Use the existing `codex/stackkit-cli-v1` branch, do not create worktrees, and commit after each verified milestone.

**Goal:** Make official generated projects deeper and coherent: deterministic README, env metadata, root scripts, health endpoints, tests, lint/format configs, and coherent DB/auth ownership for Next/FastAPI/Auth0.

**Architecture:** Modules contribute structured metadata and file operations. Templates remain deterministic and formatted. README and `.env.example` are composed from module metadata in core.

**Tech Stack:** TypeScript templates, FastAPI, SQLAlchemy, pytest, Ruff, Vitest where needed, Turborepo.

---

## File Structure

- `packages/schemas/src/index.ts`: extend env/readme/verification metadata.
- `packages/core/src/index.ts`: compose README, env files, verification commands, and next commands.
- `packages/core/src/readme.test.ts`: README composition tests.
- `packages/core/src/create-execution.test.ts`: env and verification command tests.
- `packages/templates/src/index.ts`: improve root, Next.js, FastAPI, Docker templates.
- `packages/templates/src/api-fastapi.test.ts`: FastAPI health/auth/db/test templates.
- `packages/templates/src/web-nextjs.test.ts`: Next.js scripts and auth boundary.
- `packages/registry/src/index.ts`: adjust presets and metadata.
- `packages/registry/src/presets.test.ts`: one DB owner rule.
- `packages/test-utils/src/create-integration.test.ts`: generated project assertions.

## Review Hardening

- README metadata must cover stack, layout, prerequisites, install commands, dev commands, verification commands, environment variables, and the Stackkit section. Do not stop at stack/layout/commands.
- `.env.example` and README env tables must be generated from the same env metadata. Duplicate env vars must be compatible or fail validation.
- Root generated projects must include `dev`, `build`, `test`, `typecheck`, `lint`, and `format` scripts where applicable, plus Turbo task wiring.
- FastAPI `pyproject.toml` must include runtime deps and dev/test tooling: FastAPI, uvicorn, pytest, httpx, and Ruff in the appropriate dependency groups.
- Official generated project depth must be verified through at least one full-stack generated project, not only file assertions. Use `next-fastapi-postgres-auth0` as the representative path.
- If `uv` is unavailable on the machine, integration tests may skip Python execution with an explicit guard, but the plan must still include the command and record the skip reason.

## Task 1: Add README Metadata And Composer

**Files:**
- Create: `packages/core/src/readme.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/schemas/src/index.ts`

- [ ] **Step 1: Write failing README tests**

Create `packages/core/src/readme.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { composeReadme, defineModule } from "./index.js";

describe("composeReadme", () => {
  it("renders a deterministic stack-aware README", () => {
    const modules = [
      defineModule({
        id: "web/nextjs",
        version: "1.0.0",
        title: "Next.js",
        description: "Web app",
        readme: {
          stack: ["Next.js"],
          layout: [{ path: "apps/web", description: "Next.js web app" }],
          commands: [{ label: "Web dev", command: "pnpm dev" }]
        }
      }),
      defineModule({
        id: "api/fastapi",
        version: "1.0.0",
        title: "FastAPI",
        description: "API service",
        readme: {
          stack: ["FastAPI"],
          layout: [{ path: "apps/api", description: "FastAPI service" }],
          commands: [{ label: "API tests", command: "pnpm test" }]
        }
      })
    ];

    expect(composeReadme({ projectName: "acme", packageManager: "pnpm", modules })).toContain("# acme");
    expect(composeReadme({ projectName: "acme", packageManager: "pnpm", modules })).toContain("- Next.js");
    expect(composeReadme({ projectName: "acme", packageManager: "pnpm", modules })).toContain("`apps/api` - FastAPI service");
  });
});
```

- [ ] **Step 2: Run failing tests**

Run:

```powershell
pnpm --filter @stackkit/core test -- readme
```

Expected: fails because README schema/composer is missing.

- [ ] **Step 3: Add schema and composer**

Add to `packages/schemas/src/index.ts`:

```ts
export const readmeMetadataSchema = z.object({
  stack: z.array(z.string()).default([]),
  layout: z.array(z.object({ path: z.string(), description: z.string() })).default([]),
  prerequisites: z.array(z.string()).default([]),
  installCommands: z.array(z.object({ label: z.string(), command: z.string() })).default([]),
  devCommands: z.array(z.object({ label: z.string(), command: z.string() })).default([]),
  verificationCommands: z.array(z.object({ label: z.string(), command: z.string() })).default([]),
  commands: z.array(z.object({ label: z.string(), command: z.string() })).default([])
});
```

Add optional `readme` to `stackkitModuleSchema`.

Add `composeReadme` in `packages/core/src/index.ts` with fixed section order:

```text
# project
## Stack
## Project Layout
## Prerequisites
## Install
## Development
## Verification
## Commands
## Environment
## Stackkit
```

- [ ] **Step 4: Add README to create file plan**

In `renderCreateFiles`, add a `README.md` write operation from `composeReadme`.

- [ ] **Step 5: Run tests**

Run:

```powershell
pnpm --filter @stackkit/schemas test
pnpm --filter @stackkit/core test -- readme create-plan create-apply
```

Expected: pass after updating snapshots or exact file counts.

## Task 2: Compose `.env.example` From Module Metadata

**Files:**
- Modify: `packages/schemas/src/index.ts`
- Modify: `packages/core/src/create-execution.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add failing env tests**

Add to `packages/core/src/create-execution.test.ts`:

```ts
it("groups env examples from selected modules", async () => {
  const envVars = [
    { name: "DATABASE_URL", description: "Database connection string.", required: true, example: "", target: "api" },
    { name: "AUTH0_CLIENT_SECRET", description: "Auth0 client secret.", required: true, example: "", target: "web" }
  ];

  const operations = await planEnvExampleFiles("C:\\project", envVars);

  expect(operations[0].content).toContain("# API");
  expect(operations[0].content).toContain("DATABASE_URL=");
  expect(operations[0].content).toContain("AUTH0_CLIENT_SECRET=");
});
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
pnpm --filter @stackkit/core test -- create-execution
```

Expected: fails if `target` is unsupported or grouping is absent.

- [ ] **Step 3: Extend env schema**

Add optional `target` to `envVarDefinitionSchema`:

```ts
target: z.enum(["root", "web", "api", "db"]).default("root")
```

- [ ] **Step 4: Update env renderer**

Group by target with stable headings. Keep blank examples for real secrets. Do not write `.env`.

Before writing, validate duplicate names:

- same name and compatible example/required/description metadata: render once.
- same name but incompatible metadata: fail create planning with a validation error.

Use the same ordered env metadata for `.env.example` and README environment tables.

- [ ] **Step 5: Run focused tests**

Run:

```powershell
pnpm --filter @stackkit/schemas test -- file-operations
pnpm --filter @stackkit/core test -- create-execution
```

Expected: pass.

## Task 3: Improve FastAPI Template

**Files:**
- Modify: `packages/templates/src/index.ts`
- Modify: `packages/templates/src/api-fastapi.test.ts`

- [ ] **Step 1: Add failing FastAPI tests**

Add to `packages/templates/src/api-fastapi.test.ts`:

```ts
it("renders FastAPI package bridge and health test", () => {
  const files = renderFastApiService({ serviceName: "api", projectName: "acme" });

  expect(files.find((file) => file.path === "apps/api/package.json")?.content).toContain("uv run pytest");
  expect(files.find((file) => file.path === "apps/api/app/main.py")?.content).toContain('@app.get("/health")');
  expect(files.find((file) => file.path === "apps/api/tests/test_health.py")?.content).toContain("test_health");
});
```

- [ ] **Step 2: Run failing template test**

Run:

```powershell
pnpm --filter @stackkit/templates test -- api-fastapi
```

Expected: fails if package bridge or projectName option is absent.

- [ ] **Step 3: Implement template changes**

Update `renderFastApiService` to emit:

```text
apps/api/package.json
apps/api/pyproject.toml
apps/api/app/main.py
apps/api/app/auth.py when auth module selected later
apps/api/tests/test_health.py
```

Use scripts:

```json
{
  "dev": "uv run uvicorn app.main:app --reload",
  "test": "uv run pytest",
  "typecheck": "uv run python -m compileall app",
  "lint": "uv run ruff check .",
  "format": "uv run ruff format ."
}
```

In `pyproject.toml`, include:

```toml
dependencies = [
  "fastapi",
  "uvicorn[standard]"
]

[dependency-groups]
dev = [
  "httpx",
  "pytest",
  "ruff"
]
```

- [ ] **Step 4: Run template tests**

Run:

```powershell
pnpm --filter @stackkit/templates test -- api-fastapi
```

Expected: pass.

## Task 4: Fix Full-Stack Preset DB Ownership

**Files:**
- Modify: `packages/registry/src/index.ts`
- Modify: `packages/registry/src/presets.test.ts`

- [ ] **Step 1: Add failing preset test**

Add to `packages/registry/src/presets.test.ts`:

```ts
it("uses one database owner in next-fastapi-postgres-auth0", () => {
  const preset = builtinPresets.find((item) => item.id === "next-fastapi-postgres-auth0");

  expect(preset?.modules).toContain("db/sqlalchemy");
  expect(preset?.modules).not.toContain("db/drizzle");
});
```

- [ ] **Step 2: Run failing registry tests**

Run:

```powershell
pnpm --filter @stackkit/registry test -- presets
```

Expected: fails if Drizzle remains in the preset.

- [ ] **Step 3: Update preset**

Remove `db/drizzle` from `next-fastapi-postgres-auth0`. Ensure `db/sqlalchemy` remains.

- [ ] **Step 4: Run registry tests**

Run:

```powershell
pnpm --filter @stackkit/registry test -- presets
```

Expected: pass.

## Task 4B: Add Root Scripts And Quality Configs

**Files:**
- Modify: `packages/templates/src/index.ts`
- Modify: `packages/templates/src/foundation.test.ts`
- Modify: `packages/templates/src/web-nextjs.test.ts`
- Modify: `packages/templates/src/api-fastapi.test.ts`

- [ ] **Step 1: Add failing template tests**

Assert generated root files include:

```text
package.json scripts: dev, build, test, typecheck, lint, format
turbo.json tasks: dev, build, test, typecheck, lint, format
```

Assert app package bridges exist for web and api packages.

- [ ] **Step 2: Implement root and app script wiring**

Use package-manager adapter commands from Slice 02 when commands are shown in README or next actions.

- [ ] **Step 3: Run template tests**

Run:

```powershell
pnpm --filter @stackkit/templates test -- foundation web-nextjs api-fastapi
```

Expected: pass.

## Task 5: Verify Generated Project Depth

**Files:**
- Modify: `packages/test-utils/src/create-integration.test.ts`
- Modify: `docs/status.md`

- [ ] **Step 1: Add generated project assertions**

In `packages/test-utils/src/create-integration.test.ts`, assert that generated `next-fastapi-postgres-auth0` includes:

```text
README.md
.env.example
apps/api/package.json
apps/api/tests/test_health.py
```

Also run, when dependencies are available:

```powershell
pnpm install --lockfile-only
pnpm test
pnpm typecheck
pnpm --dir apps/api exec uv run pytest
stackkit doctor
```

If `uv` is not installed, skip only the API runtime command with an explicit skip message. Do not skip generated file, root script, README, env, or doctor checks.

- [ ] **Step 2: Run integration tests**

Run:

```powershell
pnpm --filter @stackkit/test-utils test -- create-integration
```

Expected: pass.

- [ ] **Step 3: Run full verification**

Run:

```powershell
pnpm typecheck
pnpm test
pnpm smoke
```

Expected: pass.

- [ ] **Step 4: Update status**

Update `docs/status.md` with verified generated project depth.
