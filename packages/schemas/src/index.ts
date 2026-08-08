import { z } from "zod";

export const moduleIdSchema = z.string().min(1);
export const semverSchema = z.string().min(1);
export const projectSlugSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, "Use a lowercase slug such as acme-dashboard");

export const aiSkillTrustSchema = z.enum(["official", "curated", "local", "unresolved"]);
export const aiSkillAgentSchema = z.enum(["codex", "claude-code"]);
export const aiSkillModeSchema = z.enum(["install", "plan", "skip"]);
export const aiSkillLinkModeSchema = z.enum(["copy", "symlink"]);
export const packageManagerSchema = z.enum(["pnpm", "npm", "yarn", "bun"]);
export const supportLevelSchema = z.enum(["supported", "preview", "planned"]);
export const supportMetadataSchema = z
  .object({
    level: supportLevelSchema,
    reason: z.string().min(1).optional(),
    verifiedAt: z.string().min(1).optional(),
    verificationProfile: z.string().min(1).optional()
  })
  .default({ level: "planned" });

export const aiSkillTargetSchema = z.object({
  agent: aiSkillAgentSchema,
  directory: z.enum([".agents", ".claude"]),
  enabled: z.boolean()
});

export const aiSkillDependencySchema = z.object({
  source: z.string().url().optional(),
  skills: z.array(z.string().min(1)).min(1),
  trust: aiSkillTrustSchema,
  causedBy: moduleIdSchema,
  reason: z.string().min(1),
  installCount: z.number().int().nonnegative().optional(),
  repoStars: z.number().int().nonnegative().optional(),
  verifiedAt: z.string().optional(),
  optional: z.boolean().optional()
});

export const fileOverwritePolicySchema = z.enum(["never", "if-owned", "always"]);

export const fileOperationSchema = z.object({
  kind: z.enum(["write", "delete"]),
  path: z.string().min(1),
  owner: moduleIdSchema,
  content: z.string().optional(),
  mode: z.number().int().optional(),
  overwrite: fileOverwritePolicySchema.default("if-owned")
});

const packageJsonFieldsSchema = z.record(z.string(), z.string());

export const packageChangeSchema = z.object({
  packagePath: z.string().min(1),
  scripts: packageJsonFieldsSchema.default({}),
  dependencies: packageJsonFieldsSchema.default({}),
  devDependencies: packageJsonFieldsSchema.default({}),
  peerDependencies: packageJsonFieldsSchema.default({}),
  optionalDependencies: packageJsonFieldsSchema.default({})
});

export const envVarDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  required: z.boolean().default(true),
  example: z.string().optional(),
  target: z.enum(["root", "web", "api", "db"]).default("root")
});

const readmeCommandSchema = z.object({
  label: z.string().min(1),
  command: z.string().min(1)
});

export const readmeMetadataSchema = z.object({
  stack: z.array(z.string().min(1)).default([]),
  layout: z
    .array(
      z.object({
        path: z.string().min(1),
        description: z.string().min(1)
      })
    )
    .default([]),
  prerequisites: z.array(z.string().min(1)).default([]),
  installCommands: z.array(readmeCommandSchema).default([]),
  devCommands: z.array(readmeCommandSchema).default([]),
  verificationCommands: z.array(readmeCommandSchema).default([]),
  commands: z.array(readmeCommandSchema).default([]),
  stackkit: z.array(z.string().min(1)).default([])
});

export const taskDefinitionSchema = z.object({
  name: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  cwd: z.string().min(1).optional()
});

export const lifecycleHookSchema = taskDefinitionSchema;

