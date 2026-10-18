#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join, relative, resolve, win32 } from "node:path";
import { fileURLToPath } from "node:url";

import { Command } from "commander";

import {
  applyAddModules,
  applyAutomaticMigrations,
  applyCreatePlan,
  applyModuleUpdates,
  applyRemoveModules,
  createPresetRecipe,
  createSupportedCreatePlan,
  decodeRecipe,
  encodeRecipe,
  getPackageManagerAdapter,
  recipeFromConfig,
  resolveCreateConfig,
  planAddModules,
  planModuleMigrations,
  planRemoveModules,
  planUpdateModules,
  planSkillSyncCommands,
  applySkillSync,
  planSkillUpdateCommands,
  applySkillUpdate,
  isRetriableUnresolvedSkill,
  collectInfo,
  createFileContentDiff,
  diffManagedFile,
  readManifest,
  readSkillsLock,
  resumeCreatePlan,
  inspectRecipe,
  inspectStackkitModule,
  isPubliclySelectable,
  listStackkitModules,
  loadProjectRegistries,
  resolveInstalledModuleId,
  resolveSpawnCommand,
  runDoctor,
  searchStackkitModules,
  validateStackkitConfig,
  validateProjectSlug,
  writeSkillsLock,
  type AddModulesPlan,
  type AiSkillInstallCommand,
  type ApplyCreatePlanResult,
  type CreateAxesInput,
  type CreatePlan,
  type DoctorCheck,
  type FileContentDiff,
  type FilePlan,
  type LifecycleFileChanges,
  type ManagedFileDiff,
  type ModuleDiscoveryEntry,
  type ModuleMigrationPlan,
  type ModuleUpdatePlan,
  type RemoveModulesPlan,
  type UpdateModulesPlan,
  type RunCommand,
  type StackkitManifest,
  type StackkitInfo,
  type RecipeInspectView,
  type StackkitModule,
  type StackkitRegistry,
  type StackkitRecipe
} from "@berkayorhan/stackkit-core";
import {
  builtinModules,
  builtinPresets,
  builtinRegistry,
  curatedSkillSourceAllowlist,
  defaultPresetId
} from "@berkayorhan/stackkit-registry";
import { stackkitConfigSchema, type AiSkillAgent, type AiSkillDependency, type StackkitConfig } from "@berkayorhan/stackkit-schemas";

export type CreateDryRunPlan = CreatePlan;

