#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Command } from "commander";

import { applyCreatePlan, createCreatePlan, validateStackkitConfig, type CreatePlan, type RunCommand } from "@stackkit/core";
import { builtinModules, builtinPresets, curatedSkillSourceAllowlist } from "@stackkit/registry";
import { stackkitConfigSchema, type AiSkillAgent, type StackkitConfig } from "@stackkit/schemas";

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
  program.command("add <module>").description("Add a module to a managed project");
  program.command("remove <module>").description("Safely remove a module from a managed project");
  program.command("update [module]").description("Update managed modules");
  program.command("migrate [module]").description("Apply pending module migrations");
  program.command("diff [module]").description("Preview managed changes before applying them");
  program.command("doctor").description("Validate project health and Stackkit state");

  const skills = program.command("skills").description("Manage project-local AI skills");
  skills.command("sync").description("Restore AI skills from the recorded skill lock");
  skills.command("update").description("Update installed official and curated AI skills");

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
