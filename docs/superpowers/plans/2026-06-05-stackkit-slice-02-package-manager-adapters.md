# Stackkit Slice 02 Package Manager Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Use the existing `codex/stackkit-cli-v1` branch, do not create worktrees, and commit after each verified milestone.

**Goal:** Add shared package-manager adapters for pnpm, npm, yarn, and bun without scattering conditionals through templates and CLI code.

**Architecture:** Schemas validate allowed package managers. Core resolves package-manager behavior through a small adapter API and passes plain template options into templates. Templates must not import `@berkayorhan/stackkit-core`, because core already imports templates.

**Tech Stack:** TypeScript, Zod, Vitest, Node package metadata.

---

## File Structure

- `packages/schemas/src/index.ts`: validate `packageManager` as `pnpm | npm | yarn | bun`.
- `packages/schemas/src/config.test.ts`: verify allowed package managers and default `pnpm`.
- `packages/core/src/index.ts`: add package-manager adapter type and resolver.
- `packages/core/src/package-manager.test.ts`: test commands and generated metadata.
- `packages/templates/src/index.ts`: accept package-manager foundation options.
- `packages/templates/src/foundation.test.ts`: verify generated package files for each manager.
- `packages/cli/src/index.ts`: add `--pm` and `--package-manager`.
- `packages/cli/src/cli.test.ts`: cover `--pm bun` dry-run.

## Review Hardening

- Add the schema enum first. Current schema only accepts `pnpm`; create/config validation must accept `pnpm`, `npm`, `yarn`, and `bun` before CLI flags are wired.
- Avoid a package cycle. `@berkayorhan/stackkit-core` may import templates, but templates must not import core. Either keep adapter helpers in core and pass plain template options, or move only shared types/constants into `@berkayorhan/stackkit-schemas`.
- The adapter owns `addCommand` as well as install, run, and dlx. If add support is not implemented in this slice, mark it explicitly deferred in code and doctor output.
- Audit all generated output for hard-coded pnpm, including Dockerfile content and lifecycle hook tests. Either make it package-manager aware or declare the module package-manager limitation.
- Use current CLI tests' `runProgram` helper unless a new helper is intentionally added.
- Verification must include schemas, affected typecheck, and one actual CLI dry-run smoke for `create acme --pm bun --dry-run`.

## Task 0: Extend Package Manager Schema

**Files:**
- Modify: `packages/schemas/src/index.ts`
- Modify: `packages/schemas/src/config.test.ts`

- [ ] **Step 1: Add failing schema tests**

Assert:

```ts
expect(stackkitConfigSchema.parse({ projectName: "acme", modules: [], packageManager: "bun" }).packageManager).toBe("bun");
expect(stackkitConfigSchema.parse({ projectName: "acme", modules: [] }).packageManager).toBe("pnpm");
expect(() => stackkitConfigSchema.parse({ projectName: "acme", modules: [], packageManager: "bad" })).toThrow();
```

- [ ] **Step 2: Run failing tests**

Run:

```powershell
pnpm --filter @berkayorhan/stackkit-schemas test -- config
```

Expected: fails because schema only accepts `pnpm`.

- [ ] **Step 3: Implement schema enum**

Add:

```ts
export const packageManagerSchema = z.enum(["pnpm", "npm", "yarn", "bun"]);
```

Use `packageManagerSchema.default("pnpm")` in `stackkitConfigSchema`.

- [ ] **Step 4: Run schema tests**

Run:

```powershell
pnpm --filter @berkayorhan/stackkit-schemas test -- config
```

Expected: pass.

## Task 1: Add Adapter API

**Files:**
- Create: `packages/core/src/package-manager.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing adapter tests**

Create `packages/core/src/package-manager.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { getPackageManagerAdapter } from "./index.js";