export const stackkitVersion = String(
  (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version
);

export type StackkitProgramOptions = {
  runCommand?: RunCommand;
  /** Modules the lifecycle commands (add, remove, update, migrate, diff) resolve against. Defaults to the built-in registry. */
  availableModules?: readonly StackkitModule[];
};

export type InteractiveAnswers = {
  projectName: string;
  preset: string;
  aiTargets: AiSkillAgent[];
};

export function buildConfigFromInteractiveAnswers(answers: InteractiveAnswers): StackkitConfig {
  return stackkitConfigSchema.parse({
    projectName: answers.projectName,
    packageManager: "pnpm",
    workspace: "pnpm-turbo",
    preset: answers.preset,
    modules: [],
    ai: {
      skillTargets: answers.aiTargets
    }
  });
}

export function createStackkitProgram(programOptions: StackkitProgramOptions = {}): Command {
  const runCommand = programOptions.runCommand ?? runLocalCommand;
  const lifecycleModules = programOptions.availableModules ?? builtinModules;
  const program = new Command()
    .name("stackkit")
    .description("Generate and maintain Stackkit-managed monorepos")
    .version(stackkitVersion);

  program
    .command("create [name]")
    .description("Create a new Stackkit-managed monorepo")
    .option("-c, --config <path>", "Path to a Stackkit config file")
    .option("--preset <id>", "Preset to use for scripted create")
    .option("--pm <manager>", "Package manager to use. (pnpm, npm, yarn, bun)")
    .option("--package-manager <manager>", "Package manager to use. (pnpm, npm, yarn, bun)")
    .option("--ai <targets>", "AI skill targets. Comma-separated: codex,claude-code")
    .option("--skills <mode>", "AI skill mode. (install, plan, skip)")
    .option("--skill-link <mode>", "AI skill link mode. (copy, symlink)")
    .option("--web <alias>", "Web framework alias")
    .option("--ui <alias>", "UI layer alias. (shadcn, none)")
    .option("--api <alias>", "API framework alias")
    .option("--db <alias>", "Database alias")
    .option("--db-client <alias>", "Database client alias")
    .option("--db-provider <alias>", "Postgres host/provider. (neon, supabase, supabase-local, postgres-local)")
    .option("--db-runtime <mode>", "Database client runtime. (node, edge) — edge requires Drizzle, typically with Neon")
    .option("--auth <alias>", "Auth provider alias")
    .option("--ts-quality <choice>", "TypeScript lint+format toolchain. (eslint-prettier, biome)")
    .option("--py-typecheck <choice>", "Python type checker. (mypy, pyright)")
    .option("--with <aliases>", "Additional module aliases. Comma-separated")
    .option("--deploy <aliases>", "Deployment target aliases. Comma-separated")
    .option("--recipe <code>", "Offline Stackkit recipe code")
    .option("--dry-run", "Print the create plan without writing files")
    .option("--allow-external-state", "Allow native initializers that mutate external state")
    .option("--include-preview", "Allow preview presets and modules")
    .option("--view <path>", "Print one planned file during --dry-run")
    .option("--diff", "Print file-oriented planned changes during --dry-run")
    .option("--dir <path>", "Target project directory")
    .option("--resume", "Resume an interrupted create from .stackkit/apply-state.json")
    .option("--retry-initializers", "Retry an incomplete initializer after reviewing partial output")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (name: string | undefined, options: CreateCommandOptions) => {
      if ((options.view || options.diff) && !options.dryRun) {
        throw new Error("--view and --diff require --dry-run");
      }
      if (options.retryInitializers && !options.resume) {
        throw new Error("--retry-initializers requires --resume");
      }

      if (options.resume) {
        if (!options.dir) {
          throw new Error("--resume requires --dir <path>");
        }
        if (name || options.config || options.preset || options.recipe || options.dryRun) {
          throw new Error("--resume cannot be combined with a project name, create source, or --dry-run");
        }

        const result = await resumeCreatePlan({
          projectDirectory: resolve(options.dir),
          stackkitVersion,
          runCommand,
          availableModules: builtinModules,
          availablePresets: builtinPresets,
          curatedSkillSourceAllowlist,
          allowExternalState: options.allowExternalState,
          retryInitializers: options.retryInitializers
        });
        writeCreateResult(program, "Resumed", result);
        return;
      }

      const plan = await createDryRunPlanFromConfig({
        nonInteractive: Object.keys(options).length > 0,
        name,
        configPath: options.config,
        preset: options.preset,
        packageManager: options.packageManager ?? options.pm,
        aiTargets: parseCommaList(options.ai),
        skillMode: options.skills,
        skillLinkMode: options.skillLink,
        axes: {
          web: options.web,
          ui: options.ui,
          api: options.api,
          db: options.db,
          dbClient: options.dbClient,
          dbProvider: options.dbProvider,
          auth: parseCommaList(options.auth),
          tsQuality: options.tsQuality,
          pyTypecheck: options.pyTypecheck,
          with: parseCommaList(options.with),
          deploy: parseCommaList(options.deploy)
        },
        dbRuntime: options.dbRuntime,
        recipeCode: options.recipe,
        allowExternalState: options.allowExternalState,
        includePreview: options.includePreview
      });
      const targetDirectory = options.dir ? resolve(options.dir) : undefined;

      if (options.dryRun) {
        if (options.view) {
          writeProgramOutput(program, formatFileView(plan.filePlan, options.view));
          return;
        }
        if (options.diff) {
          writeProgramOutput(program, await formatFilePlanDiff("Stackkit create diff", plan.projectName, plan.filePlan, targetDirectoryForPlan(plan, targetDirectory)));
          return;
        }

        writeProgramOutput(program, formatCreateDryRunPlan(plan));
        return;
      }

      if (!options.yes) {
        await confirmCreate(plan);
      }

      const result = await applyCreatePlan(plan, {
        parentDirectory: process.cwd(),
        targetDirectory,
        stackkitVersion,
        runCommand,
        allowExternalState: options.allowExternalState
      });
      writeCreateResult(program, "Created", result);
    });

  program
    .command("add <module>")
    .description("Add a module to a managed project")
    .option("--dry-run", "Print the add plan without writing files")
    .option("--view <path>", "Print one planned file during --dry-run")
    .option("--diff", "Print file-oriented planned changes during --dry-run")
    .option("--include-preview", "Allow preview modules")
    .option("--force", "Overwrite managed files that drifted from what Stackkit rendered")
    .option("--dir <path>", "Project directory")
    .action(async (moduleId: string, options: { dryRun?: boolean; view?: string; diff?: boolean; includePreview?: boolean; force?: boolean; dir?: string }) => {
      const projectDirectory = options.dir ? resolve(options.dir) : process.cwd();
      const manifest = await readManifest(projectDirectory);
      const input = {
        projectDirectory,
        manifest,
        moduleIds: [moduleId],
        availableModules: lifecycleModules,
        includePreview: options.includePreview,
        force: options.force
      };

      if (options.dryRun) {
        const plan = await planAddModules(input);
        const filePlan = { files: plan.writes };

        writeProgramOutput(
          program,
          options.view
            ? formatFileView(filePlan, options.view)
            : options.diff
              ? await formatFilePlanDiff("Stackkit add diff", manifest.projectName, filePlan, projectDirectory)
              : formatAddPlan(plan)
        );
        return;
      }

      const result = await applyAddModules({ ...input, curatedSkillSourceAllowlist, runCommand });
      const added = result.plan.modulesToAdd.map((module) => module.id);
      writeProgramOutput(
        program,
        added.length > 0
          ? `Added ${added.join(", ")} to ${result.manifest.projectName}\n`
          : `${moduleId} is already installed in ${result.manifest.projectName}\n`
      );
    });

  program
    .command("remove <module>")
    .description("Safely remove a module from a managed project")
    .option("--dry-run", "Print the remove plan without deleting files")
    .option("--yes", "Confirm the removal and delete owned files")
    .option("--force", "Overwrite or delete managed files that drifted from what Stackkit rendered")
    .option("--dir <path>", "Project directory")
    .action(async (moduleId: string, options: { dryRun?: boolean; yes?: boolean; force?: boolean; dir?: string }) => {
      const projectDirectory = options.dir ? resolve(options.dir) : process.cwd();
      const input = {
        projectDirectory,
        manifest: await readManifest(projectDirectory),
        moduleIds: [moduleId],
        availableModules: lifecycleModules,
        force: options.force
      };

      if (options.dryRun) {
        writeProgramOutput(program, formatRemovePlan(await planRemoveModules(input)));
        return;
      }

      if (!options.yes) {
        throw new Error(`Refusing to remove ${moduleId} without --yes. Re-run with --yes to apply, or use --dry-run to preview.`);
      }

      const result = await applyRemoveModules(input);
      writeProgramOutput(
        program,
        [
          ...formatRemovalAdvisories(result.plan),
          `Removed ${result.plan.modulesToRemove.join(", ")} from ${result.manifest.projectName}`,
          ""
        ].join("\n")
      );
    });

  program
    .command("update [module]")
    .description("Update managed modules")
    .option("--dry-run", "Print the update plan without writing files")
    .option("--apply", "Apply pending module updates and automatic migrations")
    .option("--force", "Overwrite or delete managed files that drifted from what Stackkit rendered")
    .option("--dir <path>", "Project directory")
    .action(async (moduleId: string | undefined, options: { dryRun?: boolean; apply?: boolean; force?: boolean; dir?: string }) => {
      const projectDirectory = options.dir ? resolve(options.dir) : process.cwd();
      const manifest = await readManifest(projectDirectory);
      const input = {
        projectDirectory,
        manifest,
        availableModules: scopeModules(manifest, lifecycleModules, moduleId),
        force: options.force
      };

      if (resolveLifecyclePlanMode(options) === "plan") {
        writeProgramOutput(program, formatUpdatePlan(manifest, await planUpdateModules(input)));
        return;
      }

      const migrationPlan = planModuleMigrations({ manifest, modules: input.availableModules });

      if (migrationPlan.reviewRequired.length > 0 || migrationPlan.manual.length > 0) {
        throw new Error(refuseMigrationMessage(migrationPlan));
      }

      const updated = await applyModuleUpdates(input);

      writeProgramOutput(
        program,
        `Updated ${updated.manifest.projectName}: ${updated.updates.length} module update(s), ${updated.plan.migrations.automatic.length} migration(s) applied\n`
      );
    });

  program
    .command("migrate [module]")
    .description("Apply pending module migrations")
    .option("--dry-run", "Print pending migrations without writing files")
    .option("--apply", "Apply pending automatic migrations")
    .option("--dir <path>", "Project directory")
    .action(async (moduleId: string | undefined, options: { dryRun?: boolean; apply?: boolean; dir?: string }) => {
      const projectDirectory = options.dir ? resolve(options.dir) : process.cwd();
      const manifest = await readManifest(projectDirectory);
      const availableModules = scopeModules(manifest, lifecycleModules, moduleId);
      const migrationPlan = planModuleMigrations({ manifest, modules: availableModules });

      if (resolveLifecyclePlanMode(options) === "plan") {
        writeProgramOutput(program, formatMigratePlan(manifest, migrationPlan));
        return;
      }

      if (migrationPlan.reviewRequired.length > 0 || migrationPlan.manual.length > 0) {
        throw new Error(refuseMigrationMessage(migrationPlan));
      }

      if (migrationPlan.automatic.length === 0) {
        writeProgramOutput(program, `No pending migrations for ${manifest.projectName}\n`);
        return;
      }

      const migrated = await applyAutomaticMigrations({
        projectDirectory,
        manifest,
        modules: availableModules
      });

      writeProgramOutput(
        program,
        `Applied ${migrationPlan.automatic.length} migration(s) to ${migrated.manifest.projectName}\n`
      );
    });

  program
    .command("diff [module]")
    .description("Preview managed changes before applying them")
    .option("--dir <path>", "Project directory")
    .option("--cwd <cwd>", "Project directory")
    .option("--file <path>", "Show a file-oriented diff for one managed file")
    .action(async (moduleId: string | undefined, options: { dir?: string; cwd?: string; file?: string }) => {
      const projectDirectory = projectDirectoryFromOptions(options);

      if (options.file) {
        const diff = await diffManagedFile(projectDirectory, options.file);
        writeProgramOutput(program, formatManagedFileDiff(diff));
        return;
      }

      const manifest = await readManifest(projectDirectory);
      const plan = await planUpdateModules({
        projectDirectory,
        manifest,
        availableModules: scopeModules(manifest, lifecycleModules, moduleId)
      });

      writeProgramOutput(program, formatDiff(manifest, plan));
    });

  program
    .command("doctor")
    .description("Validate project health and Stackkit state")
    .option("--dir <path>", "Project directory")
    .action(async (options: { dir?: string }) => {
      const projectDirectory = options.dir ? resolve(options.dir) : process.cwd();
      const result = await runDoctor(projectDirectory, { runCommand, modules: builtinModules });
      const hasWarnings = result.checks.some((check) => check.status === "warning");
      const summary = !result.ok
        ? "Stackkit doctor found issues"
        : hasWarnings
          ? "Stackkit doctor completed with warnings"
          : "Stackkit doctor passed";
      writeProgramOutput(
        program,
        `${summary}\n${formatDoctorChecks(result.checks)}\n`
      );

      if (!result.ok) {
        process.exitCode = 1;
      }
    });

  program
    .command("info")
    .description("Show Stackkit project information")
    .option("--json", "Output JSON")
    .option("--cwd <cwd>", "Project directory")
    .option("--dir <path>", "Project directory")
    .action(async (options: { json?: boolean; cwd?: string; dir?: string }) => {
      const projectDirectory = projectDirectoryFromOptions(options);
      const info = await collectInfo(projectDirectory);

      writeProgramOutput(program, options.json ? `${JSON.stringify(info, null, 2)}\n` : formatInfo(info));
    });

  const module = program.command("module").description("Inspect Stackkit modules");
  module
    .command("list")
    .description("List available modules")
    .option("--json", "Output JSON")
    .option("--include-preview", "Include preview modules")
    .action((options: { json?: boolean; includePreview?: boolean }) => {
      writeProgramOutput(
        program,
        formatModuleDiscovery(
          listStackkitModules(builtinModules, { includePreview: options.includePreview }),
          options.json
        )
      );
    });
  module
    .command("search <query>")
    .description("Search available modules")
    .option("--json", "Output JSON")
    .option("--include-preview", "Include preview modules")
    .action((query: string, options: { json?: boolean; includePreview?: boolean }) => {
      writeProgramOutput(
        program,
        formatModuleDiscovery(
          searchStackkitModules(query, builtinModules, { includePreview: options.includePreview }),
          options.json
        )
      );
    });
  module
    .command("inspect <module>")
    .description("Inspect a Stackkit module")
    .option("--json", "Output JSON")
    .action((moduleId: string, options: { json?: boolean }) => {
      const entry = inspectStackkitModule(moduleId, builtinModules);

      writeProgramOutput(program, options.json ? `${JSON.stringify(entry, null, 2)}\n` : formatModuleInspect(entry));
    });

  const skills = program.command("skills").description("Manage project-local AI skills");
  skills
    .command("sync")
    .description("Restore AI skills from the recorded skill lock")
    .option("--apply", "Run skill install commands and update skills-lock.json")
    .option("--dir <path>", "Project directory")
    .action(async (options: { apply?: boolean; dir?: string }) => {
      const projectDirectory = options.dir ? resolve(options.dir) : process.cwd();
      const lock = await readSkillsLock(projectDirectory);
      const commands = planSkillSyncCommands(lock);

      if (!options.apply) {
        writeProgramOutput(program, formatSkillCommands("Stackkit skills sync plan", commands));
        return;
      }

      const { lock: updated, failed } = await applySkillSync(lock, { cwd: projectDirectory, runCommand });
      await writeSkillsLock(projectDirectory, updated);
      writeSkillFailures(program, failed);
      writeProgramOutput(program, failed.length > 0 ? "Stackkit skills sync finished with failures\n" : "Stackkit skills sync complete\n");
    });
  skills
    .command("update")
    .description("Update installed official and curated AI skills")
    .option("--apply", "Run skill update commands and update skills-lock.json")
    .option("--dir <path>", "Project directory")
    .action(async (options: { apply?: boolean; dir?: string }) => {
      const projectDirectory = options.dir ? resolve(options.dir) : process.cwd();
      const lock = await readSkillsLock(projectDirectory);
      const commands = planSkillUpdateCommands(lock);

      if (!options.apply) {
        writeProgramOutput(program, formatSkillCommands("Stackkit skills update plan", commands));
        return;
      }

      const { lock: updated, failed } = await applySkillUpdate(lock, { cwd: projectDirectory, runCommand });
      await writeSkillsLock(projectDirectory, updated);
      writeSkillFailures(program, failed);
      writeProgramOutput(program, failed.length > 0 ? "Stackkit skills update finished with failures\n" : "Stackkit skills update complete\n");
    });

  const recipe = program.command("recipe").description("Manage offline Stackkit recipes");
  recipe
    .command("encode")
    .description("Encode a Stackkit recipe")
    .option("--config <path>", "Path to a Stackkit config file")
    .option("--preset <preset>", `Preset ID to encode (default: ${defaultPresetId})`)
    .option("--include-preview", "Allow encoding a preview preset")
    .action(async (options: { config?: string; preset?: string; includePreview?: boolean }) => {
      if (options.config && options.preset) {
        throw new Error("Cannot combine recipe encode --config and --preset");
      }

      const recipeConfig = options.config
        ? recipeFromConfig(stackkitConfigSchema.parse(await readJsonFile(options.config)))
        : createPresetRecipe(options.preset ?? defaultPresetId, builtinPresets, options.includePreview);

      writeProgramOutput(program, `${encodeRecipe(recipeConfig)}\n`);
    });
  recipe
    .command("decode <code>")
    .description("Decode a Stackkit recipe")
    .option("--json", "Output JSON")
    .action((code: string, options: { json?: boolean }) => {
      writeProgramOutput(program, formatRecipe(decodeRecipe(code), options.json));
    });
  recipe
    .command("inspect <code>")
    .description("Inspect a Stackkit recipe")
    .option("--json", "Output JSON")
    .action((code: string, options: { json?: boolean }) => {
      writeProgramOutput(
        program,
        formatRecipeInspect(
          inspectRecipe(decodeRecipe(code), {
            availableModules: builtinModules,
            availablePresets: builtinPresets
          }),
          options.json
        )
      );
    });

  const preset = program.command("preset").description("Inspect Stackkit presets");
  preset
    .command("list")
    .description("List available presets")
    .option("--include-preview", "Include preview presets")
    .action((options: { includePreview?: boolean }) => {
      writeProgramOutput(
        program,
        builtinPresets
          .filter((preset) => isPubliclySelectable(preset.support, options.includePreview))
          .map((preset) => `${preset.id}\t${preset.title}`)
          .join("\n") + "\n"
      );
    });
  preset
    .command("inspect <preset>")
    .description("Show the modules included in a preset")
    .action((presetId: string) => {
      const foundPreset = builtinPresets.find((preset) => preset.id === presetId);

      if (!foundPreset) {
        throw new Error(`Unknown Stackkit preset: ${presetId}`);
      }

      writeProgramOutput(
        program,
        [
          foundPreset.title,
          foundPreset.description,
          "Modules:",
          ...foundPreset.modules.map((moduleId) => `- ${moduleId}`),
          ""
        ].join("\n")
      );
    });

  const registry = program.command("registry").description("Inspect Stackkit registries");
  registry
    .command("list")
    .description("List configured registries")
    .option("--json", "Output JSON")
    .option("--config <path>", "Path to a Stackkit config file")
    .action(async (options: { json?: boolean; config?: string }) => {
      const registries = await listRegistries(options.config);

      writeProgramOutput(program, formatRegistryList(registries, options.json));
    });

  const config = program.command("config").description("Manage Stackkit configuration");
  config
    .command("validate [path]")
    .description("Validate a Stackkit config file")
    .action(async (path = "stackkit.config.json") => {
      const parsed = stackkitConfigSchema.parse(await readJsonFile(path));
      const result = validateStackkitConfig(parsed, builtinModules, builtinPresets);

      if (!result.ok) {
        throw new Error(result.errors.join("\n"));
      }

      writeProgramOutput(program, `Config is valid: ${path}\n`);
    });

  return program;
}

