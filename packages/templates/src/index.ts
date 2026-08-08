import type { FileOperation } from "@berkayorhan/stackkit-schemas";

import { writeFile } from "./file-operations.js";
import type { PyTypecheckChoice, TsToolingChoice } from "./tooling-configs.js";
import {
  goldenFastApiDependencies,
  renderGoldenFastApiFiles,
  renderGoldenFastApiMain
} from "./golden-fastapi.js";
import { renderAuth0HomePage, renderAuth0NextjsFiles } from "./golden-nextjs.js";

export type { PyTypecheckChoice, TsToolingChoice } from "./tooling-configs.js";
export {
  renderBiomeConfig,
  renderEslintConfig,
  renderMypyConfig,
  renderPrettierConfig,
  renderPyrightConfig,
  renderRuffConfig
} from "./tooling-configs.js";

type PnpmTurboFoundationOptions = {
  projectName: string;
  packageManagerField?: string;
  workspaceFile?: string;
  tsTooling?: TsToolingChoice;
};

type NextjsAppOptions = {
  appName: string;
  packageManagerField?: string;
  tsTooling?: TsToolingChoice;
  withShadcn?: boolean;
  withAuth0?: boolean;
  withTodoApi?: boolean;
};

type FastApiServiceOptions = {
  serviceName: string;
  projectName?: string;
  pyTypecheck?: PyTypecheckChoice;
  withSqlAlchemy?: boolean;
  withAuth0?: boolean;
};

type DockerFilesOptions = {
  packageManagerName?: string;
  installCommand?: readonly string[];
  runBuildCommand?: readonly string[];
  runStartCommand?: readonly string[];
  serviceTargets?: readonly DockerServiceTarget[];
  withPostgres?: boolean;
  withSqlAlchemy?: boolean;
};

const workspaceOwner = "workspace/pnpm-turbo";
type DockerServiceTarget = "web" | "api";

export function renderPnpmTurboFoundation({
  projectName,
  packageManagerField = "pnpm@10.5.1",
  workspaceFile,
  tsTooling = "eslint-prettier"
}: PnpmTurboFoundationOptions): FileOperation[] {
  const workspaceManifest = workspaceFile ?? (packageManagerField.startsWith("pnpm@") ? "pnpm-workspace.yaml" : undefined);
  const lintFormatDevDependencies =
    tsTooling === "biome"
      ? { "@biomejs/biome": "^2.0.0" }
      : {
          "@eslint/js": "^9.39.1",
          eslint: "^9.39.1",
          prettier: "^3.7.4",
          "typescript-eslint": "^8.49.0"
        };
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
      format: "turbo run format",
      "stackkit:doctor": "node .stackkit/doctor.cjs"
    },
    devDependencies: {
      "@types/node": "^24.0.0",
      ...lintFormatDevDependencies,
      turbo: "^2.9.16",
      typescript: "^5.9.3",
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
    writeFile(
      "tsconfig.json",
      "workspace/typescript",
      `${JSON.stringify(
        {
          extends: "./tsconfig.base.json",
          compilerOptions: {
            paths: {}
          }
        },
        null,
        2
      )}\n`
    ),
    writeFile(
      ".stackkit/doctor.cjs",
      workspaceOwner,
      [
        'const { spawnSync } = require("node:child_process");',
        'const directBinary = process.env.STACKKIT_DOCTOR_BIN;',
        'const command = directBinary || (process.platform === "win32" ? "npx.cmd" : "npx");',
        'const args = directBinary ? ["doctor"] : ["--yes", "@berkayorhan/stackkit@0.3.0", "doctor"];',
        'const result = spawnSync(command, args, { stdio: "inherit" });',
        'process.exit(result.status ?? 1);',
        ""
      ].join("\n")
    ),
    writeFile(
      ".gitignore",
      workspaceOwner,
      "node_modules\n.turbo\ndist\n.next\n.venv\n__pycache__\n*.pyc\n.env\n.env.*\n!.env.example\n"
    )
  ];

  if (workspaceManifest) {
    files.splice(1, 0, writeFile(workspaceManifest, workspaceOwner, "packages:\n  - apps/*\n  - packages/*\n"));
  }

  return files;
}

