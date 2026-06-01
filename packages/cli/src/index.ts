#!/usr/bin/env node

import { Command } from "commander";

export function createStackkitProgram(): Command {
  const program = new Command()
    .name("stackkit")
    .description("Generate and maintain Stackkit-managed monorepos");

  program
    .command("create")
    .description("Create a new Stackkit-managed monorepo")
    .option("-c, --config <path>", "Path to a Stackkit config file");

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
  preset.command("list").description("List available presets");
  preset.command("inspect <preset>").description("Show the modules included in a preset");

  const config = program.command("config").description("Manage Stackkit configuration");
  config.command("validate [path]").description("Validate a Stackkit config file");

  return program;
}