type RegistrySummary = {
  namespace: string;
  name: string;
  source: "builtin" | "local";
  location?: string;
  modules: number;
  presets: number;
};

export type CreatePlanOptions = {
  name?: string;
  configPath?: string;
  preset?: string;
  packageManager?: string;
  aiTargets?: string[];
  skillMode?: string;
  skillLinkMode?: string;
  axes?: CreateAxesInput;
  dbRuntime?: string;
  recipeCode?: string;
  allowExternalState?: boolean;
  includePreview?: boolean;
  /** Fail instead of prompting when no project name, config, or recipe is given. */
  nonInteractive?: boolean;
};

type CreateCommandOptions = {
  config?: string;
  preset?: string;
  pm?: string;
  packageManager?: string;
  ai?: string;
  skills?: string;
  skillLink?: string;
  web?: string;
  ui?: string;
  api?: string;
  db?: string;
  dbClient?: string;
  dbProvider?: string;
  dbRuntime?: string;
  auth?: string;
  tsQuality?: string;
  pyTypecheck?: string;
  with?: string;
  deploy?: string;
  recipe?: string;
  dryRun?: boolean;
  allowExternalState?: boolean;
  includePreview?: boolean;
  view?: string;
  diff?: boolean;
  dir?: string;
  resume?: boolean;
  retryInitializers?: boolean;
  yes?: boolean;
};