export const nativeInitializerPhaseSchema = z.enum(["root-scaffold", "app-scaffold", "integration", "tool-config"]);
export const nativeInitializerMutationPolicySchema = z.enum([
  "generated-subtree",
  "known-files",
  "merge-owned",
  "external-state"
]);
export const nativeInitializerToolSchema = z.discriminatedUnion("execution", [
  z.object({
    execution: z.literal("package-manager-dlx"),
    package: z.string().min(1)
  }),
  z.object({
    execution: z.literal("direct"),
    command: z.string().min(1)
  }),
  z.object({
    execution: z.literal("system"),
    command: z.string().min(1)
  })
]);
export const nativeInitializerArgSchema = z.union([
  z.string(),
  z.object({
    token: z.enum(["project-name", "target-directory-name", "package-manager", "web-framework"]),
    values: z.record(z.string(), z.string()).optional()
  })
]);
export const nativeInitializerWhenSchema = z.object({
  allModules: z.array(moduleIdSchema).optional(),
  anyModules: z.array(moduleIdSchema).optional(),
  capabilities: z.array(z.string().min(1)).optional()
});
export const nativeInitializerSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean().default(true),
  disabledReason: z.string().min(1).optional(),
  phase: nativeInitializerPhaseSchema,
  tool: nativeInitializerToolSchema,
  args: z.array(nativeInitializerArgSchema).default([]),
  cwd: z.string().min(1).default("."),
  when: nativeInitializerWhenSchema.optional(),
  mutationPolicy: nativeInitializerMutationPolicySchema,
  // Advisory reporting metadata for initializer output. May contain glob patterns.
  expectedFiles: z.array(z.string().min(1)).default([]),
  // Advisory redaction metadata for initializer output. May contain glob patterns.
  redactExpectedFiles: z.array(z.string().min(1)).default([])
});

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

export const moduleMigrationSchema = z.object({
  from: z.string().min(1),
  to: semverSchema,
  title: z.string().min(1),
  operations: z.array(migrationOperationSchema).default([]),
  safety: z.enum(["automatic", "review-required", "manual"])
});

export const moduleRemovalPolicySchema = z.object({
  mode: z.enum(["managed-files-only", "manual", "blocked"]),
  retainedData: z.array(z.string().min(1)),
  manualCleanup: z.array(z.string().min(1))
});

export const stackkitModuleSchema = z.object({
  id: moduleIdSchema,
  version: semverSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  support: supportMetadataSchema,
  removalPolicy: moduleRemovalPolicySchema.default({
    mode: "managed-files-only",
    retainedData: [],
    manualCleanup: []
  }),
  aliases: z.array(z.string().min(1)).default([]),
  category: z.string().min(1).optional(),
  icon: z.string().min(1).optional(),
  requires: z.array(z.string().min(1)).optional(),
  provides: z.array(z.string().min(1)).optional(),
  conflicts: z.array(moduleIdSchema).optional(),
  prompts: z.array(z.unknown()).optional(),
  files: z.array(fileOperationSchema).optional(),
  packageChanges: z.array(packageChangeSchema).optional(),
  envVars: z.array(envVarDefinitionSchema).optional(),
  readme: readmeMetadataSchema.optional(),
  tasks: z.array(taskDefinitionSchema).optional(),
  postCreate: z.array(lifecycleHookSchema).optional(),
  postAdd: z.array(lifecycleHookSchema).optional(),
  nativeInitializers: z.array(nativeInitializerSchema).optional(),
  migrations: z.array(moduleMigrationSchema).optional(),
  aiSkills: z.array(aiSkillDependencySchema).optional(),
  validate: z.array(moduleValidationSchema).optional()
});

export const manifestExpectedFileSchema = z.object({
  path: z.string().min(1),
  owner: moduleIdSchema,
  content: z.string(),
  hash: z.string().min(1)
});

export const skippedInitializerSchema = z.object({
  name: z.string().min(1),
  moduleId: moduleIdSchema,
  mutationPolicy: nativeInitializerMutationPolicySchema,
  reason: z.string().min(1)
});

export const stackkitPresetSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  support: supportMetadataSchema,
  modules: z.array(moduleIdSchema).min(1)
});

export const stackkitRegistrySchema = z.object({
  schemaVersion: z.literal(1),
  namespace: z.string().min(1),
  name: z.string().min(1),
  modules: z.array(stackkitModuleSchema).default([]),
  presets: z.array(stackkitPresetSchema).default([])
});

export const aiSkillRegistryEntrySchema = z.object({
  module: moduleIdSchema,
  aiSkills: z.array(aiSkillDependencySchema).min(1)
});

export const stackkitConfigSchema = z.object({
  projectName: projectSlugSchema,
  preset: z.string().min(1).optional(),
  packageManager: packageManagerSchema.default("pnpm"),
  workspace: z.literal("pnpm-turbo").default("pnpm-turbo"),
  modules: z.array(moduleIdSchema).default([]),
  registries: z.record(z.string(), z.string()).default({}),
  options: z.record(moduleIdSchema, z.record(z.string(), z.unknown())).optional(),
  ai: z
    .object({
      skillTargets: z.array(aiSkillAgentSchema).default(["codex"]),
      skillMode: aiSkillModeSchema.default("install"),
      linkMode: aiSkillLinkModeSchema.default("copy")
    })
    .default({ skillTargets: ["codex"], skillMode: "install", linkMode: "copy" })
});

