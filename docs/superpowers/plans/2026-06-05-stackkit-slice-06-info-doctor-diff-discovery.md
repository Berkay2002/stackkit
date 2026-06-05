# Stackkit Slice 06 Info, Doctor, Diff, And Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Use the existing `codex/stackkit-cli-v1` branch, do not create worktrees, and commit after each verified milestone.

**Goal:** Add product-grade inspection commands: `info`, better `doctor` recommendations, scoped `module` discovery, and file-oriented diff/view behavior.

**Architecture:** Core returns structured data for info, doctor checks, module discovery, and diffs. CLI renders human text, JSON, and color. Read-only commands tolerate partial config where safe; write commands remain strict.

**Tech Stack:** TypeScript, Commander, Vitest, Node fs/path APIs, existing manifest and file hash logic.

---

## File Structure

- `packages/core/src/index.ts`: add `collectInfo`, doctor action recommendations, module discovery, and diff data.
- `packages/core/src/doctor.test.ts`: recommendation checks.
- `packages/core/src/info.test.ts`: info data.
- `packages/core/src/diff.test.ts`: structured diff behavior.
- `packages/cli/src/index.ts`: add `info`, `module list/search/inspect`, `--json`, `--diff`, and `--view` output.
- `packages/cli/src/cli.test.ts`: command output.

## Prerequisites

- Slice 01 must add manifest `packageManager`, `source`, and `paths` fields before `collectInfo` relies on them.
- Slice 04 must add alias/category metadata before module discovery can expose friendly module output. If Slice 04 is not complete, move the minimal alias/category schema work into this slice before Task 3.

## Review Hardening

- Implement `stackkit diff --file <path>` before doctor recommends it.
- `collectInfo` must read manifest fields that actually exist. If the current manifest schema lacks `packageManager`, `source`, or `paths`, add them here or keep Slice 06 blocked on Slice 01.
- Module discovery uses friendly aliases in output but returns canonical IDs in JSON.
- CLI tests should use `runProgram` and update exact command-surface assertions intentionally.
- Avoid invented fixture helpers. Use existing temp helpers or add `packages/core/src/test-helpers.ts` deliberately.

## Task 1: Add `collectInfo`

**Files:**
- Create: `packages/core/src/info.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Write failing info tests**

Create `packages/core/src/info.test.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { collectInfo, writeManifest } from "./index.js";
import { makeTempDirectory } from "./test-helpers.js";

describe("collectInfo", () => {
  it("returns project inventory from manifest and config", async () => {
    const projectDirectory = await makeTempDirectory();
    await mkdir(join(projectDirectory, ".stackkit"), { recursive: true });
    await writeFile(
      join(projectDirectory, "stackkit.config.json"),
      JSON.stringify({ projectName: "acme", packageManager: "pnpm", modules: [], ai: { skillTargets: ["codex"] } }),
      "utf8"
    );
    await writeManifest(projectDirectory, {
      schemaVersion: 1,
      stackkitVersion: "0.1.0",
      projectName: "acme",
      createdAt: "2026-06-05T00:00:00.000Z",
      modules: [],
      files: [],
      aiSkills: { targets: [{ agent: "codex", directory: ".agents", enabled: true }], installed: [], unresolved: [] },
      migrations: { applied: [] }
    });

    await expect(collectInfo(projectDirectory)).resolves.toEqual(
      expect.objectContaining({
        project: expect.objectContaining({ name: "acme", packageManager: "pnpm" }),
        ai: expect.objectContaining({ targets: ["codex"] })
      })
    );
  });
});
```

If no shared test helper exists, use the temp helper pattern from nearby tests.

- [ ] **Step 2: Run failing test**

Run:

```powershell
pnpm --filter @stackkit/core test -- info
```

Expected: fails because `collectInfo` is missing.

- [ ] **Step 3: Implement `collectInfo`**

In `packages/core/src/index.ts`, read manifest, optional config, and optional skills lock. Return:

```ts
export type StackkitInfo = {
  project: { name: string; packageManager: string; stackkitVersion: string };
  source: { kind: string; preset?: string; recipeCode?: string } | null;
  modules: { id: string; title?: string; version: string }[];
  paths: Record<string, string>;
  ai: { targets: string[]; installed: number; local: number; unresolved: number };
};
```

If these fields are missing from manifest schema, add them before implementing `collectInfo`:

```ts
packageManager: packageManagerSchema.default("pnpm"),
source: z.object({ kind: z.string(), path: z.string().optional(), preset: z.string().optional(), recipeCode: z.string().optional() }).nullable(),
paths: z.record(z.string(), z.string()).default({})
```

- [ ] **Step 4: Add CLI command**

In `packages/cli/src/index.ts`, add:

```ts
program.command("info").description("Show Stackkit project information").option("--json", "Output JSON").option("--cwd <cwd>", "Project directory").action(...)
```

- [ ] **Step 5: Run tests**

Run:

```powershell
pnpm --filter @stackkit/core test -- info
pnpm --filter @stackkit/cli test -- cli
```

Expected: pass after CLI tests are added.

## Task 2: Add Doctor Recommendations

**Files:**
- Modify: `packages/schemas/src/index.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/doctor.test.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Add failing doctor test**

Add to `packages/core/src/doctor.test.ts`:

```ts
it("returns concrete actions for unresolved skills", async () => {
  const result = await runDoctor(projectDirectoryWithUnresolvedSkill);
  const check = result.checks.find((item) => item.id === "skills.unresolved");

  expect(check?.actions).toContain("stackkit skills sync --apply");
});
```