async function listRegistries(configPath: string | undefined): Promise<RegistrySummary[]> {
  const registries: RegistrySummary[] = [registrySummary(builtinRegistry, "builtin")];

  if (!configPath) {
    return registries;
  }

  const resolvedConfigPath = resolve(configPath);
  const config = stackkitConfigSchema.parse(await readJsonFile(resolvedConfigPath));
  const loaded = await loadProjectRegistries(dirname(resolvedConfigPath), config.registries);

  registries.push(
    ...loaded.map((registryItem) => registrySummary(registryItem, "local", config.registries[registryItem.namespace]))
  );

  return registries;
}

function registrySummary(registry: StackkitRegistry, source: "builtin" | "local", location?: string): RegistrySummary {
  return {
    namespace: registry.namespace,
    name: registry.name,
    source,
    location,
    modules: registry.modules.length,
    presets: registry.presets.length
  };
}

export async function createDryRunPlanFromConfig(options: string | CreatePlanOptions | undefined = {}): Promise<CreatePlan> {
  const planOptions = typeof options === "string" ? { configPath: options } : options ?? {};
  const planInput = {
    availableModules: builtinModules,
    availablePresets: builtinPresets,
    curatedSkillSourceAllowlist,
    allowExternalState: planOptions.allowExternalState ?? false,
    includePreview: planOptions.includePreview
  };

  if (!planOptions.name && !planOptions.configPath && !planOptions.recipeCode) {
    if (planOptions.nonInteractive || !process.stdin.isTTY) {
      throw new Error("A project name is required: stackkit create <name> (or pass --config or --recipe).");
    }

    return createSupportedCreatePlan({ ...planInput, config: await promptForCreateConfig(), source: { kind: "interactive" } });
  }

  const { config, source } = resolveCreateConfig({
    name: planOptions.name,
    configFile: planOptions.configPath
      ? { path: configProvenancePath(planOptions.configPath), content: await readJsonFile(planOptions.configPath) }
      : undefined,
    recipeCode: planOptions.recipeCode,
    preset: planOptions.preset,
    defaultPreset: defaultPresetId,
    packageManager: planOptions.packageManager,
    ai: { skillTargets: planOptions.aiTargets, skillMode: planOptions.skillMode, linkMode: planOptions.skillLinkMode },
    axes: planOptions.axes,
    dbRuntime: planOptions.dbRuntime,
    availableModules: builtinModules,
    availablePresets: builtinPresets
  });

  return createSupportedCreatePlan({ ...planInput, config, source });
}