export const aiConfigSchema = stackkitConfigSchema.shape.ai;

export const stackkitRecipeSchema = z.object({
  schemaVersion: z.literal(1),
  preset: z.string().min(1).optional(),
  packageManager: packageManagerSchema.default("pnpm"),
  modules: z.array(moduleIdSchema).default([]),
  options: z.record(moduleIdSchema, z.record(z.string(), z.unknown())).default({}),
  ai: aiConfigSchema
});

export const stackkitManifestSourceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("config"),
    path: z.string().min(1)
  }),
  z.object({
    kind: z.literal("scripted")
  }),
  z.object({
    kind: z.literal("recipe"),
    code: z.string().min(1)
  }),
  z.object({
    kind: z.literal("interactive")
  })
]);

export const createApplyPhaseSchema = z.enum([
  "planned",
  "deterministic-files",
  "initializers",
  "skills",
  "manifest",
  "verification"
]);

export const createApplyPhaseStateSchema = z.object({
  status: z.enum(["pending", "running", "completed", "failed"]),
  completedAt: z.string().min(1).optional(),
  error: z.string().min(1).optional()
});

export const createApplyStateSchema = z
  .object({
    schemaVersion: z.literal(1),
    operation: z.literal("create"),
    planHash: z.string().min(1),
    projectDirectory: z.string().min(1),
    startedAt: z.string().min(1),
    updatedAt: z.string().min(1),
    plan: z.record(z.string(), z.unknown()),
    selectedModules: z.array(stackkitModuleSchema),
    phases: z.record(createApplyPhaseSchema, createApplyPhaseStateSchema)
  })
  .passthrough();

export const stackkitManifestSchema = z.object({
  schemaVersion: z.literal(1),
  stackkitVersion: z.string().min(1),
  projectName: projectSlugSchema,
  packageManager: packageManagerSchema.default("pnpm"),
  source: stackkitManifestSourceSchema.default({ kind: "config", path: "stackkit.config.json" }),
  paths: z.record(z.string(), z.string()).default({ root: "." }),
  createdAt: z.string().min(1),
  planHash: z.string().min(1).optional(),
  modules: z.array(
    z.object({
      id: moduleIdSchema,
      version: semverSchema,
      options: z.record(z.string(), z.unknown()).default({}),
      snapshot: stackkitModuleSchema.optional()
    })
  ),
  files: z.array(
    z.object({
      path: z.string().min(1),
      owner: moduleIdSchema,
      hash: z.string().min(1)
    })
  ),
  expectedFiles: z.array(manifestExpectedFileSchema).default([]),
  skippedInitializers: z.array(skippedInitializerSchema).default([]),
  aiSkills: z.object({
    mode: aiSkillModeSchema.default("install"),
    linkMode: aiSkillLinkModeSchema.default("copy"),
    targets: z.array(aiSkillTargetSchema).default([{ agent: "codex", directory: ".agents", enabled: true }]),
    installed: z.array(aiSkillDependencySchema),
    planned: z.array(aiSkillDependencySchema).default([]),
    local: z.array(aiSkillDependencySchema).default([]),
    unresolved: z.array(aiSkillDependencySchema)
  }),
  migrations: z.object({
    applied: z.array(z.unknown())
  })
});

export const skillsLockSchema = z.object({
  schemaVersion: z.literal(1),
  mode: aiSkillModeSchema.default("install"),
  linkMode: aiSkillLinkModeSchema.default("copy"),
  targets: z.array(aiSkillTargetSchema),
  installed: z.array(aiSkillDependencySchema),
  planned: z.array(aiSkillDependencySchema).default([]),
  local: z.array(aiSkillDependencySchema),
  unresolved: z.array(aiSkillDependencySchema)
});

export const doctorCheckSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["ok", "warning", "error"]),
  message: z.string().min(1),
  actions: z.array(z.string().min(1)).default([])
});