Use or create a fixture project with unresolved skills.

- [ ] **Step 2: Run failing doctor test**

Run:

```powershell
pnpm --filter @stackkit/core test -- doctor
```

Expected: fails because `actions` is not part of checks.

- [ ] **Step 3: Extend doctor check schema**

In `packages/schemas/src/index.ts`, add:

```ts
actions: z.array(z.string()).default([])
```

to `doctorCheckSchema`.

- [ ] **Step 4: Add actions in `runDoctor`**

For unresolved skills:

```ts
actions: ["stackkit skills sync --apply"]
```

For modified managed files:

```ts
actions: [`stackkit diff --file ${file.path}`]
```

- [ ] **Step 5: Render actions in CLI**

In `doctor` CLI output, print each action indented:

```text
  Run: stackkit skills sync --apply
```

- [ ] **Step 6: Run tests**

Run:

```powershell
pnpm --filter @stackkit/schemas test -- lifecycle
pnpm --filter @stackkit/core test -- doctor
pnpm --filter @stackkit/cli test -- cli
```

Expected: pass.

## Task 2B: Add `diff --file`

**Files:**
- Create: `packages/core/src/diff.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/cli.test.ts`

- [ ] **Step 1: Add failing focused diff tests**

Create a generated project fixture with a modified managed file. Assert:

```ts
const result = await diffManagedFile(projectDirectory, "apps/web/package.json");
expect(result.path).toBe("apps/web/package.json");
expect(result.currentHash).not.toBe(result.expectedHash);
expect(result.diff.parts.length).toBeGreaterThan(0);
```

- [ ] **Step 2: Add failing CLI test**

Use:

```ts
const output = await runProgram(["diff", "--file", "apps/web/package.json", "--cwd", projectDirectory]);
expect(output.stdout).toContain("apps/web/package.json");
```

- [ ] **Step 3: Implement file diff from manifest hashes and deterministic re-rendering**

Read `.stackkit/project.json`, find the managed file, re-render expected content from recorded module versions/options, compare current file content, and return structured diff data.

- [ ] **Step 4: Run diff tests**

Run:

```powershell
pnpm --filter @stackkit/core test -- diff
pnpm --filter @stackkit/cli test -- cli
```

Expected: pass.

## Task 3: Add Module Discovery Commands

**Files:**
- Modify: `packages/core/src/index.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/cli.test.ts`

- [ ] **Step 1: Add failing CLI tests**

Add to `packages/cli/src/cli.test.ts`:

```ts
it("lists modules by friendly alias", async () => {
  const output = await runProgram(["module", "list"]);

  expect(output.stdout).toContain("fastapi");
  expect(output.stdout).toContain("Next.js");
});

it("inspects a module alias as JSON", async () => {
  const output = await runProgram(["module", "inspect", "fastapi", "--json"]);

  expect(JSON.parse(output.stdout)).toEqual(expect.objectContaining({ id: "api/fastapi" }));
});
```

- [ ] **Step 2: Run failing CLI tests**

Run:

```powershell
pnpm --filter @stackkit/cli test -- cli
```

Expected: fails because module commands are missing.

- [ ] **Step 3: Implement module command group**

In `packages/cli/src/index.ts`, add:

```ts
const module = program.command("module").description("Inspect Stackkit modules");
module.command("list").option("--json", "Output JSON").action(...);
module.command("search <query>").option("--json", "Output JSON").action(...);
module.command("inspect <module>").option("--json", "Output JSON").action(...);
```

Use registry metadata and `resolveModuleAlias`.

- [ ] **Step 4: Run CLI tests**

Run:

```powershell
pnpm --filter @stackkit/cli test -- cli
```

Expected: pass.

## Task 4: Add Diff/View Plan Output

**Files:**
- Create: `packages/core/src/diff.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/cli.test.ts`

- [ ] **Step 1: Write failing diff tests**

Create `packages/core/src/diff.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createFileContentDiff } from "./index.js";

describe("createFileContentDiff", () => {
  it("marks added and removed lines", () => {
    const diff = createFileContentDiff("one\ntwo\n", "one\nthree\n");

    expect(diff.parts.some((part) => part.kind === "removed" && part.value.includes("two"))).toBe(true);
    expect(diff.parts.some((part) => part.kind === "added" && part.value.includes("three"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run failing diff test**

Run:

```powershell
pnpm --filter @stackkit/core test -- diff
```

Expected: fails because diff helper is missing.

- [ ] **Step 3: Implement structured line diff**

Use the existing `diff` dependency only if already installed. If not installed, add a small line-based helper in core without a new dependency:

```ts
export type FileDiffPart = { kind: "same" | "added" | "removed"; value: string };
export type FileContentDiff = { parts: FileDiffPart[] };
```

Implement enough line diff behavior for generated file previews.

- [ ] **Step 4: Add CLI `--view` and `--diff` formatting**

For `create --dry-run` and `add --dry-run`, support:

```bash
--view <path>
--diff
```

`--view` prints planned file content. `--diff` prints path headers and structured diff content where existing files exist.

- [ ] **Step 5: Run tests**

Run:

```powershell
pnpm --filter @stackkit/core test -- diff
pnpm --filter @stackkit/cli test -- cli
```

Expected: pass.

## Task 5: Verify Slice

**Files:**
- Modify: `docs/status.md`

- [ ] **Step 1: Run focused checks**

Run:

```powershell
pnpm --filter @stackkit/core test -- info doctor diff
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

Update `docs/status.md` with `info`, doctor actions, module discovery, and diff/view only if verified.
