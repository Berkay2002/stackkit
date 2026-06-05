#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Command } from "commander";

import {
  applyAddModules,
  applyAutomaticMigrations,
  applyCreatePlan,
  applyModuleUpdates,
  applyRemoveModules,
  decodeRecipe,
  encodeRecipe,
  createCreatePlan,
  planAddModuleFiles,
  planAddModules,
  planModuleMigrations,
  planModuleUpdates,
  planRemoveModules,
  planSkillSyncCommands,
  applySkillSync,
  collectInfo,
  createFileContentDiff,
  diffManagedFile,
  readCurrentManagedFileHashes,
  readManifest,
  readSkillsLock,
  inspectStackkitModule,
  listStackkitModules,
  loadProjectRegistries,
  resolveStackAxes,
  runDoctor,
  searchStackkitModules,
  validateStackkitConfig,
  validateProjectSlug,
  writeSkillsLock,
  type AddModulesPlan,
  type AiSkillInstallCommand,
  type CreatePlan,
  type DoctorCheck,
  type FileContentDiff,
  type FilePlan,
  type ManagedFileDiff,
  type ModuleDiscoveryEntry,
  type ModuleMigrationPlan,
  type ModuleUpdatePlan,
  type RemoveModulesPlan,
  type RunCommand,
  type StackkitManifest,
  type StackkitInfo,
  type StackkitModule,
  type StackkitRegistry,
  type StackkitRecipe
} from "@stackkit/core";
import { builtinModules, builtinPresets, builtinRegistry, curatedSkillSourceAllowlist } from "@stackkit/registry";
import { stackkitConfigSchema, type AiSkillAgent, type PackageManager, type StackkitConfig } from "@stackkit/schemas";

export type CreateDryRunPlan = CreatePlan;

