#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Command } from "commander";

import {
  applyAddModules,
  applyAutomaticMigrations,
  applyCreatePlan,
  applyModuleUpdates,
  applyRemoveModules,
  createCreatePlan,
  planAddModules,
  planModuleMigrations,
  planModuleUpdates,
  planRemoveModules,
  planSkillSyncCommands,
  applySkillSync,
  readCurrentManagedFileHashes,
  readManifest,
  readSkillsLock,
  runDoctor,
  validateStackkitConfig,
  writeSkillsLock,
  type AddModulesPlan,
  type AiSkillInstallCommand,
  type CreatePlan,
  type ModuleMigrationPlan,
  type ModuleUpdatePlan,
  type RemoveModulesPlan,
  type RunCommand,
  type StackkitManifest,
  type StackkitModule
} from "@stackkit/core";
import { builtinModules, builtinPresets, curatedSkillSourceAllowlist } from "@stackkit/registry";
import { stackkitConfigSchema, type AiSkillAgent, type SkillsLock, type StackkitConfig } from "@stackkit/schemas";

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

export function createStackkitProgram(programOptions: StackkitProgramOptions = {}): Command {
  const runCommand = programOptions.runCommand ?? runLocalCommand;
  const program = new Command()
    .name("stackkit")
    .description("Generate and maintain Stackkit-managed monorepos");

  program
    .command("create")
    .description("Create a new Stackkit-managed monorepo")
    .option("-c, --config <path>", "Path to a Stackkit config file")
    .option("--dry-run", "Print the create plan without writing files")
    .option("--dir <path>", "Target project directory")
    .action(async (options: { config?: string; dryRun?: boolean; dir?: string }) => {
      const plan = await createDryRunPlanFromConfig(options.config);
      const targetDirectory = options.dir ? resolve(options.dir) : undefined;

      if (options.dryRun) {
        writeProgramOutput(program, formatCreateDryRunPlan(plan));
        return;
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
    .option("--dir <path>", "Project directory")
    .action(async (moduleId: string, options: { dryRun?: boolean; dir?: string }) => {
      const projectDirectory = options.dir ? resolve(options.dir) : process.cwd();
      const manifest = await readManifest(projectDirectory);

      if (options.dryRun) {
        const plan = planAddModules({ manifest, moduleIds: [moduleId], availableModules: builtinModules });
        writeProgramOutput(program, formatAddPlan(plan));
        return;
      }

      const result = await applyAddModules({
        projectDirectory,
        manifest,
        moduleIds: [moduleId],
        availableModules: builtinModules,
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
    .action(async (moduleId: string | undefined, options: { dir?: string }) => {
      const projectDirectory = options.dir ? resolve(options.dir) : process.cwd();
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
        `${result.ok ? "Stackkit doctor passed" : "Stackkit doctor found issues"}\n${result.checks
          .map((check) => `[${check.status}] ${check.id}: ${check.message}`)
          .join("\n")}\n`
      );

      if (!result.ok) {
        process.exitCode = 1;
      }
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
      const updateLock: SkillsLock = { ...lock, unresolved: [] };
      const commands = planSkillSyncCommands(updateLock);

      if (!options.apply) {
        writeProgramOutput(program, formatSkillCommands("Stackkit skills update plan", commands));
        return;
      }

      const updated = await applySkillSync(updateLock, { cwd: projectDirectory, runCommand });
      await writeSkillsLock(projectDirectory, updated);
      writeProgramOutput(program, "Stackkit skills update complete\n");
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

export async function createDryRunPlanFromConfig(configPath?: string): Promise<CreatePlan> {
  if (!configPath) {
    const interactiveConfig = await promptForCreateConfig();

    return createCreatePlan({
      config: interactiveConfig,
      availableModules: builtinModules,
      availablePresets: builtinPresets,
      curatedSkillSourceAllowlist
    });
  }

  const config = stackkitConfigSchema.parse(JSON.parse(await readFile(configPath, "utf8")));
  return createCreatePlan({
    config,
    availableModules: builtinModules,
    availablePresets: builtinPresets,
    curatedSkillSourceAllowlist
  });
}

export function formatCreateDryRunPlan(plan: CreatePlan): string {
  const skillTargets = plan.aiSkills.targets.map((target) => `${target.agent} -> ${target.directory}`).join(", ");
  const installCommands = plan.skillInstallCommands.map((installCommand) => `- ${installCommand.command} ${installCommand.args.join(" ")}`);
  const localGuidance = plan.aiSkills.local.map((skill) => `- ${skill.causedBy}: ${skill.skills.join(", ")}`);
  const unresolved = plan.aiSkills.unresolved.map((skill) => `- ${skill.causedBy}: ${skill.skills.join(", ")}`);

  return [
    `Stackkit create plan for ${plan.projectName}`,
    "Dry run: no files will be written.",
    `Modules: ${plan.modules.map((module) => module.id).join(", ")}`,
    `AI skill targets: ${skillTargets || "none"}`,
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
    validate: (value) => (value.trim().length > 0 ? undefined : "Project name is required")
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
