# Stackkit Slice 03 AI Skills Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Use the existing `codex/stackkit-cli-v1` branch, do not create worktrees, and commit after each verified milestone.

**Goal:** Make AI skill behavior explicit and product-ready: default Codex `.agents`, optional Claude Code `.claude`, install/plan/skip modes, copy/symlink link mode metadata, and non-fatal skill install failures.

**Architecture:** Extend schema types for skill mode and link mode. Keep skill resolution in core. Keep CLI flags and output formatting in CLI. Do not make external skill failures fail create.

**Tech Stack:** TypeScript, Zod, Vitest, Node fs APIs, existing skill installer abstraction.

---

## File Structure

- `packages/schemas/src/index.ts`: add `ai.skillMode` and `ai.linkMode`.
- `packages/schemas/src/index.ts`: add `skillsLock.planned` and manifest AI state fields if they do not already exist.
- `packages/core/src/index.ts`: respect skill mode and link mode in planning/apply.
- `packages/core/src/ai-skill-targets.test.ts`: target/link mode behavior.
- `packages/core/src/create-apply.test.ts`: skills-lock/local guidance behavior.
- `packages/cli/src/index.ts`: add `--ai`, `--skills`, and `--skill-link`.
- `packages/cli/src/cli.test.ts`: flag behavior.

## Review Hardening

- Represent planned skills separately from unresolved failures. Add `planned` to `skillsLockSchema`, `CreatePlan.aiSkills`, and manifest AI state if the current schemas cannot express it.
- `--skills plan` records planned external installs but runs no external commands.
- `--skills skip` bypasses all skill output: no `skills-lock.json`, no `.agents/skills`, no `.claude/skills`, no local skill guidance files, and no install commands in dry-run JSON.
- `--skills install` runs installs and records failures as unresolved without failing `create`.
- `--skills require` may be added here or left for the verification harness, but if the flag is exposed it must fail on unresolved required skills.
- `linkMode` is metadata unless the real `npx skills` CLI support is verified in this slice. Do not invent symlink flags from memory.
- CLI tests should use `runProgram`; create/apply tests should use existing temp helpers or add a shared `test-helpers.ts` deliberately.

## Task 1: Extend AI Config Schema

**Files:**
- Modify: `packages/schemas/src/index.ts`
- Modify: `packages/schemas/src/config.test.ts`

- [ ] **Step 1: Add failing schema test**

Add to `packages/schemas/src/config.test.ts`:

```ts
it("accepts AI skill mode and link mode", () => {
  const parsed = stackkitConfigSchema.parse({
    projectName: "acme",
    modules: ["workspace/pnpm-turbo"],
    ai: {
      skillTargets: ["codex", "claude-code"],
      skillMode: "install",
      linkMode: "copy"
    }
  });

  expect(parsed.ai).toEqual(
    expect.objectContaining({
      skillTargets: ["codex", "claude-code"],
      skillMode: "install",
      linkMode: "copy"
    })
  );
});
```

- [ ] **Step 2: Run failing schema tests**

Run:

```powershell
pnpm --filter @stackkit/schemas test -- config
```

Expected: fails because fields are not defined.

- [ ] **Step 3: Add schema fields**

In `packages/schemas/src/index.ts`, add:

```ts
export const aiSkillModeSchema = z.enum(["install", "plan", "skip"]);
export const aiSkillLinkModeSchema = z.enum(["copy", "symlink"]);
```

Extend `stackkitConfigSchema.ai`:

```ts
skillMode: aiSkillModeSchema.default("install"),
linkMode: aiSkillLinkModeSchema.default("copy")
```

Export inferred types.

If not already present, extend the skill lock and manifest schemas:

```ts
planned: z.array(aiSkillDependencySchema).default([])
```

Keep `unresolved` for failures only.

- [ ] **Step 4: Run schema tests**

Run:

```powershell
pnpm --filter @stackkit/schemas test -- config lifecycle
```

Expected: pass.

## Task 2: Respect Skill Modes In Core

**Files:**
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/create-apply.test.ts`

- [ ] **Step 1: Add failing tests**

Add to `packages/core/src/create-apply.test.ts`:

```ts
it("writes skills lock but does not run external installs in plan mode", async () => {
  const parentDirectory = await makeTempDirectory();
  const runCommand = vi.fn(async () => ({ exitCode: 0, stdout: "ok", stderr: "" }));
  const plan = createCreatePlan({
    config: {
      ...nextConfig("acme"),
      ai: { skillTargets: ["codex"], skillMode: "plan", linkMode: "copy" }
    },
    availableModules: nextModules,
    curatedSkillSourceAllowlist: []
  });

  const result = await applyCreatePlan(plan, { parentDirectory, runCommand });

  expect(runCommand).not.toHaveBeenCalled();
  await expect(readFile(join(result.projectDirectory, "skills-lock.json"), "utf8")).resolves.toContain(
    "vercel-react-best-practices"
  );
});

