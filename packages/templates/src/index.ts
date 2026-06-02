import type { FileOperation } from "@stackkit/schemas";

type PnpmTurboFoundationOptions = {
  projectName: string;
};

type NextjsAppOptions = {
  appName: string;
};

type FastApiServiceOptions = {
  serviceName: string;
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

export function renderNextjsApp({ appName }: NextjsAppOptions): FileOperation[] {
  const root = `apps/${appName}`;

  return [
    writeFile(
      `${root}/package.json`,
      "web/nextjs",
      `${JSON.stringify(
        {
          name: `@acme/${appName}`,
          private: true,
          type: "module",
          scripts: {
            dev: "next dev",
            build: "next build",
            start: "next start",
            typecheck: "tsc --noEmit"
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
        },
        null,
        2
      )}\n`
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
            jsx: "preserve",
            noEmit: true,
            plugins: [{ name: "next" }]
          },
          include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"]
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

export function renderFastApiService({ serviceName }: FastApiServiceOptions): FileOperation[] {
  const root = `apps/${serviceName}`;

  return [
    writeFile(
      `${root}/pyproject.toml`,
      "api/fastapi",
      [
        "[project]",
        `name = "${serviceName}"`,
        'version = "0.0.0"',
        'requires-python = ">=3.12"',
        'dependencies = ["fastapi", "uvicorn[standard]"]',
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
      "quality/pytest",
      'from fastapi.testclient import TestClient\n\nfrom app.main import app\n\n\ndef test_health() -> None:\n    client = TestClient(app)\n    assert client.get("/health").json() == {"status": "ok"}\n'
    )
  ];
}

export function renderVercelFiles(): FileOperation[] {
  return [writeFile("vercel.json", "deploy/vercel", `${JSON.stringify({ version: 2 }, null, 2)}\n`)];
}

export function renderDockerFiles(): FileOperation[] {
  return [
    writeFile(
      "docker-compose.yml",
      "deploy/docker",
      'services:\n  web:\n    build: ./apps/web\n    ports:\n      - "3000:3000"\n'
    ),
    writeFile(
      "apps/web/Dockerfile",
      "deploy/docker",
      'FROM node:22-alpine\nWORKDIR /app\nCOPY . .\nRUN corepack enable && pnpm install --frozen-lockfile\nRUN pnpm build\nCMD ["pnpm", "start"]\n'
    )
  ];
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
