import { z } from "zod";

export const moduleIdSchema = z.string().min(1);
export const semverSchema = z.string().min(1);

export const aiSkillTrustSchema = z.enum(["official", "curated", "local", "unresolved"]);

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

export const moduleMigrationSchema = z.object({
  from: z.string().min(1),
  to: semverSchema,
  title: z.string().min(1),
  operations: z.array(z.unknown()).default([]),
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
  files: z.array(z.unknown()).optional(),
  packageChanges: z.array(z.unknown()).optional(),
  envVars: z.array(z.unknown()).optional(),
  tasks: z.array(z.unknown()).optional(),
  postCreate: z.array(z.unknown()).optional(),
  postAdd: z.array(z.unknown()).optional(),
  migrations: z.array(moduleMigrationSchema).optional(),
  aiSkills: z.array(aiSkillDependencySchema).optional(),
  validate: z.array(z.unknown()).optional()
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
  packageManager: z.literal("pnpm").default("pnpm"),
  workspace: z.literal("pnpm-turbo").default("pnpm-turbo"),
  modules: z.array(moduleIdSchema).default([]),
  options: z.record(moduleIdSchema, z.record(z.string(), z.unknown())).optional()
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
    installed: z.array(aiSkillDependencySchema),
    unresolved: z.array(aiSkillDependencySchema)
  }),
  migrations: z.object({
    applied: z.array(z.unknown())
  })
});

export type ModuleId = z.infer<typeof moduleIdSchema>;
export type SemVer = z.infer<typeof semverSchema>;
export type AiSkillTrust = z.infer<typeof aiSkillTrustSchema>;
export type AiSkillDependency = z.infer<typeof aiSkillDependencySchema>;
export type AiSkillRegistryEntry = z.infer<typeof aiSkillRegistryEntrySchema>;
export type ModuleMigration = z.infer<typeof moduleMigrationSchema>;
export type StackkitModule = z.infer<typeof stackkitModuleSchema>;
export type StackkitPreset = z.infer<typeof stackkitPresetSchema>;
export type StackkitConfig = z.infer<typeof stackkitConfigSchema>;
export type StackkitManifest = z.infer<typeof stackkitManifestSchema>;