describe("package manager adapters", () => {
  it("returns pnpm commands", () => {
    const adapter = getPackageManagerAdapter("pnpm");

    expect(adapter).toEqual(
      expect.objectContaining({
        name: "pnpm",
        lockfile: "pnpm-lock.yaml",
        workspaceFile: "pnpm-workspace.yaml",
        packageManagerField: "pnpm@10.5.1"
      })
    );
    expect(adapter.installCommand).toEqual(["pnpm", "install"]);
    expect(adapter.runCommand("build")).toEqual(["pnpm", "build"]);
  });

  it("returns npm commands", () => {
    const adapter = getPackageManagerAdapter("npm");

    expect(adapter.lockfile).toBe("package-lock.json");
    expect(adapter.workspaceFile).toBeUndefined();
    expect(adapter.installCommand).toEqual(["npm", "install"]);
    expect(adapter.runCommand("build")).toEqual(["npm", "run", "build"]);
  });

  it("returns yarn commands", () => {
    const adapter = getPackageManagerAdapter("yarn");

    expect(adapter.lockfile).toBe("yarn.lock");
    expect(adapter.packageManagerField).toMatch(/^yarn@/);
    expect(adapter.runCommand("build")).toEqual(["yarn", "build"]);
  });

  it("returns bun commands", () => {
    const adapter = getPackageManagerAdapter("bun");

    expect(adapter.lockfile).toBe("bun.lock");
    expect(adapter.packageManagerField).toMatch(/^bun@/);
    expect(adapter.runCommand("build")).toEqual(["bun", "run", "build"]);
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
pnpm --filter @berkayorhan/stackkit-core test -- package-manager
```

Expected: fails because adapter API is missing.

- [ ] **Step 3: Implement adapter**

Add to `packages/core/src/index.ts`:

```ts
export type PackageManagerName = "pnpm" | "npm" | "yarn" | "bun";

export type PackageManagerAdapter = {
  name: PackageManagerName;
  lockfile: string;
  workspaceFile?: string;
  packageManagerField: string;
  installCommand: string[];
  runCommand: (script: string) => string[];
  addCommand: (packages: readonly string[]) => string[];
  dlxCommand: (packageName: string, args: readonly string[]) => string[];
};

const packageManagers: Record<PackageManagerName, PackageManagerAdapter> = {
  pnpm: {
    name: "pnpm",
    lockfile: "pnpm-lock.yaml",
    workspaceFile: "pnpm-workspace.yaml",
    packageManagerField: "pnpm@10.5.1",
    installCommand: ["pnpm", "install"],
    runCommand: (script) => ["pnpm", script],
    addCommand: (packages) => ["pnpm", "add", ...packages],
    dlxCommand: (packageName, args) => ["pnpm", "dlx", packageName, ...args]
  },
  npm: {
    name: "npm",
    lockfile: "package-lock.json",
    packageManagerField: "npm@11.5.2",
    installCommand: ["npm", "install"],
    runCommand: (script) => ["npm", "run", script],
    addCommand: (packages) => ["npm", "install", ...packages],
    dlxCommand: (packageName, args) => ["npx", "-y", packageName, ...args]
  },
  yarn: {
    name: "yarn",
    lockfile: "yarn.lock",
    packageManagerField: "yarn@4.9.4",
    installCommand: ["yarn", "install"],
    runCommand: (script) => ["yarn", script],
    addCommand: (packages) => ["yarn", "add", ...packages],
    dlxCommand: (packageName, args) => ["yarn", "dlx", packageName, ...args]
  },
  bun: {
    name: "bun",
    lockfile: "bun.lock",
    packageManagerField: "bun@1.2.15",
    installCommand: ["bun", "install"],
    runCommand: (script) => ["bun", "run", script],
    addCommand: (packages) => ["bun", "add", ...packages],
    dlxCommand: (packageName, args) => ["bunx", packageName, ...args]
  }
};

export function getPackageManagerAdapter(name: PackageManagerName): PackageManagerAdapter {
  return packageManagers[name];
}
```

- [ ] **Step 4: Run adapter tests**

Run:

```powershell
pnpm --filter @berkayorhan/stackkit-core test -- package-manager
```

Expected: pass.

## Task 2: Make Foundation Template Package-Manager Aware

**Files:**
- Modify: `packages/templates/src/index.ts`
- Modify: `packages/templates/src/foundation.test.ts`

- [ ] **Step 1: Add failing template tests**

Add to `packages/templates/src/foundation.test.ts`:

```ts
it("renders npm workspaces without pnpm-workspace.yaml", () => {
  const files = renderPnpmTurboFoundation({ projectName: "acme", packageManager: "npm" });

  expect(files.some((file) => file.path === "pnpm-workspace.yaml")).toBe(false);
  expect(files.find((file) => file.path === "package.json")?.content).toContain('"packageManager": "npm@');
  expect(files.find((file) => file.path === "package.json")?.content).toContain('"workspaces"');
});

it("renders bun package manager metadata", () => {
  const files = renderPnpmTurboFoundation({ projectName: "acme", packageManager: "bun" });

  expect(files.find((file) => file.path === "package.json")?.content).toContain('"packageManager": "bun@');
});
```

- [ ] **Step 2: Run failing template tests**

Run:

```powershell
pnpm --filter @berkayorhan/stackkit-templates test -- foundation
```

Expected: fails because template options only include `projectName`.

- [ ] **Step 3: Update template options**

In `packages/templates/src/index.ts`, change:

```ts
type PnpmTurboFoundationOptions = {
  projectName: string;
};
```

to:

```ts
type PnpmTurboFoundationOptions = {
  projectName: string;
  packageManager?: "pnpm" | "npm" | "yarn" | "bun";
};
```

Core should call the adapter and pass a plain option object into templates:

```ts
renderPnpmTurboFoundation({
  projectName: config.projectName,
  packageManagerField: adapter.packageManagerField,
  workspaceFile: adapter.workspaceFile
})
```

Do not import `@berkayorhan/stackkit-core` from `packages/templates`.

For `pnpm`, emit `pnpm-workspace.yaml`. For other package managers, emit `workspaces` in root `package.json`.

Add a Docker template test for non-pnpm output. If Docker still emits pnpm-only commands, mark Docker support as pnpm-only in module metadata and add a doctor warning instead of pretending it is supported.

- [ ] **Step 4: Run template tests**

Run:

```powershell
pnpm --filter @berkayorhan/stackkit-templates test -- foundation
```

Expected: pass.

## Task 3: Wire `--pm` Into Create Planning

**Files:**
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/cli.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add failing CLI test**

Add to `packages/cli/src/cli.test.ts`:

```ts
it("uses --pm to override the package manager in create dry-run", async () => {
  const output = await runProgram(["create", "acme", "--pm", "bun", "--dry-run"]);

  expect(output.stdout).toContain('"packageManager": "bun"');
  expect(output.stdout).toContain('"packageManager": "bun@');
});
```

- [ ] **Step 2: Run failing CLI test**

Run:

```powershell
pnpm --filter @berkayorhan/stackkit test -- cli
```

Expected: fails because `--pm` is missing.

- [ ] **Step 3: Add CLI options**

In `packages/cli/src/index.ts`, add create options:

```ts
.option("--pm <manager>", "Package manager to use. (pnpm, npm, yarn, bun)")
.option("--package-manager <manager>", "Package manager to use. (pnpm, npm, yarn, bun)")
```

Normalize:

```ts
const packageManager = options.packageManager ?? options.pm;
```

Validate with schema by writing it into the `StackkitConfig` before plan creation.

- [ ] **Step 4: Pass package manager to template rendering**

In `packages/core/src/index.ts`, call:

```ts
renderPnpmTurboFoundation({ projectName: config.projectName, packageManager: config.packageManager })
```

- [ ] **Step 5: Run checks**

Run:

```powershell
pnpm --filter @berkayorhan/stackkit-core test -- package-manager create-plan
pnpm --filter @berkayorhan/stackkit-schemas test -- config
pnpm --filter @berkayorhan/stackkit-templates test -- foundation
pnpm --filter @berkayorhan/stackkit test -- cli
pnpm --filter @berkayorhan/stackkit-core typecheck
pnpm --filter @berkayorhan/stackkit-templates typecheck
pnpm --filter @berkayorhan/stackkit typecheck
```

Expected: pass.
