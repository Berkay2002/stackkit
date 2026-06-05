# Stackkit Slice 01 Create UX And Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Use the existing `codex/stackkit-cli-v1` branch, do not create worktrees, and commit after each verified milestone.

**Goal:** Make `stackkit create` behave like the intended product surface: slug positional name, compact confirmation, `--yes`, `--dry-run`, root `stackkit.config.json`, and safer target directory handling.

**Architecture:** Keep command parsing and output in `packages/cli`. Put reusable config normalization and target validation in `packages/core`. Keep schema changes in `packages/schemas` so future customizer and recipe support share the same contract.

**Tech Stack:** TypeScript, Commander, Zod, Vitest, Node fs/path APIs.

---

## File Structure

- `packages/schemas/src/index.ts`: add source/config fields needed for generated config and manifest provenance.
- `packages/core/src/index.ts`: add project slug validation, normalized create config, target directory safety, config write planning, and create result next-command data.
- `packages/schemas/src/config.test.ts`: verify strict project slug validation and manifest provenance schema.
- `packages/core/src/create-plan.test.ts`: cover name/config normalization and generated config file planning.
- `packages/core/src/create-apply.test.ts`: cover target directory refusal and `stackkit.config.json` writing.
- `packages/cli/src/index.ts`: change `create` signature to `create [name]`, add `--yes`, compact summary confirmation, and config path behavior.
- `packages/cli/src/cli.test.ts`: cover create command UX and safety.
- `docs/status.md`: update after verification.

## Review Hardening

- Put the slug contract in shared schema/core normalization, not only in an exported helper. It must apply to config files, positional names, interactive answers, `config validate`, and `createCreatePlan`.
- Add manifest schema and writer support for `packageManager` and source provenance in this slice. Later `info`, `doctor`, and `diff` depend on it.
- `stackkit.config.json` is owned by `stackkit/config`, not `workspace/pnpm-turbo`, because generated configs are Stackkit-owned even when the workspace module is not selected.
- Scripted `stackkit create acme --dry-run` must not enter Clack prompts. Implement a deterministic `createPlanFromCreateOptions` style path that uses positional `name`, optional `--config`, optional `--preset`, and defaults.
- Existing Stackkit-managed target directories are refused and should suggest `add`, `update`, or `diff`. Keep unmanaged non-empty refusal separate from managed-project refusal.
- CLI tests in this repo use `runProgram`, not `runCli`. Match the current harness unless a helper is intentionally added.

## Task 1: Add Project Slug Validation

**Files:**
- Modify: `packages/schemas/src/index.ts`
- Modify: `packages/schemas/src/config.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/create-plan.test.ts`

- [ ] **Step 1: Add failing tests**

Add tests to `packages/core/src/create-plan.test.ts` and `packages/schemas/src/config.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { validateProjectSlug } from "./index.js";

describe("validateProjectSlug", () => {
  it("accepts lowercase slug names", () => {
    expect(validateProjectSlug("acme-dashboard")).toBe("acme-dashboard");
    expect(validateProjectSlug("app2")).toBe("app2");
  });

  it("rejects names that are not v1 Stackkit slugs", () => {
    expect(() => validateProjectSlug("Acme Dashboard")).toThrow('Invalid project name: "Acme Dashboard"');
    expect(() => validateProjectSlug("acme_dashboard")).toThrow('Invalid project name: "acme_dashboard"');
    expect(() => validateProjectSlug("@acme/dashboard")).toThrow('Invalid project name: "@acme/dashboard"');
  });
});
```

Also add a schema test that rejects invalid `projectName` in `stackkitConfigSchema.parse(...)`.

- [ ] **Step 2: Run the failing test**

Run:

```powershell
pnpm --filter @stackkit/core test -- create-plan
```

Expected: fails because `validateProjectSlug` is not exported.

- [ ] **Step 3: Implement slug validation**

Add to `packages/core/src/index.ts`:

```ts
const projectSlugPattern = /^[a-z0-9][a-z0-9-]*$/;

export function validateProjectSlug(name: string): string {
  if (!projectSlugPattern.test(name)) {
    throw new Error(`Invalid project name: "${name}". Use a lowercase slug such as acme-dashboard.`);
  }

  return name;
}
```

- [ ] **Step 4: Run the focused test**

Run:

```powershell
pnpm --filter @stackkit/core test -- create-plan
```

