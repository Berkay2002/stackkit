# Stackkit Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Review at the end of each chunk or milestone, not after every task.

**Goal:** Build the remaining Stackkit generator platform: real project generation, manifests, AI skills, lifecycle commands, presets, interactive prompts, docs, and verification.

**Architecture:** `packages/core` owns planning, safety, file application, manifests, skills, lifecycle behavior, and diagnostics. `packages/registry` declares modules and presets. `packages/templates` renders file content into operations. `packages/cli` parses commands, prompts users, formats output, and delegates to core.

**Tech Stack:** TypeScript, Node.js, pnpm, Turborepo, Commander, Zod, Vitest, native `node:fs/promises`, `node:child_process`, `node:crypto`, and existing workspace packages.

---

## Execution Rules

Repo root: `C:/Users/berka/Project/my-monorepo`

Do not create a worktree or feature branch in this repo. The handoff explicitly forbids both.

Do not commit, stage, reset, or revert unless the user explicitly asks. The commit steps from the writing-plans skill are represented as "checkpoint notes" only for this repo.

Run the narrow test command after each implementation slice. Run the broader workspace checks only after a milestone is complete. Dry-run commands are testable planning commands, but final acceptance requires apply-mode tests for `create`, `add`, `remove`, `migrate`, `skills sync`, and `skills update`.

Subagent-driven execution should use chunk-level reviews. Do not run spec and code-quality reviews after every task. A chunk is one milestone, except when a milestone is very large; split those at natural boundaries such as schema/core/CLI or templates/registry/tests. Run the reviewer after the chunk's tests pass.

```powershell
pnpm --filter @stackkit/core test
pnpm --filter @stackkit/cli test
pnpm --filter @stackkit/registry test
pnpm --filter @stackkit/schemas test
pnpm test
pnpm build
pnpm typecheck
```

If build output creates `packages/**/dist` or `packages/**/*.tsbuildinfo`, remove those generated artifacts only after confirming they are generated files and not source inputs.

## File Structure Map

Create or modify these files over the full plan:

```text
packages/schemas/src/index.ts
packages/schemas/src/file-operations.test.ts
packages/schemas/src/lifecycle.test.ts
packages/core/src/index.ts
packages/core/src/create-plan.test.ts
packages/core/src/module-graph.test.ts
packages/core/src/file-plan.test.ts
packages/core/src/apply-file-plan.test.ts
packages/core/src/manifest.test.ts
packages/core/src/skills-lock.test.ts
packages/core/src/skill-installer.test.ts
packages/core/src/lifecycle-add-remove.test.ts
packages/core/src/lifecycle-update-migrate.test.ts
packages/core/src/doctor.test.ts
packages/templates/src/index.ts
packages/templates/src/foundation.test.ts
packages/templates/src/web-nextjs.test.ts
packages/templates/src/api-fastapi.test.ts
packages/templates/src/deploy.test.ts
packages/registry/src/index.ts
packages/registry/src/presets.test.ts
packages/registry/src/module-files.test.ts
packages/cli/src/index.ts
packages/cli/src/cli.test.ts
packages/test-utils/src/index.ts
examples/next-shadcn/stackkit.config.json
examples/next-fastapi-postgres-auth0/stackkit.config.json
examples/next-rust-postgres-auth0/stackkit.config.json
examples/docker-kubernetes/stackkit.config.json
docs/architecture.md
docs/modules.md
docs/skills.md
docs/managed-updates.md
docs/contributing.md
README.md
LICENSE
CONTRIBUTING.md
SECURITY.md
CODE_OF_CONDUCT.md
CHANGELOG.md
```

Keep public types in `packages/schemas`. Keep orchestration in `packages/core`. Keep generated content in `packages/templates`. Keep module declarations in `packages/registry`. Keep all direct terminal output and prompts in `packages/cli`.

---

## Milestone 1: Move Create Planning Into Core

### Task 1: Add Core Create Plan API

**Files:**
- Create: `packages/core/src/create-plan.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `packages/cli/src/cli.test.ts`

- [ ] **Step 1: Write the failing core test**

Add `packages/core/src/create-plan.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createCreatePlan, defineModule, type StackkitConfig } from "./index.js";

const nextModule = defineModule({
  id: "web/nextjs",
  version: "1.0.0",
  title: "Next.js",
  description: "Next.js web application",
  provides: ["web-app", "react"],
  aiSkills: [
    {
      source: "https://github.com/vercel-labs/agent-skills",
      skills: ["vercel-react-best-practices"],
      trust: "official",
      causedBy: "web/nextjs",
      reason: "React and Next.js app code"
    }
  ]
});

const kubernetesModule = defineModule({
  id: "deploy/kubernetes",
  version: "1.0.0",
  title: "Kubernetes",
  description: "Baseline Kubernetes deployment",
  provides: ["deploy"],
  aiSkills: [
    {
      skills: ["stackkit-kubernetes-guidance"],
      trust: "local",
      causedBy: "deploy/kubernetes",
      reason: "No accepted Kubernetes skill source is configured"
    }
  ]
});

describe("createCreatePlan", () => {
  it("builds a dry-run create plan from parsed config and available modules", () => {
    const config: StackkitConfig = {
      projectName: "acme-dashboard",
      packageManager: "pnpm",
      workspace: "pnpm-turbo",
      modules: ["web/nextjs", "deploy/kubernetes"],
      ai: { skillTargets: ["codex", "claude-code"] }
    };

    const plan = createCreatePlan({
      config,
      availableModules: [nextModule, kubernetesModule],
      curatedSkillSourceAllowlist: []
    });

    expect(plan).toEqual(
      expect.objectContaining({
        schemaVersion: 1,
        operation: "create",
        projectName: "acme-dashboard",
        dryRun: true
      })
    );
    expect(plan.modules).toEqual([
      { id: "web/nextjs", version: "1.0.0" },
      { id: "deploy/kubernetes", version: "1.0.0" }
    ]);
    expect(plan.aiSkills.targets).toEqual([
      { agent: "codex", directory: ".agents", enabled: true },
      { agent: "claude-code", directory: ".claude", enabled: true }
    ]);
    expect(plan.aiSkills.local).toEqual([
      expect.objectContaining({ causedBy: "deploy/kubernetes", trust: "local" })
    ]);
    expect(plan.skillInstallCommands).toEqual([
      expect.objectContaining({
        command: "npx",
        args: expect.arrayContaining(["skills", "add", "https://github.com/vercel-labs/agent-skills", "--agent", "codex"])
      }),
      expect.objectContaining({
        command: "npx",
        args: expect.arrayContaining(["skills", "add", "https://github.com/vercel-labs/agent-skills", "--agent", "claude-code"])
      })
    ]);
  });

  it("fails when config references an unknown module", () => {
    expect(() =>
      createCreatePlan({
        config: {
          projectName: "bad-project",
          packageManager: "pnpm",
          workspace: "pnpm-turbo",
          modules: ["missing/module"],
          ai: { skillTargets: ["codex"] }
        },
        availableModules: [nextModule],
        curatedSkillSourceAllowlist: []
      })
    ).toThrow("Unknown Stackkit module: missing/module");
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
pnpm --filter @stackkit/core test -- create-plan
```

Expected: FAIL because `createCreatePlan` is not exported.

- [ ] **Step 3: Implement the core API**

In `packages/core/src/index.ts`, move the create plan type and planning logic from the CLI into core. Add these exports near the existing AI skill types:

```ts
export type CreatePlan = {
  schemaVersion: 1;
  operation: "create";
  dryRun: true;
  projectName: string;
  modules: {
    id: string;
    version: string;
  }[];
  aiSkills: {
    targets: AiSkillTarget[];
    resolved: AiSkillDependency[];
    local: AiSkillDependency[];
    unresolved: AiSkillDependency[];
  };
  skillInstallCommands: AiSkillInstallCommand[];
};

export type CreatePlanInput = {
  config: StackkitConfig;
  availableModules: readonly StackkitModule[];
  availablePresets?: readonly StackkitPreset[];
  curatedSkillSourceAllowlist?: readonly string[];
};
```

Add this function:

```ts
export function createCreatePlan(input: CreatePlanInput): CreatePlan {
  const configuredModules = resolveConfiguredModules(input.config, input.availableModules);
  const modules = resolveModuleGraph(configuredModules, {
    presets: input.availablePresets ?? [],
    selectedPresets: input.config.preset ? [input.config.preset] : [],
    availableModules: input.availableModules
  });
  const resolvedSkills = resolveAiSkills(modules, {
    curatedAllowlist: input.curatedSkillSourceAllowlist ?? []
  });
  const targets = resolveAiSkillTargets(input.config.ai.skillTargets);
  const installCommands = planAiSkillInstallCommands(resolvedSkills, targets);

  return {
    schemaVersion: 1,
    operation: "create",
    dryRun: true,
    projectName: input.config.projectName,
    modules: modules.map((module) => ({
      id: module.id,
      version: module.version
    })),
    aiSkills: {
      targets,
      resolved: resolvedSkills,
      local: resolvedSkills.filter((skill) => skill.trust === "local"),
      unresolved: resolvedSkills.filter((skill) => skill.trust === "unresolved")
    },
    skillInstallCommands: installCommands
  };
}

function resolveConfiguredModules(config: StackkitConfig, availableModules: readonly StackkitModule[]): StackkitModule[] {
  const moduleById = new Map<string, StackkitModule>(availableModules.map((module) => [module.id, module]));

  return config.modules.map((moduleId) => {
    const module = moduleById.get(moduleId);

    if (!module) {
      throw new Error(`Unknown Stackkit module: ${moduleId}`);
    }

    return module;
  });
}
```

- [ ] **Step 4: Run core tests**

Run:

```powershell
pnpm --filter @stackkit/core test -- create-plan
```

Expected: PASS.

- [ ] **Step 5: Update CLI to call core**

In `packages/cli/src/index.ts`, remove the local `CreateDryRunPlan` type and `resolveConfiguredModules` helper. Import `createCreatePlan` and `type CreatePlan` from `@stackkit/core`. Import `builtinPresets` alongside `builtinModules` from `@stackkit/registry`. Change `createDryRunPlanFromConfig` to:

```ts
export async function createDryRunPlanFromConfig(configPath?: string): Promise<CreatePlan> {
  if (!configPath) {
    throw new Error("Interactive create is not implemented yet. Pass --config <path>.");
  }

  const config = stackkitConfigSchema.parse(JSON.parse(await readFile(configPath, "utf8")));

  return createCreatePlan({
    config,
    availableModules: builtinModules,
    availablePresets: builtinPresets,
    curatedSkillSourceAllowlist
  });
}
```

Change the formatter signature:

```ts
export function formatCreateDryRunPlan(plan: CreatePlan): string {
```

- [ ] **Step 6: Run CLI and core tests**

Run:

```powershell
pnpm --filter @stackkit/core test
pnpm --filter @stackkit/cli test
```

Expected: PASS.

Checkpoint note: core now owns create planning, CLI owns reading and formatting.

---

## Milestone 2: Schemas For File Operations And Lifecycle Data

### Task 2: Add File Operation, Package, Env, Hook, And Doctor Schemas

**Files:**
- Create: `packages/schemas/src/file-operations.test.ts`
- Create: `packages/schemas/src/lifecycle.test.ts`
- Modify: `packages/schemas/src/index.ts`

- [ ] **Step 1: Write schema tests**

Add `packages/schemas/src/file-operations.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { fileOperationSchema, packageChangeSchema, stackkitModuleSchema } from "./index.js";

describe("file operation schemas", () => {
  it("accepts generated file writes owned by a module", () => {
    expect(
      fileOperationSchema.parse({
        kind: "write",
        path: "package.json",
        owner: "workspace/pnpm-turbo",
        content: "{\n  \"name\": \"acme\"\n}\n",
        overwrite: "if-owned"
      })
    ).toEqual({
      kind: "write",
      path: "package.json",
      owner: "workspace/pnpm-turbo",
      content: "{\n  \"name\": \"acme\"\n}\n",
      overwrite: "if-owned"
    });
  });

  it("accepts package changes on a workspace package", () => {
    expect(
      packageChangeSchema.parse({
        packagePath: "package.json",
        scripts: { build: "turbo run build" },
        dependencies: { next: "^15.0.0" },
        devDependencies: { typescript: "^5.9.3" }
      })
    ).toEqual(
      expect.objectContaining({
        packagePath: "package.json",
        scripts: { build: "turbo run build" }
      })
    );
  });

  it("allows modules to declare files, package changes, env vars, tasks, hooks, and validations", () => {
    const parsed = stackkitModuleSchema.parse({
      id: "workspace/pnpm-turbo",
      version: "1.0.0",
      title: "pnpm and Turborepo",
      description: "Workspace foundation",
      provides: ["workspace/node"],
      files: [
        {
          kind: "write",
          path: "pnpm-workspace.yaml",
          owner: "workspace/pnpm-turbo",
          content: "packages:\n  - packages/*\n",
          overwrite: "if-owned"
        }
      ],
      packageChanges: [
        {
          packagePath: "package.json",
          devDependencies: { turbo: "^2.9.16" }
        }
      ],
      envVars: [
        {
          name: "DATABASE_URL",
          description: "Postgres connection string",
          required: true,
          example: "postgres://postgres:postgres@localhost:5432/app"
        }
      ],
      tasks: [{ name: "install", command: "pnpm", args: ["install"] }],
      postCreate: [{ name: "format", command: "pnpm", args: ["format"] }],
      validate: [{ kind: "file-exists", path: "package.json" }]
    });

    expect(parsed.files).toHaveLength(1);
    expect(parsed.packageChanges).toHaveLength(1);
    expect(parsed.envVars).toHaveLength(1);
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.postCreate).toHaveLength(1);
    expect(parsed.validate).toHaveLength(1);
  });
});
```

Add `packages/schemas/src/lifecycle.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { doctorResultSchema, migrationOperationSchema, skillsLockSchema } from "./index.js";

describe("lifecycle schemas", () => {
  it("accepts migration operations", () => {
    expect(
      migrationOperationSchema.parse({
        kind: "write",
        path: "turbo.json",
        content: "{\n  \"$schema\": \"https://turbo.build/schema.json\"\n}\n"
      })
    ).toEqual(
      expect.objectContaining({
        kind: "write",
        path: "turbo.json"
      })
    );
  });

  it("accepts skills lock data", () => {
    expect(
      skillsLockSchema.parse({
        schemaVersion: 1,
        targets: [{ agent: "codex", directory: ".agents", enabled: true }],
        installed: [],
        local: [],
        unresolved: []
      })
    ).toEqual(
      expect.objectContaining({
        schemaVersion: 1,
        targets: [{ agent: "codex", directory: ".agents", enabled: true }]
      })
    );
  });

  it("accepts doctor results with errors and warnings", () => {
    expect(
      doctorResultSchema.parse({
        ok: false,
        checks: [
          {
            id: "manifest.exists",
            status: "error",
            message: ".stackkit/project.json is missing"
          },
          {
            id: "skills.local",
            status: "warning",
            message: "Local guidance is missing for deploy/kubernetes"
          }
        ]
      }).ok
    ).toBe(false);
  });
});
```

Also update `packages/schemas/src/config.test.ts`:

```ts
it("accepts a preset id for preset-driven generation", () => {
  expect(
    stackkitConfigSchema.parse({
      projectName: "example",
      preset: "next-fastapi-postgres-auth0"
    }).preset
  ).toBe("next-fastapi-postgres-auth0");
});
```

- [ ] **Step 2: Run failing schema tests**

Run:

```powershell
pnpm --filter @stackkit/schemas test -- file-operations lifecycle
```

Expected: FAIL because these schemas are not exported.

- [ ] **Step 3: Implement schemas**

In `packages/schemas/src/index.ts`, add these schemas before `stackkitModuleSchema`:

```ts
export const fileOverwritePolicySchema = z.enum(["never", "if-owned", "always"]);

export const fileOperationSchema = z.object({
  kind: z.enum(["write", "delete"]),
  path: z.string().min(1),
  owner: moduleIdSchema,
  content: z.string().optional(),
  mode: z.number().int().optional(),
  overwrite: fileOverwritePolicySchema.default("if-owned")
});

export const packageChangeSchema = z.object({
  packagePath: z.string().min(1),
  scripts: z.record(z.string(), z.string()).default({}),
  dependencies: z.record(z.string(), z.string()).default({}),
  devDependencies: z.record(z.string(), z.string()).default({}),
  peerDependencies: z.record(z.string(), z.string()).default({}),
  optionalDependencies: z.record(z.string(), z.string()).default({})
});

export const envVarDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  required: z.boolean().default(true),
  example: z.string().optional()
});

export const taskDefinitionSchema = z.object({
  name: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  cwd: z.string().optional()
});

export const lifecycleHookSchema = taskDefinitionSchema;

export const moduleValidationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("file-exists"),
    path: z.string().min(1)
  }),
  z.object({
    kind: z.literal("command-succeeds"),
    command: z.string().min(1),
    args: z.array(z.string()).default([])
  })
]);

export const migrationOperationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("write"),
    path: z.string().min(1),
    content: z.string()
  }),
  z.object({
    kind: z.literal("delete"),
    path: z.string().min(1)
  })
]);

export const skillsLockSchema = z.object({
  schemaVersion: z.literal(1),
  targets: z.array(aiSkillTargetSchema),
  installed: z.array(aiSkillDependencySchema),
  local: z.array(aiSkillDependencySchema),
  unresolved: z.array(aiSkillDependencySchema)
});

export const doctorCheckSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["ok", "warning", "error"]),
  message: z.string().min(1)
});

