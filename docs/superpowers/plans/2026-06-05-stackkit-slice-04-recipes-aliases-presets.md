# Stackkit Slice 04 Recipes, Aliases, And Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Use the existing `codex/stackkit-cli-v1` branch, do not create worktrees, and commit after each verified milestone.

**Goal:** Add friendly aliases, stack-axis create flags, polished built-in preset metadata, and offline recipe encode/decode support.

**Architecture:** Registry exposes human-facing aliases and metadata. Core resolves aliases and recipes into normal `StackkitConfig`. CLI only parses flags and formats output.

**Tech Stack:** TypeScript, Zod, Vitest, Commander, Node Buffer base64url encoding.

---

## File Structure

- `packages/schemas/src/index.ts`: add recipe schema and optional alias metadata types.
- `packages/registry/src/index.ts`: add aliases, categories, and official preset metadata.
- `packages/registry/src/presets.test.ts`: verify official presets and one DB owner rule.
- `packages/core/src/index.ts`: add alias resolver, axis resolver, recipe encoder/decoder.
- `packages/core/src/recipe.test.ts`: recipe behavior.
- `packages/core/src/module-aliases.test.ts`: alias resolution behavior.
- `packages/cli/src/index.ts`: add stack-axis flags and `recipe` command group.
- `packages/cli/src/cli.test.ts`: CLI coverage.

## Prerequisites

- Slice 01 must have deterministic scripted `create <name> --dry-run` and schema-level slug validation.
- Slice 03 should have extracted reusable `packageManagerSchema` and `aiConfigSchema`, or this slice must extract them before adding recipe schemas.

## Review Hardening

- Friendly aliases are CLI/user-facing only. Manifests and ownership records store canonical module IDs.
- Stack-axis flags are part of this slice. Implement and test `--web`, `--api`, `--db`, `--db-client`, `--auth`, `--with`, and `--deploy`.
- Official preset metadata and IDs are part of this slice. Verify the exact IDs from the spec, especially `next-postgres-better-auth`, `next-fastapi-postgres-auth0`, and `next-axum-postgres-auth0`.
- Resolver behavior must be table-driven and deterministic for common stacks. Cover `next`, `next+postgres+clerk`, `next+fastapi+postgres+auth0`, `next+axum+postgres+auth0`, Docker, Kubernetes, and mutually exclusive auth providers.
- Recipes must exclude `projectName`, use offline encoded config only, and round-trip through the same schema as CLI/config create.
- CLI tests should use `runProgram`. Update command-surface tests intentionally when adding `recipe` and stack-axis flags.

## Task 1: Add Alias Metadata To Registry

**Files:**
- Modify: `packages/schemas/src/index.ts`
- Modify: `packages/registry/src/index.ts`
- Modify: `packages/registry/src/module-files.test.ts`

- [ ] **Step 1: Add failing registry test**

Add to `packages/registry/src/module-files.test.ts`:

```ts
it("declares unique friendly aliases for public modules", () => {
  const aliases = builtinModules.flatMap((module) => module.aliases ?? []);

  expect(aliases).toContain("next");
  expect(aliases).toContain("fastapi");
  expect(aliases).toContain("postgres");
  expect(new Set(aliases).size).toBe(aliases.length);
});
```

- [ ] **Step 2: Run failing registry test**

Run:

```powershell
pnpm --filter @stackkit/registry test -- module-files
```

Expected: fails because aliases are missing.

- [ ] **Step 3: Extend module schema**

In `packages/schemas/src/index.ts`, add optional fields to `stackkitModuleSchema`:

```ts
aliases: z.array(z.string().min(1)).default([]),
category: z.string().min(1).optional(),
```

- [ ] **Step 4: Add aliases to built-ins**

In `packages/registry/src/index.ts`, add aliases and categories to key modules:

```ts
{
  id: "web/nextjs",
  aliases: ["next", "nextjs"],
  category: "web",
  ...
}
```

Use unique aliases:

```text
next
shadcn
tailwind
fastapi
flask
django
postgres
drizzle
sqlalchemy
sqlx
clerk
auth0
better-auth
vercel
docker
kubernetes
```

Do not give `auth0` to service-specific modules directly. Use resolver logic for provider groups.

- [ ] **Step 5: Run registry tests**

Run:

```powershell
pnpm --filter @stackkit/schemas test
pnpm --filter @stackkit/registry test -- module-files
```

Expected: pass.

## Task 2: Implement Alias And Axis Resolver

**Files:**
- Create: `packages/core/src/module-aliases.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing resolver tests**

Create `packages/core/src/module-aliases.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { defineModule, resolveModuleAlias, resolveStackAxes } from "./index.js";

const modules = [
  defineModule({ id: "workspace/pnpm-turbo", version: "1.0.0", title: "pnpm", description: "workspace", provides: ["workspace/node"], aliases: ["workspace"] }),
  defineModule({ id: "workspace/typescript", version: "1.0.0", title: "TypeScript", description: "ts", requires: ["workspace/node"], aliases: ["typescript"] }),
  defineModule({ id: "web/nextjs", version: "1.0.0", title: "Next.js", description: "web", requires: ["workspace/node"], provides: ["web-app", "nextjs-app", "react"], aliases: ["next"] }),
  defineModule({ id: "api/fastapi", version: "1.0.0", title: "FastAPI", description: "api", provides: ["api", "python", "fastapi"], aliases: ["fastapi"] }),
  defineModule({ id: "db/postgres", version: "1.0.0", title: "Postgres", description: "db", provides: ["postgres"], aliases: ["postgres"] }),
  defineModule({ id: "db/sqlalchemy", version: "1.0.0", title: "SQLAlchemy", description: "db client", requires: ["postgres", "python"], aliases: ["sqlalchemy"] }),
  defineModule({ id: "auth/auth0-nextjs", version: "1.0.0", title: "Auth0 Next.js", description: "auth", requires: ["react"] }),
  defineModule({ id: "auth/auth0-fastapi", version: "1.0.0", title: "Auth0 FastAPI", description: "auth", requires: ["python"] })
];

describe("module aliases", () => {
  it("resolves a friendly alias to a module id", () => {
    expect(resolveModuleAlias("fastapi", modules)).toBe("api/fastapi");
    expect(resolveModuleAlias("api/fastapi", modules)).toBe("api/fastapi");
  });

  it("resolves stack axes into coherent modules", () => {
    expect(
      resolveStackAxes(
        {
          web: "next",
          api: "fastapi",
          db: "postgres",
          auth: "auth0"
        },
        modules
      )
    ).toEqual([
      "workspace/pnpm-turbo",
      "workspace/typescript",
      "web/nextjs",
      "api/fastapi",
      "db/postgres",
      "db/sqlalchemy",
      "auth/auth0-nextjs",
      "auth/auth0-fastapi"
    ]);
  });
});
```

- [ ] **Step 2: Run failing tests**

Run:

```powershell
pnpm --filter @stackkit/core test -- module-aliases
```

Expected: fails because resolver functions are missing.

- [ ] **Step 3: Implement resolver**

Add to `packages/core/src/index.ts`:

```ts
export type StackAxes = {
  web?: string;
  api?: string;
  db?: string;
  dbClient?: string;
  auth?: string;
  deploy?: readonly string[];
};

