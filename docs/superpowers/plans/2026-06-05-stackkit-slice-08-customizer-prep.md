# Stackkit Slice 08 Customizer Prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Use the existing `codex/stackkit-cli-v1` branch, do not create worktrees, and commit after each verified milestone.

**Goal:** Prepare shared APIs so a future Next.js/shadcn visual customizer can render stack choices and produce offline recipe commands without duplicating CLI logic.

**Architecture:** Add a UI-neutral catalog API in core/registry. Do not build `apps/customizer` in this slice. The customizer should later consume the same catalog, recipe encoder, and resolver as the CLI.

**Tech Stack:** TypeScript, Vitest, JSON-serializable catalog data.

---

## File Structure

- `packages/core/src/index.ts`: add `buildCustomizerCatalog`.
- `packages/core/src/customizer-catalog.test.ts`: verify UI-ready catalog data.
- `packages/registry/src/index.ts`: ensure modules/presets expose title, alias, category, and icon key where useful.
- `packages/schemas/src/index.ts`: add optional `icon` metadata.
- `docs/status.md`: note customizer is designed but not implemented.

## Prerequisites

- Slice 04 must add aliases, categories, recipe encode/decode, and stack-axis resolver before this slice can expose full customizer-ready choices.
- If Slice 04 is not complete, keep this slice limited to catalog display data and do not claim recipe-command generation.

## Review Hardening

- This slice does not build `apps/customizer`.
- Catalog output must be deterministic: sort presets by title or ID and sort categories and choices consistently.
- The catalog can expose display data and canonical IDs. It should not duplicate resolver rules.
- If recipe APIs are missing, document that catalog consumers can display choices only until Slice 04 lands.
- Use icon keys as strings, not imported React components.

## Task 1: Add Icon Metadata

**Files:**
- Modify: `packages/schemas/src/index.ts`
- Modify: `packages/registry/src/index.ts`
- Modify: `packages/registry/src/module-files.test.ts`

- [ ] **Step 1: Add failing metadata test**

Add to `packages/registry/src/module-files.test.ts`:

```ts
it("declares icon keys for common customizer choices", () => {
  const next = builtinModules.find((module) => module.id === "web/nextjs");
  const fastapi = builtinModules.find((module) => module.id === "api/fastapi");

  expect(next?.icon).toBe("nextjs");
  expect(fastapi?.icon).toBe("fastapi");
});
```

- [ ] **Step 2: Run failing registry test**

Run:

```powershell
pnpm --filter @berkayorhan/stackkit-registry test -- module-files
```

Expected: fails because `icon` is missing.

- [ ] **Step 3: Add schema field**

In `stackkitModuleSchema`, add:

```ts
icon: z.string().min(1).optional()
```

- [ ] **Step 4: Add icon keys**

In `packages/registry/src/index.ts`, add simple icon keys for common modules:

```text
nextjs
shadcn
fastapi
postgres
drizzle
sqlalchemy
clerk
auth0
better-auth
vercel
docker
kubernetes
```

These are keys, not imported icon components.

- [ ] **Step 5: Run tests**

Run:

```powershell
pnpm --filter @berkayorhan/stackkit-schemas test
pnpm --filter @berkayorhan/stackkit-registry test -- module-files
```

Expected: pass.

## Task 2: Add Customizer Catalog API

**Files:**
- Create: `packages/core/src/customizer-catalog.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing catalog test**

Create `packages/core/src/customizer-catalog.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { buildCustomizerCatalog, defineModule, definePreset } from "./index.js";

describe("buildCustomizerCatalog", () => {
  it("returns JSON-serializable choices grouped by category", () => {
    const catalog = buildCustomizerCatalog({
      modules: [
        defineModule({
          id: "web/nextjs",
          aliases: ["next"],
          category: "web",
          icon: "nextjs",
          version: "1.0.0",
          title: "Next.js",
          description: "Next.js app"
        })
      ],
      presets: [
        definePreset({
          id: "next",
          title: "Next.js",
          description: "Next.js app",
          modules: ["web/nextjs"]
        })
      ]
    });

    expect(catalog).toEqual({
      presets: [
        expect.objectContaining({
          id: "next",
          title: "Next.js",
          modules: ["web/nextjs"]
        })
      ],
      categories: {
        web: [
          expect.objectContaining({
            id: "web/nextjs",
            alias: "next",
            icon: "nextjs"
          })
        ]
      }
    });
    expect(() => JSON.stringify(catalog)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run failing catalog test**

Run:

```powershell
pnpm --filter @berkayorhan/stackkit-core test -- customizer-catalog
```

Expected: fails because catalog API is missing.

- [ ] **Step 3: Implement catalog API**

Add to `packages/core/src/index.ts`:

```ts
export type CustomizerCatalog = {
  presets: {
    id: string;
    title: string;
    description: string;
    modules: string[];
  }[];
  categories: Record<
    string,
    {
      id: string;
      alias: string;
      title: string;
      description: string;
      icon?: string;
    }[]
  >;
};

export function buildCustomizerCatalog(input: {
  modules: readonly StackkitModule[];
  presets: readonly StackkitPreset[];
}): CustomizerCatalog {
  const categories: CustomizerCatalog["categories"] = {};

  for (const module of input.modules) {
    const category = module.category ?? "other";
    categories[category] ??= [];
    categories[category].push({
      id: module.id,
      alias: module.aliases?.[0] ?? module.id,
      title: module.title,
      description: module.description,
      icon: module.icon
    });
  }

  for (const choices of Object.values(categories)) {
    choices.sort((left, right) => left.title.localeCompare(right.title));
  }

  return {
    presets: input.presets
      .map((preset) => ({
        id: preset.id,
        title: preset.title,
        description: preset.description,
        modules: [...preset.modules]
      }))
      .sort((left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id)),
    categories: Object.fromEntries(
      Object.entries(categories).sort(([left], [right]) => left.localeCompare(right))
    )
  };
}
```

- [ ] **Step 4: Run catalog test**

Run:

```powershell
pnpm --filter @berkayorhan/stackkit-core test -- customizer-catalog
```

Expected: pass.

## Task 3: Document Customizer Boundary

**Files:**
- Modify: `docs/status.md`
- Create: `docs/customizer.md`

- [ ] **Step 1: Add customizer doc**

Create `docs/customizer.md`:

```md
# Stackkit Customizer

The customizer is planned as a future Next.js and shadcn/ui app.

It should render choices from the shared Stackkit catalog and output offline recipe commands. It must not duplicate module, preset, or resolver logic from the CLI.

The first customizer should be client-side only:

- choose preset
- choose package manager
- choose web/API/database/auth/deploy/AI options
- preview resolved modules
- copy `stackkit create <name> --recipe <code>`
- view decoded config

No accounts, hosted recipe IDs, or backend storage are part of the first customizer.
```

- [ ] **Step 2: Update status**

Add a short note in `docs/status.md` that customizer prep is a shared API only and the app is not implemented.

If Slice 04 recipe APIs are not complete, state that offline recipe command output remains blocked by Slice 04.

- [ ] **Step 3: Run docs existence check**

Run:

```powershell
Test-Path docs/customizer.md
```

Expected: `True`.

## Task 4: Verify Slice

**Files:**
- No additional source files.

- [ ] **Step 1: Run focused checks**

Run:

```powershell
pnpm --filter @berkayorhan/stackkit-schemas test
pnpm --filter @berkayorhan/stackkit-registry test -- module-files
pnpm --filter @berkayorhan/stackkit-core test -- customizer-catalog
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
