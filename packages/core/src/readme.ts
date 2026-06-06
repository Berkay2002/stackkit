import { type ReadmeMetadata, type StackkitModule } from "@berkayorhan/stackkit-schemas";

import { getPackageManagerAdapter, type PackageManagerAdapter, type PackageManagerName } from "./package-manager.js";
import {
  envTargetLabel,
  normalizeEnvVars,
  type NormalizedEnvVar
} from "./env.js";

export type ComposeReadmeInput = {
  projectName: string;
  packageManager: PackageManagerName;
  modules: readonly StackkitModule[];
};

type ReadmeCommand = {
  label: string;
  command: string;
};

type ReadmeLayoutEntry = {
  path: string;
  description: string;
};

export function composeReadme(input: ComposeReadmeInput): string {
  const adapter = getPackageManagerAdapter(input.packageManager);
  const readme = collectReadmeMetadata(input.modules, adapter);
  const envVars = normalizeEnvVars(input.modules.flatMap((module) => module.envVars ?? []));

  return [
    `# ${input.projectName}`,
    "",
    "## Stack",
    renderList(readme.stack),
    "",
    "## Project Layout",
    renderLayout(readme.layout),
    "",
    "## Prerequisites",
    renderList(readme.prerequisites),
    "",
    "## Install",
    renderCommands(readme.installCommands),
    "",
    "## Development",
    renderCommands(readme.devCommands),
    "",
    "## Verification",
    renderCommands(readme.verificationCommands),
    "",
    "## Commands",
    renderCommands(readme.commands),
    "",
    "## Environment",
    renderEnvironmentTable(envVars),
    "",
    "## Stackkit",
    renderList(readme.stackkit),
    ""
  ].join("\n");
}

export function collectReadmeMetadata(
  modules: readonly StackkitModule[],
  adapter: PackageManagerAdapter
): Required<ReadmeMetadata> {
  const metadata = modules.flatMap((module) => (module.readme ? [module.readme] : []));
  const stack = uniqueStrings([
    ...metadata.flatMap((item) => item.stack),
    ...modules.filter((module) => !module.readme?.stack.length).map((module) => module.title)
  ]);
  const layout = uniqueLayout(metadata.flatMap((item) => item.layout));
  const prerequisites = uniqueStrings(metadata.flatMap((item) => item.prerequisites));
  const installCommands = uniqueCommands(metadata.flatMap((item) => item.installCommands));
  const devCommands = uniqueCommands(metadata.flatMap((item) => item.devCommands));
  const verificationCommands = uniqueCommands(metadata.flatMap((item) => item.verificationCommands));
  const commands = uniqueCommands(metadata.flatMap((item) => item.commands));
  const stackkit = uniqueStrings(metadata.flatMap((item) => item.stackkit));

  return {
    stack,
    layout,
    prerequisites: prerequisites.length > 0 ? prerequisites : [`${adapter.name} via Corepack where applicable`],
    installCommands: installCommands.length > 0 ? installCommands : [{ label: "Install dependencies", command: commandToString(adapter.installCommand) }],
    devCommands: devCommands.length > 0 ? devCommands : [{ label: "Start development", command: commandToString(adapter.runCommand("dev")) }],
    verificationCommands:
      verificationCommands.length > 0
        ? verificationCommands
        : [
            { label: "Run tests", command: commandToString(adapter.runCommand("test")) },
            { label: "Typecheck", command: commandToString(adapter.runCommand("typecheck")) }
          ],
    commands:
      commands.length > 0
        ? commands
        : [
            { label: "Build", command: commandToString(adapter.runCommand("build")) },
            { label: "Lint", command: commandToString(adapter.runCommand("lint")) },
            { label: "Format", command: commandToString(adapter.runCommand("format")) }
          ],
    stackkit:
      stackkit.length > 0
        ? stackkit
        : ["This project is generated and managed by Stackkit. Keep stackkit.config.json and .stackkit/project.json in sync with lifecycle changes."]
  };
}

export function renderList(items: readonly string[]): string {
  if (items.length === 0) {
    return "_None declared._";
  }

  return items.map((item) => `- ${item}`).join("\n");
}

export function renderLayout(entries: readonly ReadmeLayoutEntry[]): string {
  if (entries.length === 0) {
    return "_No project layout metadata declared._";
  }

  return entries.map((entry) => `- \`${entry.path}\` - ${entry.description}`).join("\n");
}

export function renderCommands(commands: readonly ReadmeCommand[]): string {
  if (commands.length === 0) {
    return "_No commands declared._";
  }

  return commands.map((command) => `- ${command.label}: \`${command.command}\``).join("\n");
}

export function renderEnvironmentTable(envVars: readonly NormalizedEnvVar[]): string {
  if (envVars.length === 0) {
    return "_No environment variables declared._";
  }

  return [
    "| Target | Name | Required | Description |",
    "| --- | --- | --- | --- |",
    ...envVars.map(
      (envVar) =>
        `| ${envTargetLabel(envVar.target)} | \`${envVar.name}\` | ${envVar.required ? "Required" : "Optional"} | ${envVar.description} |`
    )
  ].join("\n");
}

export function commandToString(command: readonly string[]): string {
  return command.join(" ");
}

export function uniqueStrings(items: readonly string[]): string[] {
  return [...new Set(items)];
}

export function uniqueLayout(entries: readonly ReadmeLayoutEntry[]): ReadmeLayoutEntry[] {
  return uniqueBy(entries, (entry) => `${entry.path}\0${entry.description}`);
}

export function uniqueCommands(commands: readonly ReadmeCommand[]): ReadmeCommand[] {
  return uniqueBy(commands, (command) => `${command.label}\0${command.command}`);
}

export function uniqueBy<T>(items: readonly T[], keyFor: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    const key = keyFor(item);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}