/** Record the config path relative to the working directory, so manifests never embed absolute local paths. */
function configProvenancePath(configPath: string): string {
  return relative(process.cwd(), resolve(configPath)).replaceAll("\\", "/") || configPath;
}

async function readJsonFile(path: string): Promise<unknown> {
  const content = await readFile(path, "utf8");

  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Invalid JSON in ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseCommaList(value: string | undefined): string[] | undefined {
  return value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}


export function formatCreateDryRunPlan(plan: CreatePlan): string {
  const skillTargets = plan.aiSkills.targets.map((target) => `${target.agent} -> ${target.directory}`).join(", ");
  const installCommands = plan.skillInstallCommands.map((installCommand) => `- ${installCommand.command} ${installCommand.args.join(" ")}`);
  const localGuidance = plan.aiSkills.local.map((skill) => `- ${skill.causedBy}: ${skill.skills.join(", ")}`);
  const unresolved = plan.aiSkills.unresolved.map((skill) => `- ${skill.causedBy}: ${skill.skills.join(", ")}`);
  const nativeInitializers = plan.nativeInitializers.map((initializer) => {
    const command = `${initializer.command} ${initializer.args.join(" ")}`.trim();
    const state = initializer.gated ? " - GATED (needs --allow-external-state)" : "";
    const expected =
      initializer.expectedFiles.length > 0 ? `; expected (advisory): ${initializer.expectedFiles.join(", ")}` : "";

    return `- ${initializer.name}: ${command} (cwd: ${initializer.cwd}, policy: ${initializer.mutationPolicy}${expected})${state}`;
  });

  return [
    `Stackkit create plan for ${plan.projectName}`,
    "Dry run: no files will be written.",
    `Package manager: ${plan.packageManager}`,
    `Modules: ${plan.modules.map((module) => module.id).join(", ")}`,
    `Module titles: ${plan.selectedModules.map((module) => module.title).join(", ")}`,
    `AI skill targets: ${skillTargets || "none"}`,
    `AI skill mode: ${plan.aiSkills.mode}`,
    `AI skill link mode: ${plan.aiSkills.linkMode}`,
    "Skill install commands:",
    ...(installCommands.length > 0 ? installCommands : ["- none"]),
    "Local AI guidance:",
    ...(localGuidance.length > 0 ? localGuidance : ["- none"]),
    "Unresolved AI skills:",
    ...(unresolved.length > 0 ? unresolved : ["- none"]),
    "Native initializers:",
    ...(nativeInitializers.length > 0 ? nativeInitializers : ["- none"]),
    "STACKKIT_PLAN_JSON_START",
    JSON.stringify(plan, null, 2),
    "STACKKIT_PLAN_JSON_END",
    ""
  ].join("\n");
}

function formatInfo(info: StackkitInfo): string {
  const source = info.source
    ? [info.source.kind, info.source.path, info.source.preset, info.source.recipeCode].filter(Boolean).join(" ")
    : "unknown";

  return [
    `Stackkit project: ${info.project.name}`,
    `Package manager: ${info.project.packageManager}`,
    `Stackkit version: ${info.project.stackkitVersion}`,
    `Source: ${source}`,
    "Modules:",
    ...(info.modules.length > 0 ? info.modules.map((module) => `- ${module.id}@${module.version}`) : ["- none"]),
    "Paths:",
    ...Object.entries(info.paths).map(([name, path]) => `- ${name}: ${path}`),
    `AI targets: ${info.ai.targets.length > 0 ? info.ai.targets.join(", ") : "none"}`,
    `AI skills: ${info.ai.installed} installed, ${info.ai.local} local, ${info.ai.unresolved} unresolved`,
    ""
  ].join("\n");
}

function formatDoctorChecks(checks: readonly DoctorCheck[]): string {
  return checks
    .flatMap((check) => [
      `[${check.status}] ${check.id}: ${check.message}`,
      ...(check.actions ?? []).map((action) => `  Run: ${action}`)
    ])
    .join("\n");
}

/**
 * Report a finished create or resume. The post-create doctor checks files, manifest, and skills only
 * (runtime validations need installed dependencies), so any problem it finds is real: warnings go to
 * stderr, errors also set a non-zero exit code.
 */
function writeCreateResult(program: Command, verb: "Created" | "Resumed", result: ApplyCreatePlanResult): void {
  for (const initializer of result.manifest.skippedInitializers) {
    writeProgramError(
      program,
      `Skipped ${initializer.name} (${initializer.mutationPolicy}). Re-run with --allow-external-state to enable.\n`
    );
  }

  const issues = result.doctor.checks.filter(
    (check) => check.status !== "ok" && !check.id.startsWith("initializers.skipped.")
  );
  if (issues.length > 0) {
    const summary = result.doctor.ok ? "Stackkit doctor warnings" : "Stackkit doctor found issues";
    writeProgramError(program, `${summary}:\n${formatDoctorChecks(issues)}\n`);
  }
  if (!result.doctor.ok) {
    process.exitCode = 1;
  }

  writeSkillFailures(program, result.manifest.aiSkills.unresolved.filter(isRetriableUnresolvedSkill));

  writeProgramOutput(
    program,
    [
      `${verb} Stackkit project at ${result.projectDirectory}`,
      "Next steps:",
      `  cd ${result.projectDirectory}`,
      `  ${getPackageManagerAdapter(result.manifest.packageManager).installCommand.join(" ")}`,
      "  stackkit doctor",
      ""
    ].join("\n")
  );
}

function formatModuleDiscovery(modules: readonly ModuleDiscoveryEntry[], json = false): string {
  if (json) {
    return `${JSON.stringify(modules, null, 2)}\n`;
  }

  return [
    "Stackkit modules",
    ...modules.map((module) => {
      const aliases = module.aliases.length > 0 ? ` (${module.aliases.join(", ")})` : "";

      return `- ${module.title}${aliases}: ${module.id}`;
    }),
    ""
  ].join("\n");
}

function formatRegistryList(registries: readonly RegistrySummary[], json = false): string {
  if (json) {
    return `${JSON.stringify(registries, null, 2)}\n`;
  }

  return [
    "Stackkit registries",
    ...registries.map((registry) => {
      const location = registry.location ? ` ${registry.location}` : "";

      return `- ${registry.namespace}: ${registry.name} (${registry.source}${location}) modules=${registry.modules} presets=${registry.presets}`;
    }),
    ""
  ].join("\n");
}

function formatModuleInspect(module: ModuleDiscoveryEntry): string {
  return [
    module.title,
    module.description,
    `ID: ${module.id}`,
    `Version: ${module.version}`,
    `Aliases: ${module.aliases.length > 0 ? module.aliases.join(", ") : "none"}`,
    `Category: ${module.category ?? "none"}`,
    `Removal mode: ${module.removalPolicy.mode}`,
    "Retained data:",
    ...(module.removalPolicy.retainedData.length > 0
      ? module.removalPolicy.retainedData.map((item) => `- ${item}`)
      : ["- none"]),
    "Manual cleanup:",
    ...(module.removalPolicy.manualCleanup.length > 0
      ? module.removalPolicy.manualCleanup.map((item) => `- ${item}`)
      : ["- none"]),
    ""
  ].join("\n");
}

function formatFileView(filePlan: FilePlan, path: string): string {
  const file = findPlannedFile(filePlan, path);

  return [`Stackkit file view: ${file.path}`, file.content].join("\n");
}

async function formatFilePlanDiff(
  title: string,
  projectName: string,
  filePlan: FilePlan,
  projectDirectory: string
): Promise<string> {
  const sections = await Promise.all(
    filePlan.files.map(async (file) => {
      const current = await readOptionalUtf8(join(projectDirectory, file.path));
      const diff = createFileContentDiff(current ?? "", file.content);

      return formatDiffSection(file.path, "current", file.path, diff);
    })
  );

  return [`${title} for ${projectName}`, "Read-only: no files will be written.", ...sections, ""].join("\n");
}

function formatManagedFileDiff(fileDiff: ManagedFileDiff): string {
  return [
    `Stackkit file diff: ${fileDiff.path}`,
    `Expected hash: ${fileDiff.expectedHash}`,
    `Current hash: ${fileDiff.currentHash ?? "missing"}`,
    formatDiffSection(fileDiff.path, "expected", "current", fileDiff.diff),
    ""
  ].join("\n");
}

function formatDiffSection(path: string, fromLabel: string, toLabel: string, diff: FileContentDiff): string {
  return [`--- ${fromLabel}`, `+++ ${toLabel === path ? path : toLabel}`, ...formatDiffParts(diff)].join("\n");
}

function formatDiffParts(diff: FileContentDiff): string[] {
  return diff.parts.flatMap((part) => {
    const prefix = part.kind === "same" ? " " : part.kind === "added" ? "+" : "-";
    const lines = part.value.split("\n");
    const hasTrailingNewline = lines.at(-1) === "";
    const body = hasTrailingNewline ? lines.slice(0, -1) : lines;

    return body.map((line) => `${prefix}${line}`);
  });
}

function findPlannedFile(filePlan: FilePlan, path: string): FilePlan["files"][number] {
  const normalizedPath = path.replaceAll("\\", "/");
  const file = filePlan.files.find((candidate) => candidate.path === normalizedPath);

  if (!file) {
    throw new Error(`No planned file matches ${path}`);
  }

  return file;
}

async function readOptionalUtf8(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (isNodeFileNotFound(error)) {
      return undefined;
    }

    throw error;
  }
}

