export type {
  AiSkillDependency,
  AiSkillAgent,
  AiSkillRegistryEntry,
  AiSkillLinkMode,
  AiSkillMode,
  AiSkillTarget,
  AiSkillTrust,
  DoctorCheck,
  DoctorResult,
  EnvVarDefinition,
  LifecycleHook,
  ModuleId,
  ModuleMigration,
  NativeInitializer,
  NativeInitializerArg,
  NativeInitializerMutationPolicy,
  NativeInitializerPhase,
  PackageChange,
  PackageManager,
  ReadmeMetadata,
  StackkitConfig,
  StackkitManifest,
  StackkitManifestSource,
  StackkitModule,
  StackkitModuleInput,
  StackkitPreset,
  StackkitPresetInput,
  StackkitRegistry,
  StackkitRecipe,
  StackkitRecipeInput,
  SupportLevel,
  SupportMetadata,
  SkippedInitializer,
  TaskDefinition
} from "@berkayorhan/stackkit-schemas";

export { hashContent } from "./fs-utils.js";

export type {
  PackageManagerName,
  PackageManagerAdapter,
  CommandResult,
  ResolvedSpawnCommand,
  RunCommand
} from "./package-manager.js";
export { getPackageManagerAdapter, resolveSpawnCommand } from "./package-manager.js";

export { encodeRecipe, decodeRecipe } from "./recipe.js";
export type {
  InspectRecipeOptions,
  RecipeInspectView
} from "./recipe.js";
export { inspectRecipe } from "./recipe.js";

export { defineModule, definePreset, loadProjectRegistries } from "./registry.js";

export type {
  ToolingLanguage,
  ToolingSlot,
  ToolingToolSpec
} from "./tooling.js";
export {
  buildQualityModules,
  toolingCatalog,
  slotCapability,
  languageCapability
} from "./tooling.js";

export type { ComposeReadmeInput } from "./readme.js";
export { composeReadme } from "./readme.js";

export type {
  AiSkillInstallCommand,
  InstallAiSkillsOptions,
  InstallAiSkillsResult,
  ResolveAiSkillOptions,
  WriteLocalAiGuidanceInput
} from "./skills.js";
export {
  defineSkillSource,
  resolveAiSkills,
  resolveAiSkillTargets,
  planAiSkillInstallCommands,
  installAiSkills,
  planSkillSyncCommands,
  applySkillSync,
  planSkillUpdateCommands,
  applySkillUpdate,
  mergeSkillDependencies,
  writeLocalAiGuidance
} from "./skills.js";

export type {
  ResolveModuleGraphOptions,
  StackAxes,
  ValidateConfigResult
} from "./module-graph.js";

export type { AssertCreateSupportInput } from "./support.js";
export { assertCreateSupport, isPubliclySelectable } from "./support.js";
export {
  validateProjectSlug,
  resolveModuleAlias,
  resolveStackAxes,
  resolveModuleGraph,
  validateStackkitConfig
} from "./module-graph.js";

export type {
  FileOverwritePolicy,
  PlannedFile,
  FilePlan,
  FileConflict,
  ManifestFileRecord,
  ApplyFilePlanOptions
} from "./file-plan.js";
export { buildFilePlan, detectFileConflicts, applyFilePlan, applyFilePlanUnchecked } from "./file-plan.js";

export {
  createManifest,
  writeManifest,
  readManifest,
  writeSkillsLock,
  readOptionalSkillsLock,
  readSkillsLock
} from "./manifest.js";

export { runDoctor } from "./doctor.js";

export { planPackageChangeFiles, applyPackageChanges } from "./package-files.js";

export type {
  CreatePlan,
  CreatePlanInput,
  ApplyCreatePlanOptions,
  ApplyCreatePlanResult,
  CreateApplyPhase,
  CreateApplyState,
  ResumeCreatePlanOptions,
  PlannedNativeInitializer
} from "./create.js";
export {
  createCreatePlan,
  applyCreatePlan,
  resumeCreatePlan,
  readCreateApplyState,
  computeCreatePlanHash,
  createApplyPhases,
  buildCreateFilePlan,
  renderCreateFiles,
  planEnvExampleFiles,
  applyEnvExamples
} from "./create.js";

export type {
  AddModulesPlan,
  RemoveModulesPlan,
  ApplyAddModulesInput,
  ApplyRemoveModulesInput,
  ModuleUpdatePlan,
  ModuleMigrationPlan
} from "./lifecycle.js";
export {
  planAddModules,
  planRemoveModules,
  readCurrentManagedFileHashes,
  applyAddModules,
  applyRemoveModules,
  planModuleUpdates,
  planModuleMigrations,
  applyAutomaticMigrations,
  applyModuleUpdates,
  planAddModuleFiles,
  runLifecycleHooks
} from "./lifecycle.js";

export type {
  FileDiffPart,
  FileContentDiff,
  ManagedFileDiff
} from "./diff.js";
export { createFileContentDiff, diffManagedFile } from "./diff.js";

export type {
  StackkitInfo,
  ModuleDiscoveryEntry,
  ModuleDiscoveryOptions
} from "./discovery.js";
export type {
  CustomizerCatalogChoice,
  CustomizerCatalog
} from "./customizer.js";
export {
  listStackkitModules,
  searchStackkitModules,
  inspectStackkitModule,
  collectInfo
} from "./discovery.js";
export { buildCustomizerCatalog } from "./customizer.js";