export const doctorResultSchema = z.object({
  ok: z.boolean(),
  checks: z.array(doctorCheckSchema)
});
```

Change `moduleMigrationSchema.operations`:

```ts
operations: z.array(migrationOperationSchema).default([]),
```

Change `stackkitConfigSchema` to include first-class presets:

```ts
preset: z.string().min(1).optional(),
```

Change these fields in `stackkitModuleSchema`:

```ts
files: z.array(fileOperationSchema).optional(),
packageChanges: z.array(packageChangeSchema).optional(),
envVars: z.array(envVarDefinitionSchema).optional(),
tasks: z.array(taskDefinitionSchema).optional(),
postCreate: z.array(lifecycleHookSchema).optional(),
postAdd: z.array(lifecycleHookSchema).optional(),
validate: z.array(moduleValidationSchema).optional()
```

Add type exports at the bottom:

```ts
export type FileOverwritePolicy = z.infer<typeof fileOverwritePolicySchema>;
export type FileOperation = z.infer<typeof fileOperationSchema>;
export type PackageChange = z.infer<typeof packageChangeSchema>;
export type EnvVarDefinition = z.infer<typeof envVarDefinitionSchema>;
export type TaskDefinition = z.infer<typeof taskDefinitionSchema>;
export type LifecycleHook = z.infer<typeof lifecycleHookSchema>;
export type ModuleValidation = z.infer<typeof moduleValidationSchema>;
export type MigrationOperation = z.infer<typeof migrationOperationSchema>;
export type SkillsLock = z.infer<typeof skillsLockSchema>;
export type DoctorCheck = z.infer<typeof doctorCheckSchema>;
export type DoctorResult = z.infer<typeof doctorResultSchema>;
```

- [ ] **Step 4: Run schema tests**

Run:

```powershell
pnpm --filter @stackkit/schemas test
```

Expected: PASS.

Checkpoint note: public schemas now describe the data the engine needs.

---

## Milestone 3: Module Graph Validation

### Task 3: Validate Requirements, Provides, Conflicts, And Preset Expansion

**Files:**
- Create: `packages/core/src/module-graph.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/registry/src/index.ts`
- Create: `packages/registry/src/presets.test.ts`

- [ ] **Step 1: Write core module graph tests**

Add `packages/core/src/module-graph.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { defineModule, definePreset, resolveModuleGraph } from "./index.js";

const workspace = defineModule({
  id: "workspace/pnpm-turbo",
  version: "1.0.0",
  title: "pnpm and Turborepo",
  description: "Workspace foundation",
  provides: ["workspace/node"]
});

const next = defineModule({
  id: "web/nextjs",
  version: "1.0.0",
  title: "Next.js",
  description: "Next.js web application",
  requires: ["workspace/node"],
  provides: ["web-app", "react"]
});

const django = defineModule({
  id: "web/django",
  version: "1.0.0",
  title: "Django",
  description: "Django web application",
  conflicts: ["web/nextjs"],
  provides: ["web-app", "python"]
});

describe("resolveModuleGraph", () => {
  it("orders selected modules deterministically and validates requirements", () => {
    const graph = resolveModuleGraph([next, workspace]);

    expect(graph.map((module) => module.id)).toEqual(["workspace/pnpm-turbo", "web/nextjs"]);
  });

  it("fails when a required capability is missing", () => {
    expect(() => resolveModuleGraph([next])).toThrow("Module web/nextjs requires capability workspace/node");
  });

  it("fails when selected modules conflict", () => {
    expect(() => resolveModuleGraph([workspace, next, django])).toThrow("Module web/django conflicts with web/nextjs");
  });

  it("expands presets into modules before resolving", () => {
    const preset = definePreset({
      id: "next-only",
      title: "Next.js only",
      description: "A pnpm/Turborepo workspace with Next.js",
      modules: ["workspace/pnpm-turbo", "web/nextjs"]
    });

    const graph = resolveModuleGraph([], {
      presets: [preset],
      selectedPresets: ["next-only"],
      availableModules: [workspace, next]
    });

    expect(graph.map((module) => module.id)).toEqual(["workspace/pnpm-turbo", "web/nextjs"]);
  });
});
```

- [ ] **Step 2: Run failing core test**

Run:

```powershell
pnpm --filter @stackkit/core test -- module-graph
```

Expected: FAIL because `resolveModuleGraph` does not validate or expand presets.

- [ ] **Step 3: Implement module graph resolution**

In `packages/core/src/index.ts`, replace `resolveModuleGraph` with:

```ts
export type ResolveModuleGraphOptions = {
  presets?: readonly StackkitPreset[];
  selectedPresets?: readonly string[];
  availableModules?: readonly StackkitModule[];
};

export function resolveModuleGraph(
  modules: readonly StackkitModule[],
  options: ResolveModuleGraphOptions = {}
): StackkitModule[] {
  const expanded = [...expandPresetModules(options), ...modules];
  const unique = dedupeModules(expanded);
  const ordered = orderModulesByRequirements(unique);

  validateModuleRequirements(ordered);
  validateModuleConflicts(ordered);

  return ordered;
}

function expandPresetModules(options: ResolveModuleGraphOptions): StackkitModule[] {
  const selectedPresets = options.selectedPresets ?? [];

  if (selectedPresets.length === 0) {
    return [];
  }

  const presetById = new Map((options.presets ?? []).map((preset) => [preset.id, preset]));
  const moduleById = new Map((options.availableModules ?? []).map((module) => [module.id, module]));
  const expanded: StackkitModule[] = [];

  for (const presetId of selectedPresets) {
    const preset = presetById.get(presetId);

    if (!preset) {
      throw new Error(`Unknown Stackkit preset: ${presetId}`);
    }

    for (const moduleId of preset.modules) {
      const module = moduleById.get(moduleId);

      if (!module) {
        throw new Error(`Preset ${presetId} references unknown module: ${moduleId}`);
      }

      expanded.push(module);
    }
  }

  return expanded;
}

function dedupeModules(modules: readonly StackkitModule[]): StackkitModule[] {
  const moduleById = new Map<string, StackkitModule>();

  for (const module of modules) {
    moduleById.set(module.id, module);
  }

  return [...moduleById.values()];
}

function orderModulesByRequirements(modules: readonly StackkitModule[]): StackkitModule[] {
  const pending = [...modules].sort((left, right) => left.id.localeCompare(right.id));
  const ordered: StackkitModule[] = [];
  const provided = new Set<string>();

  while (pending.length > 0) {
    const index = pending.findIndex((module) => (module.requires ?? []).every((capability) => provided.has(capability)));

    if (index === -1) {
      ordered.push(...pending);
      break;
    }

    const [module] = pending.splice(index, 1);
    ordered.push(module);

    for (const capability of module.provides ?? []) {
      provided.add(capability);
    }
  }

  return ordered;
}

function validateModuleRequirements(modules: readonly StackkitModule[]): void {
  const provided = new Set<string>();

  for (const module of modules) {
    for (const required of module.requires ?? []) {
      if (!provided.has(required)) {
        throw new Error(`Module ${module.id} requires capability ${required}`);
      }
    }

    for (const capability of module.provides ?? []) {
      provided.add(capability);
    }
  }
}

function validateModuleConflicts(modules: readonly StackkitModule[]): void {
  const selected = new Set(modules.map((module) => module.id));

  for (const module of modules) {
    for (const conflict of module.conflicts ?? []) {
      if (selected.has(conflict)) {
        throw new Error(`Module ${module.id} conflicts with ${conflict}`);
      }
    }
  }
}
```

- [ ] **Step 4: Run core tests**

Run:

```powershell
pnpm --filter @stackkit/core test -- module-graph
```

Expected: PASS.

- [ ] **Step 5: Add registry presets**

Add `packages/registry/src/presets.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { builtinModules, builtinPresets } from "./index.js";

describe("builtinPresets", () => {
  it("contains named compositions of built-in modules", () => {
    const moduleIds = new Set(builtinModules.map((module) => module.id));

    expect(builtinPresets.map((preset) => preset.id)).toEqual(
      expect.arrayContaining([
        "next-only",
        "next-postgres-clerk",
        "next-fastapi-postgres-auth0",
        "next-rust-postgres-auth0",
        "fullstack-containerized",
        "work-kubernetes-ready"
      ])
    );

    for (const preset of builtinPresets) {
      for (const moduleId of preset.modules) {
        expect(moduleIds.has(moduleId), `${preset.id} references ${moduleId}`).toBe(true);
      }
    }
  });
});
```

In `packages/registry/src/index.ts`, import `definePreset` and export:

```ts
export const builtinPresets = [
  definePreset({
    id: "next-only",
    title: "Next.js only",
    description: "A pnpm/Turborepo workspace with a Next.js app",
    modules: ["workspace/pnpm-turbo", "workspace/typescript", "web/nextjs", "ui/shadcn", "quality/eslint", "quality/prettier"]
  }),
  definePreset({
    id: "next-postgres-clerk",
    title: "Next.js, Postgres, and Clerk",
    description: "A Next.js app with ShadCN, Postgres, Drizzle, and Clerk",
    modules: [
      "workspace/pnpm-turbo",
      "workspace/typescript",
      "web/nextjs",
      "ui/shadcn",
      "db/postgres",
      "db/drizzle",
      "auth/clerk",
      "deploy/vercel",
      "quality/eslint",
      "quality/prettier"
    ]
  }),
  definePreset({
    id: "next-fastapi-postgres-auth0",
    title: "Next.js, FastAPI, Postgres, and Auth0",
    description: "A multi-language app with Next.js, FastAPI, Postgres, and Auth0",
    modules: [
      "workspace/pnpm-turbo",
      "workspace/typescript",
      "web/nextjs",
      "ui/shadcn",
      "api/fastapi",
      "db/postgres",
      "db/drizzle",
      "db/sqlalchemy",
      "auth/auth0-nextjs",
      "auth/auth0-fastapi",
      "deploy/vercel",
      "deploy/docker",
      "quality/eslint",
      "quality/prettier",
      "quality/ruff",
      "quality/pytest"
    ]
  }),
  definePreset({
    id: "next-rust-postgres-auth0",
    title: "Next.js, Rust, Postgres, and Auth0",
    description: "A Next.js app with Rust service, Postgres, and Auth0",
    modules: [
      "workspace/pnpm-turbo",
      "workspace/typescript",
      "web/nextjs",
      "ui/shadcn",
      "rust/axum",
      "rust/tokio",
      "rust/sqlx",
      "db/postgres",
      "auth/auth0-nextjs",
      "deploy/vercel",
      "deploy/docker",
      "quality/eslint",
      "quality/prettier",
      "quality/cargo"
    ]
  }),
  definePreset({
    id: "fullstack-containerized",
    title: "Full stack containerized",
    description: "A Docker-ready Next.js and API workspace",
    modules: [
      "workspace/pnpm-turbo",
      "workspace/typescript",
      "workspace/docker-compose",
      "web/nextjs",
      "ui/shadcn",
      "api/fastapi",
      "db/postgres",
      "deploy/docker",
      "docs/local-dev"
    ]
  }),
  definePreset({
    id: "work-kubernetes-ready",
    title: "Work Kubernetes ready",
    description: "A containerized workspace with Kubernetes manifests",
    modules: [
      "workspace/pnpm-turbo",
      "workspace/typescript",
      "workspace/github-actions",
      "web/nextjs",
      "api/fastapi",
      "db/postgres",
      "deploy/docker",
      "deploy/kubernetes",
      "docs/architecture",
      "docs/env"
    ]
  })
] as const;
```

Also add minimal module declarations for IDs referenced above before running tests. Use `defineModule` with accurate `requires` and `provides`.

- [ ] **Step 6: Run registry tests**

Run:

```powershell
pnpm --filter @stackkit/registry test -- presets
```

Expected: PASS.

Checkpoint note: presets and graph validation are enforceable.

---

## Milestone 4: File Planning, Hashing, And Conflict Detection

### Task 4: Build File Planning And Conflict Detection

**Files:**
- Create: `packages/core/src/file-plan.test.ts`
- Create: `packages/core/src/apply-file-plan.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write file planning tests**

Add `packages/core/src/file-plan.test.ts`:

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { applyFilePlan, buildFilePlan, detectFileConflicts, hashContent } from "./index.js";

describe("file planning", () => {
  it("builds planned files with deterministic hashes", () => {
    const plan = buildFilePlan([
      {
        kind: "write",
        path: "package.json",
        owner: "workspace/pnpm-turbo",
        content: "{\n  \"name\": \"acme\"\n}\n",
        overwrite: "if-owned"
      }
    ]);

    expect(plan.files).toEqual([
      {
        path: "package.json",
        owner: "workspace/pnpm-turbo",
        content: "{\n  \"name\": \"acme\"\n}\n",
        hash: hashContent("{\n  \"name\": \"acme\"\n}\n"),
        overwrite: "if-owned"
      }
    ]);
  });

  it("detects an existing non-owned file as a conflict", async () => {
    const directory = join(tmpdir(), `stackkit-conflict-${Date.now()}`);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "package.json"), "{}\n", "utf8");

    const plan = buildFilePlan([
      {
        kind: "write",
        path: "package.json",
        owner: "workspace/pnpm-turbo",
        content: "{\n  \"name\": \"acme\"\n}\n",
        overwrite: "if-owned"
      }
    ]);

    await expect(detectFileConflicts(directory, plan, [])).resolves.toEqual([
      {
        path: "package.json",
        reason: "exists-unowned"
      }
    ]);
  });

  it("allows unchanged owned files to be rewritten", async () => {
    const directory = join(tmpdir(), `stackkit-owned-${Date.now()}`);
    const content = "{\n  \"name\": \"acme\"\n}\n";
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "package.json"), content, "utf8");

    const plan = buildFilePlan([
      {
        kind: "write",
        path: "package.json",
        owner: "workspace/pnpm-turbo",
        content,
        overwrite: "if-owned"
      }
    ]);

    await expect(
      detectFileConflicts(directory, plan, [{ path: "package.json", owner: "workspace/pnpm-turbo", hash: hashContent(content) }])
    ).resolves.toEqual([]);
  });
});
```

Add `packages/core/src/apply-file-plan.test.ts`:

```ts
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { applyFilePlan, buildFilePlan } from "./index.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("applyFilePlan", () => {
  it("writes planned files and returns manifest file records", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stackkit-apply-"));
    tempDirectories.push(directory);

    const plan = buildFilePlan([
      {
        kind: "write",
        path: "package.json",
        owner: "workspace/pnpm-turbo",
        content: "{\n  \"name\": \"acme\"\n}\n",
        overwrite: "if-owned"
      }
    ]);

    const files = await applyFilePlan(directory, plan);

    await expect(readFile(join(directory, "package.json"), "utf8")).resolves.toBe("{\n  \"name\": \"acme\"\n}\n");
    expect(files).toEqual([
      expect.objectContaining({
        path: "package.json",
        owner: "workspace/pnpm-turbo"
      })
    ]);
  });
});
```

- [ ] **Step 2: Run failing tests**

Run:

```powershell
pnpm --filter @stackkit/core test -- file-plan apply-file-plan
```

Expected: FAIL because file plan APIs are not exported.

- [ ] **Step 3: Implement file planning APIs**

In `packages/core/src/index.ts`, import needed Node APIs:

```ts
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
```

Add type exports:

```ts
export type PlannedFile = {
  path: string;
  owner: ModuleId;
  content: string;
  hash: string;
  overwrite: "never" | "if-owned" | "always";
};

export type FilePlan = {
  files: PlannedFile[];
};

export type FileConflict = {
  path: string;
  reason: "exists-unowned" | "modified-owned";
};

export type ManifestFileRecord = StackkitManifest["files"][number];
```

Add implementation:

```ts
export function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function buildFilePlan(operations: readonly { kind: string; path: string; owner: ModuleId; content?: string; overwrite?: string }[]): FilePlan {
  const files: PlannedFile[] = [];

  for (const operation of operations) {
    if (operation.kind !== "write") {
      continue;
    }

    const content = operation.content ?? "";

    files.push({
      path: normalizeProjectPath(operation.path),
      owner: operation.owner,
      content,
      hash: hashContent(content),
      overwrite: operation.overwrite === "never" || operation.overwrite === "always" ? operation.overwrite : "if-owned"
    });
  }

  return { files };
}

export async function detectFileConflicts(
  projectDirectory: string,
  plan: FilePlan,
  ownedFiles: readonly ManifestFileRecord[]
): Promise<FileConflict[]> {
  const ownedByPath = new Map(ownedFiles.map((file) => [normalizeProjectPath(file.path), file]));
  const conflicts: FileConflict[] = [];

  for (const file of plan.files) {
    const absolutePath = join(projectDirectory, file.path);
    const existing = await readExistingFile(absolutePath);

    if (existing === undefined || file.overwrite === "always") {
      continue;
    }

    const owned = ownedByPath.get(file.path);

    if (!owned) {
      conflicts.push({ path: file.path, reason: "exists-unowned" });
      continue;
    }

    if (owned.hash !== hashContent(existing)) {
      conflicts.push({ path: file.path, reason: "modified-owned" });
    }
  }

  return conflicts;
}

export async function applyFilePlan(projectDirectory: string, plan: FilePlan): Promise<ManifestFileRecord[]> {
  const records: ManifestFileRecord[] = [];

  for (const file of plan.files) {
    const absolutePath = join(projectDirectory, file.path);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, file.content, "utf8");
    records.push({ path: file.path, owner: file.owner, hash: file.hash });
  }

  return records;
}