it("skips skills output only when skill mode is skip", async () => {
  const parentDirectory = await makeTempDirectory();
  const plan = createCreatePlan({
    config: {
      ...nextConfig("acme"),
      ai: { skillTargets: ["codex"], skillMode: "skip", linkMode: "copy" }
    },
    availableModules: nextModules,
    curatedSkillSourceAllowlist: []
  });

  const result = await applyCreatePlan(plan, { parentDirectory });

  await expect(readFile(join(result.projectDirectory, "skills-lock.json"), "utf8")).rejects.toThrow();
});
```

Use existing helpers or define local fixtures consistent with the file.

- [ ] **Step 2: Run failing core tests**

Run:

```powershell
pnpm --filter @stackkit/core test -- create-apply
```

Expected: fails because mode is ignored.

- [ ] **Step 3: Implement mode handling**

In `resolveSkillInstallResult`, branch on `plan.aiSkills.mode` or the config-derived mode stored on `CreatePlan`.

Add `skillMode` and `linkMode` to `CreatePlan.aiSkills`:

```ts
aiSkills: {
  mode: "install" | "plan" | "skip";
  linkMode: "copy" | "symlink";
  targets: AiSkillTarget[];
  resolved: AiSkillDependency[];
  local: AiSkillDependency[];
  unresolved: AiSkillDependency[];
}
```

Behavior:

- `install`: run install commands, failures unresolved.
- `plan`: do not run commands, record installable skills in `planned`.
- `skip`: do not write local skill files, local guidance, install commands, or lock.

If the current lock schema cannot clearly represent planned skills, add a `planned` array in `skillsLockSchema` and manifest AI state in the same task.

- [ ] **Step 4: Run core tests**

Run:

```powershell
pnpm --filter @stackkit/core test -- ai-skill-targets skill-installer create-apply
```

Expected: pass.

## Task 3: Add CLI AI Flags

**Files:**
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/cli.test.ts`

- [ ] **Step 1: Add failing CLI tests**

Add to `packages/cli/src/cli.test.ts`:

```ts
it("accepts comma-separated AI targets", async () => {
  const output = await runProgram([
    "create",
    "acme",
    "--dry-run",
    "--ai",
    "codex,claude-code"
  ]);

  expect(output.stdout).toContain("codex -> .agents");
  expect(output.stdout).toContain("claude-code -> .claude");
});

it("accepts skills plan mode", async () => {
  const output = await runProgram(["create", "acme", "--dry-run", "--skills", "plan"]);

  expect(output.stdout).toContain('"skillMode": "plan"');
});
```

- [ ] **Step 2: Run failing CLI tests**

Run:

```powershell
pnpm --filter @stackkit/cli test -- cli
```

Expected: fails because flags are missing.

- [ ] **Step 3: Implement flags**

In `packages/cli/src/index.ts`, add create options:

```ts
.option("--ai <targets>", "AI skill targets. Comma-separated: codex,claude-code")
.option("--skills <mode>", "AI skill mode. (install, plan, skip)")
.option("--skill-link <mode>", "AI skill link mode. (copy, symlink)")
```

Normalize targets:

```ts
function parseCommaList(value: string | undefined): string[] | undefined {
  return value?.split(",").map((item) => item.trim()).filter(Boolean);
}
```

Pass into config before schema parse.

For `--skill-link symlink`, first verify the current `npx skills` CLI behavior. If no supported symlink behavior exists, store link mode in manifest/lock and keep file output copied until a later slice can implement real symlinking safely.

- [ ] **Step 4: Run CLI tests**

Run:

```powershell
pnpm --filter @stackkit/cli test -- cli
```

Expected: pass.

## Task 4: Verify Slice

**Files:**
- Modify: `docs/status.md`

- [ ] **Step 1: Run focused checks**

Run:

```powershell
pnpm --filter @stackkit/schemas test -- config lifecycle
pnpm --filter @stackkit/core test -- ai-skill-targets skill-installer create-apply
pnpm --filter @stackkit/cli test -- cli
```

Expected: pass.

- [ ] **Step 2: Run full checks**

Run:

```powershell
pnpm typecheck
pnpm test
pnpm smoke
```

Expected: pass.

- [ ] **Step 3: Update status**

Update `docs/status.md` with implemented AI skill modes only after all checks pass.
