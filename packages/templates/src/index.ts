import type { FileOperation } from "@berkayorhan/stackkit-schemas";

type PnpmTurboFoundationOptions = {
  projectName: string;
  packageManagerField?: string;
  workspaceFile?: string;
};

type NextjsAppOptions = {
  appName: string;
  packageManagerField?: string;
};

type FastApiServiceOptions = {
  serviceName: string;
  projectName?: string;
};

type DockerFilesOptions = {
  packageManagerName?: string;
  installCommand?: readonly string[];
  runBuildCommand?: readonly string[];
  runStartCommand?: readonly string[];
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

export function renderPnpmTurboFoundation({
  projectName,
  packageManagerField = "pnpm@10.5.1",
  workspaceFile
}: PnpmTurboFoundationOptions): FileOperation[] {
  const workspaceManifest = workspaceFile ?? (packageManagerField.startsWith("pnpm@") ? "pnpm-workspace.yaml" : undefined);
  const packageJson: Record<string, unknown> = {
    name: projectName,
    version: "0.0.0",
    private: true,
    type: "module",
    packageManager: packageManagerField,
    scripts: {
      dev: "turbo run dev",
      build: "turbo run build",
      test: "turbo run test",
      typecheck: "turbo run typecheck",
      lint: "turbo run lint",
      format: "turbo run format"
    },
    devDependencies: {
      "@eslint/js": "^9.39.1",
      "@types/node": "^24.0.0",
      eslint: "^9.39.1",
      prettier: "^3.7.4",
      turbo: "^2.9.16",
      typescript: "^5.9.3",
      "typescript-eslint": "^8.49.0",
      vitest: "^4.1.8"
    }
  };

  if (!workspaceManifest) {
    packageJson.workspaces = ["apps/*", "packages/*"];
  }

  const files = [
    writeFile(
      "package.json",
      workspaceOwner,
      `${JSON.stringify(packageJson, null, 2)}\n`
    ),
    writeFile(
      "turbo.json",
      workspaceOwner,
      `${JSON.stringify(
        {
          $schema: "https://turbo.build/schema.json",
          tasks: {
            dev: {
              cache: false,
              persistent: true
            },
            build: {
              dependsOn: ["^build"],
              outputs: ["dist/**", ".next/**", "!.next/cache/**"]
            },
            test: {
              dependsOn: ["^build"]
            },
            typecheck: {
              dependsOn: ["^build"]
            },
            lint: {
              dependsOn: ["^build"]
            },
            format: {
              cache: false
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
    writeFile(".gitignore", workspaceOwner, "node_modules\n.turbo\ndist\n"),
    writeFile(
      "eslint.config.mjs",
      "quality/eslint",
      'import js from "@eslint/js";\nimport tseslint from "typescript-eslint";\n\nexport default tseslint.config(js.configs.recommended, ...tseslint.configs.recommended);\n'
    ),
    writeFile("prettier.config.mjs", "quality/prettier", "export default {};\n")
  ];

  if (workspaceManifest) {
    files.splice(1, 0, writeFile(workspaceManifest, workspaceOwner, "packages:\n  - apps/*\n  - packages/*\n"));
  }

  return files;
}

export function renderNextjsApp({ appName, packageManagerField }: NextjsAppOptions): FileOperation[] {
  const root = `apps/${appName}`;
  const packageJson: Record<string, unknown> = {
    name: `@acme/${appName}`,
    private: true,
    type: "module",
    scripts: {
      dev: "next dev",
      build: "next build",
      test: "vitest run --passWithNoTests",
      start: "next start",
      typecheck: "tsc --noEmit",
      lint: "eslint --config ../../eslint.config.mjs app next.config.ts",
      format: "prettier --write ."
    },
    dependencies: {
      next: "^15.0.0",
      react: "^19.0.0",
      "react-dom": "^19.0.0"
    },
    devDependencies: {
      "@types/react": "^19.0.0",
      "@types/react-dom": "^19.0.0",
      typescript: "^5.9.3"
    }
  };

  if (packageManagerField) {
    packageJson.packageManager = packageManagerField;
  }

  return [
    writeFile(
      `${root}/package.json`,
      "web/nextjs",
      `${JSON.stringify(packageJson, null, 2)}\n`
    ),
    writeFile(
      `${root}/app/layout.tsx`,
      "web/nextjs",
      'import type { ReactNode } from "react";\n\nexport default function RootLayout({ children }: { children: ReactNode }) {\n  return (\n    <html lang="en">\n      <body>{children}</body>\n    </html>\n  );\n}\n'
    ),
    writeFile(
      `${root}/app/page.tsx`,
      "web/nextjs",
      "export default function Page() {\n  return <main>Stackkit app</main>;\n}\n"
    ),
    writeFile(
      `${root}/next.config.ts`,
      "web/nextjs",
      'import type { NextConfig } from "next";\n\nconst nextConfig: NextConfig = {};\n\nexport default nextConfig;\n'
    ),
    writeFile(
      `${root}/tsconfig.json`,
      "web/nextjs",
      `${JSON.stringify(
        {
          extends: "../../tsconfig.base.json",
          compilerOptions: {
            lib: ["dom", "dom.iterable", "esnext"],
            allowJs: true,
            incremental: true,
            esModuleInterop: true,
            resolveJsonModule: true,
            isolatedModules: true,
            jsx: "preserve",
            noEmit: true,
            plugins: [{ name: "next" }]
          },
          include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
          exclude: ["node_modules"]
        },
        null,
        2
      )}\n`
    )
  ];
}

export function renderShadcnUi({ appName }: NextjsAppOptions): FileOperation[] {
  const root = `apps/${appName}`;

  return [
    writeFile(
      `${root}/components.json`,
      "ui/shadcn",
      `${JSON.stringify(
        {
          style: "new-york",
          rsc: true,
          tsx: true,
          tailwind: {
            css: "app/globals.css",
            baseColor: "neutral",
            cssVariables: true
          },
          aliases: {
            components: "@/components",
            utils: "@/lib/utils"
          }
        },
        null,
        2
      )}\n`
    ),
    writeFile(
      `${root}/app/globals.css`,
      "ui/shadcn",
      '@import "tailwindcss";\n\n:root {\n  color-scheme: light;\n}\n'
    )
  ];
}

export function renderFastApiService({ serviceName, projectName }: FastApiServiceOptions): FileOperation[] {
  const root = `apps/${serviceName}`;
  const packageName = projectName ? `@${projectName}/${serviceName}` : `@acme/${serviceName}`;

  return [
    writeFile(
      `${root}/package.json`,
      "api/fastapi",
      `${JSON.stringify(
        {
          name: packageName,
          private: true,
          scripts: {
            dev: "uv run uvicorn app.main:app --reload",
            test: "uv run pytest",
            typecheck: "uv run python -m compileall app",
            lint: "uv run ruff check .",
            format: "uv run ruff format ."
          }
        },
        null,
        2
      )}\n`
    ),
    writeFile(
      `${root}/pyproject.toml`,
      "api/fastapi",
      [
        "[project]",
        `name = "${serviceName}"`,
        'version = "0.0.0"',
        'requires-python = ">=3.12"',
        "dependencies = [",
        '  "fastapi",',
        '  "uvicorn[standard]"',
        "]",
        "",
        "[dependency-groups]",
        "dev = [",
        '  "httpx",',
        '  "pytest",',
        '  "ruff"',
        "]",
        "",
        "[tool.pytest.ini_options]",
        'pythonpath = ["."]',
        ""
      ].join("\n")
    ),
    writeFile(
      `${root}/app/main.py`,
      "api/fastapi",
      'from fastapi import FastAPI\n\napp = FastAPI()\n\n@app.get("/health")\ndef health() -> dict[str, str]:\n    return {"status": "ok"}\n'
    ),
    writeFile(
      `${root}/tests/test_health.py`,
      "api/fastapi",
      'from fastapi.testclient import TestClient\n\nfrom app.main import app\n\n\ndef test_health() -> None:\n    client = TestClient(app)\n    assert client.get("/health").json() == {"status": "ok"}\n'
    )
  ];
}

export function renderVercelFiles(): FileOperation[] {
  return [writeFile("vercel.json", "deploy/vercel", `${JSON.stringify({ version: 2 }, null, 2)}\n`)];
}

export function renderDockerFiles({
  packageManagerName = "pnpm",
  installCommand = ["corepack", "enable", "&&", "pnpm", "install", "--frozen-lockfile"],
  runBuildCommand = ["pnpm", "build"],
  runStartCommand = ["pnpm", "start"]
}: DockerFilesOptions = {}): FileOperation[] {
  const baseImage = packageManagerName === "bun" ? "oven/bun:1-alpine" : "node:22-alpine";

  return [
    writeFile(
      "docker-compose.yml",
      "deploy/docker",
      'services:\n  web:\n    build: ./apps/web\n    ports:\n      - "3000:3000"\n'
    ),
    writeFile(
      "apps/web/Dockerfile",
      "deploy/docker",
      [
        `FROM ${baseImage}`,
        "WORKDIR /app",
        "COPY . .",
        `RUN ${shellCommand(installCommand)}`,
        `RUN ${shellCommand(runBuildCommand)}`,
        `CMD ${jsonCommand(runStartCommand)}`,
        ""
      ].join("\n")
    )
  ];
}

function shellCommand(command: readonly string[]): string {
  return command.join(" ");
}

function jsonCommand(command: readonly string[]): string {
  return `[${command.map((part) => JSON.stringify(part)).join(", ")}]`;
}

export function renderKubernetesFiles(): FileOperation[] {
  return [
    writeFile(
      "deploy/kubernetes/web-deployment.yaml",
      "deploy/kubernetes",
      "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\nspec:\n  replicas: 2\n  selector:\n    matchLabels:\n      app: web\n  template:\n    metadata:\n      labels:\n        app: web\n    spec:\n      containers:\n        - name: web\n          image: web:latest\n          ports:\n            - containerPort: 3000\n"
    )
  ];
}