async function readExistingFile(path: string): Promise<string | undefined> {
  try {
    const fileStat = await stat(path);

    if (!fileStat.isFile()) {
      return "";
    }

    return await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

function normalizeProjectPath(path: string): string {
  const normalized = normalize(path).split(sep).join("/");

  if (normalized.startsWith("../") || normalized === "..") {
    throw new Error(`Project path escapes target directory: ${path}`);
  }

  return normalized;
}
```

- [ ] **Step 4: Run file planning tests**

Run:

```powershell
pnpm --filter @stackkit/core test -- file-plan apply-file-plan
```

Expected: PASS.

Checkpoint note: core can stage, hash, conflict-check, and write files.

---

## Milestone 5: Foundation Template And Real Create Writes

### Task 5: Implement pnpm/Turborepo Foundation Template

**Files:**
- Create: `packages/templates/src/foundation.test.ts`
- Modify: `packages/templates/src/index.ts`
- Modify: `packages/registry/src/index.ts`
- Create: `packages/registry/src/module-files.test.ts`

- [ ] **Step 1: Write template test**

Add `packages/templates/src/foundation.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { renderPnpmTurboFoundation } from "./index.js";

describe("renderPnpmTurboFoundation", () => {
  it("renders root workspace files", () => {
    const files = renderPnpmTurboFoundation({ projectName: "acme-dashboard" });

    expect(files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "package.json",
          owner: "workspace/pnpm-turbo",
          content: expect.stringContaining("\"name\": \"acme-dashboard\"")
        }),
        expect.objectContaining({
          path: "pnpm-workspace.yaml",
          owner: "workspace/pnpm-turbo",
          content: "packages:\n  - apps/*\n  - packages/*\n"
        }),
        expect.objectContaining({
          path: "turbo.json",
          owner: "workspace/pnpm-turbo",
          content: expect.stringContaining("\"build\"")
        }),
        expect.objectContaining({
          path: "tsconfig.base.json",
          owner: "workspace/typescript",
          content: expect.stringContaining("\"moduleResolution\": \"Bundler\"")
        }),
        expect.objectContaining({
          path: ".gitignore",
          owner: "workspace/pnpm-turbo",
          content: expect.stringContaining("node_modules")
        })
      ])
    );
  });
});
```

- [ ] **Step 2: Run failing template test**

Run:

```powershell
pnpm --filter @stackkit/templates test -- foundation
```

Expected: FAIL because `renderPnpmTurboFoundation` is not exported or template tests are not configured.

- [ ] **Step 3: Add test config if missing**

If `packages/templates` has no `vitest.config.ts`, create it:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node"
  }
});
```

Ensure `packages/templates/package.json` has:

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  }
}
```

- [ ] **Step 4: Implement template renderer**

In `packages/templates/src/index.ts`, add:

```ts
import type { FileOperation } from "@stackkit/schemas";

export type FoundationTemplateInput = {
  projectName: string;
};

export function renderPnpmTurboFoundation(input: FoundationTemplateInput): FileOperation[] {
  return [
    {
      kind: "write",
      path: "package.json",
      owner: "workspace/pnpm-turbo",
      overwrite: "if-owned",
      content: `${JSON.stringify(
        {
          name: input.projectName,
          version: "0.0.0",
          private: true,
          type: "module",
          packageManager: "pnpm@10.5.1",
          scripts: {
            build: "turbo run build",
            test: "turbo run test",
            typecheck: "turbo run typecheck"
          },
          devDependencies: {
            "@types/node": "^24.0.0",
            turbo: "^2.9.16",
            typescript: "^5.9.3",
            vitest: "^4.1.8"
          }
        },
        null,
        2
      )}\n`
    },
    {
      kind: "write",
      path: "pnpm-workspace.yaml",
      owner: "workspace/pnpm-turbo",
      overwrite: "if-owned",
      content: "packages:\n  - apps/*\n  - packages/*\n"
    },
    {
      kind: "write",
      path: "turbo.json",
      owner: "workspace/pnpm-turbo",
      overwrite: "if-owned",
      content: `${JSON.stringify(
        {
          $schema: "https://turbo.build/schema.json",
          tasks: {
            build: {
              dependsOn: ["^build"],
              outputs: ["dist/**", ".next/**", "!.next/cache/**"]
            },
            test: {
              dependsOn: ["^build"]
            },
            typecheck: {
              dependsOn: ["^build"]
            }
          }
        },
        null,
        2
      )}\n`
    },
    {
      kind: "write",
      path: "tsconfig.base.json",
      owner: "workspace/typescript",
      overwrite: "if-owned",
      content: `${JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "NodeNext",
            moduleResolution: "Bundler",
            strict: true,
            noUncheckedIndexedAccess: true,
            exactOptionalPropertyTypes: true,
            skipLibCheck: true
          }
        },
        null,
        2
      )}\n`
    },
    {
      kind: "write",
      path: ".gitignore",
      owner: "workspace/pnpm-turbo",
      overwrite: "if-owned",
      content: "node_modules\n.pnpm-store\ndist\n.turbo\n.next\n.env\n.env.*\n!.env.example\n"
    }
  ];
}
```

Add dependency in `packages/templates/package.json`:

```json
"dependencies": {
  "@stackkit/schemas": "workspace:*"
}
```

- [ ] **Step 5: Run template tests**

Run:

```powershell
pnpm --filter @stackkit/templates test -- foundation
```

Expected: PASS.

- [ ] **Step 6: Attach template output to registry module**

In `packages/registry/src/index.ts`, import `renderPnpmTurboFoundation` and add a built-in module:

```ts
defineModule({
  id: "workspace/pnpm-turbo",
  version: "1.0.0",
  title: "pnpm and Turborepo",
  description: "pnpm workspace with Turborepo task orchestration",
  provides: ["workspace/node"],
  files: renderPnpmTurboFoundation({ projectName: "{{projectName}}" }).filter((file) => file.owner === "workspace/pnpm-turbo")
})
```

Also add:

```ts
defineModule({
  id: "workspace/typescript",
  version: "1.0.0",
  title: "TypeScript",
  description: "Shared TypeScript compiler defaults",
  requires: ["workspace/node"],
  provides: ["typescript"],
  files: renderPnpmTurboFoundation({ projectName: "{{projectName}}" }).filter((file) => file.owner === "workspace/typescript")
})
```

If literal `{{projectName}}` is not acceptable in module file declarations, skip `files` on these modules and let `packages/core` call template renderers based on module IDs in Task 6. Do not let registry perform filesystem writes.

- [ ] **Step 7: Add registry file declaration test**

Add `packages/registry/src/module-files.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { builtinModules } from "./index.js";

describe("builtin module file declarations", () => {
  it("includes workspace foundation modules", () => {
    expect(builtinModules.map((module) => module.id)).toEqual(
      expect.arrayContaining(["workspace/pnpm-turbo", "workspace/typescript"])
    );
  });
});
```

Run:

```powershell
pnpm --filter @stackkit/registry test -- module-files
```

Expected: PASS.

Checkpoint note: templates can render the base workspace.

### Task 6: Apply Real Create Writes

**Files:**
- Modify: `packages/core/src/create-plan.test.ts`
- Create: `packages/core/src/create-apply.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/cli.test.ts`

- [ ] **Step 1: Write create apply test**

Add `packages/core/src/create-apply.test.ts`:

```ts
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { applyCreatePlan, createCreatePlan, defineModule } from "./index.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("applyCreatePlan", () => {
  it("writes the pnpm/Turborepo foundation and manifest", async () => {
    const parent = await mkdtemp(join(tmpdir(), "stackkit-create-"));
    tempDirectories.push(parent);

    const plan = createCreatePlan({
      config: {
        projectName: "acme-dashboard",
        packageManager: "pnpm",
        workspace: "pnpm-turbo",
        modules: ["workspace/pnpm-turbo", "workspace/typescript"],
        ai: { skillTargets: ["codex"] }
      },
      availableModules: [
        defineModule({
          id: "workspace/pnpm-turbo",
          version: "1.0.0",
          title: "pnpm and Turborepo",
          description: "Workspace foundation",
          provides: ["workspace/node"]
        }),
        defineModule({
          id: "workspace/typescript",
          version: "1.0.0",
          title: "TypeScript",
          description: "TypeScript config",
          requires: ["workspace/node"],
          provides: ["typescript"]
        })
      ],
      curatedSkillSourceAllowlist: []
    });

    const result = await applyCreatePlan(plan, { parentDirectory: parent });

    expect(result.projectDirectory).toBe(join(parent, "acme-dashboard"));
    await expect(readFile(join(result.projectDirectory, "package.json"), "utf8")).resolves.toContain("\"name\": \"acme-dashboard\"");
    await expect(readFile(join(result.projectDirectory, ".stackkit", "project.json"), "utf8")).resolves.toContain("\"projectName\": \"acme-dashboard\"");
  });
});
```

- [ ] **Step 2: Run failing apply test**

Run:

```powershell
pnpm --filter @stackkit/core test -- create-apply
```

Expected: FAIL because `applyCreatePlan` is not exported.

- [ ] **Step 3: Extend create plan with target and files**

In `packages/core/src/index.ts`, extend `CreatePlan`:

```ts
targetDirectoryName: string;
filePlan: FilePlan;
warnings: string[];
```

In `createCreatePlan`, build files:

```ts
const filePlan = buildFilePlan(renderCreateFiles(input.config, modules));
```

Add renderer adapter in core:

```ts
function renderCreateFiles(config: StackkitConfig, modules: readonly StackkitModule[]): FileOperation[] {
  const operations: FileOperation[] = [];
  const selected = new Set(modules.map((module) => module.id));

  if (selected.has("workspace/pnpm-turbo") || selected.has("workspace/typescript")) {
    operations.push(...renderPnpmTurboFoundation({ projectName: config.projectName }));
  }

  for (const module of modules) {
    operations.push(...(module.files ?? []).filter((file) => !operations.some((existing) => existing.path === file.path)));
  }

  return operations;
}
```

Import `renderPnpmTurboFoundation` from `@stackkit/templates` and `type FileOperation` from `@stackkit/schemas`. Add dependency to `packages/core/package.json`:

```json
"@stackkit/templates": "workspace:*"
```

Set these properties in the returned plan:

```ts
targetDirectoryName: input.config.projectName,
filePlan,
warnings: []
```

- [ ] **Step 4: Implement create apply**

Add to `packages/core/src/index.ts`:

```ts
export type ApplyCreatePlanOptions = {
  parentDirectory: string;
  targetDirectory?: string;
  stackkitVersion?: string;
  now?: () => Date;
};

export type ApplyCreatePlanResult = {
  projectDirectory: string;
  manifest: StackkitManifest;
};

export async function applyCreatePlan(plan: CreatePlan, options: ApplyCreatePlanOptions): Promise<ApplyCreatePlanResult> {
  const projectDirectory = options.targetDirectory ?? join(options.parentDirectory, plan.targetDirectoryName);
  const conflicts = await detectFileConflicts(projectDirectory, plan.filePlan, []);

  if (conflicts.length > 0) {
    throw new Error(`Create target has conflicts: ${conflicts.map((conflict) => `${conflict.path} (${conflict.reason})`).join(", ")}`);
  }

  const files = await applyFilePlan(projectDirectory, plan.filePlan);
  const manifest = await writeManifest(projectDirectory, {
    schemaVersion: 1,
    stackkitVersion: options.stackkitVersion ?? "0.0.0",
    projectName: plan.projectName,
    createdAt: (options.now ?? (() => new Date()))().toISOString(),
    modules: plan.modules.map((module) => ({ ...module, options: {} })),
    files,
    aiSkills: {
      targets: plan.aiSkills.targets,
      installed: plan.aiSkills.resolved.filter((skill) => skill.trust === "official" || skill.trust === "curated"),
      unresolved: plan.aiSkills.unresolved
    },
    migrations: { applied: [] }
  });

  return { projectDirectory, manifest };
}
```

- [ ] **Step 5: Run create apply tests**

Run:

```powershell
pnpm --filter @stackkit/core test -- create-plan create-apply
```

Expected: PASS.

- [ ] **Step 6: Add CLI write behavior**

In `packages/cli/src/index.ts`, change create options:

```ts
.option("-c, --config <path>", "Path to a Stackkit config file")
.option("--dry-run", "Print the create plan without writing files")
.option("--dir <path>", "Project target directory")
```

Change action:

```ts
.action(async (options: { config?: string; dryRun?: boolean; dir?: string }) => {
  const plan = await createDryRunPlanFromConfig(options.config);

  if (options.dryRun === true) {
    writeProgramOutput(program, formatCreateDryRunPlan(plan));
    return;
  }

  const parentDirectory = process.cwd();
  const result = await applyCreatePlan(plan, {
    parentDirectory,
    targetDirectory: options.dir ? resolve(options.dir) : undefined
  });

  writeProgramOutput(program, `Created Stackkit project at ${result.projectDirectory}\n`);
});
```

This is the final create behavior: missing `--dry-run` writes the project. Dry-run is opt-in and must not touch disk.

- [ ] **Step 7: Update CLI tests**

Add one CLI test that calls `create --config <path> --dry-run` and expects the plan output without creating the project directory. Add a second CLI test that calls `create --config <path> --dir <target>` without `--dry-run` and asserts that `<target>/package.json` and `<target>/.stackkit/project.json` exist.

Use this test body for the write case:

```ts
it("writes a project by default for create --config", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stackkit-cli-create-"));
  const configPath = join(directory, "stackkit.config.json");
  const targetDirectory = join(directory, "generated");

  await writeFile(
    configPath,
    JSON.stringify(
      {
        projectName: "generated",
        modules: ["workspace/pnpm-turbo", "workspace/typescript"],
        ai: { skillTargets: ["codex"] }
      },
      null,
      2
    ),
    "utf8"
  );

  let output = "";
  const program = createStackkitProgram();
  program.configureOutput({ writeOut: (value) => (output += value) });

  await program.parseAsync(["create", "--config", configPath, "--dir", targetDirectory], { from: "user" });

  expect(output).toContain(`Created Stackkit project at ${targetDirectory}`);
  await expect(readFile(join(targetDirectory, "package.json"), "utf8")).resolves.toContain("\"name\": \"generated\"");
  await expect(readFile(join(targetDirectory, ".stackkit", "project.json"), "utf8")).resolves.toContain("\"projectName\": \"generated\"");
});
```

Run:

```powershell
pnpm --filter @stackkit/cli test
```

Expected: PASS.

Checkpoint note: create can produce real foundation files through core.

---

## Milestone 6: Manifest, Skills Lock, And Local Guidance

### Task 7: Write `skills-lock.json` And Local AI Guidance

**Files:**
- Create: `packages/core/src/skills-lock.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/schemas/src/index.ts`

- [ ] **Step 1: Write skills lock tests**

Add `packages/core/src/skills-lock.test.ts`:

```ts
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { writeLocalAiGuidance, writeSkillsLock } from "./index.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("skills lock and local guidance", () => {
  it("writes skills-lock.json", async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), "stackkit-skills-"));
    tempDirectories.push(projectDirectory);

    await writeSkillsLock(projectDirectory, {
      schemaVersion: 1,
      targets: [{ agent: "codex", directory: ".agents", enabled: true }],
      installed: [],
      local: [],
      unresolved: []
    });

    const lock = JSON.parse(await readFile(join(projectDirectory, "skills-lock.json"), "utf8"));
    expect(lock.schemaVersion).toBe(1);
    expect(lock.targets).toEqual([{ agent: "codex", directory: ".agents", enabled: true }]);
  });

  it("writes local guidance into selected project skill directories", async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), "stackkit-local-guidance-"));
    tempDirectories.push(projectDirectory);

    await writeLocalAiGuidance(projectDirectory, {
      targets: [{ agent: "codex", directory: ".agents", enabled: true }],
      local: [
        {
          skills: ["stackkit-kubernetes-guidance"],
          trust: "local",
          causedBy: "deploy/kubernetes",
          reason: "No accepted Kubernetes skill source is configured"
        }
      ]
    });

    await expect(
      readFile(join(projectDirectory, ".agents", "skills", "stackkit-kubernetes-guidance", "SKILL.md"), "utf8")
    ).resolves.toContain("deploy/kubernetes");
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
pnpm --filter @stackkit/core test -- skills-lock
```

Expected: FAIL because skills lock APIs do not exist.

- [ ] **Step 3: Implement skills lock and guidance writers**

In `packages/core/src/index.ts`, add:

```ts
export async function writeSkillsLock(projectDirectory: string, lock: SkillsLock): Promise<SkillsLock> {
  const parsed = skillsLockSchema.parse(lock);
  await writeFile(join(projectDirectory, "skills-lock.json"), `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  return parsed;
}

export type WriteLocalAiGuidanceInput = {
  targets: readonly AiSkillTarget[];
  local: readonly AiSkillDependency[];
};

export async function writeLocalAiGuidance(projectDirectory: string, input: WriteLocalAiGuidanceInput): Promise<void> {
  for (const skill of input.local) {
    for (const target of input.targets) {
      if (!target.enabled) {
        continue;
      }

      const skillDirectory = join(projectDirectory, target.directory, "skills", skill.skills[0]);
      await mkdir(skillDirectory, { recursive: true });
      await writeFile(
        join(skillDirectory, "SKILL.md"),
        [
          "---",
          `name: ${skill.skills[0]}`,
          `description: Stackkit-generated guidance for ${skill.causedBy}`,
          "---",
          "",
          `# ${skill.skills[0]}`,
          "",
          `Use this guidance when working on Stackkit module \`${skill.causedBy}\`.`,
          "",
          skill.reason,
          ""
        ].join("\n"),
        "utf8"
      );
    }
  }
}
```

Import `skillsLockSchema` and `type SkillsLock` from `@stackkit/schemas`.

Update `applyCreatePlan` to call:

```ts
await writeSkillsLock(projectDirectory, {
  schemaVersion: 1,
  targets: plan.aiSkills.targets,
  installed: plan.aiSkills.resolved.filter((skill) => skill.trust === "official" || skill.trust === "curated"),
  local: plan.aiSkills.local,
  unresolved: plan.aiSkills.unresolved
});
await writeLocalAiGuidance(projectDirectory, {
  targets: plan.aiSkills.targets,
  local: plan.aiSkills.local
});
```

- [ ] **Step 4: Run tests**

Run:

```powershell
pnpm --filter @stackkit/core test -- skills-lock create-apply
```

Expected: PASS.

Checkpoint note: create records skills and writes local fallback guidance.

### Task 8: Execute AI Skill Installs With Failure Recording

**Files:**
- Create: `packages/core/src/skill-installer.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write installer tests**

