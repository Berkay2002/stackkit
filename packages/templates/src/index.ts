import type { FileOperation } from "@stackkit/schemas";

type PnpmTurboFoundationOptions = {
  projectName: string;
};

const workspaceOwner = "workspace/pnpm-turbo";

function writeFile(path: string, owner: FileOperation["owner"], content: string): FileOperation {
  return {
    kind: "write",
    path,
    owner,
    content,
    overwrite: "if-owned"
  };
}

export function renderPnpmTurboFoundation({ projectName }: PnpmTurboFoundationOptions): FileOperation[] {
  return [
    writeFile(
      "package.json",
      workspaceOwner,
      `${JSON.stringify(
        {
          name: projectName,
          version: "0.0.0",
          private: true,
          type: "module",
          packageManager: "pnpm@10.5.1",
          scripts: {
            build: "turbo run build",
            test: "turbo run test",
            typecheck: "turbo run typecheck"
          },
          devDependencies: {
            "@types/node": "^24.0.0",
            turbo: "^2.9.16",
            typescript: "^5.9.3",
            vitest: "^4.1.8"
          }
        },
        null,
        2
      )}\n`
    ),
    writeFile("pnpm-workspace.yaml", workspaceOwner, "packages:\n  - apps/*\n  - packages/*\n"),
    writeFile(
      "turbo.json",
      workspaceOwner,
      `${JSON.stringify(
        {
          $schema: "https://turbo.build/schema.json",
          tasks: {
            build: {
              dependsOn: ["^build"],
              outputs: ["dist/**", ".next/**", "!.next/cache/**"]
            },
            test: {
              dependsOn: ["^build"]
            },
            typecheck: {
              dependsOn: ["^build"]
            }
          }
        },
        null,
        2
      )}\n`
    ),
    writeFile(
      "tsconfig.base.json",
      "workspace/typescript",
      `${JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "ESNext",
            moduleResolution: "Bundler",
            strict: true,
            skipLibCheck: true
          }
        },
        null,
        2
      )}\n`
    ),
    writeFile(".gitignore", workspaceOwner, "node_modules\n.turbo\ndist\n")
  ];
}
