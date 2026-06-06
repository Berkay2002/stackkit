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