export function renderNextjsApp({
  appName,
  packageManagerField,
  tsTooling = "eslint-prettier",
  withShadcn = false,
  withAuth0 = false,
  withTodoApi = false
}: NextjsAppOptions): FileOperation[] {
  const root = `apps/${appName}`;
  const lintFormatScripts =
    tsTooling === "biome"
      ? { lint: "biome lint .", format: "biome format --write ." }
      : { lint: "eslint --config ../../eslint.config.mjs app lib proxy.ts next.config.ts", format: "prettier --write ." };
  const dependencies: Record<string, string> = {
    next: "^16.3.0",
    react: "^19.2.8",
    "react-dom": "^19.2.8"
  };

  if (withShadcn) {
    dependencies["@workspace/ui"] = "workspace:*";
  }
  if (withAuth0) {
    dependencies["@auth0/nextjs-auth0"] = "^4.26.0";
  }
  const devDependencies: Record<string, string> = {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    typescript: "^5.9.3"
  };

  if (withShadcn) {
    devDependencies["@tailwindcss/postcss"] = "^4";
  }

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
      ...lintFormatScripts
    },
    dependencies,
    devDependencies
  };

  if (packageManagerField) {
    packageJson.packageManager = packageManagerField;
  }

  const files = [
    writeFile(
      `${root}/package.json`,
      "web/nextjs",
      `${JSON.stringify(packageJson, null, 2)}\n`
    ),
    writeFile(
      `${root}/app/layout.tsx`,
      "web/nextjs",
      `${withShadcn ? 'import "@workspace/ui/globals.css";\n' : ""}import type { ReactNode } from "react";\n\nexport default function RootLayout({ children }: { children: ReactNode }) {\n  return (\n    <html lang="en">\n      <body>{children}</body>\n    </html>\n  );\n}\n`
    ),
    writeFile(
      `${root}/app/page.tsx`,
      "web/nextjs",
      withAuth0 ? renderAuth0HomePage() : "export default function Page() {\n  return <main>Stackkit app</main>;\n}\n"
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

  if (withAuth0) {
    files.push(...renderAuth0NextjsFiles(root, withTodoApi));
  }

  if (withShadcn) {
    files.push(
      writeFile(
        `${root}/postcss.config.mjs`,
        "ui/shadcn",
        'export { default } from "@workspace/ui/postcss.config";\n'
      )
    );
  }

  return files;
}

type DatabaseClientOptions = {
  client: "drizzle" | "prisma";
  runtime?: "node" | "edge";
  provider?: string;
};

const STANDARD_DRIZZLE_CLIENT = `// Install: pnpm add drizzle-orm pg && pnpm add -D @types/pg
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool);
`;

const NEON_SERVERLESS_CLIENT = `// Install: pnpm add drizzle-orm @neondatabase/serverless
// Neon serverless driver: use the pooled connection string with sslmode=require.
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

const sql = neon(process.env.DATABASE_URL!);

export const db = drizzle(sql);
`;

function renderPrismaSchema(provider: string | undefined): string {
  const usesDirectUrl = provider === "postgres/supabase" || provider === "postgres/supabase-local";
  const directUrlLine = usesDirectUrl ? '\n  directUrl = env("DIRECT_URL")' : "";

  return `// Install: pnpm add @prisma/client && pnpm add -D prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")${directUrlLine}
}
`;
}

export function renderDatabaseClient({ client, runtime = "node", provider }: DatabaseClientOptions): FileOperation[] {
  if (client === "prisma") {
    return [writeFile("apps/web/prisma/schema.prisma", "db/prisma", renderPrismaSchema(provider))];
  }

  const content = runtime === "edge" && provider === "postgres/neon" ? NEON_SERVERLESS_CLIENT : STANDARD_DRIZZLE_CLIENT;

  return [writeFile("apps/web/db/client.ts", "db/drizzle", content)];
}

type ShadcnFramework = "nextjs" | "vite" | "tanstack-start";
type ShadcnUiOptions = { appName: string; framework?: ShadcnFramework };

const SHADCN_SHARED_CSS_PATH = "packages/ui/src/styles/globals.css";
const SHADCN_APP_CSS_PATH = "../../packages/ui/src/styles/globals.css";

export function renderShadcnUi({ appName, framework = "nextjs" }: ShadcnUiOptions): FileOperation[] {
  const root = `apps/${appName}`;
  const rsc = framework === "nextjs";
  const baseConfig = {
    $schema: "https://ui.shadcn.com/schema.json",
    style: "radix-nova",
    rsc,
    tsx: true,
    tailwind: { config: "", css: "src/styles/globals.css", baseColor: "neutral", cssVariables: true },
    iconLibrary: "lucide",
    aliases: {
      components: "@workspace/ui/components",
      utils: "@workspace/ui/lib/utils",
      hooks: "@workspace/ui/hooks",
      lib: "@workspace/ui/lib",
      ui: "@workspace/ui/components"
    },
    rtl: false,
    menuColor: "default",
    menuAccent: "subtle"
  };

  return [
    writeFile(
      `${root}/components.json`,
      "ui/shadcn",
      `${JSON.stringify(
        {
          ...baseConfig,
          tailwind: { ...baseConfig.tailwind, css: SHADCN_APP_CSS_PATH },
          aliases: {
            components: "@/components",
            hooks: "@/hooks",
            lib: "@/lib",
            utils: "@workspace/ui/lib/utils",
            ui: "@workspace/ui/components"
          }
        },
        null,
        2
      )}\n`
    ),
    writeFile("packages/ui/components.json", "ui/shadcn", `${JSON.stringify(baseConfig, null, 2)}\n`),
    writeFile(
      "packages/ui/package.json",
      "ui/shadcn",
      `${JSON.stringify(
        {
          name: "@workspace/ui",
          version: "0.0.0",
          private: true,
          type: "module",
          imports: {
            "#components/*": "./src/components/*.tsx",
            "#lib/*": "./src/lib/*.ts",
            "#hooks/*": "./src/hooks/*.ts"
          },
          scripts: {
            typecheck: "tsc --noEmit"
          },
          exports: {
            "./globals.css": "./src/styles/globals.css",
            "./postcss.config": "./postcss.config.mjs",
            "./components/*": "./src/components/*.tsx",
            "./lib/*": "./src/lib/*.ts",
            "./hooks/*": "./src/hooks/*.ts"
          },
          dependencies: {
            react: "^19.0.0",
            "react-dom": "^19.0.0"
          },
          devDependencies: {
            "@tailwindcss/postcss": "^4",
            "@types/react": "^19.0.0",
            "@types/react-dom": "^19.0.0",
            tailwindcss: "^4",
            typescript: "^5.9.3"
          }
        },
        null,
        2
      )}\n`
    ),
    writeFile(
      "packages/ui/tsconfig.json",
      "ui/shadcn",
      `${JSON.stringify(
        {
          extends: "../../tsconfig.base.json",
          compilerOptions: {
            lib: ["dom", "dom.iterable", "esnext"],
            jsx: "react-jsx",
            noEmit: true
          },
          include: ["src"]
        },
        null,
        2
      )}\n`
    ),
    writeFile(
      "packages/ui/postcss.config.mjs",
      "ui/shadcn",
      '/** @type {import("postcss-load-config").Config} */\nconst config = {\n  plugins: { "@tailwindcss/postcss": {} }\n};\n\nexport default config;\n'
    ),
    writeFile(SHADCN_SHARED_CSS_PATH, "ui/shadcn", '@import "tailwindcss";\n')
  ];
}

type ViteAppOptions = { appName: string; packageManagerField?: string; withShadcn?: boolean };

export function renderViteApp({ appName, packageManagerField, withShadcn = false }: ViteAppOptions): FileOperation[] {
  const root = `apps/${appName}`;
  const packageJson: Record<string, unknown> = {
    name: `@acme/${appName}`,
    private: true,
    type: "module",
    scripts: {
      dev: "vite", build: "vite build", preview: "vite preview",
      test: "vitest run --passWithNoTests", typecheck: "tsc --noEmit",
      lint: "eslint src", format: "prettier --write ."
    },
    dependencies: { ...(withShadcn ? { "@workspace/ui": "workspace:*" } : {}), react: "^19.0.0", "react-dom": "^19.0.0" },
    devDependencies: {
      "@types/react": "^19.0.0", "@types/react-dom": "^19.0.0",
      "@vitejs/plugin-react": "^4.3.4", typescript: "^5.9.3", vite: "^6.0.0"
    }
  };
  if (packageManagerField) packageJson.packageManager = packageManagerField;

  const files = [
    writeFile(`${root}/package.json`, "web/vite", `${JSON.stringify(packageJson, null, 2)}\n`),
    writeFile(`${root}/index.html`, "web/vite", '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>Stackkit app</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>\n'),
    writeFile(`${root}/vite.config.ts`, "web/vite", 'import { fileURLToPath, URL } from "node:url";\nimport react from "@vitejs/plugin-react";\nimport { defineConfig } from "vite";\n\nexport default defineConfig({\n  plugins: [react()],\n  resolve: {\n    alias: {\n      "@": fileURLToPath(new URL("./src", import.meta.url))\n    }\n  }\n});\n'),
    writeFile(`${root}/tsconfig.json`, "web/vite", `${JSON.stringify({ extends: "../../tsconfig.base.json", compilerOptions: { lib: ["ES2022", "DOM", "DOM.Iterable"], jsx: "react-jsx", noEmit: true, paths: { "@/*": ["./src/*"] } }, include: ["src"], references: [{ path: "./tsconfig.node.json" }] }, null, 2)}\n`),
    writeFile(`${root}/tsconfig.node.json`, "web/vite", `${JSON.stringify({ compilerOptions: { composite: true, module: "ESNext", moduleResolution: "Bundler", noEmit: true }, include: ["vite.config.ts"] }, null, 2)}\n`),
    writeFile(`${root}/src/main.tsx`, "web/vite", `import { StrictMode } from "react";\nimport { createRoot } from "react-dom/client";\nimport App from "./App";\nimport ${withShadcn ? '"@workspace/ui/globals.css"' : '"./index.css"'};\n\ncreateRoot(document.getElementById("root")!).render(\n  <StrictMode>\n    <App />\n  </StrictMode>\n);\n`),
    writeFile(`${root}/src/App.tsx`, "web/vite", 'export default function App() {\n  return <main>Stackkit app</main>;\n}\n'),
    writeFile(`${root}/src/vite-env.d.ts`, "web/vite", '/// <reference types="vite/client" />\n')
  ];
  if (!withShadcn) {
    files.push(writeFile(`${root}/src/index.css`, "web/vite", ":root {\n  color-scheme: light;\n}\n"));
  }
  return files;
}

type TanStackStartAppOptions = { appName: string; packageManagerField?: string; withShadcn?: boolean };

export function renderTanStackStartApp({ appName, packageManagerField, withShadcn = false }: TanStackStartAppOptions): FileOperation[] {
  const root = `apps/${appName}`;
  const packageJson: Record<string, unknown> = {
    name: `@acme/${appName}`,
    private: true,
    type: "module",
    scripts: {
      dev: "vite dev", build: "vite build", start: "node .output/server/index.mjs",
      test: "vitest run --passWithNoTests", typecheck: "tsc --noEmit",
      lint: "eslint src", format: "prettier --write ."
    },
    dependencies: {
      ...(withShadcn ? { "@workspace/ui": "workspace:*" } : {}),
      "@tanstack/react-router": "^1.95.0", "@tanstack/react-start": "^1.95.0",
      react: "^19.0.0", "react-dom": "^19.0.0"
    },
    devDependencies: {
      "@types/react": "^19.0.0", "@types/react-dom": "^19.0.0",
      "@vitejs/plugin-react": "^4.3.4", nitro: "^2.10.0", typescript: "^5.9.3", vite: "^6.0.0"
    }
  };
  if (packageManagerField) packageJson.packageManager = packageManagerField;

  const files = [
    writeFile(`${root}/package.json`, "web/tanstack-start", `${JSON.stringify(packageJson, null, 2)}\n`),
    writeFile(`${root}/vite.config.ts`, "web/tanstack-start", 'import { tanstackStart } from "@tanstack/react-start/plugin/vite";\nimport viteReact from "@vitejs/plugin-react";\nimport { defineConfig } from "vite";\n\nexport default defineConfig({\n  server: { port: 3000 },\n  plugins: [tanstackStart(), viteReact()]\n});\n'),
    writeFile(`${root}/tsconfig.json`, "web/tanstack-start", `${JSON.stringify({ extends: "../../tsconfig.base.json", compilerOptions: { lib: ["ES2022", "DOM", "DOM.Iterable"], jsx: "react-jsx", moduleResolution: "Bundler", noEmit: true, paths: { "@/*": ["./src/*"] } }, include: ["src"] }, null, 2)}\n`),
    writeFile(`${root}/src/router.tsx`, "web/tanstack-start", 'import { createRouter as createTanStackRouter } from "@tanstack/react-router";\nimport { routeTree } from "./routeTree.gen";\n\nexport function createRouter() {\n  return createTanStackRouter({ routeTree, scrollRestoration: true });\n}\n\ndeclare module "@tanstack/react-router" {\n  interface Register {\n    router: ReturnType<typeof createRouter>;\n  }\n}\n'),
    writeFile(`${root}/src/routes/__root.tsx`, "web/tanstack-start", `${withShadcn ? 'import "@workspace/ui/globals.css";\n' : 'import "../styles/app.css";\n'}import { Outlet, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";\nimport type { ReactNode } from "react";\n\nexport const Route = createRootRoute({\n  head: () => ({\n    meta: [\n      { charSet: "utf-8" },\n      { name: "viewport", content: "width=device-width, initial-scale=1" },\n      { title: "Stackkit app" }\n    ]\n  }),\n  component: RootComponent\n});\n\nfunction RootComponent() {\n  return (\n    <RootDocument>\n      <Outlet />\n    </RootDocument>\n  );\n}\n\nfunction RootDocument({ children }: Readonly<{ children: ReactNode }>) {\n  return (\n    <html>\n      <head>\n        <HeadContent />\n      </head>\n      <body>\n        {children}\n        <Scripts />\n      </body>\n    </html>\n  );\n}\n`),
    writeFile(`${root}/src/routes/index.tsx`, "web/tanstack-start", 'import { createFileRoute } from "@tanstack/react-router";\n\nexport const Route = createFileRoute("/")({\n  component: Home\n});\n\nfunction Home() {\n  return <main>Stackkit app</main>;\n}\n'),
    writeFile(`${root}/.gitignore`, "web/tanstack-start", ".output\n.nitro\n.tanstack\nsrc/routeTree.gen.ts\n")
  ];
  if (!withShadcn) {
    files.push(writeFile(`${root}/src/styles/app.css`, "web/tanstack-start", ":root {\n  color-scheme: light;\n}\n"));
  }
  return files;
}

export function renderFastApiService({
  serviceName,
  projectName,
  pyTypecheck = "mypy",
  withSqlAlchemy = false,
  withAuth0 = false
}: FastApiServiceOptions): FileOperation[] {
  const root = `apps/${serviceName}`;
  const packageName = projectName ? `@${projectName}/${serviceName}` : `@acme/${serviceName}`;
  // Ruff is always present for lint/format; the type checker is the only Python tooling choice here.
  const devGroup = ["httpx", "mypy", "pyright", "pytest", "ruff"]
    .filter((tool) => tool === "ruff" || tool === "httpx" || tool === "pytest" || tool === pyTypecheck)
    .sort();

  const dependencies = goldenFastApiDependencies({ withSqlAlchemy, withAuth0 });
  const files = [
    writeFile(
      `${root}/package.json`,
      "api/fastapi",
      `${JSON.stringify(
        {
          name: packageName,
          private: true,
          scripts: {
            dev: withSqlAlchemy
              ? "uv run alembic upgrade head && uv run uvicorn app.main:app --reload"
              : "uv run uvicorn app.main:app --reload",
            test: "uv run pytest",
            typecheck: `uv run ${pyTypecheck} .`,
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
        ...dependencies.map((dependency, index) => `  "${dependency}"${index === dependencies.length - 1 ? "" : ","}`),
        "]",
        "",
        "[dependency-groups]",
        "dev = [",
        ...devGroup.map((tool, index) => `  "${tool}"${index === devGroup.length - 1 ? "" : ","}`),
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
      renderGoldenFastApiMain({ withSqlAlchemy, withAuth0 })
    ),
    writeFile(
      `${root}/tests/test_health.py`,
      "api/fastapi",
      'from fastapi.testclient import TestClient\n\nfrom app.main import app\n\n\ndef test_health() -> None:\n    client = TestClient(app)\n    assert client.get("/health").json() == {"status": "ok"}\n'
    )
  ];

  files.push(...renderGoldenFastApiFiles({ root, withSqlAlchemy, withAuth0 }));
  return files;
}

export function renderVercelFiles(): FileOperation[] {
  return [writeFile("vercel.json", "deploy/vercel", `${JSON.stringify({ version: 2 }, null, 2)}\n`)];
}

export function renderDockerFiles({
  packageManagerName = "pnpm",
  installCommand = ["corepack", "enable", "&&", "pnpm", "install", "--frozen-lockfile"],
  runBuildCommand = ["pnpm", "build"],
  runStartCommand = ["pnpm", "start"],
  serviceTargets = ["web"],
  withPostgres = false,
  withSqlAlchemy = false
}: DockerFilesOptions = {}): FileOperation[] {
  const baseImage = packageManagerName === "bun" ? "oven/bun:1-alpine" : "node:22-alpine";
  const targets = uniqueServiceTargets(serviceTargets);
  const files: FileOperation[] = [
    writeFile("docker-compose.yml", "deploy/docker", renderDockerCompose(targets, withPostgres)),
    writeFile(
      ".dockerignore",
      "deploy/docker",
      ".git\n.stackkit\nnode_modules\n**/node_modules\n.turbo\n**/.next\n**/dist\n**/.venv\n**/__pycache__\n.env\n.env.*\n!.env.example\n"
    )
  ];

  if (targets.includes("web")) {
    files.push(
      writeFile(
        "apps/web/Dockerfile",
        "deploy/docker",
        renderWebDockerfile({ baseImage, installCommand, runBuildCommand, runStartCommand })
      )
    );
  }

  if (targets.includes("api")) {
    files.push(
      writeFile(
        "apps/api/Dockerfile",
        "deploy/docker",
        [
          "FROM python:3.13-slim",
          "WORKDIR /app",
          "COPY . .",
          "WORKDIR /app/apps/api",
          "RUN pip install --no-cache-dir uv && uv sync",
          withSqlAlchemy
            ? 'CMD ["sh", "-c", "uv run alembic upgrade head && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000"]'
            : 'CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]',
          ""
        ].join("\n")
      )
    );
  }

  return files;
}

function uniqueServiceTargets(serviceTargets: readonly DockerServiceTarget[]): DockerServiceTarget[] {
  return [...new Set(serviceTargets)];
}

function renderDockerCompose(serviceTargets: readonly DockerServiceTarget[], withPostgres: boolean): string {
  const services: string[] = [];

  // Build from the repository root so workspace packages (referenced via workspace:* deps) are
  // part of the build context; the per-service Dockerfile path is given explicitly.
  if (serviceTargets.includes("web")) {
    services.push(
      renderComposeService({
        name: "web",
        dockerfile: "apps/web/Dockerfile",
        port: 3000,
        environment: serviceTargets.includes("api")
          ? [
              "API_BASE_URL=http://api:8000",
              "APP_BASE_URL=http://localhost:3000",
              "AUTH0_DOMAIN=${AUTH0_DOMAIN}",
              "AUTH0_CLIENT_ID=${AUTH0_CLIENT_ID}",
              "AUTH0_CLIENT_SECRET=${AUTH0_CLIENT_SECRET}",
              "AUTH0_SECRET=${AUTH0_SECRET}",
              "AUTH0_AUDIENCE=${AUTH0_AUDIENCE}",
              "AUTH0_ALLOW_INSECURE_REQUESTS=${AUTH0_ALLOW_INSECURE_REQUESTS:-false}"
            ]
          : [],
        dependsOn: serviceTargets.includes("api") ? { api: "service_started" } : {}
      })
    );
  }

  if (serviceTargets.includes("api")) {
    services.push(
      renderComposeService({
        name: "api",
        dockerfile: "apps/api/Dockerfile",
        port: 8000,
        environment: withPostgres
          ? [
              "DATABASE_URL=postgresql+psycopg://postgres:postgres@db:5432/app",
              "AUTH0_DOMAIN=${AUTH0_DOMAIN}",
              "AUTH0_AUDIENCE=${AUTH0_AUDIENCE}",
              "AUTH0_ISSUER=${AUTH0_ISSUER:-}",
              "AUTH0_JWKS_URL=${AUTH0_JWKS_URL:-}"
            ]
          : [],
        dependsOn: withPostgres ? { db: "service_healthy" } : {}
      })
    );
  }

  if (withPostgres) {
    services.push(
      [
        "  db:",
        "    image: postgres:17-alpine",
        "    environment:",
        "      POSTGRES_USER: postgres",
        "      POSTGRES_PASSWORD: postgres",
        "      POSTGRES_DB: app",
        "    ports:",
        '      - "5432:5432"',
        "    volumes:",
        "      - pgdata:/var/lib/postgresql/data",
        "    healthcheck:",
        '      test: ["CMD-SHELL", "pg_isready -U postgres -d app"]',
        "      interval: 2s",
        "      timeout: 2s",
        "      retries: 15"
      ].join("\n")
    );
  }

  return `services:\n${services.join("\n")}\n${withPostgres ? "volumes:\n  pgdata:\n" : ""}`;
}

function renderComposeService({
  name,
  dockerfile,
  port,
  environment = [],
  dependsOn = {}
}: {
  name: string;
  dockerfile: string;
  port: number;
  environment?: readonly string[];
  dependsOn?: Readonly<Record<string, "service_started" | "service_healthy">>;
}): string {
  const lines = [
    `  ${name}:`,
    "    build:",
    "      context: .",
    `      dockerfile: ${dockerfile}`,
    "    ports:",
    `      - "${port}:${port}"`
  ];
  if (environment.length > 0) {
    lines.push("    environment:", ...environment.map((value) => `      - ${value}`));
  }
  if (Object.keys(dependsOn).length > 0) {
    lines.push(
      "    depends_on:",
      ...Object.entries(dependsOn).flatMap(([service, condition]) => [
        `      ${service}:`,
        `        condition: ${condition}`
      ])
    );
  }
  return lines.join("\n");
}

function renderKubernetesDeployment({
  name,
  port
}: {
  name: string;
  port: number;
}): string {
  return [
    "apiVersion: apps/v1",
    "kind: Deployment",
    "metadata:",
    `  name: ${name}`,
    "spec:",
    "  replicas: 2",
    "  selector:",
    "    matchLabels:",
    `      app: ${name}`,
    "  template:",
    "    metadata:",
    "      labels:",
    `        app: ${name}`,
    "    spec:",
    "      containers:",
    `        - name: ${name}`,
    `          image: ${name}:latest`,
    "          ports:",
    `            - containerPort: ${port}`,
    ""
  ].join("\n");
}

function renderWebDockerfile({
  baseImage,
  installCommand,
  runBuildCommand,
  runStartCommand
}: {
  baseImage: string;
  installCommand: readonly string[];
  runBuildCommand: readonly string[];
  runStartCommand: readonly string[];
}): string {
  // Root build context: copy the whole workspace, install and build from the root so workspace
  // packages resolve, then start the web app from its own directory.
  return [
    `FROM ${baseImage}`,
    "WORKDIR /app",
    "COPY . .",
    `RUN ${shellCommand(installCommand)}`,
    `RUN ${shellCommand(runBuildCommand)}`,
    "WORKDIR /app/apps/web",
    `CMD ${jsonCommand(runStartCommand)}`,
    ""
  ].join("\n");
}

function shellCommand(command: readonly string[]): string {
  return command.join(" ");
}

function jsonCommand(command: readonly string[]): string {
  return `[${command.map((part) => JSON.stringify(part)).join(", ")}]`;
}

export function renderKubernetesFiles({
  serviceTargets = ["web"]
}: {
  serviceTargets?: readonly DockerServiceTarget[];
} = {}): FileOperation[] {
  const targets = uniqueServiceTargets(serviceTargets);
  const files: FileOperation[] = [];

  if (targets.includes("web")) {
    files.push(
      writeFile(
        "deploy/kubernetes/web-deployment.yaml",
        "deploy/kubernetes",
        renderKubernetesDeployment({ name: "web", port: 3000 })
      )
    );
  }

  if (targets.includes("api")) {
    files.push(
      writeFile(
        "deploy/kubernetes/api-deployment.yaml",
        "deploy/kubernetes",
        renderKubernetesDeployment({ name: "api", port: 8000 })
      )
    );
  }

  return files;
}