export type StackkitProgramOptions = {
  runCommand?: RunCommand;
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
  const program = new Command()
    .name("stackkit")
    .description("Generate and maintain Stackkit-managed monorepos");

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
    .option("--api <alias>", "API framework alias")
    .option("--db <alias>", "Database alias")
    .option("--db-client <alias>", "Database client alias")
    .option("--auth <alias>", "Auth provider alias")
    .option("--with <aliases>", "Additional module aliases. Comma-separated")
    .option("--deploy <aliases>", "Deployment target aliases. Comma-separated")
    .option("--recipe <code>", "Offline Stackkit recipe code")
    .option("--dry-run", "Print the create plan without writing files")
    .option("--view <path>", "Print one planned file during --dry-run")
    .option("--diff", "Print file-oriented planned changes during --dry-run")
    .option("--dir <path>", "Target project directory")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (name: string | undefined, options: CreateCommandOptions) => {
      const plan = await createDryRunPlanFromConfig({
        name,
        configPath: options.config,
        preset: options.preset,
        packageManager: options.packageManager ?? options.pm,
        aiTargets: parseCommaList(options.ai),
        skillMode: options.skills,
        skillLinkMode: options.skillLink,
        axes: {
          web: options.web,
          api: options.api,
          db: options.db,
          dbClient: options.dbClient,
          auth: parseCommaList(options.auth),
          with: parseCommaList(options.with),
          deploy: parseCommaList(options.deploy)
        },
        recipeCode: options.recipe
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
        runCommand
      });
      writeProgramOutput(program, `Created Stackkit project at ${result.projectDirectory}\n`);
    });

  program.command("init").description("Adopt an existing repository into Stackkit management");

  program
    .command("add <module>")
    .description("Add a module to a managed project")
    .option("--dry-run", "Print the add plan without writing files")
    .option("--view <path>", "Print one planned file during --dry-run")
    .option("--diff", "Print file-oriented planned changes during --dry-run")
    .option("--dir <path>", "Project directory")
    .action(async (moduleId: string, options: { dryRun?: boolean; view?: string; diff?: boolean; dir?: string }) => {
      const projectDirectory = options.dir ? resolve(options.dir) : process.cwd();
      const manifest = await readManifest(projectDirectory);

      if (options.dryRun) {
        const plan = planAddModules({ manifest, moduleIds: [moduleId], availableModules: builtinModules });
        if (options.view || options.diff) {
          const filePlan = await planAddModuleFiles({
            projectDirectory,
            manifest,
            moduleIds: [moduleId],
            availableModules: builtinModules
          });

          writeProgramOutput(
            program,
            options.view
              ? formatFileView(filePlan, options.view)
              : await formatFilePlanDiff("Stackkit add diff", manifest.projectName, filePlan, projectDirectory)
          );
          return;
        }

        writeProgramOutput(program, formatAddPlan(plan));
        return;
      }

      const result = await applyAddModules({
        projectDirectory,
        manifest,
        moduleIds: [moduleId],
        availableModules: builtinModules,
        curatedSkillSourceAllowlist,
        runCommand
      });
      writeProgramOutput(program, `Added ${moduleId} to ${result.manifest.projectName}\n`);
    });

  program
    .command("remove <module>")
    .description("Safely remove a module from a managed project")
    .option("--dry-run", "Print the remove plan without deleting files")
    .option("--yes", "Confirm the removal and delete owned files")
    .option("--dir <path>", "Project directory")
    .action(async (moduleId: string, options: { dryRun?: boolean; yes?: boolean; dir?: string }) => {
      const projectDirectory = options.dir ? resolve(options.dir) : process.cwd();
      const manifest = await readManifest(projectDirectory);

      if (options.dryRun) {
        const currentFiles = await readCurrentManagedFileHashes(projectDirectory, manifest);
        const plan = planRemoveModules({ manifest, moduleIds: [moduleId], currentFiles });
        writeProgramOutput(program, formatRemovePlan(plan));
        return;
      }

      if (!options.yes) {
        throw new Error(`Refusing to remove ${moduleId} without --yes. Re-run with --yes to apply, or use --dry-run to preview.`);
      }

      const result = await applyRemoveModules({ projectDirectory, manifest, moduleIds: [moduleId] });
      writeProgramOutput(program, `Removed ${moduleId} from ${result.manifest.projectName}\n`);
    });

  program
    .command("update [module]")
    .description("Update managed modules")
    .option("--dry-run", "Print the update plan without writing files")
    .option("--apply", "Apply pending module updates and automatic migrations")
    .option("--dir <path>", "Project directory")
    .action(async (moduleId: string | undefined, options: { dryRun?: boolean; apply?: boolean; dir?: string }) => {
      const projectDirectory = options.dir ? resolve(options.dir) : process.cwd();
      const manifest = await readManifest(projectDirectory);
      const availableModules = scopeModules(builtinModules, moduleId);
      const manifestModules = scopeManifestModules(manifest.modules, moduleId);

      if (!options.apply) {
        const updatePlan = planModuleUpdates({ manifestModules, availableModules });
        const migrationPlan = planModuleMigrations({ manifest, modules: availableModules });
        writeProgramOutput(program, formatUpdatePlan(manifest, updatePlan, migrationPlan));
        return;
      }

      const migrationPlan = planModuleMigrations({ manifest, modules: availableModules });

      if (migrationPlan.reviewRequired.length > 0 || migrationPlan.manual.length > 0) {
        throw new Error(refuseMigrationMessage(migrationPlan));
      }

      let workingManifest = manifest;

      if (migrationPlan.automatic.length > 0) {
        const migrated = await applyAutomaticMigrations({
          projectDirectory,
          manifest: workingManifest,
          modules: availableModules
        });
        workingManifest = migrated.manifest;
      }

      const updated = await applyModuleUpdates({
        projectDirectory,
        manifest: workingManifest,
        availableModules
      });

      writeProgramOutput(
        program,
        `Updated ${updated.manifest.projectName}: ${updated.updates.length} module update(s), ${migrationPlan.automatic.length} migration(s) applied\n`
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
      const availableModules = scopeModules(builtinModules, moduleId);
      const migrationPlan = planModuleMigrations({ manifest, modules: availableModules });

      if (!options.apply) {
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
      const availableModules = scopeModules(builtinModules, moduleId);
      const manifestModules = scopeManifestModules(manifest.modules, moduleId);
      const updatePlan = planModuleUpdates({ manifestModules, availableModules });
      const migrationPlan = planModuleMigrations({ manifest, modules: availableModules });

      writeProgramOutput(program, formatDiff(manifest, updatePlan, migrationPlan));
    });

  program
    .command("doctor")
    .description("Validate project health and Stackkit state")
    .option("--dir <path>", "Project directory")
    .action(async (options: { dir?: string }) => {
      const projectDirectory = options.dir ? resolve(options.dir) : process.cwd();
      const result = await runDoctor(projectDirectory);
      writeProgramOutput(
        program,
        `${result.ok ? "Stackkit doctor passed" : "Stackkit doctor found issues"}\n${formatDoctorChecks(result.checks)}\n`
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
    .action((options: { json?: boolean }) => {
      writeProgramOutput(program, formatModuleDiscovery(listStackkitModules(builtinModules), options.json));
    });
  module
    .command("search <query>")
    .description("Search available modules")
    .option("--json", "Output JSON")
    .action((query: string, options: { json?: boolean }) => {
      writeProgramOutput(program, formatModuleDiscovery(searchStackkitModules(query, builtinModules), options.json));
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

      const updated = await applySkillSync(lock, { cwd: projectDirectory, runCommand });
      await writeSkillsLock(projectDirectory, updated);
      writeProgramOutput(program, "Stackkit skills sync complete\n");
    });
  skills
    .command("update")
    .description("Update installed official and curated AI skills")
    .option("--apply", "Run skill update commands and update skills-lock.json")
    .option("--dir <path>", "Project directory")
    .action(async (options: { apply?: boolean; dir?: string }) => {
      const projectDirectory = options.dir ? resolve(options.dir) : process.cwd();
      const lock = await readSkillsLock(projectDirectory);
      const commands = planSkillSyncCommands(lock);

      if (!options.apply) {
        writeProgramOutput(program, formatSkillCommands("Stackkit skills update plan", commands));
        return;
      }

      const updated = await applySkillSync(lock, { cwd: projectDirectory, runCommand });
      await writeSkillsLock(projectDirectory, updated);
      writeProgramOutput(program, "Stackkit skills update complete\n");
    });

  const recipe = program.command("recipe").description("Manage offline Stackkit recipes");
  recipe
    .command("encode")
    .description("Encode a Stackkit recipe")
    .option("--config <path>", "Path to a Stackkit config file")
    .option("--preset <preset>", "Preset ID to encode")
    .action(async (options: { config?: string; preset?: string }) => {
      if (options.config && options.preset) {
        throw new Error("Cannot combine recipe encode --config and --preset");
      }

      const recipeConfig = options.config
        ? recipeFromConfig(stackkitConfigSchema.parse(JSON.parse(await readFile(options.config, "utf8"))))
        : createPresetRecipe(options.preset ?? "next");

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
      writeProgramOutput(program, formatRecipe(decodeRecipe(code), options.json));
    });

  const preset = program.command("preset").description("Inspect Stackkit presets");
  preset
    .command("list")
    .description("List available presets")
    .action(() => {
      writeProgramOutput(program, builtinPresets.map((preset) => `${preset.id}\t${preset.title}`).join("\n") + "\n");
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
      const parsed = stackkitConfigSchema.parse(JSON.parse(await readFile(path, "utf8")));
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
  axes?: CreateAxisOptions;
  recipeCode?: string;
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
  api?: string;
  db?: string;
  dbClient?: string;
  auth?: string;
  with?: string;
  deploy?: string;
  recipe?: string;
  dryRun?: boolean;
  view?: string;
  diff?: boolean;
  dir?: string;
  yes?: boolean;
};

async function listRegistries(configPath: string | undefined): Promise<RegistrySummary[]> {
  const registries: RegistrySummary[] = [registrySummary(builtinRegistry, "builtin")];

  if (!configPath) {
    return registries;
  }

  const resolvedConfigPath = resolve(configPath);
  const config = stackkitConfigSchema.parse(JSON.parse(await readFile(resolvedConfigPath, "utf8")));
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

type CreateAxisOptions = {
  web?: string;
  api?: string;
  db?: string;
  dbClient?: string;
  auth?: string[];
  with?: string[];
  deploy?: string[];
};

export async function createDryRunPlanFromConfig(options: string | CreatePlanOptions | undefined = {}): Promise<CreatePlan> {
  const planOptions = typeof options === "string" ? { configPath: options } : options ?? {};
  const projectName = planOptions.name ? validateProjectSlug(planOptions.name) : undefined;
  const axisModules = resolveCreateAxisModules(planOptions.axes);

  if (planOptions.recipeCode && planOptions.configPath) {
    throw new Error("Cannot combine --recipe and --config");
  }

  if (planOptions.recipeCode && !projectName) {
    throw new Error("A project name is required when using --recipe");
  }

  if (!planOptions.configPath && !planOptions.recipeCode && !projectName) {
    const interactiveConfig = await promptForCreateConfig();

    return createCreatePlan({
      config: interactiveConfig,
      source: { kind: "interactive" },
      availableModules: builtinModules,
      availablePresets: builtinPresets,
      curatedSkillSourceAllowlist
    });
  }

  if (planOptions.recipeCode) {
    const recipe = decodeRecipe(planOptions.recipeCode);
    const config = stackkitConfigSchema.parse({
      ...recipe,
      projectName,
      packageManager: planOptions.packageManager ?? recipe.packageManager,
      modules: mergeModuleIds(recipe.modules, axisModules),
      ai: {
        ...recipe.ai,
        ...buildAiOverrides(planOptions)
      }
    });

    return createCreatePlan({
      config,
      source: { kind: "recipe", code: planOptions.recipeCode },
      availableModules: builtinModules,
      availablePresets: builtinPresets,
      curatedSkillSourceAllowlist
    });
  }

  if (!planOptions.configPath) {
    const hasAxisModules = axisModules.length > 0;
    const config = stackkitConfigSchema.parse({
      projectName,
      packageManager: planOptions.packageManager,
      preset: planOptions.preset ?? (hasAxisModules ? undefined : "next"),
      modules: axisModules,
      ai: {
        skillTargets: planOptions.aiTargets ?? ["codex"],
        skillMode: planOptions.skillMode,
        linkMode: planOptions.skillLinkMode
      }
    });

    return createCreatePlan({
      config,
      source: { kind: "scripted" },
      availableModules: builtinModules,
      availablePresets: builtinPresets,
      curatedSkillSourceAllowlist
    });
  }

  const rawConfig = JSON.parse(await readFile(planOptions.configPath, "utf8"));
  const cliOverrides: { projectName?: string; packageManager?: PackageManager | string } = {};
  if (projectName) {
    cliOverrides.projectName = projectName;
  }
  if (planOptions.packageManager) {
    cliOverrides.packageManager = planOptions.packageManager;
  }
  const configInput: Record<string, unknown> = { ...asObject(rawConfig), ...cliOverrides };
  const aiOverrides = buildAiOverrides(planOptions);
  if (aiOverrides) {
    configInput.ai = { ...asOptionalObject(configInput.ai), ...aiOverrides };
  }
  if (axisModules.length > 0) {
    configInput.modules = mergeModuleIds(readModuleIds(configInput.modules), axisModules);
  }
  const config = stackkitConfigSchema.parse(configInput);

  return createCreatePlan({
    config,
    source: { kind: "config", path: "stackkit.config.json" },
    availableModules: builtinModules,
    availablePresets: builtinPresets,
    curatedSkillSourceAllowlist
  });
}

function resolveCreateAxisModules(axes: CreateAxisOptions | undefined): string[] {
  if (!axes || !hasCreateAxes(axes)) {
    return [];
  }

  return resolveStackAxes(
    {
      web: axes.web,
      api: axes.api,
      db: axes.db,
      dbClient: axes.dbClient,
      auth: axes.auth,
      with: axes.with,
      deploy: axes.deploy
    },
    builtinModules
  );
}

function hasCreateAxes(axes: CreateAxisOptions): boolean {
  return Boolean(
    axes.web ||
      axes.api ||
      axes.db ||
      axes.dbClient ||
      (axes.auth && axes.auth.length > 0) ||
      (axes.with && axes.with.length > 0) ||
      (axes.deploy && axes.deploy.length > 0)
  );
}

function readModuleIds(value: unknown): string[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error("Stackkit config modules must be an array of module IDs");
  }

  return value;
}

function mergeModuleIds(left: readonly string[], right: readonly string[]): string[] {
  return [...new Set([...left, ...right])];
}

function recipeFromConfig(config: StackkitConfig): StackkitRecipe {
  return {
    schemaVersion: 1,
    preset: config.preset,
    packageManager: config.packageManager,
    modules: config.modules,
    options: config.options ?? {},
    ai: config.ai
  };
}

function createPresetRecipe(presetId: string): StackkitRecipe {
  if (!builtinPresets.some((preset) => preset.id === presetId)) {
    throw new Error(`Unknown Stackkit preset: ${presetId}`);
  }

  return {
    schemaVersion: 1,
    preset: presetId,
    packageManager: "pnpm",
    modules: [],
    options: {},
    ai: { skillTargets: ["codex"], skillMode: "install", linkMode: "copy" }
  };
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Stackkit config must be a JSON object");
  }

  return value as Record<string, unknown>;
}

function asOptionalObject(value: unknown): Record<string, unknown> {
  if (value === undefined) {
    return {};
  }

  return asObject(value);
}

function parseCommaList(value: string | undefined): string[] | undefined {
  return value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildAiOverrides(options: CreatePlanOptions): Record<string, unknown> | undefined {
  const overrides: Record<string, unknown> = {};

  if (options.aiTargets) {
    overrides.skillTargets = options.aiTargets;
  }
  if (options.skillMode) {
    overrides.skillMode = options.skillMode;
  }
  if (options.skillLinkMode) {
    overrides.linkMode = options.skillLinkMode;
  }

  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

export function formatCreateDryRunPlan(plan: CreatePlan): string {
  const skillTargets = plan.aiSkills.targets.map((target) => `${target.agent} -> ${target.directory}`).join(", ");
  const installCommands = plan.skillInstallCommands.map((installCommand) => `- ${installCommand.command} ${installCommand.args.join(" ")}`);
  const localGuidance = plan.aiSkills.local.map((skill) => `- ${skill.causedBy}: ${skill.skills.join(", ")}`);
  const unresolved = plan.aiSkills.unresolved.map((skill) => `- ${skill.causedBy}: ${skill.skills.join(", ")}`);

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
  return resolve(options.cwd ?? options.dir ?? process.cwd());
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
    "STACKKIT_PLAN_JSON_START",
    JSON.stringify(plan, null, 2),
    "STACKKIT_PLAN_JSON_END",
    ""
  ].join("\n");
}

export function formatRemovePlan(plan: RemoveModulesPlan): string {
  const filesToRemove = plan.filesToRemove.map((file) => `- ${file.path}`);
  const refusals = plan.refusals.map((refusal) => `- ${refusal.path} (${refusal.reason})`);

  return [
    `Stackkit remove plan for ${plan.manifest.projectName}`,
    "Dry run: no files will be deleted.",
    `Modules to remove: ${plan.modulesToRemove.length > 0 ? plan.modulesToRemove.join(", ") : "none"}`,
    `Safe to remove: ${plan.safe ? "yes" : "no"}`,
    "Files to delete:",
    ...(filesToRemove.length > 0 ? filesToRemove : ["- none"]),
    "Refusals:",
    ...(refusals.length > 0 ? refusals : ["- none"]),
    "STACKKIT_PLAN_JSON_START",
    JSON.stringify(plan, null, 2),
    "STACKKIT_PLAN_JSON_END",
    ""
  ].join("\n");
}

function scopeModules(modules: readonly StackkitModule[], moduleId: string | undefined): readonly StackkitModule[] {
  if (!moduleId) {
    return modules;
  }

  return modules.filter((module) => module.id === moduleId);
}

function scopeManifestModules(
  modules: readonly StackkitManifest["modules"][number][],
  moduleId: string | undefined
): readonly StackkitManifest["modules"][number][] {
  if (!moduleId) {
    return modules;
  }

  return modules.filter((module) => module.id === moduleId);
}

function refuseMigrationMessage(plan: ModuleMigrationPlan): string {
  const titles = [...plan.reviewRequired, ...plan.manual].map((migration) => migration.title);

  return [
    "Refusing to apply: there are migrations that require review.",
    "Review these migrations before continuing:",
    ...titles.map((title) => `- ${title}`)
  ].join("\n");
}

function formatUpdateLines(plan: ModuleUpdatePlan): string[] {
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

export function formatDiff(
  manifest: StackkitManifest,
  updatePlan: ModuleUpdatePlan,
  migrationPlan: ModuleMigrationPlan
): string {
  return [
    `Stackkit diff for ${manifest.projectName}`,
    "Read-only: no files will be written.",
    "Pending version updates:",
    ...formatUpdateLines(updatePlan),
    "Pending migrations:",
    ...formatMigrationLines(migrationPlan),
    "STACKKIT_DIFF_JSON_START",
    JSON.stringify({ updates: updatePlan, migrations: migrationPlan }, null, 2),
    "STACKKIT_DIFF_JSON_END",
    ""
  ].join("\n");
}

export function formatUpdatePlan(
  manifest: StackkitManifest,
  updatePlan: ModuleUpdatePlan,
  migrationPlan: ModuleMigrationPlan
): string {
  return [
    `Stackkit update plan for ${manifest.projectName}`,
    "Dry run: no files will be written.",
    "Planned version updates:",
    ...formatUpdateLines(updatePlan),
    "Pending migrations:",
    ...formatMigrationLines(migrationPlan),
    "STACKKIT_UPDATE_JSON_START",
    JSON.stringify({ updates: updatePlan, migrations: migrationPlan }, null, 2),
    "STACKKIT_UPDATE_JSON_END",
    ""
  ].join("\n");
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

export const runLocalCommand: RunCommand = async (command, args, options) => {
  const { spawn } = await import("node:child_process");

  return await new Promise((resolve) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

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
    options: builtinPresets.map((presetItem) => ({
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

export function runStackkitCli(argv: readonly string[] = process.argv): void {
  createStackkitProgram().parse(argv);
}

export function isDirectCliExecution(moduleUrl: string, argvEntry = process.argv[1]): boolean {
  if (!argvEntry) {
    return false;
  }

  return resolve(fileURLToPath(moduleUrl)) === resolve(argvEntry);
}

if (isDirectCliExecution(import.meta.url)) {
  runStackkitCli();
}