Expected: pass.

## Task 2: Plan Root `stackkit.config.json`

**Files:**
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/create-plan.test.ts`

- [ ] **Step 1: Add failing config planning test**

Add to `packages/core/src/create-plan.test.ts`:

```ts
it("plans a human-editable stackkit.config.json", () => {
  const plan = createCreatePlan({
    config: {
      projectName: "acme",
      packageManager: "pnpm",
      workspace: "pnpm-turbo",
      modules: ["workspace/pnpm-turbo", "workspace/typescript"],
      ai: { skillTargets: ["codex"] }
    },
    availableModules: [workspaceModule, typescriptModule],
    curatedSkillSourceAllowlist: []
  });

  const configFile = plan.filePlan.files.find((file) => file.path === "stackkit.config.json");

  expect(configFile).toEqual(
    expect.objectContaining({
      owner: "stackkit/config",
      overwrite: "never"
    })
  );
  expect(JSON.parse(configFile?.content ?? "{}")).toEqual(
    expect.objectContaining({
      $schema: "https://stackkit.dev/schema.json",
      projectName: "acme",
      packageManager: "pnpm",
      ai: { skillTargets: ["codex"] }
    })
  );
});
```

If `workspaceModule` and `typescriptModule` do not exist in the test file, define them with `defineModule`.

- [ ] **Step 2: Run the failing test**

Run:

```powershell
pnpm --filter @stackkit/core test -- create-plan
```

Expected: fails because `stackkit.config.json` is not planned.

- [ ] **Step 3: Implement generated config planning**

In `packages/core/src/index.ts`, add:

```ts
function renderStackkitConfig(config: StackkitConfig): FileOperation {
  return {
    kind: "write",
    path: "stackkit.config.json",
    owner: "stackkit/config",
    overwrite: "never",
    content: `${JSON.stringify(
      {
        $schema: "https://stackkit.dev/schema.json",
        projectName: config.projectName,
        packageManager: config.packageManager,
        workspace: config.workspace,
        preset: "preset" in config ? config.preset : undefined,
        modules: config.modules,
        options: config.options ?? {},
        ai: config.ai
      },
      null,
      2
    )}\n`
  };
}
```

Add this operation to `renderCreateFiles` before module file operations:

```ts
appendUniqueFileOperations(operations, seenPaths, [renderStackkitConfig(config)]);
```

- [ ] **Step 4: Run focused tests**

Run:

```powershell
pnpm --filter @stackkit/core test -- create-plan create-apply
```

Expected: pass after adjusting expected managed files in tests that assert exact file lists.

## Task 2B: Persist Manifest Provenance

**Files:**
- Modify: `packages/schemas/src/index.ts`
- Modify: `packages/schemas/src/config.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/create-apply.test.ts`

- [ ] **Step 1: Add failing manifest schema and apply tests**

Assert that `.stackkit/project.json` includes:

```json
{
  "packageManager": "pnpm",
  "source": { "kind": "config", "path": "stackkit.config.json" },
  "paths": { "root": "." }
}
```

Cover config-path create and scripted positional create.

- [ ] **Step 2: Implement schema and manifest write support**

Add manifest fields for `packageManager`, `source`, and `paths`. Write them from the resolved create plan in `applyCreatePlan`.

- [ ] **Step 3: Run focused tests**

Run:

```powershell
pnpm --filter @stackkit/schemas test -- config
pnpm --filter @stackkit/core test -- create-apply
```

Expected: pass.

## Task 3: Refuse Non-Empty Create Targets

**Files:**
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/create-apply.test.ts`

- [ ] **Step 1: Add failing safety tests**

Add to `packages/core/src/create-apply.test.ts`:

```ts
it("refuses to create in a non-empty unmanaged directory", async () => {
  const parentDirectory = await makeTempDirectory();
  const targetDirectory = join(parentDirectory, "existing");
  await mkdir(targetDirectory, { recursive: true });
  await writeFile(join(targetDirectory, "README.md"), "# Existing\n", "utf8");

  const plan = createCreatePlan({
    config: foundationConfig("acme"),
    availableModules: foundationModules,
    curatedSkillSourceAllowlist: []
  });

  await expect(applyCreatePlan(plan, { parentDirectory, targetDirectory })).rejects.toThrow(
    "Refusing to create in non-empty directory"
  );
});

it("allows create in an existing empty target directory", async () => {
  const parentDirectory = await makeTempDirectory();
  const targetDirectory = join(parentDirectory, "empty");
  await mkdir(targetDirectory, { recursive: true });

  const plan = createCreatePlan({
    config: foundationConfig("acme"),
    availableModules: foundationModules,
    curatedSkillSourceAllowlist: []
  });

  const result = await applyCreatePlan(plan, { parentDirectory, targetDirectory, installSkills: false });

  expect(result.projectDirectory).toBe(targetDirectory);
});
```