export function resolveModuleAlias(input: string, modules: readonly StackkitModule[]): string {
  if (modules.some((module) => module.id === input)) {
    return input;
  }

  const matches = modules.filter((module) => (module.aliases ?? []).includes(input));

  if (matches.length === 0) {
    throw new Error(`Unknown Stackkit module or alias: ${input}`);
  }

  if (matches.length > 1) {
    throw new Error(`Ambiguous Stackkit alias: ${input}`);
  }

  return matches[0].id;
}
```

Add `resolveStackAxes` with explicit v1 mappings for common axes. Keep it small and deterministic.

Minimum v1 resolver table:

| Input | Resolved modules |
| --- | --- |
| `--web next` | `workspace/pnpm-turbo`, `workspace/typescript`, `web/nextjs`, `ui/shadcn` |
| `--web next --db postgres --auth clerk` | Next.js stack plus `db/postgres`, `db/drizzle`, `auth/clerk` |
| `--web next --api fastapi --db postgres --auth auth0` | Next.js, FastAPI, `db/postgres`, `db/sqlalchemy`, `auth/auth0-nextjs`, `auth/auth0-fastapi` |
| `--web next --api axum --db postgres --auth auth0` | Next.js, Axum, `db/postgres`, `db/sqlx`, `auth/auth0-nextjs`, `auth/auth0-axum` if available |
| `--with docker` | `deploy/docker` when selected modules provide the required capability |
| `--deploy kubernetes` | `deploy/kubernetes` and a container-capable deployment path |

Throw on mutually exclusive auth selections and unknown aliases.

- [ ] **Step 4: Run resolver tests**

Run:

```powershell
pnpm --filter @stackkit/core test -- module-aliases
```

Expected: pass.

## Task 2B: Wire Stack-Axis Flags Into Create

**Files:**
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/cli.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add failing CLI tests**

Add tests for:

```ts
await runProgram(["create", "acme", "--web", "next", "--api", "fastapi", "--db", "postgres", "--auth", "auth0", "--dry-run"]);
await runProgram(["create", "acme", "--preset", "next-postgres-clerk", "--with", "docker", "--deploy", "vercel", "--dry-run"]);
```

Assert dry-run JSON contains canonical module IDs and human output uses friendly titles.

- [ ] **Step 2: Implement flags**

Add create flags:

```ts
.option("--web <alias>")
.option("--api <alias>")
.option("--db <alias>")
.option("--db-client <alias>")
.option("--auth <alias>")
.option("--with <aliases>")
.option("--deploy <aliases>")
```

Normalize comma-separated values where a flag can take multiple aliases, resolve through core, and write canonical IDs into the create config.

- [ ] **Step 3: Run CLI tests**

Run:

```powershell
pnpm --filter @stackkit/core test -- module-aliases
pnpm --filter @stackkit/cli test -- cli
```

Expected: pass.

## Task 3: Add Offline Recipe Encoding

**Files:**
- Create: `packages/core/src/recipe.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/schemas/src/index.ts`

- [ ] **Step 1: Write failing recipe tests**

Create `packages/core/src/recipe.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { decodeRecipe, encodeRecipe } from "./index.js";

describe("offline recipes", () => {
  it("round-trips config without project name", () => {
    const code = encodeRecipe({
      schemaVersion: 1,
      preset: "next-postgres-clerk",
      packageManager: "pnpm",
      modules: ["deploy/docker"],
      ai: { skillTargets: ["codex"], skillMode: "install", linkMode: "copy" }
    });

    expect(code).toMatch(/^sk_/);
    expect(decodeRecipe(code)).toEqual({
      schemaVersion: 1,
      preset: "next-postgres-clerk",
      packageManager: "pnpm",
      modules: ["deploy/docker"],
      ai: { skillTargets: ["codex"], skillMode: "install", linkMode: "copy" }
    });
  });

  it("rejects invalid recipe codes", () => {
    expect(() => decodeRecipe("bad")).toThrow("Invalid Stackkit recipe code");
  });
});
```

- [ ] **Step 2: Run failing recipe tests**

Run:

```powershell
pnpm --filter @stackkit/core test -- recipe
```

Expected: fails because functions are missing.

- [ ] **Step 3: Implement recipe schema and functions**

In `packages/schemas/src/index.ts`, add:

```ts
export const stackkitRecipeSchema = z.object({
  schemaVersion: z.literal(1),
  preset: z.string().min(1).optional(),
  packageManager: packageManagerSchema.default("pnpm"),
  modules: z.array(moduleIdSchema).default([]),
  options: z.record(z.string(), z.unknown()).default({}),
  ai: aiConfigSchema
});
```

Extract and export `packageManagerSchema`, `aiConfigSchema`, and `StackkitRecipe` if they do not already exist.

In `packages/core/src/index.ts`, add:

```ts
export function encodeRecipe(recipe: StackkitRecipe): string {
  const json = JSON.stringify(stackkitRecipeSchema.parse(recipe));
  return `sk_${Buffer.from(json, "utf8").toString("base64url")}`;
}