function isNodeFileNotFound(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function targetDirectoryForPlan(plan: CreatePlan, explicitTargetDirectory: string | undefined): string {
  return explicitTargetDirectory ?? resolve(plan.targetDirectoryName);
}

function projectDirectoryFromOptions(options: { cwd?: string; dir?: string }): string {
  if (options.cwd && options.dir) {
    throw new Error("Cannot combine --cwd and --dir");
  }

  return resolve(options.cwd ?? options.dir ?? process.cwd());
}

export function resolveLifecyclePlanMode(options: { dryRun?: boolean; apply?: boolean }): "plan" | "apply" {
  if (options.dryRun && options.apply) {
    throw new Error("Cannot combine --dry-run and --apply");
  }

  return options.apply ? "apply" : "plan";
}

function formatRecipe(recipe: StackkitRecipe, json = false): string {
  if (json) {
    return `${JSON.stringify(recipe, null, 2)}\n`;
  }

  return [
    "Stackkit recipe",
    `Preset: ${recipe.preset ?? "none"}`,
    `Package manager: ${recipe.packageManager}`,
    `Modules: ${recipe.modules.length > 0 ? recipe.modules.join(", ") : "none"}`,
    `AI skill targets: ${recipe.ai.skillTargets.join(", ")}`,
    ""
  ].join("\n");
}

function formatRecipeInspect(view: RecipeInspectView, json = false): string {
  if (json) {
    return `${JSON.stringify(view, null, 2)}\n`;
  }

  return [
    "Stackkit recipe inspect",
    `Preset: ${view.recipe.preset ?? "none"}`,
    `Package manager: ${view.recipe.packageManager}`,
    `Modules: ${view.recipe.modules.length > 0 ? view.recipe.modules.join(", ") : "none"}`,
    "Expanded presets:",
    ...(view.expandedPresets.length > 0
      ? view.expandedPresets.map((preset) => `- ${preset.id}: ${preset.modules.join(", ")}`)
      : ["- none"]),
    "Resolved modules:",
    ...(view.resolvedModules.length > 0
      ? view.resolvedModules.map((module) => `- ${module.id}: ${module.title}`)
      : ["- none"]),
    "Capabilities:",
    ...(view.capabilities.length > 0 ? view.capabilities.map((capability) => `- ${capability}`) : ["- none"]),
    "Conflicts:",
    ...(view.conflicts.length > 0
      ? view.conflicts.map((conflict) => `- ${conflict.moduleId} conflicts with ${conflict.conflictsWith}`)
      : ["- none"]),
    "Warnings:",
    ...(view.warnings.length > 0 ? view.warnings.map((warning) => `- ${warning}`) : ["- none"]),
    ""
  ].join("\n");
}

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

export function formatAddPlan(plan: AddModulesPlan): string {
  const modulesToAdd = plan.modulesToAdd.map((module) => module.id);
  const resultingModules = plan.modules.map((module) => module.id);

  return [
    `Stackkit add plan for ${plan.manifest.projectName}`,
    "Dry run: no files will be written.",
    `Modules to add: ${modulesToAdd.length > 0 ? modulesToAdd.join(", ") : "none"}`,
    `Resulting modules: ${resultingModules.join(", ")}`,
    `Safe to add: ${plan.safe ? "yes" : "no"}`,
    ...formatFileChangeLines(plan),
    "STACKKIT_PLAN_JSON_START",
    JSON.stringify(withWritePaths(plan), null, 2),
    "STACKKIT_PLAN_JSON_END",
    ""
  ].join("\n");
}

export function formatRemovePlan(plan: RemoveModulesPlan): string {
  return [
    `Stackkit remove plan for ${plan.manifest.projectName}`,
    "Dry run: no files will be deleted.",
    `Modules to remove: ${plan.modulesToRemove.length > 0 ? plan.modulesToRemove.join(", ") : "none"}`,
    `Safe to remove: ${plan.safe ? "yes" : "no"}`,
    ...(plan.dependents.length > 0 ? [`Still required by: ${plan.dependents.join(", ")}`] : []),
    ...formatRemovalAdvisories(plan),
    ...formatFileChangeLines(plan),
    "STACKKIT_PLAN_JSON_START",
    JSON.stringify(withWritePaths(plan), null, 2),
    "STACKKIT_PLAN_JSON_END",
    ""
  ].join("\n");
}

function formatFileChangeLines(changes: Pick<LifecycleFileChanges, "writes" | "deletes" | "refusals">): string[] {
  const list = (items: readonly string[]) => (items.length > 0 ? items.map((item) => `- ${item}`) : ["- none"]);

  return [
    "Files to write:",
    ...list(changes.writes.map((file) => file.path)),
    "Files to delete:",
    ...list(changes.deletes),
    "Refusals:",
    ...list(changes.refusals.map((refusal) => `${refusal.path} (${refusal.reason})`))
  ];
}

/** Plan JSON lists written paths, not full file contents. */
function withWritePaths<T extends { writes: readonly { path: string }[] }>(plan: T): Omit<T, "writes"> & { writes: string[] } {
  return { ...plan, writes: plan.writes.map((file) => file.path) };
}

function formatRemovalAdvisories(plan: RemoveModulesPlan): string[] {
  return plan.removalAdvisories.flatMap((advisory) => [
    `Removal policy for ${advisory.moduleId}: ${advisory.policy.mode}`,
    "Retained data:",
    ...(advisory.policy.retainedData.length > 0
      ? advisory.policy.retainedData.map((item) => `- ${item}`)
      : ["- none"]),
    "Manual cleanup:",
    ...(advisory.policy.manualCleanup.length > 0
      ? advisory.policy.manualCleanup.map((item) => `- ${item}`)
      : ["- none"])
  ]);
}

function scopeModules(
  manifest: StackkitManifest,
  modules: readonly StackkitModule[],
  moduleId: string | undefined
): readonly StackkitModule[] {
  if (!moduleId) {
    return modules;
  }

  const installedId = resolveInstalledModuleId(manifest, moduleId, modules);
  return modules.filter((module) => module.id === installedId);
}

function refuseMigrationMessage(plan: ModuleMigrationPlan): string {
  const titles = [...plan.reviewRequired, ...plan.manual].map((migration) => migration.title);

  return [
    "Refusing to apply: there are migrations that require review.",
    "Review these migrations before continuing:",
    ...titles.map((title) => `- ${title}`)
  ].join("\n");
}

function formatUpdateLines(plan: Pick<ModuleUpdatePlan, "updates">): string[] {
  return plan.updates.length > 0
    ? plan.updates.map((update) => `- ${update.id}: ${update.from} -> ${update.to}`)
    : ["- none"];
}

function formatMigrationLines(plan: ModuleMigrationPlan): string[] {
  const lines = [
    `Automatic: ${plan.automatic.length}`,
    ...plan.automatic.map((migration) => `- ${migration.title}`),
    `Review required: ${plan.reviewRequired.length}`,
    ...plan.reviewRequired.map((migration) => `- ${migration.title}`),
    `Manual: ${plan.manual.length}`,
    ...plan.manual.map((migration) => `- ${migration.title}`)
  ];

  return lines;
}

export function formatDiff(manifest: StackkitManifest, plan: UpdateModulesPlan): string {
  return [
    `Stackkit diff for ${manifest.projectName}`,
    "Read-only: no files will be written.",
    ...formatUpdatePlanBody(plan),
    "STACKKIT_DIFF_JSON_START",
    JSON.stringify(updatePlanJson(plan), null, 2),
    "STACKKIT_DIFF_JSON_END",
    ""
  ].join("\n");
}

export function formatUpdatePlan(manifest: StackkitManifest, plan: UpdateModulesPlan): string {
  return [
    `Stackkit update plan for ${manifest.projectName}`,
    "Dry run: no files will be written.",
    ...formatUpdatePlanBody(plan),
    "STACKKIT_UPDATE_JSON_START",
    JSON.stringify(updatePlanJson(plan), null, 2),
    "STACKKIT_UPDATE_JSON_END",
    ""
  ].join("\n");
}

function formatUpdatePlanBody(plan: UpdateModulesPlan): string[] {
  return [
    "Pending version updates:",
    ...formatUpdateLines(plan),
    ...plan.warnings.map((warning) => `Warning: ${warning}`),
    "Pending migrations:",
    ...formatMigrationLines(plan.migrations),
    `Safe to apply: ${plan.safe ? "yes" : "no"}`,
    ...formatFileChangeLines(plan)
  ];
}

function updatePlanJson(plan: UpdateModulesPlan) {
  return {
    updates: { updates: plan.updates, warnings: plan.warnings },
    migrations: plan.migrations,
    safe: plan.safe,
    files: { writes: plan.writes.map((file) => file.path), deletes: plan.deletes, refusals: plan.refusals }
  };
}

export function formatMigratePlan(manifest: StackkitManifest, migrationPlan: ModuleMigrationPlan): string {
  return [
    `Stackkit migrate plan for ${manifest.projectName}`,
    "Dry run: no files will be written.",
    "Pending migrations:",
    ...formatMigrationLines(migrationPlan),
    "STACKKIT_MIGRATE_JSON_START",
    JSON.stringify(migrationPlan, null, 2),
    "STACKKIT_MIGRATE_JSON_END",
    ""
  ].join("\n");
}

/** Report failed skill installs on stderr and fail the command; the lock keeps them as unresolved. */
function writeSkillFailures(program: Command, failed: readonly AiSkillDependency[]): void {
  for (const skill of failed) {
    writeProgramError(program, `AI skill ${skill.skills.join(", ")} from ${skill.source ?? "unknown source"}: ${skill.reason}\n`);
  }

  if (failed.length > 0) {
    writeProgramError(program, "Retry with stackkit skills sync --apply\n");
    process.exitCode = 1;
  }
}

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

const defaultCommandTimeoutMs = 10 * 60 * 1000;

export const runLocalCommand: RunCommand = async (command, args, options) => {
  const { spawn } = await import("node:child_process");

  return await new Promise((resolve) => {
    const invocation = resolveSpawnCommand(command, args, { cwd: options.cwd });
    const child = spawn(invocation.command, invocation.args, {
      cwd: options.cwd,
      windowsVerbatimArguments: invocation.windowsVerbatimArguments,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timeoutMs = Number(process.env.STACKKIT_COMMAND_TIMEOUT_MS) || defaultCommandTimeoutMs;
    const timer = setTimeout(() => {
      // On Windows the child is cmd.exe; kill the whole tree so the real tool dies too.
      if (process.platform === "win32" && child.pid !== undefined) {
        spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" });
      } else {
        child.kill("SIGKILL");
      }
      resolve({
        exitCode: 1,
        stdout,
        stderr: `${stderr}${stderr && !stderr.endsWith("\n") ? "\n" : ""}Timed out after ${timeoutMs}ms: ${[command, ...args].join(" ")} (set STACKKIT_COMMAND_TIMEOUT_MS to change the limit)`
      });
    }, timeoutMs);
    timer.unref();
    child.on("exit", () => clearTimeout(timer));

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      resolve({
        exitCode: 1,
        stdout,
        stderr: stderr || error.message
      });
    });
    child.on("close", (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr
      });
    });
  });
};

