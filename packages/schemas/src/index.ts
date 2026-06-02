import { z } from "zod";

export const moduleIdSchema = z.string().min(1);
export const semverSchema = z.string().min(1);

export const aiSkillTrustSchema = z.enum(["official", "curated", "local", "unresolved"]);
export const aiSkillAgentSchema = z.enum(["codex", "claude-code"]);

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
  example: z.string().optional()
});

export const taskDefinitionSchema = z.object({
  name: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  cwd: z.string().min(1).optional()
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

export const moduleMigrationSchema = z.object({
  from: z.string().min(1),
  to: semverSchema,
  title: z.string().min(1),
  operations: z.array(migrationOperationSchema).default([]),
  safety: z.enum(["automatic", "review-required", "manual"])
});

export const stackkitModuleSchema = z.object({
  id: moduleIdSchema,
  version: semverSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  requires: z.array(z.string().min(1)).optional(),
  provides: z.array(z.string().min(1)).optional(),
  conflicts: z.array(moduleIdSchema).optional(),
  prompts: z.array(z.unknown()).optional(),
  files: z.array(fileOperationSchema).optional(),
  packageChanges: z.array(packageChangeSchema).optional(),
  envVars: z.array(envVarDefinitionSchema).optional(),
  tasks: z.array(taskDefinitionSchema).optional(),
  postCreate: z.array(lifecycleHookSchema).optional(),
  postAdd: z.array(lifecycleHookSchema).optional(),
  migrations: z.array(moduleMigrationSchema).optional(),
  aiSkills: z.array(aiSkillDependencySchema).optional(),
  validate: z.array(moduleValidationSchema).optional()
});

export const stackkitPresetSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  modules: z.array(moduleIdSchema).min(1)
});

export const aiSkillRegistryEntrySchema = z.object({
  module: moduleIdSchema,
  aiSkills: z.array(aiSkillDependencySchema).min(1)
});

export const stackkitConfigSchema = z.object({
  projectName: z.string().min(1),
  preset: z.string().min(1).optional(),
  packageManager: z.literal("pnpm").default("pnpm"),
  workspace: z.literal("pnpm-turbo").default("pnpm-turbo"),
  modules: z.array(moduleIdSchema).default([]),
  options: z.record(moduleIdSchema, z.record(z.string(), z.unknown())).optional(),
  ai: z
    .object({
      skillTargets: z.array(aiSkillAgentSchema).default(["codex"])
    })
    .default({ skillTargets: ["codex"] })
});

export const stackkitManifestSchema = z.object({
  schemaVersion: z.literal(1),
  stackkitVersion: z.string().min(1),
  projectName: z.string().min(1),
  createdAt: z.string().min(1),
  modules: z.array(
    z.object({
      id: moduleIdSchema,
      version: semverSchema,
      options: z.record(z.string(), z.unknown()).default({})
    })
  ),
  files: z.array(
    z.object({
      path: z.string().min(1),
      owner: moduleIdSchema,
      hash: z.string().min(1)
    })
  ),
  aiSkills: z.object({
    targets: z.array(aiSkillTargetSchema).default([{ agent: "codex", directory: ".agents", enabled: true }]),
    installed: z.array(aiSkillDependencySchema),
    unresolved: z.array(aiSkillDependencySchema)
  }),
  migrations: z.object({
    applied: z.array(z.unknown())
  })
});

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

export type ModuleId = z.infer<typeof moduleIdSchema>;
export type SemVer = z.infer<typeof semverSchema>;
export type AiSkillTrust = z.infer<typeof aiSkillTrustSchema>;
export type AiSkillAgent = z.infer<typeof aiSkillAgentSchema>;
export type AiSkillTarget = z.infer<typeof aiSkillTargetSchema>;
export type AiSkillDependency = z.infer<typeof aiSkillDependencySchema>;
export type FileOverwritePolicy = z.infer<typeof fileOverwritePolicySchema>;
export type FileOperation = z.infer<typeof fileOperationSchema>;
export type PackageChange = z.infer<typeof packageChangeSchema>;
export type EnvVarDefinition = z.infer<typeof envVarDefinitionSchema>;
export type TaskDefinition = z.infer<typeof taskDefinitionSchema>;
export type LifecycleHook = z.infer<typeof lifecycleHookSchema>;
export type ModuleValidation = z.infer<typeof moduleValidationSchema>;
export type MigrationOperation = z.infer<typeof migrationOperationSchema>;
export type AiSkillRegistryEntry = z.infer<typeof aiSkillRegistryEntrySchema>;
export type ModuleMigration = z.infer<typeof moduleMigrationSchema>;
export type StackkitModule = z.infer<typeof stackkitModuleSchema>;
export type StackkitPreset = z.infer<typeof stackkitPresetSchema>;
export type StackkitConfig = z.infer<typeof stackkitConfigSchema>;
export type StackkitManifest = z.infer<typeof stackkitManifestSchema>;
export type SkillsLock = z.infer<typeof skillsLockSchema>;
export type DoctorCheck = z.infer<typeof doctorCheckSchema>;
export type DoctorResult = z.infer<typeof doctorResultSchema>;