export const doctorResultSchema = z.object({
  ok: z.boolean(),
  checks: z.array(doctorCheckSchema)
});

export type ModuleId = z.infer<typeof moduleIdSchema>;
export type SemVer = z.infer<typeof semverSchema>;
export type AiSkillTrust = z.infer<typeof aiSkillTrustSchema>;
export type AiSkillAgent = z.infer<typeof aiSkillAgentSchema>;
export type AiSkillMode = z.infer<typeof aiSkillModeSchema>;
export type AiSkillLinkMode = z.infer<typeof aiSkillLinkModeSchema>;
export type PackageManager = z.infer<typeof packageManagerSchema>;
export type SupportLevel = z.infer<typeof supportLevelSchema>;
export type SupportMetadata = z.infer<typeof supportMetadataSchema>;
export type ModuleRemovalPolicy = z.infer<typeof moduleRemovalPolicySchema>;
export type AiSkillTarget = z.infer<typeof aiSkillTargetSchema>;
export type AiSkillDependency = z.infer<typeof aiSkillDependencySchema>;
export type FileOverwritePolicy = z.infer<typeof fileOverwritePolicySchema>;
export type FileOperation = z.infer<typeof fileOperationSchema>;
export type PackageChange = z.infer<typeof packageChangeSchema>;
export type EnvVarDefinition = z.input<typeof envVarDefinitionSchema>;
export type ReadmeMetadata = z.infer<typeof readmeMetadataSchema>;
export type TaskDefinition = z.infer<typeof taskDefinitionSchema>;
export type LifecycleHook = z.infer<typeof lifecycleHookSchema>;
export type NativeInitializer = z.infer<typeof nativeInitializerSchema>;
export type NativeInitializerInput = z.input<typeof nativeInitializerSchema>;
export type NativeInitializerArg = z.infer<typeof nativeInitializerArgSchema>;
export type NativeInitializerMutationPolicy = z.infer<typeof nativeInitializerMutationPolicySchema>;
export type NativeInitializerPhase = z.infer<typeof nativeInitializerPhaseSchema>;
export type ModuleValidation = z.infer<typeof moduleValidationSchema>;
export type MigrationOperation = z.infer<typeof migrationOperationSchema>;
export type AiSkillRegistryEntry = z.infer<typeof aiSkillRegistryEntrySchema>;
export type ModuleMigration = z.infer<typeof moduleMigrationSchema>;
export type StackkitModuleInput = z.input<typeof stackkitModuleSchema>;
export type StackkitPresetInput = z.input<typeof stackkitPresetSchema>;
export type StackkitModule = z.infer<typeof stackkitModuleSchema>;
export type ManifestExpectedFile = z.infer<typeof manifestExpectedFileSchema>;
export type SkippedInitializer = z.infer<typeof skippedInitializerSchema>;
export type StackkitPreset = z.infer<typeof stackkitPresetSchema>;
export type StackkitRegistry = z.infer<typeof stackkitRegistrySchema>;
export type StackkitConfig = z.infer<typeof stackkitConfigSchema>;
export type StackkitRecipeInput = z.input<typeof stackkitRecipeSchema>;
export type StackkitRecipe = z.infer<typeof stackkitRecipeSchema>;
export type StackkitManifestSource = z.infer<typeof stackkitManifestSourceSchema>;
export type StackkitManifest = z.infer<typeof stackkitManifestSchema>;
export type CreateApplyPhase = z.infer<typeof createApplyPhaseSchema>;
export type CreateApplyState = z.infer<typeof createApplyStateSchema>;
export type SkillsLock = z.infer<typeof skillsLockSchema>;
export type DoctorCheck = z.infer<typeof doctorCheckSchema>;
export type DoctorResult = z.infer<typeof doctorResultSchema>;

/**
 * Canonical constructor for a validated {@link StackkitModule}. A thin `schema.parse` wrapper that
 * lives here (the contract base) so every package — schemas, registry, core — shares one
 * implementation instead of re-deriving it. Re-exported from core for back-compat.
 */
export function defineModule(module: StackkitModuleInput): StackkitModule {
  return stackkitModuleSchema.parse(module);
}

/** Canonical constructor for a validated {@link StackkitPreset}. See {@link defineModule}. */
export function definePreset(preset: StackkitPresetInput): StackkitPreset {
  return stackkitPresetSchema.parse(preset);
}