async function promptForCreateConfig(): Promise<StackkitConfig> {
  const prompts = await import("@clack/prompts");

  prompts.intro("Create a Stackkit project");

  const projectName = await prompts.text({
    message: "Project name",
    placeholder: "acme-dashboard",
    validate: (value) => {
      if (value.trim().length === 0) {
        return "Project name is required";
      }

      try {
        validateProjectSlug(value);
        return undefined;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    }
  });

  if (prompts.isCancel(projectName)) {
    return cancelCreate(prompts);
  }

  const preset = await prompts.select({
    message: "Preset",
    options: builtinPresets
      .filter((presetItem) => isPubliclySelectable(presetItem.support))
      .map((presetItem) => ({
        value: presetItem.id,
        label: presetItem.title,
        hint: presetItem.description
      }))
  });

  if (prompts.isCancel(preset)) {
    return cancelCreate(prompts);
  }

  const aiTargets = await prompts.multiselect<AiSkillAgent>({
    message: "AI skill targets",
    options: [
      { value: "codex", label: ".agents  Codex-compatible project skills" },
      { value: "claude-code", label: ".claude  Claude Code project skills" }
    ],
    initialValues: ["codex"],
    required: true
  });

  if (prompts.isCancel(aiTargets)) {
    return cancelCreate(prompts);
  }

  prompts.outro("Stackkit plan ready");

  return stackkitConfigSchema.parse(
    buildConfigFromInteractiveAnswers({
      projectName,
      preset,
      aiTargets
    })
  );
}

async function confirmCreate(plan: CreatePlan): Promise<void> {
  if (!process.stdin.isTTY) {
    throw new Error(
      `Refusing to create ${plan.projectName} without --yes in non-interactive mode. Re-run with --yes to apply, or use --dry-run to preview.`
    );
  }

  const prompts = await import("@clack/prompts");
  prompts.note(formatCreateSummary(plan), "Create summary");

  const confirmed = await prompts.confirm({
    message: "Create this Stackkit project?",
    initialValue: true
  });

  if (prompts.isCancel(confirmed) || !confirmed) {
    return cancelCreate(prompts);
  }
}

function cancelCreate(prompts: typeof import("@clack/prompts")): never {
  prompts.cancel("Create cancelled");
  process.exitCode = 1;
  throw new Error("Create cancelled");
}

function writeProgramOutput(program: Command, output: string): void {
  const writeOut = program.configureOutput().writeOut;

  if (writeOut) {
    writeOut(output);
    return;
  }

  process.stdout.write(output);
}

export async function runStackkitCli(argv: readonly string[] = process.argv): Promise<void> {
  try {
    await createStackkitProgram().parseAsync(argv);
  } catch (error) {
    process.stderr.write(`Error: ${formatCliError(error)}\n`);
    process.exitCode = 1;
  }
}

/** Render schema validation failures (Zod issues) as one readable line per issue. */
export function formatCliError(error: unknown): string {
  const issues = (error as { issues?: unknown } | undefined)?.issues;
  if (error instanceof Error && Array.isArray(issues)) {
    return [
      "Invalid Stackkit input:",
      ...issues.map((issue: { path?: PropertyKey[]; message: string }) =>
        `  - ${issue.path?.length ? `${issue.path.map(String).join(".")}: ` : ""}${issue.message}`
      )
    ].join("\n");
  }
  return error instanceof Error ? error.message : String(error);
}

export function isDirectCliExecution(
  moduleUrl: string,
  argvEntry = process.argv[1],
  realpath: (entry: string) => string = realpathSync.native
): boolean {
  if (!argvEntry) {
    return false;
  }

  const modulePath = resolveCliEntryPath(fileURLToPath(moduleUrl), realpath);
  const entryPath = resolveCliEntryPath(argvEntry, realpath);

  if (isWindowsCliEntryPath(modulePath) || isWindowsCliEntryPath(entryPath)) {
    return normalizeWindowsCliEntryPath(modulePath) === normalizeWindowsCliEntryPath(entryPath);
  }

  return resolve(modulePath) === resolve(entryPath);
}

function resolveCliEntryPath(entry: string, realpath: (entry: string) => string): string {
  try {
    return realpath(entry);
  } catch {
    return entry;
  }
}

function writeProgramError(program: Command, output: string): void {
  const writeErr = program.configureOutput().writeErr;

  if (writeErr) {
    writeErr(output);
    return;
  }

  process.stderr.write(output);
}

function isWindowsCliEntryPath(filePath: string): boolean {
  return /^\/?[a-z]:[\\/]/i.test(filePath);
}

function normalizeWindowsCliEntryPath(filePath: string): string {
  return win32.normalize(filePath.replace(/^\/([a-z]:[\\/])/i, "$1")).toLowerCase();
}

if (isDirectCliExecution(import.meta.url)) {
  void runStackkitCli();
}