Add `packages/core/src/skill-installer.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { installAiSkills, planAiSkillInstallCommands, resolveAiSkillTargets, type AiSkillDependency } from "./index.js";

const skill: AiSkillDependency = {
  source: "https://github.com/vercel-labs/agent-skills",
  skills: ["vercel-react-best-practices"],
  trust: "official",
  causedBy: "web/nextjs",
  reason: "React and Next.js app code"
};

describe("installAiSkills", () => {
  it("runs planned install commands", async () => {
    const commands = planAiSkillInstallCommands([skill], resolveAiSkillTargets(["codex"]));
    const seen: string[][] = [];

    const result = await installAiSkills(commands, {
      runCommand: async (command, args) => {
        seen.push([command, ...args]);
        return { exitCode: 0, stdout: "ok", stderr: "" };
      }
    });

    expect(seen).toEqual([
      [
        "npx",
        "-y",
        "skills",
        "add",
        "https://github.com/vercel-labs/agent-skills",
        "--skill",
        "vercel-react-best-practices",
        "--agent",
        "codex",
        "-y",
        "--copy"
      ]
    ]);
    expect(result.installed).toEqual([skill]);
    expect(result.unresolved).toEqual([]);
  });

  it("records failed installs as unresolved and continues", async () => {
    const commands = planAiSkillInstallCommands([skill], resolveAiSkillTargets(["codex"]));

    const result = await installAiSkills(commands, {
      runCommand: async () => ({ exitCode: 1, stdout: "", stderr: "network failed" })
    });

    expect(result.installed).toEqual([]);
    expect(result.unresolved).toEqual([
      expect.objectContaining({
        source: "https://github.com/vercel-labs/agent-skills",
        skills: ["vercel-react-best-practices"],
        trust: "unresolved",
        causedBy: "web/nextjs",
        reason: "Skill install failed: network failed"
      })
    ]);
  });
});
```

- [ ] **Step 2: Run failing installer tests**

Run:

```powershell
pnpm --filter @stackkit/core test -- skill-installer
```

Expected: FAIL because `installAiSkills` is missing.

- [ ] **Step 3: Implement installer**

In `packages/core/src/index.ts`, add:

```ts
export type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type RunCommand = (command: string, args: readonly string[], options: { cwd?: string }) => Promise<CommandResult>;

export type InstallAiSkillsOptions = {
  cwd?: string;
  runCommand: RunCommand;
};

export type InstallAiSkillsResult = {
  installed: AiSkillDependency[];
  unresolved: AiSkillDependency[];
};

export async function installAiSkills(
  commands: readonly AiSkillInstallCommand[],
  options: InstallAiSkillsOptions
): Promise<InstallAiSkillsResult> {
  const installed: AiSkillDependency[] = [];
  const unresolved: AiSkillDependency[] = [];

  for (const installCommand of commands) {
    const result = await options.runCommand(installCommand.command, installCommand.args, { cwd: options.cwd });

    if (result.exitCode === 0) {
      installed.push(installCommand.skill);
      continue;
    }

    unresolved.push({
      ...installCommand.skill,
      trust: "unresolved",
      reason: `Skill install failed: ${result.stderr || result.stdout || `exit code ${result.exitCode}`}`
    });
  }

  return { installed, unresolved };
}
```

- [ ] **Step 4: Run installer tests**

Run:

```powershell
pnpm --filter @stackkit/core test -- skill-installer
```

Expected: PASS.

Checkpoint note: skill installation can be executed with injectable command runner and failure recording.

- [ ] **Step 5: Wire skill installation into create**

Extend `ApplyCreatePlanOptions` in `packages/core/src/index.ts`:

```ts
installSkills?: boolean;
runCommand?: RunCommand;
```

Update `applyCreatePlan` so official and curated skill installs run during create unless `installSkills` is `false`. Use the injected command runner so tests do not invoke the real network or `npx`.

Add this block before writing the manifest and lock files:

```ts
const skillInstallResult =
  options.installSkills === false || plan.skillInstallCommands.length === 0
    ? {
        installed: plan.aiSkills.resolved.filter((skill) => skill.trust === "official" || skill.trust === "curated"),
        unresolved: plan.aiSkills.unresolved
      }
    : await installAiSkills(plan.skillInstallCommands, {
        cwd: projectDirectory,
        runCommand:
          options.runCommand ??
          (async () => ({
            exitCode: 1,
            stdout: "",
            stderr: "No command runner configured for AI skill installation"
          }))
      });
```

Use `skillInstallResult.installed` and `skillInstallResult.unresolved` when writing `.stackkit/project.json` and `skills-lock.json`:

```ts
aiSkills: {
  targets: plan.aiSkills.targets,
  installed: skillInstallResult.installed,
  unresolved: skillInstallResult.unresolved
}
```

```ts
await writeSkillsLock(projectDirectory, {
  schemaVersion: 1,
  targets: plan.aiSkills.targets,
  installed: skillInstallResult.installed,
  local: plan.aiSkills.local,
  unresolved: skillInstallResult.unresolved
});
```

Add this test to `packages/core/src/create-apply.test.ts`:

```ts
it("records failed AI skill installs as unresolved during create", async () => {
  const parent = await mkdtemp(join(tmpdir(), "stackkit-create-skills-"));
  tempDirectories.push(parent);

  const plan = createCreatePlan({
    config: {
      projectName: "skill-failure",
      packageManager: "pnpm",
      workspace: "pnpm-turbo",
      modules: ["web/nextjs"],
      ai: { skillTargets: ["codex"] }
    },
    availableModules: [
      defineModule({
        id: "web/nextjs",
        version: "1.0.0",
        title: "Next.js",
        description: "Next.js web app",
        aiSkills: [
          {
            source: "https://github.com/vercel-labs/agent-skills",
            skills: ["vercel-react-best-practices"],
            trust: "official",
            causedBy: "web/nextjs",
            reason: "React and Next.js app code"
          }
        ]
      })
    ],
    curatedSkillSourceAllowlist: []
  });

  const result = await applyCreatePlan(plan, {
    parentDirectory: parent,
    runCommand: async () => ({ exitCode: 1, stdout: "", stderr: "network failed" })
  });

  const manifest = JSON.parse(await readFile(join(result.projectDirectory, ".stackkit", "project.json"), "utf8"));
  expect(manifest.aiSkills.unresolved).toEqual([
    expect.objectContaining({
      trust: "unresolved",
      reason: "Skill install failed: network failed"
    })
  ]);
});
```

Run:

```powershell
pnpm --filter @stackkit/core test -- skill-installer create-apply
```

Expected: PASS.

Update the `create` action in `packages/cli/src/index.ts` so applied create passes the local command runner:

```ts
const result = await applyCreatePlan(plan, {
  parentDirectory,
  targetDirectory: options.dir ? resolve(options.dir) : undefined,
  runCommand: runLocalCommand
});
```

Add `runLocalCommand` in `packages/cli/src/index.ts` in this task:

```ts
async function runLocalCommand(command: string, args: readonly string[], options: { cwd?: string }) {
  const { spawn } = await import("node:child_process");

  return await new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolvePromise) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      shell: process.platform === "win32"
    });
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (code) => {
      resolvePromise({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}
```

Run:

```powershell
pnpm --filter @stackkit/cli test
```

Expected: PASS.

### Task 8A: Apply Package Changes, Env Examples, And Hooks During Create

**Files:**
- Create: `packages/core/src/create-execution.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Write create execution tests**

Add `packages/core/src/create-execution.test.ts`:

```ts
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { applyPackageChanges, applyEnvExamples, runLifecycleHooks, type PackageChange, type EnvVarDefinition } from "./index.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("create execution helpers", () => {
  it("merges package changes into package.json", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stackkit-package-change-"));
    tempDirectories.push(directory);

    const changes: PackageChange[] = [
      {
        packagePath: "package.json",
        scripts: { dev: "turbo run dev" },
        dependencies: { next: "^15.0.0" },
        devDependencies: { typescript: "^5.9.3" },
        peerDependencies: {},
        optionalDependencies: {}
      }
    ];

    await applyPackageChanges(directory, changes);

    const pkg = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
    expect(pkg.scripts.dev).toBe("turbo run dev");
    expect(pkg.dependencies.next).toBe("^15.0.0");
  });

  it("writes .env.example entries from env var declarations", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stackkit-env-"));
    tempDirectories.push(directory);

    const envVars: EnvVarDefinition[] = [
      {
        name: "DATABASE_URL",
        description: "Postgres connection string",
        required: true,
        example: "postgres://postgres:postgres@localhost:5432/app"
      }
    ];

    await applyEnvExamples(directory, envVars);

    await expect(readFile(join(directory, ".env.example"), "utf8")).resolves.toContain("DATABASE_URL=postgres://postgres:postgres@localhost:5432/app");
  });

  it("runs lifecycle hooks with the injected command runner", async () => {
    const seen: string[][] = [];

    await runLifecycleHooks(
      [{ name: "format", command: "pnpm", args: ["format"], cwd: "apps/web" }],
      {
        projectDirectory: "C:/tmp/project",
        runCommand: async (command, args, options) => {
          seen.push([options.cwd ?? "", command, ...args]);
          return { exitCode: 0, stdout: "", stderr: "" };
        }
      }
    );

    expect(seen).toEqual([["C:/tmp/project/apps/web", "pnpm", "format"]]);
  });
});
```

- [ ] **Step 2: Run failing tests**

Run:

```powershell
pnpm --filter @stackkit/core test -- create-execution
```

Expected: FAIL because execution helpers are missing.

- [ ] **Step 3: Implement package/env/hook helpers**

In `packages/core/src/index.ts`, export `PackageChange`, `EnvVarDefinition`, `TaskDefinition`, and `LifecycleHook` from `@stackkit/schemas`.

Add:

```ts
export async function planPackageChangeFiles(projectDirectory: string, changes: readonly PackageChange[]): Promise<FileOperation[]> {
  const operations: FileOperation[] = [];

  for (const change of changes) {
    const packagePath = join(projectDirectory, change.packagePath);
    const existing = await readExistingFile(packagePath);
    const pkg = existing ? JSON.parse(existing) : {};
    const nextPackage = {
      ...pkg,
      scripts: { ...(pkg.scripts ?? {}), ...change.scripts },
      dependencies: { ...(pkg.dependencies ?? {}), ...change.dependencies },
      devDependencies: { ...(pkg.devDependencies ?? {}), ...change.devDependencies },
      peerDependencies: { ...(pkg.peerDependencies ?? {}), ...change.peerDependencies },
      optionalDependencies: { ...(pkg.optionalDependencies ?? {}), ...change.optionalDependencies }
    };

    operations.push({
      kind: "write",
      path: normalizeProjectPath(change.packagePath),
      owner: "workspace/pnpm-turbo",
      content: `${JSON.stringify(nextPackage, null, 2)}\n`,
      overwrite: "if-owned"
    });
  }

  return operations;
}

export async function applyPackageChanges(projectDirectory: string, changes: readonly PackageChange[]): Promise<ManifestFileRecord[]> {
  return await applyFilePlan(projectDirectory, buildFilePlan(await planPackageChangeFiles(projectDirectory, changes)));
}

export async function planEnvExampleFiles(projectDirectory: string, envVars: readonly EnvVarDefinition[]): Promise<FileOperation[]> {
  if (envVars.length === 0) {
    return [];
  }

  const existing = await readExistingFile(join(projectDirectory, ".env.example"));
  const existingContent = existing ?? "";
  const additions = envVars.flatMap((envVar) => [`# ${envVar.description}`, `${envVar.name}=${envVar.example ?? ""}`, ""]).join("\n");

  return [
    {
      kind: "write",
      path: ".env.example",
      owner: "docs/env",
      content: `${existingContent}${existingContent.endsWith("\n") || existingContent.length === 0 ? "" : "\n"}${additions}`,
      overwrite: "if-owned"
    }
  ];
}

export async function applyEnvExamples(projectDirectory: string, envVars: readonly EnvVarDefinition[]): Promise<ManifestFileRecord[]> {
  return await applyFilePlan(projectDirectory, buildFilePlan(await planEnvExampleFiles(projectDirectory, envVars)));
}

export async function runLifecycleHooks(
  hooks: readonly LifecycleHook[],
  options: { projectDirectory: string; runCommand: RunCommand }
): Promise<void> {
  for (const hook of hooks) {
    const result = await options.runCommand(hook.command, hook.args, {
      cwd: hook.cwd ? join(options.projectDirectory, hook.cwd) : options.projectDirectory
    });

    if (result.exitCode !== 0) {
      throw new Error(`Lifecycle hook failed (${hook.name}): ${result.stderr || result.stdout || result.exitCode}`);
    }
  }
}
```

- [ ] **Step 4: Wire helpers into create**

Update `applyCreatePlan` to collect module declarations from the plan. If `CreatePlan` currently only stores module IDs and versions, add `selectedModules: StackkitModule[]` as an internal plan field.

Before writing files, include package and env operations in the same staged file plan:

```ts
const packageOperations = await planPackageChangeFiles(
  projectDirectory,
  plan.selectedModules.flatMap((module) => module.packageChanges ?? [])
);
const envOperations = await planEnvExampleFiles(
  projectDirectory,
  plan.selectedModules.flatMap((module) => module.envVars ?? [])
);
const fullFilePlan = buildFilePlan([...plan.filePlan.files.map((file) => ({
  kind: "write" as const,
  path: file.path,
  owner: file.owner,
  content: file.content,
  overwrite: file.overwrite
})), ...packageOperations, ...envOperations]);
const conflicts = await detectFileConflicts(projectDirectory, fullFilePlan, []);

if (conflicts.length > 0) {
  throw new Error(`Create target has conflicts: ${conflicts.map((conflict) => `${conflict.path} (${conflict.reason})`).join(", ")}`);
}
const files = await applyFilePlan(projectDirectory, fullFilePlan);

if (options.runCommand) {
  await runLifecycleHooks(
    plan.selectedModules.flatMap((module) => module.postCreate ?? []),
    { projectDirectory, runCommand: options.runCommand }
  );
}
```

Use the `files` returned from `fullFilePlan` when writing the manifest. Do not call `applyPackageChanges` or `applyEnvExamples` separately inside `applyCreatePlan`, because that would bypass conflict detection.

- [ ] **Step 5: Run create execution and create apply tests**

Run:

```powershell
pnpm --filter @stackkit/core test -- create-execution create-apply
```

Expected: PASS.

---

## Milestone 7: Module Output Expansion

### Task 9: Add Web, UI, API, Database, Auth, Deploy, Docs, And Quality Templates

**Files:**
- Create: `packages/templates/src/web-nextjs.test.ts`
- Create: `packages/templates/src/api-fastapi.test.ts`
- Create: `packages/templates/src/deploy.test.ts`
- Modify: `packages/templates/src/index.ts`
- Modify: `packages/registry/src/index.ts`
- Modify: `packages/registry/src/module-files.test.ts`

- [ ] **Step 1: Write representative template tests**

Add `packages/templates/src/web-nextjs.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { renderNextjsApp, renderShadcnUi } from "./index.js";

describe("web templates", () => {
  it("renders a Next.js app package and App Router files", () => {
    const files = renderNextjsApp({ appName: "web" });

    expect(files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "apps/web/package.json", owner: "web/nextjs" }),
        expect.objectContaining({ path: "apps/web/app/page.tsx", content: expect.stringContaining("export default function Page") }),
        expect.objectContaining({ path: "apps/web/next.config.ts", owner: "web/nextjs" })
      ])
    );
  });

  it("renders ShadCN and Tailwind support files", () => {
    const files = renderShadcnUi({ appName: "web" });

    expect(files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "apps/web/components.json", owner: "ui/shadcn" }),
        expect.objectContaining({ path: "apps/web/app/globals.css", content: expect.stringContaining("@import \"tailwindcss\"") })
      ])
    );
  });
});
```

Add `packages/templates/src/api-fastapi.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { renderFastApiService } from "./index.js";

describe("api templates", () => {
  it("renders a FastAPI service", () => {
    const files = renderFastApiService({ serviceName: "api" });

    expect(files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "apps/api/pyproject.toml", owner: "api/fastapi" }),
        expect.objectContaining({ path: "apps/api/app/main.py", content: expect.stringContaining("FastAPI") }),
        expect.objectContaining({ path: "apps/api/tests/test_health.py", owner: "quality/pytest" })
      ])
    );
  });
});
```

Add `packages/templates/src/deploy.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { renderDockerFiles, renderKubernetesFiles, renderVercelFiles } from "./index.js";

