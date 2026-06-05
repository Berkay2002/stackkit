# Stackkit Slice 07 Registry Extension Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Use the existing `codex/stackkit-cli-v1` branch, do not create worktrees, and commit after each verified milestone.

**Goal:** Prepare maintainable registry extension points without making external registries part of the default user flow.

**Architecture:** Treat the built-in registry as a `StackkitRegistry` object. Add schema support for project-level registry declarations. Keep external registry loading read-only and local-file-only in this slice. Remote fetching and trusted lifecycle hooks remain deferred. Keep `@stackkit/core` registry-neutral to avoid cycles; CLI and registry consumers pass registries into core helpers.

**Tech Stack:** TypeScript, Zod, Vitest, Node fs/path APIs.

---

## File Structure

- `packages/schemas/src/index.ts`: add `stackkitRegistrySchema` and `registries` config field.
- `packages/registry/src/index.ts`: export `builtinRegistry` and derive `builtinModules`/`builtinPresets`.
- `packages/registry/src/registry.test.ts`: registry shape tests.
- `packages/core/src/index.ts`: add registry merge/load helpers for built-in and local file registries.
- `packages/core/src/registry.test.ts`: registry resolution tests.
- `packages/cli/src/index.ts`: add read-only `registry list` for built-in/project config.
- `packages/cli/src/cli.test.ts`: registry command coverage.

## Review Hardening

- Do not make `@stackkit/core` import `@stackkit/registry`. Current registry code imports shared definitions used by core, so core importing the built-in registry risks a dependency cycle.
- If core helpers need registry data, pass `builtinRegistry` or loaded registries as function input from CLI or tests.
- Add `stackkitRegistrySchema` after module and preset schemas are defined, then add `registries` to `stackkitConfigSchema`.
- Configured registries must have a visible read-only flow. Implement `stackkit registry list --config <path>` or do not expose the config field yet.
- Local registry loading is allowed. Remote registry URLs must produce a clear unsupported error.
- Tests should parse `builtinRegistry` through `stackkitRegistrySchema` and use `runProgram(["registry", "list"])`.
- Update exact command-surface tests intentionally when adding the `registry` command group.

## Task 1: Add Registry Schema

**Files:**
- Modify: `packages/schemas/src/index.ts`
- Create: `packages/registry/src/registry.test.ts`
- Modify: `packages/registry/src/index.ts`

- [ ] **Step 1: Write failing registry shape test**

Create `packages/registry/src/registry.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { builtinRegistry } from "./index.js";

describe("builtinRegistry", () => {
  it("exposes built-in modules and presets through registry shape", () => {
    expect(builtinRegistry).toEqual(
      expect.objectContaining({
        schemaVersion: 1,
        namespace: "@stackkit",
        modules: expect.any(Array),
        presets: expect.any(Array)
      })
    );
    expect(builtinRegistry.modules.length).toBeGreaterThan(0);
    expect(builtinRegistry.presets.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run failing registry test**

Run:

```powershell
pnpm --filter @stackkit/registry test -- registry
```

Expected: fails because `builtinRegistry` is missing.

- [ ] **Step 3: Add schema**

In `packages/schemas/src/index.ts`, add:

```ts
export const stackkitRegistrySchema = z.object({
  schemaVersion: z.literal(1),
  namespace: z.string().min(1),
  name: z.string().min(1),
  modules: z.array(stackkitModuleSchema).default([]),
  presets: z.array(stackkitPresetSchema).default([])
});
```

Export `StackkitRegistry`.

- [ ] **Step 4: Export built-in registry**

In `packages/registry/src/index.ts`, add:

```ts
export const builtinRegistry = {
  schemaVersion: 1,
  namespace: "@stackkit",
  name: "Stackkit built-in registry",
  modules: builtinModules,
  presets: builtinPresets
} as const;
```

If schema parsing requires mutable arrays, define modules and presets first, then parse with `stackkitRegistrySchema`.

Add a test that imports `stackkitRegistrySchema` from `@stackkit/schemas` and asserts `stackkitRegistrySchema.parse(builtinRegistry)` succeeds.

- [ ] **Step 5: Run registry tests**

Run:

```powershell
pnpm --filter @stackkit/schemas test
pnpm --filter @stackkit/registry test -- registry
```

Expected: pass.

## Task 2: Add Project Registry Config Field

**Files:**
- Modify: `packages/schemas/src/index.ts`
- Modify: `packages/schemas/src/config.test.ts`

- [ ] **Step 1: Add failing config test**

Add to `packages/schemas/src/config.test.ts`:

```ts
it("accepts project-level registry declarations", () => {
  const parsed = stackkitConfigSchema.parse({
    projectName: "acme",
    modules: [],
    registries: {
      "@acme": "./stackkit.registry.json"
    }
  });

  expect(parsed.registries).toEqual({ "@acme": "./stackkit.registry.json" });
});
```

- [ ] **Step 2: Run failing schema tests**

Run:

```powershell
pnpm --filter @stackkit/schemas test -- config
```

Expected: fails because `registries` is missing.

- [ ] **Step 3: Add config field**

In `stackkitConfigSchema`, add:

```ts
registries: z.record(z.string(), z.string()).default({})
```

- [ ] **Step 4: Run schema tests**

Run:

```powershell
pnpm --filter @stackkit/schemas test -- config
```

Expected: pass.

## Task 3: Load Local Registry Files

**Files:**
- Create: `packages/core/src/registry.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing local registry test**