Add a third test for an existing directory containing `.stackkit/project.json`. It must reject with a message that suggests `stackkit add`, `stackkit update`, or `stackkit diff`.

Use existing helpers in the file where available.

- [ ] **Step 2: Run failing tests**

Run:

```powershell
pnpm --filter @stackkit/core test -- create-apply
```

Expected: non-empty target test fails.

- [ ] **Step 3: Implement target directory check**

In `packages/core/src/index.ts`, before applying files in `applyCreatePlan`, add:

```ts
async function assertCreateTargetIsSafe(projectDirectory: string): Promise<void> {
  try {
    const entries = await readdir(projectDirectory);
    if (entries.length > 0) {
      throw new Error(`Refusing to create in non-empty directory: ${projectDirectory}`);
    }
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return;
    }

    throw error;
  }
}
```

Import `readdir` from `node:fs/promises`. Call it before `applyFilePlan`.

- [ ] **Step 4: Run tests**

Run:

```powershell
pnpm --filter @stackkit/core test -- create-apply
```

Expected: pass.

## Task 4: Update CLI Create UX

**Files:**
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/cli.test.ts`

- [ ] **Step 1: Add failing CLI tests**

Add tests to `packages/cli/src/cli.test.ts`:

```ts
it("accepts a project name positional argument for create", async () => {
  const output = await runProgram(["create", "acme", "--dry-run"]);

  expect(output.stdout).toContain("Stackkit create plan for acme");
});

it("rejects invalid scripted project names", async () => {
  await expect(runProgram(["create", "Acme Dashboard", "--dry-run"])).rejects.toThrow(
    "Invalid project name"
  );
});
```

Use the local CLI test harness helper names that already exist in the file.

- [ ] **Step 2: Run failing CLI tests**

Run:

```powershell
pnpm --filter @stackkit/cli test -- cli
```

Expected: fails because `create` has no positional name support.

- [ ] **Step 3: Implement positional name and `--yes`**

In `packages/cli/src/index.ts`, change:

```ts
program.command("create")
```

to:

```ts
program.command("create [name]")
```

Add:

```ts
.option("-y, --yes", "Skip confirmation prompt")
```

Update action signature:

```ts
.action(async (name: string | undefined, options: { config?: string; dryRun?: boolean; dir?: string; yes?: boolean }) => {
```

When no config is provided, pass `name` into interactive config construction. When config is provided and `name` exists, override `projectName` with the positional name after validation.

If `name` is provided and no `--config` is provided, do not enter prompts. Resolve the same default config used by interactive mode, then apply CLI overrides. If neither `name` nor `--config` is present and stdin is interactive, prompts may run.

- [ ] **Step 4: Add compact summary formatter**

Add:

```ts
export function formatCreateSummary(plan: CreatePlan): string {
  return [
    `Stackkit will create ${plan.projectName}`,
    "",
    "Modules:",
    ...plan.modules.map((module) => `- ${module.id}`),
    "",
    `Writes: ${plan.filePlan.files.length} files`,
    `AI skills: ${plan.skillInstallCommands.length} install command(s), ${plan.aiSkills.local.length} local guidance item(s)`,
    ""
  ].join("\n");
}
```

Wire confirmation for non-dry-run when `--yes` is not present. Use `@clack/prompts` or existing prompt style.

- [ ] **Step 5: Run CLI tests**

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
pnpm --filter @stackkit/core test -- create-plan create-apply
pnpm --filter @stackkit/schemas test -- config
pnpm --filter @stackkit/cli test -- cli
```

Expected: both pass.

- [ ] **Step 2: Run smoke create**

Run:

```powershell
pnpm smoke
```

Expected: pass.

- [ ] **Step 3: Update status**

Update `docs/status.md` to move positional create, config writing, and target directory safety into verified or usable state only if the checks above passed.