describe("deploy templates", () => {
  it("renders Vercel, Docker, and Kubernetes files", () => {
    expect(renderVercelFiles()).toEqual([
      expect.objectContaining({ path: "vercel.json", owner: "deploy/vercel" })
    ]);

    expect(renderDockerFiles()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "docker-compose.yml", owner: "deploy/docker" }),
        expect.objectContaining({ path: "apps/web/Dockerfile", owner: "deploy/docker" })
      ])
    );

    expect(renderKubernetesFiles()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "deploy/kubernetes/web-deployment.yaml", owner: "deploy/kubernetes" })
      ])
    );
  });
});
```

- [ ] **Step 2: Run failing template tests**

Run:

```powershell
pnpm --filter @stackkit/templates test -- web-nextjs api-fastapi deploy
```

Expected: FAIL because renderers are missing.

- [ ] **Step 3: Implement template renderers**

In `packages/templates/src/index.ts`, add these functions. Keep them explicit strings, with no remote template fetches.

```ts
export function renderNextjsApp(input: { appName: string }): FileOperation[] {
  const root = `apps/${input.appName}`;

  return [
    {
      kind: "write",
      path: `${root}/package.json`,
      owner: "web/nextjs",
      overwrite: "if-owned",
      content: `${JSON.stringify(
        {
          name: `@acme/${input.appName}`,
          private: true,
          type: "module",
          scripts: {
            dev: "next dev",
            build: "next build",
            start: "next start",
            typecheck: "tsc --noEmit"
          },
          dependencies: {
            next: "^15.0.0",
            react: "^19.0.0",
            "react-dom": "^19.0.0"
          },
          devDependencies: {
            "@types/react": "^19.0.0",
            "@types/react-dom": "^19.0.0",
            typescript: "^5.9.3"
          }
        },
        null,
        2
      )}\n`
    },
    {
      kind: "write",
      path: `${root}/app/page.tsx`,
      owner: "web/nextjs",
      overwrite: "if-owned",
      content: "export default function Page() {\n  return <main>Stackkit app</main>;\n}\n"
    },
    {
      kind: "write",
      path: `${root}/next.config.ts`,
      owner: "web/nextjs",
      overwrite: "if-owned",
      content: "import type { NextConfig } from \"next\";\n\nconst nextConfig: NextConfig = {};\n\nexport default nextConfig;\n"
    },
    {
      kind: "write",
      path: `${root}/tsconfig.json`,
      owner: "web/nextjs",
      overwrite: "if-owned",
      content: `${JSON.stringify(
        {
          extends: "../../tsconfig.base.json",
          compilerOptions: {
            jsx: "preserve",
            noEmit: true,
            plugins: [{ name: "next" }]
          },
          include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"]
        },
        null,
        2
      )}\n`
    }
  ];
}

export function renderShadcnUi(input: { appName: string }): FileOperation[] {
  const root = `apps/${input.appName}`;

  return [
    {
      kind: "write",
      path: `${root}/components.json`,
      owner: "ui/shadcn",
      overwrite: "if-owned",
      content: `${JSON.stringify(
        {
          style: "new-york",
          rsc: true,
          tsx: true,
          tailwind: {
            css: "app/globals.css",
            baseColor: "neutral",
            cssVariables: true
          },
          aliases: {
            components: "@/components",
            utils: "@/lib/utils"
          }
        },
        null,
        2
      )}\n`
    },
    {
      kind: "write",
      path: `${root}/app/globals.css`,
      owner: "ui/shadcn",
      overwrite: "if-owned",
      content: "@import \"tailwindcss\";\n\n:root {\n  color-scheme: light;\n}\n"
    }
  ];
}

export function renderFastApiService(input: { serviceName: string }): FileOperation[] {
  const root = `apps/${input.serviceName}`;

  return [
    {
      kind: "write",
      path: `${root}/pyproject.toml`,
      owner: "api/fastapi",
      overwrite: "if-owned",
      content: [
        "[project]",
        `name = "${input.serviceName}"`,
        "version = \"0.0.0\"",
        "requires-python = \">=3.12\"",
        "dependencies = [\"fastapi\", \"uvicorn[standard]\"]",
        "",
        "[tool.pytest.ini_options]",
        "pythonpath = [\".\"]",
        ""
      ].join("\n")
    },
    {
      kind: "write",
      path: `${root}/app/main.py`,
      owner: "api/fastapi",
      overwrite: "if-owned",
      content: "from fastapi import FastAPI\n\napp = FastAPI()\n\n@app.get(\"/health\")\ndef health() -> dict[str, str]:\n    return {\"status\": \"ok\"}\n"
    },
    {
      kind: "write",
      path: `${root}/tests/test_health.py`,
      owner: "quality/pytest",
      overwrite: "if-owned",
      content: "from fastapi.testclient import TestClient\n\nfrom app.main import app\n\n\ndef test_health() -> None:\n    client = TestClient(app)\n    assert client.get(\"/health\").json() == {\"status\": \"ok\"}\n"
    }
  ];
}

export function renderVercelFiles(): FileOperation[] {
  return [
    {
      kind: "write",
      path: "vercel.json",
      owner: "deploy/vercel",
      overwrite: "if-owned",
      content: `${JSON.stringify({ version: 2 }, null, 2)}\n`
    }
  ];
}

export function renderDockerFiles(): FileOperation[] {
  return [
    {
      kind: "write",
      path: "docker-compose.yml",
      owner: "deploy/docker",
      overwrite: "if-owned",
      content: "services:\n  web:\n    build: ./apps/web\n    ports:\n      - \"3000:3000\"\n"
    },
    {
      kind: "write",
      path: "apps/web/Dockerfile",
      owner: "deploy/docker",
      overwrite: "if-owned",
      content: "FROM node:22-alpine\nWORKDIR /app\nCOPY . .\nRUN corepack enable && pnpm install --frozen-lockfile\nRUN pnpm build\nCMD [\"pnpm\", \"start\"]\n"
    }
  ];
}

export function renderKubernetesFiles(): FileOperation[] {
  return [
    {
      kind: "write",
      path: "deploy/kubernetes/web-deployment.yaml",
      owner: "deploy/kubernetes",
      overwrite: "if-owned",
      content: "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\nspec:\n  replicas: 2\n  selector:\n    matchLabels:\n      app: web\n  template:\n    metadata:\n      labels:\n        app: web\n    spec:\n      containers:\n        - name: web\n          image: web:latest\n          ports:\n            - containerPort: 3000\n"
    }
  ];
}
```

- [ ] **Step 4: Wire renderers in core**

Extend `renderCreateFiles` in `packages/core/src/index.ts`:

```ts
if (selected.has("web/nextjs")) {
  operations.push(...renderNextjsApp({ appName: "web" }));
}

if (selected.has("ui/shadcn")) {
  operations.push(...renderShadcnUi({ appName: "web" }));
}

if (selected.has("api/fastapi")) {
  operations.push(...renderFastApiService({ serviceName: "api" }));
}

if (selected.has("deploy/vercel")) {
  operations.push(...renderVercelFiles());
}

if (selected.has("deploy/docker")) {
  operations.push(...renderDockerFiles());
}

if (selected.has("deploy/kubernetes")) {
  operations.push(...renderKubernetesFiles());
}
```

- [ ] **Step 5: Run template and core create tests**

Run:

```powershell
pnpm --filter @stackkit/templates test
pnpm --filter @stackkit/core test -- create-plan create-apply
```

Expected: PASS.

Checkpoint note: representative modules produce concrete files.

### Task 10: Fill Out Remaining Registry Modules

**Files:**
- Modify: `packages/registry/src/index.ts`
- Modify: `packages/registry/src/ai-skill-registry.test.ts`
- Modify: `packages/registry/src/module-files.test.ts`

- [ ] **Step 1: Expand registry tests**

In `packages/registry/src/module-files.test.ts`, add:

```ts
it("contains the full long-term built-in module set", () => {
  expect(builtinModules.map((module) => module.id)).toEqual(
    expect.arrayContaining([
      "workspace/pnpm-turbo",
      "workspace/typescript",
      "workspace/github-actions",
      "workspace/docker-compose",
      "web/nextjs",
      "ui/shadcn",
      "ui/tailwind",
      "api/fastapi",
      "api/flask",
      "api/litestar",
      "web/django",
      "rust/axum",
      "rust/actix",
      "rust/rocket",
      "rust/tokio",
      "rust/sqlx",
      "rust/diesel",
      "desktop/tauri",
      "db/postgres",
      "db/drizzle",
      "db/prisma",
      "db/sqlalchemy",
      "db/sqlx",
      "db/diesel",
      "auth/clerk",
      "auth/auth0-nextjs",
      "auth/auth0-fastapi",
      "auth/auth0-flask",
      "auth/better-auth",
      "auth/none",
      "deploy/vercel",
      "deploy/docker",
      "deploy/kubernetes",
      "docs/readme",
      "docs/architecture",
      "docs/env",
      "docs/local-dev",
      "ai/skills",
      "quality/eslint",
      "quality/prettier",
      "quality/ruff",
      "quality/pytest",
      "quality/cargo",
      "quality/vitest"
    ])
  );
});
```

- [ ] **Step 2: Run failing registry tests**

Run:

```powershell
pnpm --filter @stackkit/registry test -- module-files
```

Expected: FAIL until all module declarations exist.

- [ ] **Step 3: Add declarative module entries**

In `packages/registry/src/index.ts`, add module entries for every expected ID. Use real capability boundaries. Examples:

```ts
defineModule({
  id: "quality/eslint",
  version: "1.0.0",
  title: "ESLint",
  description: "TypeScript and React linting",
  requires: ["workspace/node"],
  provides: ["lint"]
})
```

```ts
defineModule({
  id: "db/drizzle",
  version: "1.0.0",
  title: "Drizzle",
  description: "TypeScript database access with Drizzle",
  requires: ["typescript", "postgres"],
  provides: ["typescript-db"]
})
```

```ts
defineModule({
  id: "rust/axum",
  version: "1.0.0",
  title: "Axum",
  description: "Rust HTTP API service",
  requires: ["rust-async"],
  provides: ["api", "rust-web"]
})
```

For modules without verified skills, add local AI guidance dependency:

```ts
aiSkills: [
  {
    skills: ["stackkit-docker-guidance"],
    trust: "local",
    causedBy: "deploy/docker",
    reason: "No accepted official or curated Docker skill source is configured"
  }
]
```

- [ ] **Step 4: Run registry tests**

Run:

```powershell
pnpm --filter @stackkit/registry test
```

Expected: PASS.

Checkpoint note: registry contains the full target module surface, even when some modules initially generate only docs or local guidance.

---

## Milestone 8: Config Validation, Preset Commands, And CLI Output

### Task 11: Implement Config Validate And Preset Commands

**Files:**
- Modify: `packages/cli/src/cli.test.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write CLI tests**

In `packages/cli/src/cli.test.ts`, add:

```ts
it("validates a Stackkit config file", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stackkit-config-"));
  const configPath = join(directory, "stackkit.config.json");
  await writeFile(configPath, JSON.stringify({ projectName: "acme", modules: ["workspace/pnpm-turbo", "web/nextjs"] }), "utf8");

  let output = "";
  const program = createStackkitProgram();
  program.configureOutput({ writeOut: (value) => (output += value) });

  await program.parseAsync(["config", "validate", configPath], { from: "user" });

  expect(output).toContain("Config is valid");
});

it("lists and inspects presets", async () => {
  let output = "";
  const program = createStackkitProgram();
  program.configureOutput({ writeOut: (value) => (output += value) });

  await program.parseAsync(["preset", "list"], { from: "user" });
  expect(output).toContain("next-only");

  output = "";
  await program.parseAsync(["preset", "inspect", "next-only"], { from: "user" });
  expect(output).toContain("workspace/pnpm-turbo");
});
```

- [ ] **Step 2: Run failing CLI tests**

Run:

```powershell
pnpm --filter @stackkit/cli test -- cli
```

Expected: FAIL because subcommands have descriptions but no actions.

- [ ] **Step 3: Add core config validation helper**

In `packages/core/src/index.ts`, add:

```ts
export type ValidateConfigResult = {
  ok: boolean;
  errors: string[];
};

export function validateStackkitConfig(
  config: StackkitConfig,
  availableModules: readonly StackkitModule[],
  availablePresets: readonly StackkitPreset[] = []
): ValidateConfigResult {
  const errors: string[] = [];
  const moduleById = new Set(availableModules.map((module) => module.id));
  const presetById = new Set(availablePresets.map((preset) => preset.id));

  for (const moduleId of config.modules) {
    if (!moduleById.has(moduleId)) {
      errors.push(`Unknown Stackkit module: ${moduleId}`);
    }
  }

  if (config.preset && !presetById.has(config.preset)) {
    errors.push(`Unknown Stackkit preset: ${config.preset}`);
  }

  if (errors.length === 0) {
    try {
      const modules = availableModules.filter((module) => config.modules.includes(module.id));
      resolveModuleGraph(modules, {
        presets: availablePresets,
        selectedPresets: config.preset ? [config.preset] : [],
        availableModules
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  return {
    ok: errors.length === 0,
    errors
  };
}
```

- [ ] **Step 4: Implement CLI actions**

In `packages/cli/src/index.ts`, import `builtinPresets` and `validateStackkitConfig`.

Set actions:

```ts
preset.command("list").description("List available presets").action(() => {
  writeProgramOutput(program, `${builtinPresets.map((item) => `${item.id}\t${item.title}`).join("\n")}\n`);
});

preset.command("inspect <preset>").description("Show the modules included in a preset").action((presetId: string) => {
  const selected = builtinPresets.find((item) => item.id === presetId);

  if (!selected) {
    throw new Error(`Unknown Stackkit preset: ${presetId}`);
  }

  writeProgramOutput(program, `${selected.title}\n${selected.description}\nModules:\n${selected.modules.map((moduleId) => `- ${moduleId}`).join("\n")}\n`);
});

config.command("validate [path]").description("Validate a Stackkit config file").action(async (path = "stackkit.config.json") => {
  const parsed = stackkitConfigSchema.parse(JSON.parse(await readFile(path, "utf8")));
  const result = validateStackkitConfig(parsed, builtinModules, builtinPresets);

  if (!result.ok) {
    throw new Error(result.errors.join("\n"));
  }

  writeProgramOutput(program, `Config is valid: ${path}\n`);
});
```

- [ ] **Step 5: Run CLI tests**

Run:

```powershell
pnpm --filter @stackkit/cli test
```

Expected: PASS.

Checkpoint note: read-only CLI commands now work.

---

## Milestone 9: Interactive Create

### Task 12: Add Interactive Prompt Mapping

**Files:**
- Modify: `packages/cli/package.json`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/cli.test.ts`

- [ ] **Step 1: Write prompt mapping tests**

In `packages/cli/src/cli.test.ts`, add:

```ts
import { buildConfigFromInteractiveAnswers } from "./index.js";

it("maps interactive answers to Stackkit config", () => {
  expect(
    buildConfigFromInteractiveAnswers({
      projectName: "acme-dashboard",
      preset: "next-fastapi-postgres-auth0",
      aiTargets: ["codex", "claude-code"]
    })
  ).toEqual({
    projectName: "acme-dashboard",
    packageManager: "pnpm",
    workspace: "pnpm-turbo",
    preset: "next-fastapi-postgres-auth0",
    modules: [],
    ai: { skillTargets: ["codex", "claude-code"] }
  });
});
```

- [ ] **Step 2: Run failing CLI test**

Run:

```powershell
pnpm --filter @stackkit/cli test -- cli
```

Expected: FAIL because `buildConfigFromInteractiveAnswers` is missing.

- [ ] **Step 3: Add `@clack/prompts` dependency**

In `packages/cli/package.json`, add:

```json
"dependencies": {
  "@clack/prompts": "^1.5.0"
}
```

Run:

```powershell
pnpm install --lockfile-only
```

Expected: lockfile updates.

- [ ] **Step 4: Implement answer mapping and prompt wrapper**

In `packages/cli/src/index.ts`, add:

```ts
export type InteractiveAnswers = {
  projectName: string;
  preset: string;
  aiTargets: ("codex" | "claude-code")[];
};

export function buildConfigFromInteractiveAnswers(answers: InteractiveAnswers): StackkitConfig {
  return {
    projectName: answers.projectName,
    packageManager: "pnpm",
    workspace: "pnpm-turbo",
    preset: answers.preset,
    modules: [],
    ai: {
      skillTargets: answers.aiTargets
    }
  };
}
```

Add a prompt function:

```ts
async function promptForCreateConfig(): Promise<StackkitConfig> {
  const prompts = await import("@clack/prompts");

  prompts.intro("Create a Stackkit project");

  const projectName = await prompts.text({
    message: "Project name",
    placeholder: "acme-dashboard",
    validate: (value) => (String(value).trim().length > 0 ? undefined : "Project name is required")
  });

  if (prompts.isCancel(projectName)) {
    prompts.cancel("Create cancelled");
    process.exitCode = 1;
    throw new Error("Create cancelled");
  }

  const preset = await prompts.select({
    message: "Preset",
    options: builtinPresets.map((item) => ({ value: item.id, label: item.title, hint: item.description }))
  });

  if (prompts.isCancel(preset)) {
    prompts.cancel("Create cancelled");
    process.exitCode = 1;
    throw new Error("Create cancelled");
  }

  const targets = await prompts.multiselect({
    message: "AI skill targets",
    options: [
      { value: "codex", label: ".agents  Codex-compatible project skills" },
      { value: "claude-code", label: ".claude  Claude Code project skills" }
    ],
    initialValues: ["codex"],
    required: true
  });

  if (prompts.isCancel(targets)) {
    prompts.cancel("Create cancelled");
    process.exitCode = 1;
    throw new Error("Create cancelled");
  }

  prompts.outro("Stackkit plan ready");

  const selectedPreset = builtinPresets.find((item) => item.id === preset);

  return stackkitConfigSchema.parse({
    projectName,
    packageManager: "pnpm",
    workspace: "pnpm-turbo",
    preset,
    modules: selectedPreset?.modules ?? [],
    ai: { skillTargets: targets }
  });
}
```

Update `createDryRunPlanFromConfig` to call `promptForCreateConfig` when no config path exists.

- [ ] **Step 5: Run CLI tests**

Run:

```powershell
pnpm --filter @stackkit/cli test
```

Expected: PASS.

Checkpoint note: interactive create maps directly to config.

---

## Milestone 10: Add, Remove, Diff, Update, Migrate

### Task 13: Implement `add` And `remove`

**Files:**
- Create: `packages/core/src/lifecycle-add-remove.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/cli.test.ts`

- [ ] **Step 1: Write lifecycle core tests**

Add `packages/core/src/lifecycle-add-remove.test.ts`:

```ts
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { applyAddModules, applyRemoveModules, hashContent, planAddModules, planRemoveModules, type StackkitManifest } from "./index.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const manifest: StackkitManifest = {
  schemaVersion: 1,
  stackkitVersion: "0.0.0",
  projectName: "acme",
  createdAt: "2026-06-02T00:00:00.000Z",
  modules: [{ id: "workspace/pnpm-turbo", version: "1.0.0", options: {} }],
  files: [{ path: "package.json", owner: "workspace/pnpm-turbo", hash: "hash" }],
  aiSkills: { targets: [{ agent: "codex", directory: ".agents", enabled: true }], installed: [], unresolved: [] },
  migrations: { applied: [] }
};