Create `packages/core/src/registry.test.ts`:

```ts
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadProjectRegistries } from "./index.js";
import { makeTempDirectory } from "./test-helpers.js";

describe("loadProjectRegistries", () => {
  it("loads a local declarative registry file", async () => {
    const projectDirectory = await makeTempDirectory();
    const registryPath = join(projectDirectory, "stackkit.registry.json");
    await writeFile(
      registryPath,
      JSON.stringify({
        schemaVersion: 1,
        namespace: "@acme",
        name: "Acme",
        modules: [],
        presets: []
      }),
      "utf8"
    );

    const registries = await loadProjectRegistries(projectDirectory, { "@acme": "./stackkit.registry.json" });

    expect(registries).toEqual([expect.objectContaining({ namespace: "@acme" })]);
  });
});
```

- [ ] **Step 2: Run failing core test**

Run:

```powershell
pnpm --filter @stackkit/core test -- registry
```

Expected: fails because loader is missing.

- [ ] **Step 3: Implement local loader**

In `packages/core/src/index.ts`, add:

```ts
export async function loadProjectRegistries(
  projectDirectory: string,
  registries: Record<string, string>
): Promise<StackkitRegistry[]> {
  const loaded: StackkitRegistry[] = [];

  for (const [namespace, location] of Object.entries(registries)) {
    if (/^https?:\/\//.test(location)) {
      throw new Error(`Remote registries are not supported yet: ${namespace}`);
    }

    const fullPath = join(projectDirectory, normalizeProjectPath(location));
    const parsed = stackkitRegistrySchema.parse(JSON.parse(await readFile(fullPath, "utf8")));

    if (parsed.namespace !== namespace) {
      throw new Error(`Registry namespace mismatch: expected ${namespace}, got ${parsed.namespace}`);
    }

    loaded.push(parsed);
  }

  return loaded;
}
```

Import schema/type from `@stackkit/schemas`.

- [ ] **Step 4: Run registry tests**

Run:

```powershell
pnpm --filter @stackkit/core test -- registry
```

Expected: pass.

## Task 4: Add Read-Only Registry CLI

**Files:**
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/cli.test.ts`

- [ ] **Step 1: Add failing CLI test**

Add to `packages/cli/src/cli.test.ts`:

```ts
it("lists the built-in registry", async () => {
  const output = await runProgram(["registry", "list"]);

  expect(output.stdout).toContain("@stackkit");
});
```

- [ ] **Step 2: Run failing CLI test**

Run:

```powershell
pnpm --filter @stackkit/cli test -- cli
```

Expected: fails because registry command group is missing.

- [ ] **Step 3: Implement registry list**

In `packages/cli/src/index.ts`, add:

```ts
const registry = program.command("registry").description("Inspect Stackkit registries");
registry.command("list").option("--json", "Output JSON").action(() => {
  const registries = [{ namespace: builtinRegistry.namespace, name: builtinRegistry.name, source: "builtin" }];
  ...
});
```

Do not add `registry add/remove` in this slice.

Also support:

```bash
stackkit registry list --config stackkit.config.json
```

This loads local registries declared in the config, prints built-in plus local registry summaries, and rejects remote registry URLs with "Remote registries are not supported yet".

- [ ] **Step 4: Run CLI tests**

Run:

```powershell
pnpm --filter @stackkit/cli test -- cli
```

Expected: pass.

## Task 5: Verify Slice

**Files:**
- Modify: `docs/status.md`

- [ ] **Step 1: Run focused checks**

Run:

```powershell
pnpm --filter @stackkit/schemas test -- config
pnpm --filter @stackkit/registry test -- registry
pnpm --filter @stackkit/core test -- registry
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

Update `docs/status.md` to say registry extension points exist only if verified. Do not claim remote registry support.