export function decodeRecipe(code: string): StackkitRecipe {
  if (!code.startsWith("sk_")) {
    throw new Error("Invalid Stackkit recipe code");
  }

  try {
    return stackkitRecipeSchema.parse(JSON.parse(Buffer.from(code.slice(3), "base64url").toString("utf8")));
  } catch {
    throw new Error("Invalid Stackkit recipe code");
  }
}
```

- [ ] **Step 4: Run recipe tests**

Run:

```powershell
pnpm --filter @stackkit/schemas test
pnpm --filter @stackkit/core test -- recipe
```

Expected: pass.

## Task 4: Add Recipe CLI Group

**Files:**
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/cli.test.ts`

- [ ] **Step 1: Add failing CLI tests**

Add to `packages/cli/src/cli.test.ts`:

```ts
it("encodes and decodes recipes", async () => {
  const encoded = await runProgram(["recipe", "encode", "--preset", "next"]);
  const code = encoded.stdout.trim();

  expect(code).toMatch(/^sk_/);

  const decoded = await runProgram(["recipe", "decode", code, "--json"]);

  expect(JSON.parse(decoded.stdout)).toEqual(expect.objectContaining({ preset: "next" }));
});
```

- [ ] **Step 2: Run failing CLI tests**

Run:

```powershell
pnpm --filter @stackkit/cli test -- cli
```

Expected: fails because recipe command group is missing.

- [ ] **Step 3: Implement recipe commands**

In `packages/cli/src/index.ts`, add:

```ts
const recipe = program.command("recipe").description("Manage offline Stackkit recipes");
recipe.command("decode <code>").option("--json", "Output JSON").action(...);
recipe.command("inspect <code>").option("--json", "Output JSON").action(...);
recipe.command("encode").option("--config <path>").option("--preset <preset>").action(...);
```

For `encode --preset next`, create a recipe with default package manager and AI config.

- [ ] **Step 4: Run CLI tests**

Run:

```powershell
pnpm --filter @stackkit/cli test -- cli
```

Expected: pass.

## Task 4B: Polish Official Presets

**Files:**
- Modify: `packages/registry/src/index.ts`
- Modify: `packages/registry/src/presets.test.ts`

- [ ] **Step 1: Add failing preset metadata tests**

Assert built-in presets include exactly:

```text
next
next-postgres-clerk
next-postgres-better-auth
next-fastapi-postgres-auth0
next-axum-postgres-auth0
containerized
```

Also assert full-stack presets use one DB owner: Drizzle for Next-only DB access, SQLAlchemy for FastAPI, SQLx for Axum.

- [ ] **Step 2: Update registry metadata**

Add titles, descriptions, aliases/categories where needed, and fix module lists so the ownership rule is true.

- [ ] **Step 3: Run registry tests**

Run:

```powershell
pnpm --filter @stackkit/registry test -- presets
```

Expected: pass.

## Task 5: Verify Slice

**Files:**
- Modify: `docs/status.md`

- [ ] **Step 1: Run focused checks**

Run:

```powershell
pnpm --filter @stackkit/schemas test
pnpm --filter @stackkit/registry test
pnpm --filter @stackkit/core test -- module-aliases recipe
pnpm --filter @stackkit/cli test -- cli
```

Expected: pass.

- [ ] **Step 2: Run workspace checks**

Run:

```powershell
pnpm typecheck
pnpm test
pnpm smoke
```

Expected: pass.

- [ ] **Step 3: Update status**

Update `docs/status.md` only with behavior verified above.