describe("add and remove planning", () => {
  it("plans adding new modules to an existing manifest", () => {
    const plan = planAddModules({
      manifest,
      moduleIds: ["web/nextjs"],
      availableModules: [
        {
          id: "workspace/pnpm-turbo",
          version: "1.0.0",
          title: "Workspace",
          description: "Workspace",
          provides: ["workspace/node"]
        },
        {
          id: "web/nextjs",
          version: "1.0.0",
          title: "Next.js",
          description: "Next.js",
          requires: ["workspace/node"],
          provides: ["web-app"]
        }
      ]
    });

    expect(plan.modulesToAdd.map((module) => module.id)).toEqual(["web/nextjs"]);
  });

  it("refuses to remove modified owned files", () => {
    const plan = planRemoveModules({
      manifest,
      moduleIds: ["workspace/pnpm-turbo"],
      currentFiles: [{ path: "package.json", hash: "changed" }]
    });

    expect(plan.safe).toBe(false);
    expect(plan.refusals).toEqual([
      {
        path: "package.json",
        reason: "modified-owned"
      }
    ]);
  });

  it("applies add by writing new files and updating the manifest", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stackkit-add-"));
    tempDirectories.push(directory);

    const result = await applyAddModules({
      projectDirectory: directory,
      manifest,
      moduleIds: ["web/nextjs"],
      availableModules: [
        {
          id: "workspace/pnpm-turbo",
          version: "1.0.0",
          title: "Workspace",
          description: "Workspace",
          provides: ["workspace/node"]
        },
        {
          id: "web/nextjs",
          version: "1.0.0",
          title: "Next.js",
          description: "Next.js",
          requires: ["workspace/node"],
          provides: ["web-app"],
          files: [
            {
              kind: "write",
              path: "apps/web/package.json",
              owner: "web/nextjs",
              content: "{\n  \"name\": \"web\"\n}\n",
              overwrite: "if-owned"
            }
          ]
        }
      ]
    });

    expect(result.manifest.modules.map((module) => module.id)).toEqual(["workspace/pnpm-turbo", "web/nextjs"]);
    await expect(readFile(join(directory, "apps", "web", "package.json"), "utf8")).resolves.toContain("\"name\": \"web\"");
  });

  it("refuses add when a package change would modify an unowned existing package file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stackkit-add-conflict-"));
    tempDirectories.push(directory);
    await writeFile(join(directory, "package.json"), "{\n  \"name\": \"user-owned\"\n}\n", "utf8");

    await expect(
      applyAddModules({
        projectDirectory: directory,
        manifest,
        moduleIds: ["quality/vitest"],
        availableModules: [
          {
            id: "workspace/pnpm-turbo",
            version: "1.0.0",
            title: "Workspace",
            description: "Workspace",
            provides: ["workspace/node"]
          },
          {
            id: "quality/vitest",
            version: "1.0.0",
            title: "Vitest",
            description: "Vitest test runner",
            requires: ["workspace/node"],
            packageChanges: [
              {
                packagePath: "package.json",
                scripts: { test: "vitest run" },
                dependencies: {},
                devDependencies: { vitest: "^4.1.8" },
                peerDependencies: {},
                optionalDependencies: {}
              }
            ]
          }
        ]
      })
    ).rejects.toThrow("exists-unowned");
  });

  it("updates skills-lock.json when add introduces AI skills", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stackkit-add-skills-"));
    tempDirectories.push(directory);
    await writeFile(
      join(directory, "skills-lock.json"),
      JSON.stringify({ schemaVersion: 1, targets: [{ agent: "codex", directory: ".agents", enabled: true }], installed: [], local: [], unresolved: [] }),
      "utf8"
    );

    await applyAddModules({
      projectDirectory: directory,
      manifest,
      moduleIds: ["deploy/kubernetes"],
      availableModules: [
        {
          id: "workspace/pnpm-turbo",
          version: "1.0.0",
          title: "Workspace",
          description: "Workspace",
          provides: ["workspace/node"]
        },
        {
          id: "deploy/kubernetes",
          version: "1.0.0",
          title: "Kubernetes",
          description: "Kubernetes deployment",
          aiSkills: [{ skills: ["stackkit-kubernetes-guidance"], trust: "local", causedBy: "deploy/kubernetes", reason: "Local guidance" }]
        }
      ]
    });

    await expect(readFile(join(directory, "skills-lock.json"), "utf8")).resolves.toContain("stackkit-kubernetes-guidance");
  });

  it("applies safe remove by deleting owned unchanged files and updating the manifest", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stackkit-remove-"));
    tempDirectories.push(directory);
    const content = "{}\n";
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "package.json"), content, "utf8");

    const result = await applyRemoveModules({
      projectDirectory: directory,
      manifest: {
        ...manifest,
        files: [{ path: "package.json", owner: "workspace/pnpm-turbo", hash: hashContent(content) }]
      },
      moduleIds: ["workspace/pnpm-turbo"]
    });

    expect(result.manifest.modules).toEqual([]);
    await expect(readFile(join(directory, "package.json"), "utf8")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run failing lifecycle tests**

Run:

```powershell
pnpm --filter @stackkit/core test -- lifecycle-add-remove
```

Expected: FAIL because lifecycle planning APIs are missing.

- [ ] **Step 3: Implement add/remove planning**

In `packages/core/src/index.ts`, add:

```ts
export type AddModulesPlan = {
  modulesToAdd: StackkitModule[];
  graph: StackkitModule[];
};

export function planAddModules(input: {
  manifest: StackkitManifest;
  moduleIds: readonly string[];
  availableModules: readonly StackkitModule[];
}): AddModulesPlan {
  const selected = new Set([...input.manifest.modules.map((module) => module.id), ...input.moduleIds]);
  const moduleById = new Map(input.availableModules.map((module) => [module.id, module]));
  const modules = [...selected].map((moduleId) => {
    const module = moduleById.get(moduleId);

    if (!module) {
      throw new Error(`Unknown Stackkit module: ${moduleId}`);
    }

    return module;
  });

  const graph = resolveModuleGraph(modules);

  return {
    modulesToAdd: graph.filter((module) => input.moduleIds.includes(module.id)),
    graph
  };
}

export type RemoveModulesPlan = {
  safe: boolean;
  filesToDelete: string[];
  refusals: { path: string; reason: "modified-owned" | "not-owned" }[];
};

export function planRemoveModules(input: {
  manifest: StackkitManifest;
  moduleIds: readonly string[];
  currentFiles: readonly { path: string; hash: string }[];
}): RemoveModulesPlan {
  const currentHashByPath = new Map(input.currentFiles.map((file) => [file.path, file.hash]));
  const filesToDelete: string[] = [];
  const refusals: { path: string; reason: "modified-owned" | "not-owned" }[] = [];

  for (const file of input.manifest.files.filter((item) => input.moduleIds.includes(item.owner))) {
    const currentHash = currentHashByPath.get(file.path);

    if (currentHash !== file.hash) {
      refusals.push({ path: file.path, reason: "modified-owned" });
      continue;
    }

    filesToDelete.push(file.path);
  }

  return {
    safe: refusals.length === 0,
    filesToDelete,
    refusals
  };
}
```

Add applied lifecycle functions:

```ts
export async function readCurrentManagedFileHashes(
  projectDirectory: string,
  manifest: StackkitManifest
): Promise<{ path: string; hash: string }[]> {
  const current: { path: string; hash: string }[] = [];

  for (const file of manifest.files) {
    const content = await readExistingFile(join(projectDirectory, file.path));
    current.push({ path: file.path, hash: content === undefined ? "" : hashContent(content) });
  }

  return current;
}

export async function applyAddModules(input: {
  projectDirectory: string;
  manifest: StackkitManifest;
  moduleIds: readonly string[];
  availableModules: readonly StackkitModule[];
  skillTargets?: readonly AiSkillTarget[];
  runCommand?: RunCommand;
}): Promise<{ manifest: StackkitManifest }> {
  const addPlan = planAddModules(input);
  const packageOperations = await planPackageChangeFiles(input.projectDirectory, addPlan.modulesToAdd.flatMap((module) => module.packageChanges ?? []));
  const envOperations = await planEnvExampleFiles(input.projectDirectory, addPlan.modulesToAdd.flatMap((module) => module.envVars ?? []));
  const filePlan = buildFilePlan([
    ...addPlan.modulesToAdd.flatMap((module) => module.files ?? []),
    ...packageOperations,
    ...envOperations
  ]);
  const conflicts = await detectFileConflicts(input.projectDirectory, filePlan, input.manifest.files);

  if (conflicts.length > 0) {
    throw new Error(`Add has conflicts: ${conflicts.map((conflict) => `${conflict.path} (${conflict.reason})`).join(", ")}`);
  }

  const addedFiles = await applyFilePlan(input.projectDirectory, filePlan);
  const addedSkills = resolveAiSkills(addPlan.modulesToAdd);
  const targets = input.skillTargets ?? input.manifest.aiSkills.targets;
  const skillCommands = planAiSkillInstallCommands(addedSkills, targets);
  const skillResult =
    input.runCommand && skillCommands.length > 0
      ? await installAiSkills(skillCommands, { cwd: input.projectDirectory, runCommand: input.runCommand })
      : {
          installed: addedSkills.filter((skill) => skill.trust === "official" || skill.trust === "curated"),
          unresolved: addedSkills.filter((skill) => skill.trust === "unresolved")
        };
  const existingLock = await readOptionalSkillsLock(input.projectDirectory);
  const nextLock: SkillsLock = {
    schemaVersion: 1,
    targets,
    installed: mergeSkillDependencies(existingLock?.installed ?? [], skillResult.installed),
    local: mergeSkillDependencies(existingLock?.local ?? [], addedSkills.filter((skill) => skill.trust === "local")),
    unresolved: mergeSkillDependencies(existingLock?.unresolved ?? [], skillResult.unresolved)
  };
  await writeSkillsLock(input.projectDirectory, nextLock);
  await writeLocalAiGuidance(input.projectDirectory, {
    targets,
    local: addedSkills.filter((skill) => skill.trust === "local")
  });

  if (input.runCommand) {
    await runLifecycleHooks(
      addPlan.modulesToAdd.flatMap((module) => module.postAdd ?? []),
      { projectDirectory: input.projectDirectory, runCommand: input.runCommand }
    );
  }

  const nextManifest = createManifest({
    ...input.manifest,
    modules: addPlan.graph.map((module) => ({ id: module.id, version: module.version, options: {} })),
    files: [...input.manifest.files, ...addedFiles],
    aiSkills: {
      targets,
      installed: mergeSkillDependencies(input.manifest.aiSkills.installed, skillResult.installed),
      unresolved: mergeSkillDependencies(input.manifest.aiSkills.unresolved, skillResult.unresolved)
    }
  });
  await writeManifest(input.projectDirectory, nextManifest);

  return { manifest: nextManifest };
}

export async function applyRemoveModules(input: {
  projectDirectory: string;
  manifest: StackkitManifest;
  moduleIds: readonly string[];
}): Promise<{ manifest: StackkitManifest }> {
  const currentFiles = await readCurrentManagedFileHashes(input.projectDirectory, input.manifest);
  const removePlan = planRemoveModules({ manifest: input.manifest, moduleIds: input.moduleIds, currentFiles });

  if (!removePlan.safe) {
    throw new Error(`Remove refused: ${removePlan.refusals.map((refusal) => `${refusal.path} (${refusal.reason})`).join(", ")}`);
  }

  for (const filePath of removePlan.filesToDelete) {
    await rm(join(input.projectDirectory, filePath), { force: true });
  }

  const removed = new Set(input.moduleIds);
  const nextManifest = createManifest({
    ...input.manifest,
    modules: input.manifest.modules.filter((module) => !removed.has(module.id)),
    files: input.manifest.files.filter((file) => !removed.has(file.owner))
  });
  await writeManifest(input.projectDirectory, nextManifest);

  return { manifest: nextManifest };
}
```

Reuse `planPackageChangeFiles` and `planEnvExampleFiles` from Task 8A. Add the skills-lock helper used by `applyAddModules`:

```ts
export async function readOptionalSkillsLock(projectDirectory: string): Promise<SkillsLock | undefined> {
  const content = await readExistingFile(join(projectDirectory, "skills-lock.json"));

  return content ? skillsLockSchema.parse(JSON.parse(content)) : undefined;
}
```

- [ ] **Step 4: Run lifecycle tests**

Run:

```powershell
pnpm --filter @stackkit/core test -- lifecycle-add-remove
```

Expected: PASS.

- [ ] **Step 5: Add CLI actions for add/remove**

Add CLI actions that read `.stackkit/project.json`, call the core planners for `--dry-run`, and call `applyAddModules` or `applyRemoveModules` when applying. `remove` requires `--yes` for apply mode. `add` writes by default unless `--dry-run` is passed.

Expected command behavior:

```powershell
stackkit add web/nextjs --dry-run
stackkit add web/nextjs
stackkit remove web/nextjs --dry-run
stackkit remove web/nextjs --yes
```

Run:

```powershell
pnpm --filter @stackkit/cli test
```

Expected: PASS after tests cover dry-run summaries.

Checkpoint note: add/remove safety logic exists before file mutation.

### Task 14: Implement `diff`, `update`, And `migrate`

**Files:**
- Create: `packages/core/src/lifecycle-update-migrate.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/cli.test.ts`

- [ ] **Step 1: Write update and migration tests**

Add `packages/core/src/lifecycle-update-migrate.test.ts`:

```ts
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { applyAutomaticMigrations, applyModuleUpdates, planModuleMigrations, planModuleUpdates } from "./index.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("update and migration planning", () => {
  it("plans module updates when registry version is newer", () => {
    const plan = planModuleUpdates({
      manifestModules: [{ id: "web/nextjs", version: "1.0.0", options: {} }],
      availableModules: [
        {
          id: "web/nextjs",
          version: "1.1.0",
          title: "Next.js",
          description: "Next.js app"
        }
      ]
    });

    expect(plan.updates).toEqual([{ id: "web/nextjs", from: "1.0.0", to: "1.1.0" }]);
  });

  it("plans pending migrations and separates review-required migrations", () => {
    const plan = planModuleMigrations({
      manifest: {
        schemaVersion: 1,
        stackkitVersion: "0.0.0",
        projectName: "acme",
        createdAt: "2026-06-02T00:00:00.000Z",
        modules: [{ id: "web/nextjs", version: "1.0.0", options: {} }],
        files: [],
        aiSkills: { targets: [], installed: [], unresolved: [] },
        migrations: { applied: [] }
      },
      modules: [
        {
          id: "web/nextjs",
          version: "1.1.0",
          title: "Next.js",
          description: "Next.js app",
          migrations: [
            {
              from: "1.0.0",
              to: "1.1.0",
              title: "Add Next.js config",
              operations: [{ kind: "write", path: "apps/web/next.config.ts", content: "export default {};\n" }],
              safety: "review-required"
            }
          ]
        }
      ]
    });

    expect(plan.reviewRequired.map((migration) => migration.title)).toEqual(["Add Next.js config"]);
    expect(plan.automatic).toEqual([]);
  });

  it("applies automatic migrations and records them in the manifest", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stackkit-migrate-"));
    tempDirectories.push(directory);

    const result = await applyAutomaticMigrations({
      projectDirectory: directory,
      manifest: {
        schemaVersion: 1,
        stackkitVersion: "0.0.0",
        projectName: "acme",
        createdAt: "2026-06-02T00:00:00.000Z",
        modules: [{ id: "web/nextjs", version: "1.0.0", options: {} }],
        files: [],
        aiSkills: { targets: [], installed: [], unresolved: [] },
        migrations: { applied: [] }
      },
      modules: [
        {
          id: "web/nextjs",
          version: "1.1.0",
          title: "Next.js",
          description: "Next.js app",
          migrations: [
            {
              from: "1.0.0",
              to: "1.1.0",
              title: "Add Next.js config",
              operations: [{ kind: "write", path: "apps/web/next.config.ts", content: "export default {};\n" }],
              safety: "automatic"
            }
          ]
        }
      ]
    });

    await expect(readFile(join(directory, "apps", "web", "next.config.ts"), "utf8")).resolves.toContain("export default");
    expect(result.manifest.files).toEqual([
      expect.objectContaining({ path: "apps/web/next.config.ts", owner: "web/nextjs" })
    ]);
    expect(result.manifest.migrations.applied).toHaveLength(1);
  });

  it("applies module version updates to the manifest", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stackkit-update-"));
    tempDirectories.push(directory);

    const result = await applyModuleUpdates({
      projectDirectory: directory,
      manifest: {
        schemaVersion: 1,
        stackkitVersion: "0.0.0",
        projectName: "acme",
        createdAt: "2026-06-02T00:00:00.000Z",
        modules: [{ id: "web/nextjs", version: "1.0.0", options: {} }],
        files: [],
        aiSkills: { targets: [], installed: [], unresolved: [] },
        migrations: { applied: [] }
      },
      availableModules: [{ id: "web/nextjs", version: "1.1.0", title: "Next.js", description: "Next.js app" }]
    });

    expect(result.manifest.modules).toEqual([{ id: "web/nextjs", version: "1.1.0", options: {} }]);
  });
});
```

- [ ] **Step 2: Run failing tests**

Run:

```powershell
pnpm --filter @stackkit/core test -- lifecycle-update-migrate
```

Expected: FAIL because update/migration planning is missing.

- [ ] **Step 3: Implement update and migration planning**

In `packages/core/src/index.ts`, add:

```ts
export type ModuleUpdatePlan = {
  updates: { id: string; from: string; to: string }[];
};

export function planModuleUpdates(input: {
  manifestModules: readonly StackkitManifest["modules"][number][];
  availableModules: readonly StackkitModule[];
}): ModuleUpdatePlan {
  const availableById = new Map(input.availableModules.map((module) => [module.id, module]));

  return {
    updates: input.manifestModules.flatMap((manifestModule) => {
      const available = availableById.get(manifestModule.id);

      if (!available || available.version === manifestModule.version) {
        return [];
      }

      return [{ id: manifestModule.id, from: manifestModule.version, to: available.version }];
    })
  };
}

export type ModuleMigrationPlan = {
  automatic: ModuleMigration[];
  reviewRequired: ModuleMigration[];
  manual: ModuleMigration[];
};

export function planModuleMigrations(input: {
  manifest: StackkitManifest;
  modules: readonly StackkitModule[];
}): ModuleMigrationPlan {
  const applied = new Set(input.manifest.migrations.applied.map((entry) => JSON.stringify(entry)));
  const pending = input.modules.flatMap((module) => module.migrations ?? []).filter((migration) => !applied.has(JSON.stringify(migration)));

  return {
    automatic: pending.filter((migration) => migration.safety === "automatic"),
    reviewRequired: pending.filter((migration) => migration.safety === "review-required"),
    manual: pending.filter((migration) => migration.safety === "manual")
  };
}
```

Add applied migration behavior:

```ts
export async function applyAutomaticMigrations(input: {
  projectDirectory: string;
  manifest: StackkitManifest;
  modules: readonly StackkitModule[];
}): Promise<{ manifest: StackkitManifest }> {
  const automatic = input.modules.flatMap((module) =>
    (module.migrations ?? [])
      .filter((migration) => migration.safety === "automatic")
      .map((migration) => ({ module, migration }))
  );
  const operations = automatic.flatMap(({ module, migration }) =>
    migration.operations.map((operation) => ({
      kind: operation.kind,
      path: operation.path,
      owner: module.id,
      content: operation.kind === "write" ? operation.content : undefined,
      overwrite: "if-owned" as const
    }))
  );
  const filePlan = buildFilePlan(operations);
  const conflicts = await detectFileConflicts(input.projectDirectory, filePlan, input.manifest.files);

  if (conflicts.length > 0) {
    throw new Error(`Migration has conflicts: ${conflicts.map((conflict) => `${conflict.path} (${conflict.reason})`).join(", ")}`);
  }

  const files = await applyFilePlan(input.projectDirectory, filePlan);
  const nextManifest = createManifest({
    ...input.manifest,
    files: [...input.manifest.files, ...files],
    migrations: {
      applied: [...input.manifest.migrations.applied, ...automatic.map(({ migration }) => migration)]
    }
  });
  await writeManifest(input.projectDirectory, nextManifest);

  return { manifest: nextManifest };
}
```

Add update apply behavior for automatic version bumps:

```ts
export async function applyModuleUpdates(input: {
  projectDirectory: string;
  manifest: StackkitManifest;
  availableModules: readonly StackkitModule[];
}): Promise<{ manifest: StackkitManifest; updates: ModuleUpdatePlan["updates"] }> {
  const updatePlan = planModuleUpdates({
    manifestModules: input.manifest.modules,
    availableModules: input.availableModules
  });
  const availableById = new Map(input.availableModules.map((module) => [module.id, module]));
  const nextModules = input.manifest.modules.map((manifestModule) => {
    const available = availableById.get(manifestModule.id);

    return {
      ...manifestModule,
      version: available?.version ?? manifestModule.version
    };
  });
  const nextManifest = createManifest({
    ...input.manifest,
    modules: nextModules
  });
  await writeManifest(input.projectDirectory, nextManifest);

  return { manifest: nextManifest, updates: updatePlan.updates };
}
```

- [ ] **Step 4: Run update/migration tests**

Run:

```powershell
pnpm --filter @stackkit/core test -- lifecycle-update-migrate
```

Expected: PASS.

- [ ] **Step 5: Add CLI dry-run actions**

Implement `diff`, `update`, and `migrate` actions. `diff` is always read-only. `update` supports `--dry-run` and `--apply`; apply mode updates manifest module versions after automatic migrations are handled. `migrate` supports both dry-run and apply mode because applying pending automatic migrations is part of the lifecycle requirement.

`migrate --apply` must:

1. Read `.stackkit/project.json`.
2. Compute pending migrations.
3. Refuse if any `review-required` or `manual` migrations are pending unless the user runs without `--apply` and reviews them.
4. Apply only automatic migrations through `applyAutomaticMigrations`.
5. Rewrite `.stackkit/project.json`.

`update --apply` must:

1. Read `.stackkit/project.json`.
2. Plan module version updates.
3. Run migration planning first and refuse if non-automatic migrations are pending.
4. Apply automatic migrations.
5. Update manifest module versions through `applyModuleUpdates`.
6. Rewrite `.stackkit/project.json`.

All three commands should read the manifest, use registry modules, print human summaries, and include extractable JSON markers:

```text
STACKKIT_DIFF_JSON_START
...
STACKKIT_DIFF_JSON_END
```

```text
STACKKIT_UPDATE_JSON_START
...
STACKKIT_UPDATE_JSON_END
```

```text
STACKKIT_MIGRATE_JSON_START
...
STACKKIT_MIGRATE_JSON_END
```

Add this CLI test for apply mode:

```ts
it("applies automatic migrations with migrate --apply", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stackkit-cli-migrate-"));
  await mkdir(join(directory, ".stackkit"), { recursive: true });
  await writeFile(
    join(directory, ".stackkit", "project.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        stackkitVersion: "0.0.0",
        projectName: "acme",
        createdAt: "2026-06-02T00:00:00.000Z",
        modules: [{ id: "web/nextjs", version: "1.0.0", options: {} }],
        files: [],
        aiSkills: { targets: [], installed: [], unresolved: [] },
        migrations: { applied: [] }
      },
      null,
      2
    ),
    "utf8"
  );

  const program = createStackkitProgram();
  const originalCwd = process.cwd();

  try {
    process.chdir(directory);
    await program.parseAsync(["migrate", "--apply"], { from: "user" });
  } finally {
    process.chdir(originalCwd);
  }

  await expect(readFile(join(directory, "apps", "web", "next.config.ts"), "utf8")).resolves.toContain("export default");
  const manifest = JSON.parse(await readFile(join(directory, ".stackkit", "project.json"), "utf8"));
  expect(manifest.migrations.applied).toHaveLength(1);
});
```

Run:

```powershell
pnpm --filter @stackkit/cli test
```

Expected: PASS.

Checkpoint note: update and migration planning exists before automatic application.

---

## Milestone 11: Doctor

### Task 15: Implement Doctor Checks

**Files:**
- Create: `packages/core/src/doctor.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/cli.test.ts`

- [ ] **Step 1: Write doctor tests**

Add `packages/core/src/doctor.test.ts`:

```ts
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runDoctor } from "./index.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("runDoctor", () => {
  it("reports a missing manifest", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stackkit-doctor-missing-"));
    tempDirectories.push(directory);

    const result = await runDoctor(directory);

    expect(result.ok).toBe(false);
    expect(result.checks).toEqual([
      expect.objectContaining({
        id: "manifest.exists",
        status: "error"
      })
    ]);
  });

  it("reports modified owned files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stackkit-doctor-modified-"));
    tempDirectories.push(directory);
    await writeFile(join(directory, "package.json"), "{}\n", "utf8");
    await mkdir(join(directory, ".stackkit"), { recursive: true });
    await writeFile(
      join(directory, ".stackkit", "project.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          stackkitVersion: "0.0.0",
          projectName: "acme",
          createdAt: "2026-06-02T00:00:00.000Z",
          modules: [],
          files: [{ path: "package.json", owner: "workspace/pnpm-turbo", hash: "not-the-current-hash" }],
          aiSkills: { targets: [], installed: [], unresolved: [] },
          migrations: { applied: [] }
        },
        null,
        2
      ),
      "utf8"
    );

    const result = await runDoctor(directory);

    expect(result.ok).toBe(false);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "files.package.json",
          status: "warning"
        })
      ])
    );
  });
});
```

- [ ] **Step 2: Run failing doctor tests**

Run:

```powershell
pnpm --filter @stackkit/core test -- doctor
```

Expected: FAIL because `runDoctor` is missing.

- [ ] **Step 3: Implement doctor**

In `packages/core/src/index.ts`, add:

```ts
export async function runDoctor(projectDirectory: string): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];
  const manifestPath = join(projectDirectory, ".stackkit", "project.json");
  const manifestContent = await readExistingFile(manifestPath);

  if (!manifestContent) {
    return {
      ok: false,
      checks: [
        {
          id: "manifest.exists",
          status: "error",
          message: ".stackkit/project.json is missing"
        }
      ]
    };
  }

  const manifest = stackkitManifestSchema.parse(JSON.parse(manifestContent));
  checks.push({ id: "manifest.exists", status: "ok", message: ".stackkit/project.json exists" });

  for (const file of manifest.files) {
    const content = await readExistingFile(join(projectDirectory, file.path));

    if (content === undefined) {
      checks.push({
        id: `files.${file.path}`,
        status: "error",
        message: `Managed file is missing: ${file.path}`
      });
      continue;
    }

    if (hashContent(content) !== file.hash) {
      checks.push({
        id: `files.${file.path}`,
        status: "warning",
        message: `Managed file was modified: ${file.path}`
      });
      continue;
    }

    checks.push({
      id: `files.${file.path}`,
      status: "ok",
      message: `Managed file is unchanged: ${file.path}`
    });
  }

  return {
    ok: checks.every((check) => check.status === "ok"),
    checks
  };
}
```

Import `DoctorCheck`, `DoctorResult`, and `stackkitManifestSchema`.

- [ ] **Step 4: Run doctor tests**

Run:

```powershell
pnpm --filter @stackkit/core test -- doctor
```

Expected: PASS.

- [ ] **Step 5: Wire CLI doctor**

In `packages/cli/src/index.ts`, set `doctor` action:

```ts
program.command("doctor").description("Validate project health and Stackkit state").action(async () => {
  const result = await runDoctor(process.cwd());
  writeProgramOutput(
    program,
    `${result.ok ? "Stackkit doctor passed" : "Stackkit doctor found issues"}\n${result.checks
      .map((check) => `[${check.status}] ${check.id}: ${check.message}`)
      .join("\n")}\n`
  );

  if (!result.ok) {
    process.exitCode = 1;
  }
});
```

Run:

```powershell
pnpm --filter @stackkit/cli test
```

Expected: PASS.

- [ ] **Step 6: Wire doctor into create results**

Extend `ApplyCreatePlanResult` in `packages/core/src/index.ts`:

```ts
export type ApplyCreatePlanResult = {
  projectDirectory: string;
  manifest: StackkitManifest;
  doctor: DoctorResult;
};
```

At the end of `applyCreatePlan`, after writing `.stackkit/project.json`, `skills-lock.json`, and local guidance, call doctor and return it on both success and failure:

```ts
const doctor = await runDoctor(projectDirectory);

return { projectDirectory, manifest, doctor };
```

Add this test to `packages/core/src/create-apply.test.ts`:

```ts
it("runs doctor after create and returns the result", async () => {
  const parent = await mkdtemp(join(tmpdir(), "stackkit-create-doctor-"));
  tempDirectories.push(parent);

  const plan = createCreatePlan({
    config: {
      projectName: "doctor-project",
      packageManager: "pnpm",
      workspace: "pnpm-turbo",
      modules: ["workspace/pnpm-turbo", "workspace/typescript"],
      ai: { skillTargets: ["codex"] }
    },
    availableModules: [
      defineModule({
        id: "workspace/pnpm-turbo",
        version: "1.0.0",
        title: "pnpm and Turborepo",
        description: "Workspace foundation",
        provides: ["workspace/node"]
      }),
      defineModule({
        id: "workspace/typescript",
        version: "1.0.0",
        title: "TypeScript",
        description: "TypeScript config",
        requires: ["workspace/node"],
        provides: ["typescript"]
      })
    ],
    curatedSkillSourceAllowlist: []
  });

  const result = await applyCreatePlan(plan, {
    parentDirectory: parent,
    installSkills: false
  });

  expect(result.doctor.ok).toBe(true);
});
```

Run:

```powershell
pnpm --filter @stackkit/core test -- doctor create-apply
```

Expected: PASS.

Checkpoint note: generated projects can explain their own health.

---

## Milestone 12: Skills Sync And Update

### Task 16: Implement `skills sync` And `skills update`

**Files:**
- Modify: `packages/core/src/skill-installer.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/cli.test.ts`

- [ ] **Step 1: Add sync/update tests**

In `packages/core/src/skill-installer.test.ts`, add:

```ts
import { applySkillSync, planSkillSyncCommands } from "./index.js";

it("plans skill sync commands from skills lock", () => {
  const commands = planSkillSyncCommands({
    schemaVersion: 1,
    targets: [{ agent: "codex", directory: ".agents", enabled: true }],
    installed: [skill],
    local: [],
    unresolved: []
  });

  expect(commands).toEqual([
    expect.objectContaining({
      command: "npx",
      args: expect.arrayContaining(["skills", "add", "https://github.com/vercel-labs/agent-skills", "--agent", "codex"])
    })
  ]);
});

it("applies skill sync commands and returns an updated lock", async () => {
  const result = await applySkillSync(
    {
      schemaVersion: 1,
      targets: [{ agent: "codex", directory: ".agents", enabled: true }],
      installed: [],
      local: [],
      unresolved: [skill]
    },
    {
      runCommand: async () => ({ exitCode: 0, stdout: "ok", stderr: "" })
    }
  );

  expect(result.installed).toEqual([skill]);
  expect(result.unresolved).toEqual([]);
});
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
pnpm --filter @stackkit/core test -- skill-installer
```

Expected: FAIL because `planSkillSyncCommands` and `applySkillSync` are missing.

- [ ] **Step 3: Implement sync command planning**

In `packages/core/src/index.ts`, add:

```ts
export function planSkillSyncCommands(lock: SkillsLock): AiSkillInstallCommand[] {
  return planAiSkillInstallCommands([...lock.installed, ...lock.unresolved], lock.targets);
}
```

Add apply behavior:

```ts
export async function applySkillSync(lock: SkillsLock, options: InstallAiSkillsOptions): Promise<SkillsLock> {
  const result = await installAiSkills(planSkillSyncCommands(lock), options);

  return {
    schemaVersion: 1,
    targets: lock.targets,
    installed: mergeSkillDependencies(lock.installed, result.installed),
    local: lock.local,
    unresolved: result.unresolved
  };
}

function mergeSkillDependencies(left: readonly AiSkillDependency[], right: readonly AiSkillDependency[]): AiSkillDependency[] {
  const merged = new Map<string, AiSkillDependency>();

  for (const skill of [...left, ...right]) {
    merged.set(skillDependencyKey(skill), skill);
  }

  return [...merged.values()];
}
```

Add `readSkillsLock`:

```ts
export async function readSkillsLock(projectDirectory: string): Promise<SkillsLock> {
  const content = await readFile(join(projectDirectory, "skills-lock.json"), "utf8");
  return skillsLockSchema.parse(JSON.parse(content));
}
```

- [ ] **Step 4: Wire CLI skills commands**

In `packages/cli/src/index.ts`, set actions with `--apply` support:

```ts
skills
  .command("sync")
  .description("Restore AI skills from the recorded skill lock")
  .option("--apply", "Run skill install commands and update skills-lock.json")
  .action(async (options: { apply?: boolean }) => {
    const lock = await readSkillsLock(process.cwd());
    const commands = planSkillSyncCommands(lock);

    if (!options.apply) {
      writeProgramOutput(program, formatSkillCommands("Stackkit skills sync plan", commands));
      return;
    }

    const updated = await applySkillSync(lock, {
      cwd: process.cwd(),
      runCommand: runLocalCommand
    });
    await writeSkillsLock(process.cwd(), updated);
    writeProgramOutput(program, "Stackkit skills sync complete\n");
  });

skills
  .command("update")
  .description("Update installed official and curated AI skills")
  .option("--apply", "Run skill update commands and update skills-lock.json")
  .action(async (options: { apply?: boolean }) => {
    const lock = await readSkillsLock(process.cwd());
    const updateLock = { ...lock, unresolved: [] };
    const commands = planSkillSyncCommands(updateLock);

    if (!options.apply) {
      writeProgramOutput(program, formatSkillCommands("Stackkit skills update plan", commands));
      return;
    }

    const updated = await applySkillSync(updateLock, {
      cwd: process.cwd(),
      runCommand: runLocalCommand
    });
    await writeSkillsLock(process.cwd(), updated);
    writeProgramOutput(program, "Stackkit skills update complete\n");
  });
```

Add formatter:

```ts
function formatSkillCommands(title: string, commands: readonly AiSkillInstallCommand[]): string {
  return [
    title,
    ...commands.map((command) => `- ${command.command} ${command.args.join(" ")}`),
    commands.length === 0 ? "- none" : "",
    ""
  ]
    .filter(Boolean)
    .join("\n");
}
```

Reuse the `runLocalCommand` helper added in Task 8. If Task 8 was implemented in a separate patch and the helper is missing, add this exact helper in `packages/cli/src/index.ts`:

```ts
async function runLocalCommand(command: string, args: readonly string[], options: { cwd?: string }) {
  const { spawn } = await import("node:child_process");

  return await new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolvePromise) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      shell: process.platform === "win32"
    });
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (code) => {
      resolvePromise({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}
```

- [ ] **Step 5: Run tests**

Run:

```powershell
pnpm --filter @stackkit/core test -- skill-installer
pnpm --filter @stackkit/cli test
```

Expected: PASS.

Checkpoint note: skill lock can drive repeatable sync/update plans.

---

## Milestone 13: Documentation And Open Source Readiness

### Task 17: Add Public Documentation Files

**Files:**
- Create: `README.md`
- Create: `LICENSE`
- Create: `CONTRIBUTING.md`
- Create: `SECURITY.md`
- Create: `CODE_OF_CONDUCT.md`
- Create: `CHANGELOG.md`
- Create: `docs/architecture.md`
- Create: `docs/modules.md`
- Create: `docs/skills.md`
- Create: `docs/managed-updates.md`
- Create: `docs/contributing.md`

- [ ] **Step 1: Add docs smoke test**

If no docs test harness exists, add a simple Vitest test in `packages/test-utils/src/docs.test.ts` only if `packages/test-utils` already runs Vitest. If it does not, use a shell verification step in this task instead.

Verification command:

```powershell
foreach ($path in @("README.md","LICENSE","CONTRIBUTING.md","SECURITY.md","CODE_OF_CONDUCT.md","CHANGELOG.md","docs/architecture.md","docs/modules.md","docs/skills.md","docs/managed-updates.md","docs/contributing.md")) { if (-not (Test-Path $path)) { throw "Missing $path" } }
```

Expected before writing docs: FAIL with the first missing file.

- [ ] **Step 2: Write README**

Create `README.md`:

```md
# Stackkit

Stackkit is a TypeScript CLI for generating and maintaining multi-language monorepos.

It is built around modules. Modules declare generated files, dependencies, lifecycle hooks, migrations, validation rules, and AI skill guidance. Stackkit records what it owns in `.stackkit/project.json` so future updates can be planned safely.

## Current status

Stackkit is under active development. The CLI surface is being built toward:

```bash
stackkit create
stackkit add
stackkit remove
stackkit update
stackkit migrate
stackkit diff
stackkit doctor
stackkit skills sync
stackkit skills update
stackkit preset list
stackkit preset inspect
stackkit config validate
```

## Defaults

- pnpm and Turborepo
- Next.js and ShadCN for web apps
- Postgres for databases
- Drizzle for TypeScript database access
- SQLAlchemy for Python database access
- sqlx for Rust database access
- Clerk, Auth0, or Better Auth for auth
- Vercel, Docker, and optional Kubernetes for deployment
- Project-local AI skills through `.agents/skills` by default

## Development

Commands:

- `pnpm install`
- `pnpm test`
- `pnpm build`
- `pnpm typecheck`
```

- [ ] **Step 3: Write MIT license**

Create `LICENSE` with the MIT license text and copyright line:

```text
MIT License

Copyright (c) 2026 Stackkit contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 4: Write docs files**

Create `docs/architecture.md`:

```md
# Architecture

Stackkit is split into small packages with one direction of dependency.

`packages/schemas` defines public data shapes.

`packages/templates` renders file operations from typed inputs.

`packages/core` resolves modules, plans changes, checks safety, writes files, records manifests, installs skills, and runs diagnostics.

`packages/registry` declares built-in modules and presets. It does not write files.

`packages/cli` owns commands, prompts, output formatting, and process execution.

## Create flow

`create` loads config or prompts, resolves presets and modules, validates capabilities and conflicts, builds a plan, renders files, checks conflicts, writes files, installs skills, writes manifests, runs doctor, and prints next commands.
```

Create `docs/modules.md`:

```md
# Modules

A module is a typed declaration of generated project behavior.

Modules can declare:

- `requires`: capabilities the module needs.
- `provides`: capabilities the module supplies.
- `conflicts`: module IDs that cannot be selected together.
- `files`: generated file operations.
- `packageChanges`: package.json script and dependency changes.
- `envVars`: entries for `.env.example`.
- `postCreate` and `postAdd`: lifecycle hooks.
- `migrations`: versioned changes for managed updates.
- `aiSkills`: official, curated, local, or unresolved AI guidance.

Registry modules should stay declarative. Files are staged by core before anything is written.
```

Create `docs/skills.md`:

```md
# AI Skills

Stackkit resolves AI skills from selected modules.

Trust levels:

- `official`: vendor, framework, or platform-owned source.
- `curated`: allowlisted community source.
- `local`: Stackkit-generated project guidance.
- `unresolved`: wanted but not installed or not trusted.

Codex-compatible skills install to `.agents/skills` by default. Claude Code skills install to `.claude/skills` only when selected.

Skill installation uses `npx -y skills add ... --agent <agent> -y --copy`. Failed installs warn, continue, and are recorded in `.stackkit/project.json` and `skills-lock.json`.
```

Create `docs/managed-updates.md`:

```md
# Managed Updates

Stackkit records generated ownership in `.stackkit/project.json`.

Each managed file record has:

- path
- owner module
- content hash

`diff` shows planned changes. `update` plans module version changes. `migrate` applies automatic migrations and refuses review-required or manual migrations until the user reviews them.

Stackkit never silently overwrites user-modified managed files. If the current file hash does not match the manifest hash, the operation is refused or marked review-required.
```

Create `docs/contributing.md`:

```md
# Contributing

Use pnpm from the repository root.

```bash
pnpm install
pnpm test
pnpm build
pnpm typecheck
```

Keep package responsibilities separate. Put schemas in `packages/schemas`, orchestration in `packages/core`, generated file content in `packages/templates`, built-in declarations in `packages/registry`, and user-facing command behavior in `packages/cli`.

Do not add remote templates without a signing or trust model. Do not add untrusted AI skill sources to the default registry.
```

Create `CONTRIBUTING.md`:

```md
# Contributing

See `docs/contributing.md` for local setup, package boundaries, tests, and module authoring guidance.
```

Create `SECURITY.md`:

```md
# Security

Please report security issues privately to the project maintainer.

Stackkit installs dependencies, runs commands, and installs AI skills, so source trust matters. Official and curated AI skill sources are allowlisted. Remote templates are not supported until Stackkit has a signing or trust model.
```

Create `CODE_OF_CONDUCT.md`:

```md
# Code of Conduct

Be direct, respectful, and constructive. Do not harass people, publish private information, or use discriminatory language.

Maintainers may remove comments, issues, or contributions that make the project unsafe or unproductive.
```

`CHANGELOG.md` starts with:

```md
# Changelog

## Unreleased

- Initial Stackkit generator development.
```

- [ ] **Step 5: Verify docs exist**

Run:

```powershell
foreach ($path in @("README.md","LICENSE","CONTRIBUTING.md","SECURITY.md","CODE_OF_CONDUCT.md","CHANGELOG.md","docs/architecture.md","docs/modules.md","docs/skills.md","docs/managed-updates.md","docs/contributing.md")) { if (-not (Test-Path $path)) { throw "Missing $path" } }
```

Expected: no output and exit code 0.

Checkpoint note: repo can be published without a docs rewrite.

---

## Milestone 14: Examples And Integration Verification

### Task 18: Add Config Examples And Generated Project Snapshot Tests

**Files:**
- Create: `examples/next-shadcn/stackkit.config.json`
- Create: `examples/next-fastapi-postgres-auth0/stackkit.config.json`
- Create: `examples/next-rust-postgres-auth0/stackkit.config.json`
- Create: `examples/docker-kubernetes/stackkit.config.json`
- Create: `packages/test-utils/src/create-integration.test.ts`

- [ ] **Step 1: Add example configs**

Create `examples/next-shadcn/stackkit.config.json`:

```json
{
  "projectName": "next-shadcn",
  "packageManager": "pnpm",
  "workspace": "pnpm-turbo",
  "modules": ["workspace/pnpm-turbo", "workspace/typescript", "web/nextjs", "ui/shadcn", "deploy/vercel"],
  "ai": {
    "skillTargets": ["codex"]
  }
}
```

Create `examples/next-fastapi-postgres-auth0/stackkit.config.json`:

```json
{
  "projectName": "next-fastapi-postgres-auth0",
  "packageManager": "pnpm",
  "workspace": "pnpm-turbo",
  "modules": [
    "workspace/pnpm-turbo",
    "workspace/typescript",
    "web/nextjs",
    "ui/shadcn",
    "api/fastapi",
    "db/postgres",
    "db/drizzle",
    "db/sqlalchemy",
    "auth/auth0-nextjs",
    "auth/auth0-fastapi",
    "deploy/vercel",
    "deploy/docker"
  ],
  "ai": {
    "skillTargets": ["codex"]
  }
}
```

Create `examples/next-rust-postgres-auth0/stackkit.config.json`:

```json
{
  "projectName": "next-rust-postgres-auth0",
  "packageManager": "pnpm",
  "workspace": "pnpm-turbo",
  "modules": [
    "workspace/pnpm-turbo",
    "workspace/typescript",
    "web/nextjs",
    "ui/shadcn",
    "rust/tokio",
    "rust/axum",
    "rust/sqlx",
    "db/postgres",
    "auth/auth0-nextjs",
    "deploy/docker"
  ],
  "ai": {
    "skillTargets": ["codex"]
  }
}
```

Create `examples/docker-kubernetes/stackkit.config.json`:

```json
{
  "projectName": "docker-kubernetes",
  "packageManager": "pnpm",
  "workspace": "pnpm-turbo",
  "modules": [
    "workspace/pnpm-turbo",
    "workspace/typescript",
    "web/nextjs",
    "api/fastapi",
    "db/postgres",
    "deploy/docker",
    "deploy/kubernetes",
    "docs/local-dev"
  ],
  "ai": {
    "skillTargets": ["codex", "claude-code"]
  }
}
```

- [ ] **Step 2: Write integration test**

Add `@stackkit/core` and `@stackkit/registry` as workspace dependencies in `packages/test-utils/package.json`:

```json
"dependencies": {
  "@stackkit/core": "workspace:*",
  "@stackkit/registry": "workspace:*"
}
```

Add `packages/test-utils/src/create-integration.test.ts`:

```ts
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { applyCreatePlan, createCreatePlan } from "@stackkit/core";
import { builtinModules, curatedSkillSourceAllowlist } from "@stackkit/registry";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("create integration", () => {
  it("generates a Next.js and ShadCN project from config", async () => {
    const parent = await mkdtemp(join(tmpdir(), "stackkit-example-"));
    tempDirectories.push(parent);

    const plan = createCreatePlan({
      config: {
        projectName: "next-shadcn",
        packageManager: "pnpm",
        workspace: "pnpm-turbo",
        modules: ["workspace/pnpm-turbo", "workspace/typescript", "web/nextjs", "ui/shadcn", "deploy/vercel"],
        ai: { skillTargets: ["codex"] }
      },
      availableModules: builtinModules,
      curatedSkillSourceAllowlist
    });

    const result = await applyCreatePlan(plan, {
      parentDirectory: parent,
      runCommand: async () => ({ exitCode: 0, stdout: "ok", stderr: "" })
    });

    await expect(readFile(join(result.projectDirectory, "apps", "web", "package.json"), "utf8")).resolves.toContain("next");
    await expect(readFile(join(result.projectDirectory, "apps", "web", "components.json"), "utf8")).resolves.toContain("new-york");
    await expect(readFile(join(result.projectDirectory, ".stackkit", "project.json"), "utf8")).resolves.toContain("web/nextjs");
    await expect(readFile(join(result.projectDirectory, "skills-lock.json"), "utf8")).resolves.toContain("vercel-react-best-practices");
    expect(result.doctor.ok).toBe(true);
  });

  it("generates representative multi-stack project files with mocked skill installs", async () => {
    const parent = await mkdtemp(join(tmpdir(), "stackkit-example-multi-"));
    tempDirectories.push(parent);

    const plan = createCreatePlan({
      config: {
        projectName: "next-fastapi-postgres-auth0",
        packageManager: "pnpm",
        workspace: "pnpm-turbo",
        modules: [
          "workspace/pnpm-turbo",
          "workspace/typescript",
          "web/nextjs",
          "ui/shadcn",
          "api/fastapi",
          "db/postgres",
          "db/drizzle",
          "db/sqlalchemy",
          "auth/auth0-nextjs",
          "auth/auth0-fastapi",
          "deploy/vercel",
          "deploy/docker"
        ],
        ai: { skillTargets: ["codex"] }
      },
      availableModules: builtinModules,
      curatedSkillSourceAllowlist
    });

    const result = await applyCreatePlan(plan, {
      parentDirectory: parent,
      runCommand: async () => ({ exitCode: 0, stdout: "ok", stderr: "" })
    });

    await expect(readFile(join(result.projectDirectory, "apps", "web", "package.json"), "utf8")).resolves.toContain("next");
    await expect(readFile(join(result.projectDirectory, "apps", "api", "app", "main.py"), "utf8")).resolves.toContain("FastAPI");
    await expect(readFile(join(result.projectDirectory, "docker-compose.yml"), "utf8")).resolves.toContain("services:");
    expect(result.doctor.ok).toBe(true);
  });
});
```

- [ ] **Step 3: Run integration test**

Run:

```powershell
pnpm --filter @stackkit/test-utils test -- create-integration
```

Expected: PASS.

Checkpoint note: representative create path works in process.

### Task 19: Add End-To-End Smoke Command

**Files:**
- Modify: `package.json`
- Create: `packages/test-utils/src/e2e-smoke.test.ts`

- [ ] **Step 1: Add smoke test**

Add `packages/test-utils/src/e2e-smoke.test.ts` if `test-utils` runs Vitest:

```ts
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("CLI e2e smoke", () => {
  it("creates a foundation project and doctor validates it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "stackkit-e2e-"));
    tempDirectories.push(directory);
    const configPath = join(directory, "stackkit.config.json");
    const targetDirectory = join(directory, "generated");

    await writeFile(
      configPath,
      JSON.stringify({
        projectName: "smoke",
        modules: ["workspace/pnpm-turbo", "workspace/typescript"],
        ai: { skillTargets: ["codex"] }
      }),
      "utf8"
    );

    const { stdout } = await execFileAsync("node", ["packages/cli/dist/index.js", "create", "--config", configPath, "--dir", targetDirectory], {
      cwd: process.cwd()
    });

    expect(stdout).toContain("Created Stackkit project");

    const doctor = await execFileAsync("node", ["packages/cli/dist/index.js", "doctor"], {
      cwd: targetDirectory
    });

    expect(doctor.stdout).toContain("Stackkit doctor passed");
  });
});
```

- [ ] **Step 2: Add root smoke script**

In root `package.json`, add:

```json
"smoke": "pnpm build && pnpm --filter @stackkit/test-utils test -- e2e-smoke"
```

- [ ] **Step 3: Run smoke**

Run:

```powershell
pnpm smoke
```

Expected: PASS.

Checkpoint note: built CLI works from Node.

- [ ] **Step 4: Run generated project command checks where practical**

After the smoke test passes, run these commands against a generated foundation project:

```powershell
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("stackkit-generated-" + [Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force $tmp | Out-Null
$config = Join-Path $tmp "stackkit.config.json"
@'
{
  "projectName": "generated-foundation",
  "modules": ["workspace/pnpm-turbo", "workspace/typescript"],
  "ai": { "skillTargets": ["codex"] }
}
'@ | Set-Content -Path $config -Encoding UTF8
node packages/cli/dist/index.js create --config $config --dir (Join-Path $tmp "generated-foundation")
Push-Location (Join-Path $tmp "generated-foundation")
pnpm install --lockfile-only
node C:/Users/berka/Project/my-monorepo/packages/cli/dist/index.js doctor
Pop-Location
```

Expected: create succeeds, `pnpm install --lockfile-only` succeeds, and doctor passes.

For Docker-enabled generated projects, run this only when Docker Compose is available:

```powershell
docker compose config
```

Expected: Docker Compose validates the generated compose file.

---

## Milestone 15: Final Verification

### Task 20: Run Full Verification And Clean Generated Build Artifacts

**Files:**
- No source changes unless verification finds bugs.

- [ ] **Step 1: Run full tests**

Run:

```powershell
pnpm test
```

Expected: PASS.

- [ ] **Step 2: Run build**

Run:

```powershell
pnpm build
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

Run:

```powershell
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Run smoke**

Run:

```powershell
pnpm smoke
```

Expected: PASS.

- [ ] **Step 5: Inspect generated artifacts**

Run:

```powershell
Get-ChildItem -Path packages -Recurse -Include dist,*.tsbuildinfo
```

Expected: shows only generated build output. If generated output should not remain in the working tree, remove it with a guarded PowerShell command that resolves paths under `C:/Users/berka/Project/my-monorepo/packages`.

- [ ] **Step 6: Report status**

Report:

- Tests run and results.
- Files changed.
- Any skipped checks.
- Any remaining product gaps.
- Whether generated build artifacts were cleaned.

Do not claim completion unless all required verification commands pass or the user explicitly accepts a documented limitation.

---

## Plan Self-Review

Spec coverage:

- Full CLI lifecycle is covered by Milestones 8, 10, 11, and 12, including apply paths for create, add, remove, migrate, update, skills sync, and skills update.
- Config-driven and interactive create are covered by Milestones 5 and 9. Config-driven create writes by default and dry-run is opt-in.
- File planning, ownership, hashes, and conflict detection are covered by Milestone 4.
- Manifest and skills lock behavior are covered by Milestone 6.
- AI skills install, sync, update, local fallback, and failure recording are covered by Milestones 6 and 12.
- Built-in modules and representative templates are covered by Milestone 7.
- Public docs and open-source readiness are covered by Milestone 13.
- Examples and verification are covered by Milestones 14 and 15, including generated-project smoke checks and doctor validation.

Placeholder scan:

- No task depends on an unnamed future function without defining it in that task.
- No task instructs the implementer to add unspecified validation or unspecified tests.
- Broad module output is intentionally phased: representative file-generating modules land first, and the remaining module set is added declaratively with local guidance when a module has no concrete file output in the current registry.

Type consistency:

- `CreatePlan`, `FilePlan`, `SkillsLock`, `DoctorResult`, and lifecycle plan names are used consistently across tasks.
- CLI commands delegate to core functions introduced earlier in the plan.
- Registry stays declarative and does not write to disk.
