# Stackkit Slice 02 Package Manager Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not create a worktree, branch, commit, stage, reset, or revert unless the user explicitly asks.

**Goal:** Add shared package-manager adapters for pnpm, npm, yarn, and bun without scattering conditionals through templates and CLI code.

**Architecture:** Package-manager behavior lives in `packages/core` as a small adapter API. Schemas validate the allowed values. Templates receive package-manager-derived strings rather than checking package-manager names themselves.

**Tech Stack:** TypeScript, Zod, Vitest, Node package metadata.

---

## File Structure

- `packages/schemas/src/index.ts`: validate `packageManager` as `pnpm | npm | yarn | bun`.
- `packages/core/src/index.ts`: add package-manager adapter type and resolver.
- `packages/core/src/package-manager.test.ts`: test commands and generated metadata.
- `packages/templates/src/index.ts`: accept package-manager foundation options.
- `packages/templates/src/foundation.test.ts`: verify generated package files for each manager.
- `packages/cli/src/index.ts`: add `--pm` and `--package-manager`.
- `packages/cli/src/cli.test.ts`: cover `--pm bun` dry-run.

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
pnpm --filter @stackkit/core test -- package-manager
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
    dlxCommand: (packageName, args) => ["pnpm", "dlx", packageName, ...args]
  },
  npm: {
    name: "npm",
    lockfile: "package-lock.json",
    packageManagerField: "npm@11.5.2",
    installCommand: ["npm", "install"],
    runCommand: (script) => ["npm", "run", script],
    dlxCommand: (packageName, args) => ["npx", "-y", packageName, ...args]
  },
  yarn: {
    name: "yarn",
    lockfile: "yarn.lock",
    packageManagerField: "yarn@4.9.4",
    installCommand: ["yarn", "install"],
    runCommand: (script) => ["yarn", script],
    dlxCommand: (packageName, args) => ["yarn", "dlx", packageName, ...args]
  },
  bun: {
    name: "bun",
    lockfile: "bun.lock",
    packageManagerField: "bun@1.2.15",
    installCommand: ["bun", "install"],
    runCommand: (script) => ["bun", "run", script],
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
pnpm --filter @stackkit/core test -- package-manager
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
pnpm --filter @stackkit/templates test -- foundation
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

Add a local package manager field helper or import a small shared type if moving helpers is cleaner. Keep template logic limited to foundation files.

For `pnpm`, emit `pnpm-workspace.yaml`. For other package managers, emit `workspaces` in root `package.json`.

- [ ] **Step 4: Run template tests**

Run:

```powershell
pnpm --filter @stackkit/templates test -- foundation
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
  const output = await runCli(["node", "stackkit", "create", "acme", "--pm", "bun", "--dry-run"]);

  expect(output.stdout).toContain('"packageManager": "bun"');
  expect(output.stdout).toContain('"packageManager": "bun@');
});
```

- [ ] **Step 2: Run failing CLI test**

Run:

```powershell
pnpm --filter @stackkit/cli test -- cli
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
pnpm --filter @stackkit/core test -- package-manager create-plan
pnpm --filter @stackkit/templates test -- foundation
pnpm --filter @stackkit/cli test -- cli
```

Expected: pass.

