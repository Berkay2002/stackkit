import { existsSync } from "node:fs";
import { join } from "node:path";

import { type PackageManager } from "@berkayorhan/stackkit-schemas";

export type PackageManagerName = PackageManager;

export type PackageManagerAdapter = {
  name: PackageManagerName;
  lockfile: string;
  workspaceFile?: string;
  packageManagerField: string;
  installCommand: string[];
  runCommand: (script: string) => string[];
  addCommand: (packages: readonly string[]) => string[];
  dlxCommand: (packageName: string, args: readonly string[]) => string[];
};

export type CommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type RunCommand = (
  command: string,
  args: readonly string[],
  options: {
    cwd?: string;
  }
) => Promise<CommandResult>;

export type ResolvedSpawnCommand = {
  command: string;
  args: string[];
  windowsVerbatimArguments?: boolean;
};

const packageManagers: Record<PackageManagerName, PackageManagerAdapter> = {
  pnpm: {
    name: "pnpm",
    lockfile: "pnpm-lock.yaml",
    workspaceFile: "pnpm-workspace.yaml",
    packageManagerField: "pnpm@10.5.1",
    installCommand: ["pnpm", "install"],
    runCommand: (script) => ["pnpm", script],
    addCommand: (packages) => ["pnpm", "add", ...packages],
    dlxCommand: (packageName, args) => ["pnpm", "dlx", packageName, ...args]
  },
  npm: {
    name: "npm",
    lockfile: "package-lock.json",
    packageManagerField: "npm@11.5.2",
    installCommand: ["npm", "install"],
    runCommand: (script) => ["npm", "run", script],
    addCommand: (packages) => ["npm", "install", ...packages],
    dlxCommand: (packageName, args) => ["npx", "-y", packageName, ...args]
  },
  yarn: {
    name: "yarn",
    lockfile: "yarn.lock",
    packageManagerField: "yarn@4.9.4",
    installCommand: ["yarn", "install"],
    runCommand: (script) => ["yarn", script],
    addCommand: (packages) => ["yarn", "add", ...packages],
    dlxCommand: (packageName, args) => ["yarn", "dlx", packageName, ...args]
  },
  bun: {
    name: "bun",
    lockfile: "bun.lock",
    packageManagerField: "bun@1.2.15",
    installCommand: ["bun", "install"],
    runCommand: (script) => ["bun", "run", script],
    addCommand: (packages) => ["bun", "add", ...packages],
    dlxCommand: (packageName, args) => ["bunx", packageName, ...args]
  }
};

export function getPackageManagerAdapter(name: PackageManagerName): PackageManagerAdapter {
  return packageManagers[name];
}

export function resolveSpawnCommand(
  command: string,
  args: readonly string[],
  options: { platform?: NodeJS.Platform; comspec?: string; env?: NodeJS.ProcessEnv; cwd?: string } = {}
): ResolvedSpawnCommand {
  if ((options.platform ?? process.platform) !== "win32") {
    return { command, args: [...args] };
  }

  const env = options.env ?? process.env;
  // .cmd/.bat shims (npx, pnpm, npm, yarn) re-parse their arguments through %*, so cmd.exe
  // metacharacters need a second escaping pass there (the "BatBadBut" problem). Unresolvable
  // commands get it too: cmd.exe fails to start them either way.
  const resolved = findWindowsCommand(command, env, options.cwd);
  const doubleEscape = resolved === undefined || /\.(cmd|bat)$/i.test(resolved);
  const shellCommand = [
    escapeWindowsCommand(command),
    ...args.map((argument) => escapeWindowsArgument(argument, doubleEscape))
  ].join(" ");

  return {
    command: options.comspec ?? env.ComSpec ?? env.comspec ?? "cmd.exe",
    args: ["/d", "/s", "/c", `"${shellCommand}"`],
    windowsVerbatimArguments: true
  };
}

const windowsCmdMetaChars = /([()\][%!^"`<>&|;, *?])/g;

function findWindowsCommand(command: string, env: NodeJS.ProcessEnv, cwd: string | undefined): string | undefined {
  const extensions = (env.PATHEXT ?? env.Pathext ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean);
  const candidates = extensions.some((extension) => command.toLowerCase().endsWith(extension.toLowerCase()))
    ? [command]
    : extensions.map((extension) => `${command}${extension}`);
  const directories = /[\\/]/.test(command)
    ? [""]
    : [cwd ?? process.cwd(), ...(env.PATH ?? env.Path ?? "").split(";").filter(Boolean)];

  for (const directory of directories) {
    for (const candidate of candidates) {
      const path = directory ? join(directory, candidate) : candidate;

      if (existsSync(path)) {
        return path;
      }
    }
  }

  return undefined;
}

function escapeWindowsCommand(command: string): string {
  return command.replace(windowsCmdMetaChars, "^$1");
}

function escapeWindowsArgument(argument: string, doubleEscape: boolean): string {
  let escaped = `${argument}`;
  escaped = escaped.replace(/(?=(\\+?)?)\1"/g, '$1$1\\"');
  escaped = escaped.replace(/(?=(\\+?)?)\1$/, "$1$1");
  escaped = `"${escaped}"`.replace(windowsCmdMetaChars, "^$1");

  return doubleEscape ? escaped.replace(windowsCmdMetaChars, "^$1") : escaped;
}
