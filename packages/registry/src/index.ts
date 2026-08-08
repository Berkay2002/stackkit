import {
  defineModule,
  definePreset,
  stackkitRegistrySchema,
  type NativeInitializerInput,
  type SupportMetadata
} from "@berkayorhan/stackkit-schemas";

import { buildQualityModules } from "./tooling-catalog.js";

// Public tooling-catalog surface. `core` consumes these via the documented `core → registry` arrow
// (its `applyDefaultTooling` resolution logic + the browser customizer entry re-export them).
export {
  buildQualityModules,
  toolingCatalog,
  slotCapability,
  languageCapability,
  type ToolingLanguage,
  type ToolingSlot,
  type ToolingToolSpec
} from "./tooling-catalog.js";

export const curatedSkillSourceAllowlist = [
  "https://github.com/antfu/skills",
  "https://github.com/deckardger/tanstack-agent-skills",
  "https://github.com/paulrberg/agent-skills",
  "https://github.com/affaan-m/everything-claude-code",
  "https://github.com/vintasoftware/django-ai-plugins",
  "https://github.com/mindrally/skills",
  "https://github.com/bobmatnyc/claude-mpm-skills",
  "https://github.com/apollographql/skills",
  "https://github.com/wshobson/agents",
  "https://github.com/actionbook/rust-skills",
  "https://github.com/nodnarbnitram/claude-code-extensions"
] as const;

const researchedInitializerDisabledReason =
  "Researched and mapped, but not enabled until Stackkit replaces the matching deterministic template path.";

const supportedModuleIds = new Set([
  "workspace/pnpm-turbo",
  "workspace/typescript",
  "web/nextjs",
  "ui/shadcn",
  "api/fastapi",
  "quality/eslint",
  "quality/prettier",
  "quality/tsc",
  "quality/ruff",
  "quality/mypy",
  "quality/pytest",
  "db/postgres",
  "db/sqlalchemy",
  "postgres/local",
  "auth/auth0-nextjs",
  "auth/auth0-fastapi",
  "deploy/docker"
]);
const previewModuleIds = new Set([
  "web/vite",
  "web/tanstack-start",
  "ui/tailwind",
  "quality/biome",
  "quality/pyright",
  "quality/vitest",
  "db/drizzle",
  "postgres/neon",
  "postgres/supabase",
  "postgres/supabase-local",
  "auth/clerk",
  "auth/none",
  "deploy/vercel",
  "workspace/docker-compose",
  "workspace/github-actions",
  "deploy/kubernetes",
  "docs/local-dev",
  "docs/readme",
  "docs/architecture",
  "docs/env",
  "ai/skills"
]);
const previewPresetIds = new Set([
  "next",
  "vite",
  "tanstack-start",
  "next-postgres-clerk",
  "containerized",
  "next-neon-drizzle",
  "next-supabase-drizzle"
]);

function moduleSupport(moduleId: string): SupportMetadata {
  if (supportedModuleIds.has(moduleId)) {
    return { level: "supported" };
  }

  if (previewModuleIds.has(moduleId)) {
    return {
      level: "preview",
      reason: "Generated output exists, but this module has not passed the golden-path release profile."
    };
  }

  return {
    level: "planned",
    reason: "The registry declaration is not backed by a supported generated integration."
  };
}

function presetSupport(presetId: string): SupportMetadata {
  if (presetId === "next-fastapi-postgres-auth0") {
    return { level: "supported" };
  }

  if (previewPresetIds.has(presetId)) {
    return {
      level: "preview",
      reason: "The preset generates a starter, but it has not passed the golden-path release profile."
    };
  }

  return {
    level: "planned",
    reason: "One or more preset integrations are declaration-only and cannot be created."
  };
}

const packageManagerFlag = {
  token: "package-manager",
  values: {
    pnpm: "--use-pnpm",
    npm: "--use-npm",
    yarn: "--use-yarn",
    bun: "--use-bun"
  }
} as const;

const nativeInitializers = {
  createTurbo: {
    name: "create-turbo",
    enabled: false,
    disabledReason: "Root scaffold initializer requires a dedicated root-scaffold phase before execution.",
    phase: "root-scaffold",
    tool: { execution: "package-manager-dlx", package: "create-turbo@2.10.9" },
    args: [
      { token: "target-directory-name" },
      "--package-manager",
      { token: "package-manager" },
      "--skip-install",
      "--no-git"
    ],
    cwd: ".",
    mutationPolicy: "generated-subtree",
    expectedFiles: ["package.json", "pnpm-workspace.yaml", "turbo.json"]
  },
  createNextApp: {
    name: "create-next-app",
    enabled: false,
    disabledReason: researchedInitializerDisabledReason,
    phase: "app-scaffold",
    tool: { execution: "package-manager-dlx", package: "create-next-app@16.3.0" },
    args: [
      "apps/web",
      "--ts",
      "--tailwind",
      "--eslint",
      "--app",
      "--import-alias",
      "@/*",
      packageManagerFlag,
      "--skip-install",
      "--disable-git",
      "--yes"
    ],
    cwd: ".",
    mutationPolicy: "generated-subtree",
    expectedFiles: ["apps/web/package.json", "apps/web/app/page.tsx", "apps/web/next.config.ts"]
  },
  createVite: {
    name: "create-vite",
    enabled: false,
    disabledReason: researchedInitializerDisabledReason,
    phase: "app-scaffold",
    tool: { execution: "package-manager-dlx", package: "create-vite@9.1.2" },
    args: ["apps/web", "--template", "react-ts", "--no-interactive"],
    cwd: ".",
    mutationPolicy: "generated-subtree",
    expectedFiles: ["apps/web/package.json", "apps/web/src/main.tsx", "apps/web/vite.config.ts"]
  },
  tanstackCreate: {
    name: "tanstack create",
    enabled: false,
    disabledReason: researchedInitializerDisabledReason,
    phase: "app-scaffold",
    tool: { execution: "package-manager-dlx", package: "@tanstack/cli@0.70.2" },
    args: [
      "create",
      { token: "project-name" },
      "--target-dir",
      "apps/web",
      "--framework",
      "React",
      "--package-manager",
      { token: "package-manager" },
      "--no-install",
      "--no-git",
      "--non-interactive",
      "--no-examples",
      "--toolchain",
      "eslint",
      "--deployment",
      "nitro",
      "--no-intent"
    ],
    cwd: ".",
    mutationPolicy: "generated-subtree",
    expectedFiles: ["apps/web/package.json", "apps/web/src/router.tsx", "apps/web/vite.config.ts"]
  },
  shadcnInit: {
    name: "shadcn init",
    phase: "integration",
    tool: { execution: "package-manager-dlx", package: "shadcn@4.16.2" },
    args: [
      "init",
      "-d",
      "--base",
      "radix",
      "--monorepo",
      "-t",
      { token: "web-framework", values: { nextjs: "next", vite: "vite", "tanstack-start": "start" } },
      "--cwd",
      "."
    ],
    cwd: ".",
    when: { anyModules: ["web/nextjs", "web/vite", "web/tanstack-start"] },
    mutationPolicy: "merge-owned",
    expectedFiles: [
      "apps/web/components.json",
      "packages/ui/components.json",
      "packages/ui/package.json",
      "packages/ui/src/styles/globals.css"
    ]
  },
  prismaInit: {
    name: "prisma init",
    enabled: false,
    disabledReason: researchedInitializerDisabledReason,
    phase: "integration",
    tool: { execution: "package-manager-dlx", package: "prisma@7.9.1" },
    args: [
      "init",
      "--datasource-provider",
      "postgresql",
      "--generator-provider",
      "prisma-client-js",
      "--output",
      "./generated/prisma"
    ],
    cwd: "apps/web",
    mutationPolicy: "known-files",
    expectedFiles: ["apps/web/prisma/schema.prisma", "apps/web/prisma.config.ts"],
    redactExpectedFiles: ["apps/web/.env"]
  },
  supabaseInit: {
    name: "supabase init",
    enabled: false,
    disabledReason: researchedInitializerDisabledReason,
    phase: "tool-config",
    tool: { execution: "package-manager-dlx", package: "supabase@2.113.0" },
    args: ["init", "--yes", "--workdir", "."],
    cwd: ".",
    mutationPolicy: "known-files",
    expectedFiles: ["supabase/config.toml"]
  },
  clerkInit: {
    name: "clerk init",
    phase: "integration",
    tool: { execution: "package-manager-dlx", package: "clerk@3.0.0" },
    args: [
      "init",
      "--framework",
      { token: "web-framework", values: { nextjs: "next", vite: "react", "tanstack-start": "tanstack-start" } },
      "--pm",
      { token: "package-manager" },
      "--keyless",
      "--yes",
      "--no-skills"
    ],
    cwd: "apps/web",
    when: { anyModules: ["web/nextjs"] },
    mutationPolicy: "external-state",
    expectedFiles: [
      "apps/web/proxy.ts",
      "apps/web/app/layout.tsx",
      "apps/web/app/sign-in/[[...sign-in]]/page.tsx",
      "apps/web/app/sign-up/[[...sign-up]]/page.tsx",
      "apps/web/package.json"
    ],
    redactExpectedFiles: ["apps/web/.env.local", "apps/web/.clerk/keyless.json"]
  },
  djangoStartProject: {
    name: "django-admin startproject",
    enabled: false,
    disabledReason: "Researched and mapped, but Django is not yet wired into Stackkit create output.",
    phase: "app-scaffold",
    tool: { execution: "system", command: "uvx" },
    args: ["--from", "django==6.1", "django-admin", "startproject", "config", "apps/web"],
    cwd: ".",
    mutationPolicy: "generated-subtree",
    expectedFiles: ["apps/web/manage.py", "apps/web/config/settings.py"]
  },
  cargoNew: {
    name: "cargo new",
    enabled: false,
    disabledReason: "Researched and mapped, but Rust framework overlays still need a native crate migration slice.",
    phase: "app-scaffold",
    tool: { execution: "system", command: "cargo" },
    args: ["new", "apps/api", "--bin", "--vcs", "none", "--edition", "2024", "--name", { token: "project-name" }],
    cwd: ".",
    mutationPolicy: "generated-subtree",
    expectedFiles: ["apps/api/Cargo.toml", "apps/api/src/main.rs"]
  },
  createTauriApp: {
    name: "create-tauri-app",
    enabled: false,
    disabledReason: "Researched and mapped, but Tauri is not yet wired into Stackkit create output.",
    phase: "app-scaffold",
    tool: { execution: "package-manager-dlx", package: "create-tauri-app@4.6.2" },
    args: [
      "apps/desktop",
      "--manager",
      { token: "package-manager" },
      "--template",
      "react-ts",
      "--identifier",
      "com.stackkit.app",
      "--yes",
      "--tauri-version",
      "2"
    ],
    cwd: ".",
    mutationPolicy: "generated-subtree",
    expectedFiles: ["apps/desktop/package.json", "apps/desktop/src-tauri/tauri.conf.json"]
  }
} satisfies Record<string, NativeInitializerInput>;

const builtinModuleDefinitions = [
  defineModule({
    id: "workspace/pnpm-turbo",
    version: "1.0.0",
    title: "pnpm and Turborepo",
    description: "pnpm workspace with Turborepo task orchestration",
    aliases: ["workspace"],
    category: "workspace",
    provides: ["workspace/node"],
    nativeInitializers: [nativeInitializers.createTurbo],
    readme: {
      stack: ["pnpm workspace", "Turborepo"],
      layout: [
        { path: "apps", description: "Generated applications" },
        { path: "packages", description: "Shared workspace packages" }
      ],
      prerequisites: ["Node.js 22", "Corepack"],
      stackkit: ["Generated files are tracked in .stackkit/project.json."]
    }
  }),
  defineModule({
    id: "workspace/typescript",
    version: "1.0.0",
    title: "TypeScript",
    description: "Shared TypeScript configuration",
    aliases: ["typescript"],
    category: "workspace",
    requires: ["workspace/node"],
    provides: ["typescript"],
    readme: {
      stack: ["TypeScript"],
      layout: [{ path: "tsconfig.base.json", description: "Shared TypeScript compiler defaults" }]
    }
  }),
  defineModule({
    id: "web/nextjs",
    version: "1.0.0",
    title: "Next.js",
    description: "Next.js web application",
    aliases: ["next", "nextjs"],
    category: "web",
    icon: "nextjs",
    requires: ["workspace/node"],
    provides: ["web-app", "nextjs-app", "react", "container-app"],
    conflicts: ["web/vite", "web/tanstack-start"],
    nativeInitializers: [nativeInitializers.createNextApp],
    validate: [
      { kind: "file-exists", path: "apps/web/app/page.tsx" },
      { kind: "command-succeeds", command: "pnpm", args: ["--dir", "apps/web", "typecheck"] }
    ],
    readme: {
      stack: ["Next.js", "React"],
      layout: [{ path: "apps/web", description: "Next.js App Router web application" }]
    },
    aiSkills: [
      {
        source: "https://github.com/vercel-labs/agent-skills",
        skills: ["vercel-react-best-practices"],
        trust: "official",
        causedBy: "web/nextjs",
        reason: "React and Next.js app code"
      }
    ],
    migrations: [
      {
        from: "1.0.0",
        to: "1.1.0",
        title: "Add Next.js instrumentation hook",
        operations: [
          { kind: "write", path: "apps/web/instrumentation.ts", content: "export function register() {}\n" }
        ],
        safety: "automatic"
      }
    ]
  }),
  defineModule({
    id: "web/vite",
    version: "1.0.0",
    title: "Vite",
    description: "Vite React web application",
    aliases: ["vite"],
    category: "web",
    icon: "vite",
    requires: ["workspace/node"],
    provides: ["web-app", "react"],
    conflicts: ["web/nextjs", "web/tanstack-start"],
    nativeInitializers: [nativeInitializers.createVite],
    readme: {
      stack: ["Vite", "React"],
      layout: [{ path: "apps/web", description: "Vite React single-page application" }]
    },
    aiSkills: [
      {
        source: "https://github.com/antfu/skills",
        skills: ["vite"],
        trust: "curated",
        causedBy: "web/vite",
        reason: "Vite build tool, plugin, and SSR guidance"
      }
    ]
  }),
  defineModule({
    id: "web/tanstack-start",
    version: "1.0.0",
    title: "TanStack Start",
    description: "TanStack Start full-stack React application",
    aliases: ["tanstack", "tanstack-start"],
    category: "web",
    icon: "tanstack",
    requires: ["workspace/node"],
    provides: ["web-app", "react", "ssr"],
    conflicts: ["web/nextjs", "web/vite"],
    nativeInitializers: [nativeInitializers.tanstackCreate],
    readme: {
      stack: ["TanStack Start", "React"],
      layout: [{ path: "apps/web", description: "TanStack Start full-stack React application" }]
    },
    aiSkills: [
      {
        source: "https://github.com/deckardger/tanstack-agent-skills",
        skills: ["tanstack-start-best-practices"],
        trust: "curated",
        causedBy: "web/tanstack-start",
        reason: "TanStack Start SSR, server functions, middleware, and routing guidance"
      }
    ]
  }),
  defineModule({
    id: "ui/shadcn",
    version: "1.0.0",
    title: "ShadCN",
    description: "ShadCN UI components",
    aliases: ["shadcn"],
    category: "ui",
    icon: "shadcn",
    requires: ["react"],
    nativeInitializers: [nativeInitializers.shadcnInit],
    readme: {
      stack: ["ShadCN UI", "Tailwind CSS"],
      layout: [
        { path: "apps/web/components.json", description: "App-level ShadCN registry configuration" },
        { path: "packages/ui/components.json", description: "Shared ShadCN UI package registry configuration" },
        { path: "packages/ui/src/styles/globals.css", description: "Shared Tailwind CSS entrypoint" }
      ]
    },
    aiSkills: [
      {
        source: "https://github.com/shadcn/ui",
        skills: ["shadcn"],
        trust: "official",
        causedBy: "ui/shadcn",
        reason: "ShadCN UI components"
      }
    ]
  }),
  defineModule({
    id: "ui/tailwind",
    version: "1.0.0",
    title: "Tailwind CSS",
    description: "Tailwind CSS styling system",
    aliases: ["tailwind"],
    category: "ui",
    requires: ["workspace/node"],
    provides: ["css", "tailwind"]
  }),
  defineModule({
    id: "api/fastapi",
    version: "1.0.0",
    title: "FastAPI",
    description: "FastAPI API service",
    aliases: ["fastapi"],
    category: "api",
    icon: "fastapi",
    provides: ["api", "python", "container-app"],
    validate: [
      { kind: "file-exists", path: "apps/api/app/main.py" },
      { kind: "command-succeeds", command: "pnpm", args: ["--dir", "apps/api", "typecheck"] }
    ],
    readme: {
      stack: ["FastAPI", "uv", "pytest", "Ruff"],
      layout: [
        { path: "apps/api", description: "FastAPI service package" },
        { path: "apps/api/tests", description: "FastAPI health and API tests" }
      ],
      prerequisites: ["Python 3.12", "uv"]
    },
    aiSkills: [
      {
        source: "https://github.com/fastapi/fastapi",
        skills: ["fastapi"],
        trust: "official",
        causedBy: "api/fastapi",
        reason: "FastAPI service code"
      }
    ]
  }),
  defineModule({
    id: "api/flask",
    version: "1.0.0",
    title: "Flask",
    description: "Flask API service",
    aliases: ["flask"],
    category: "api",
    provides: ["api", "python"]
  }),
  defineModule({
    id: "api/litestar",
    version: "1.0.0",
    title: "Litestar",
    description: "Litestar API service",
    provides: ["api", "python"]
  }),
  ...buildQualityModules(),
  defineModule({
    id: "quality/pytest",
    version: "1.0.0",
    title: "pytest",
    description: "Python test runner",
    requires: ["python"],
    provides: ["python-test"]
  }),
  defineModule({
    id: "db/postgres",
    version: "1.0.0",
    title: "Postgres",
    description: "Postgres database family",
    aliases: ["postgres"],
    category: "database",
    icon: "postgres",
    provides: ["postgres"],
    readme: {
      stack: ["Postgres"]
    },
    aiSkills: [
      {
        source: "https://github.com/supabase/agent-skills",
        skills: ["supabase-postgres-best-practices"],
        trust: "official",
        causedBy: "db/postgres",
        reason: "General Postgres schema, indexing, and query performance"
      }
    ]
  }),
  defineModule({
    id: "db/drizzle",
    version: "1.0.0",
    title: "Drizzle",
    description: "TypeScript database toolkit for Postgres",
    aliases: ["drizzle"],
    category: "database-client",
    icon: "drizzle",
    requires: ["postgres", "typescript"],
    provides: ["typescript-db"],
    envVars: [
      {
        name: "DATABASE_URL",
        description: "Postgres connection string.",
        required: true,
        example: "",
        target: "web"
      }
    ],
    readme: {
      stack: ["Drizzle ORM"]
    }
  }),
  defineModule({
    id: "db/prisma",
    version: "1.0.0",
    title: "Prisma",
    description: "TypeScript ORM for Postgres",
    requires: ["postgres", "typescript"],
    provides: ["typescript-db"],
    nativeInitializers: [nativeInitializers.prismaInit]
  }),
  defineModule({
    id: "db/sqlalchemy",
    version: "1.0.0",
    title: "SQLAlchemy",
    description: "Python database toolkit for Postgres",
    aliases: ["sqlalchemy"],
    category: "database-client",
    icon: "sqlalchemy",
    requires: ["postgres", "python"],
    provides: ["python-db"],
    packageChanges: [
      {
        packagePath: "package.json",
        scripts: { "db:migrate": "pnpm --dir apps/api exec uv run alembic upgrade head" },
        dependencies: {},
        devDependencies: {},
        peerDependencies: {},
        optionalDependencies: {}
      }
    ],
    validate: [
      { kind: "file-exists", path: "apps/api/app/database.py" },
      { kind: "file-exists", path: "apps/api/migrations/versions/0001_create_todos.py" }
    ],
    envVars: [
      {
        name: "DATABASE_URL",
        description: "Postgres connection string.",
        required: true,
        example: "postgresql+psycopg://postgres:postgres@localhost:5432/app",
        target: "api"
      }
    ],
    readme: {
      stack: ["SQLAlchemy"]
    }
  }),
  defineModule({
    id: "db/sqlx",
    version: "1.0.0",
    title: "SQLx",
    description: "SQLx database access for Postgres",
    aliases: ["sqlx"],
    category: "database-client",
    icon: "rust",
    requires: ["postgres"],
    provides: ["sqlx-db"]
  }),
  defineModule({
    id: "db/diesel",
    version: "1.0.0",
    title: "Diesel",
    description: "Diesel ORM for Postgres",
    requires: ["postgres"],
    provides: ["diesel-db"]
  }),
  defineModule({
    id: "postgres/neon",
    version: "1.0.0",
    title: "Neon Postgres",
    description: "Neon hosted Postgres provider",
    aliases: ["neon"],
    category: "database-provider",
    requires: ["postgres"],
    conflicts: ["postgres/supabase", "postgres/supabase-local", "postgres/local"],
    aiSkills: [
      {
        source: "https://github.com/neondatabase/agent-skills",
        skills: ["neon-postgres", "neon-postgres-branches"],
        trust: "official",
        causedBy: "postgres/neon",
        reason: "Neon provider-specific branch and database workflow guidance"
      }
    ]
  }),
  defineModule({
    id: "postgres/supabase",
    version: "1.0.0",
    title: "Supabase Postgres",
    description: "Supabase hosted Postgres provider (database host only)",
    aliases: ["supabase"],
    category: "database-provider",
    requires: ["postgres"],
    conflicts: ["postgres/neon", "postgres/supabase-local", "postgres/local"],
    envVars: [
      {
        name: "DIRECT_URL",
        description:
          "Supabase direct connection (session mode, port 5432) for migrations. The app uses DATABASE_URL via the 6543 pooler with pgbouncer=true.",
        required: false,
        example:
          "postgres://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres",
        target: "db"
      }
    ],
    readme: {
      stack: ["Supabase Postgres"]
    },
    aiSkills: [
      {
        source: "https://github.com/supabase/agent-skills",
        skills: ["supabase-postgres-best-practices"],
        trust: "official",
        causedBy: "postgres/supabase",
        reason: "Supabase Postgres connection pooling and schema guidance"
      }
    ]
  }),
  defineModule({
    id: "postgres/supabase-local",
    version: "1.0.0",
    title: "Local Supabase (CLI)",
    description: "Local Supabase stack via the Supabase CLI (requires the CLI installed)",
    aliases: ["supabase-local"],
    category: "database-provider",
    requires: ["postgres"],
    conflicts: ["postgres/neon", "postgres/supabase", "postgres/local"],
    envVars: [
      {
        name: "DIRECT_URL",
        description: "Local Supabase direct connection (session mode) for migrations, as printed by `supabase start`.",
        required: false,
        example: "postgresql://postgres:postgres@localhost:54322/postgres",
        target: "db"
      }
    ],
    nativeInitializers: [nativeInitializers.supabaseInit],
    files: [
      {
        kind: "write",
        path: "supabase/config.toml",
        owner: "postgres/supabase-local",
        overwrite: "if-owned",
        content: 'project_id = "app"\n\n[db]\nport = 54322\n'
      }
    ],
    readme: {
      stack: ["Local Supabase (CLI)"]
    },
    aiSkills: [
      {
        source: "https://github.com/supabase/agent-skills",
        skills: ["supabase-postgres-best-practices"],
        trust: "official",
        causedBy: "postgres/supabase-local",
        reason: "Local Supabase Postgres workflow guidance"
      }
    ]
  }),
  defineModule({
    id: "postgres/local",
    version: "1.0.0",
    title: "Local Postgres (Docker)",
    description: "Local Postgres via a Docker Compose service",
    aliases: ["postgres-local"],
    category: "database-provider",
    requires: ["postgres"],
    conflicts: ["postgres/neon", "postgres/supabase", "postgres/supabase-local"],
    validate: [{ kind: "file-exists", path: "docker-compose.db.yml" }],
    files: [
      {
        kind: "write",
        path: "docker-compose.db.yml",
        owner: "postgres/local",
        overwrite: "if-owned",
        content:
          'services:\n  db:\n    image: postgres:17\n    environment:\n      POSTGRES_USER: postgres\n      POSTGRES_PASSWORD: postgres\n      POSTGRES_DB: app\n    ports:\n      - "5432:5432"\n    volumes:\n      - pgdata:/var/lib/postgresql/data\nvolumes:\n  pgdata:\n'
      }
    ],
    readme: {
      stack: ["Local Postgres (Docker)"]
    }
  }),
  defineModule({
    id: "auth/clerk",
    version: "1.0.0",
    title: "Clerk",
    description: "Clerk hosted auth",
    aliases: ["clerk"],
    category: "auth",
    icon: "clerk",
    requires: ["react"],
    provides: ["auth"],
    nativeInitializers: [nativeInitializers.clerkInit],
    aiSkills: [
      {
        source: "https://github.com/clerk/skills",
        skills: ["clerk-setup", "clerk-nextjs-patterns", "clerk-testing"],
        trust: "official",
        causedBy: "auth/clerk",
        reason: "Clerk with Next.js and test scaffolding"
      }
    ]
  }),
  defineModule({
    id: "auth/better-auth",
    version: "1.0.0",
    title: "Better Auth",
    description: "Self-hosted TypeScript auth",
    aliases: ["better-auth"],
    category: "auth",
    icon: "better-auth",
    requires: ["typescript"],
    provides: ["auth"],
    aiSkills: [
      {
        source: "https://github.com/better-auth/skills",
        skills: ["better-auth-best-practices", "create-auth-skill", "better-auth-security-best-practices"],
        trust: "official",
        causedBy: "auth/better-auth",
        reason: "Better Auth baseline setup and security hardening"
      }
    ]
  }),
  defineModule({
    id: "auth/auth0-nextjs",
    version: "1.0.0",
    title: "Auth0 for Next.js",
    description: "Auth0 Next.js integration",
    aliases: ["auth0-nextjs"],
    category: "auth",
    icon: "auth0",
    requires: ["react"],
    provides: ["auth"],
    validate: [
      { kind: "file-exists", path: "apps/web/lib/auth0.ts" },
      { kind: "file-exists", path: "apps/web/proxy.ts" }
    ],
    packageChanges: [
      {
        packagePath: "apps/web/package.json",
        scripts: {},
        dependencies: { "@auth0/nextjs-auth0": "^4.26.0" },
        devDependencies: {},
        peerDependencies: {},
        optionalDependencies: {}
      }
    ],
    envVars: [
      {
        name: "AUTH0_DOMAIN",
        description: "Auth0 tenant domain.",
        required: true,
        example: "",
        target: "root"
      },
      {
        name: "AUTH0_CLIENT_ID",
        description: "Auth0 application client ID.",
        required: true,
        example: "",
        target: "web"
      },
      {
        name: "AUTH0_CLIENT_SECRET",
        description: "Auth0 application client secret.",
        required: true,
        example: "",
        target: "web"
      },
      {
        name: "AUTH0_SECRET",
        description: "Secret used to encrypt the web auth session.",
        required: true,
        example: "",
        target: "web"
      },
      {
        name: "APP_BASE_URL",
        description: "Public base URL for the Next.js application.",
        required: true,
        example: "http://localhost:3000",
        target: "web"
      },
      {
        name: "AUTH0_AUDIENCE",
        description: "Auth0 API audience.",
        required: true,
        example: "https://api.example.com",
        target: "root"
      },
      {
        name: "API_BASE_URL",
        description: "FastAPI base URL used by the Next.js server.",
        required: true,
        example: "http://localhost:8000",
        target: "web"
      }
    ],
    readme: {
      stack: ["Auth0 for Next.js"]
    },
    aiSkills: [
      {
        source: "https://github.com/auth0/agent-skills",
        skills: ["auth0-nextjs"],
        trust: "official",
        causedBy: "auth/auth0-nextjs",
        reason: "Auth0 login and session integration for Next.js"
      }
    ]
  }),
  defineModule({
    id: "auth/auth0-fastapi",
    version: "1.0.0",
    title: "Auth0 for FastAPI",
    description: "Auth0 FastAPI API protection",
    aliases: ["auth0-fastapi"],
    category: "auth",
    icon: "auth0",
    requires: ["python"],
    provides: ["auth"],
    validate: [{ kind: "file-exists", path: "apps/api/app/auth.py" }],
    envVars: [
      {
        name: "AUTH0_DOMAIN",
        description: "Auth0 tenant domain.",
        required: true,
        example: "",
        target: "root"
      },
      {
        name: "AUTH0_AUDIENCE",
        description: "Auth0 API audience.",
        required: true,
        example: "https://api.example.com",
        target: "root"
      }
    ],
    readme: {
      stack: ["Auth0 for FastAPI"]
    },
    aiSkills: [
      {
        source: "https://github.com/auth0/agent-skills",
        skills: ["auth0-fastapi-api"],
        trust: "official",
        causedBy: "auth/auth0-fastapi",
        reason: "Auth0 JWT validation for FastAPI APIs"
      }
    ]
  }),
  defineModule({
    id: "auth/auth0-flask",
    version: "1.0.0",
    title: "Auth0 for Flask",
    description: "Auth0 Flask integration",
    aliases: ["auth0-flask"],
    category: "auth",
    icon: "auth0",
    requires: ["python"],
    provides: ["auth"],
    aiSkills: [
      {
        source: "https://github.com/auth0/agent-skills",
        skills: ["auth0-flask"],
        trust: "official",
        causedBy: "auth/auth0-flask",
        reason: "Auth0 integration for Flask"
      }
    ]
  }),
  defineModule({
    id: "auth/none",
    version: "1.0.0",
    title: "No auth",
    description: "Explicitly skip application authentication",
    conflicts: ["auth/clerk", "auth/auth0-nextjs", "auth/auth0-fastapi", "auth/auth0-flask", "auth/better-auth"],
    provides: ["auth:none"]
  }),
  defineModule({
    id: "deploy/vercel",
    version: "1.0.0",
    title: "Vercel",
    description: "Vercel deployment",
    aliases: ["vercel"],
    category: "deploy",
    icon: "vercel",
    requires: ["web-app"],
    provides: ["deploy"],
    readme: {
      stack: ["Vercel"]
    },
    aiSkills: [
      {
        source: "https://github.com/vercel-labs/agent-skills",
        skills: ["deploy-to-vercel"],
        trust: "official",
        causedBy: "deploy/vercel",
        reason: "Vercel deployment workflow"
      }
    ]
  }),
  defineModule({
    id: "web/django",
    version: "1.0.0",
    title: "Django",
    description: "Django web application",
    aliases: ["django"],
    category: "web",
    conflicts: ["web/nextjs"],
    provides: ["web-app", "python"],
    nativeInitializers: [nativeInitializers.djangoStartProject],
    aiSkills: [
      {
        source: "https://github.com/affaan-m/everything-claude-code",
        skills: ["django-patterns", "django-security", "django-tdd", "django-verification"],
        trust: "curated",
        causedBy: "web/django",
        reason: "Allowlisted Django patterns, security, testing, and verification guidance"
      }
    ]
  }),
  defineModule({
    id: "rust/tokio",
    version: "1.0.0",
    title: "Tokio",
    description: "Tokio async Rust runtime",
    aliases: ["tokio"],
    category: "rust",
    icon: "tokio",
    provides: ["rust-async"],
    aiSkills: [
      {
        source: "https://github.com/wshobson/agents",
        skills: ["rust-async-patterns"],
        trust: "curated",
        causedBy: "rust/tokio",
        reason: "Allowlisted async Rust and Tokio guidance"
      }
    ]
  }),
  defineModule({
    id: "rust/axum",
    version: "1.0.0",
    title: "Axum",
    description: "Rust web API service",
    aliases: ["axum", "rust"],
    category: "api",
    icon: "rust",
    requires: ["rust-async"],
    provides: ["api", "rust"],
    nativeInitializers: [nativeInitializers.cargoNew]
  }),
  defineModule({
    id: "rust/actix",
    version: "1.0.0",
    title: "Actix Web",
    description: "Actix Web API service",
    provides: ["api", "rust"]
  }),
  defineModule({
    id: "rust/rocket",
    version: "1.0.0",
    title: "Rocket",
    description: "Rocket web API service",
    provides: ["api", "rust"]
  }),
  defineModule({
    id: "rust/sqlx",
    version: "1.0.0",
    title: "sqlx",
    description: "Rust SQL toolkit for Postgres",
    aliases: ["rust-sqlx"],
    category: "database-client",
    icon: "rust",
    requires: ["postgres", "rust"],
    provides: ["rust-db"]
  }),
  defineModule({
    id: "rust/diesel",
    version: "1.0.0",
    title: "Diesel for Rust",
    description: "Rust Diesel ORM integration for Postgres",
    requires: ["postgres", "rust"],
    provides: ["rust-db"]
  }),
  defineModule({
    id: "desktop/tauri",
    version: "1.0.0",
    title: "Tauri",
    description: "Tauri desktop application",
    provides: ["desktop"],
    nativeInitializers: [nativeInitializers.createTauriApp],
    aiSkills: [
      {
        source: "https://github.com/nodnarbnitram/claude-code-extensions",
        skills: ["tauri-v2"],
        trust: "curated",
        causedBy: "desktop/tauri",
        reason: "Allowlisted Tauri v2 guidance"
      }
    ]
  }),
  defineModule({
    id: "deploy/docker",
    version: "1.0.0",
    title: "Docker",
    description: "Container build configuration",
    aliases: ["docker"],
    category: "deploy",
    icon: "docker",
    requires: ["container-app"],
    provides: ["container"],
    validate: [
      { kind: "file-exists", path: "docker-compose.yml" },
      { kind: "command-succeeds", command: "docker", args: ["compose", "config", "--quiet"] }
    ],
    readme: {
      stack: ["Docker"],
      layout: [
        { path: "docker-compose.yml", description: "Local container orchestration" }
      ]
    }
  }),
  defineModule({
    id: "workspace/docker-compose",
    version: "1.0.0",
    title: "Docker Compose",
    description: "Local multi-service Docker Compose setup",
    requires: ["container"],
    provides: ["local-compose"]
  }),
  defineModule({
    id: "workspace/github-actions",
    version: "1.0.0",
    title: "GitHub Actions",
    description: "Baseline CI workflow",
    provides: ["ci"]
  }),
  defineModule({
    id: "deploy/kubernetes",
    version: "1.0.0",
    title: "Kubernetes",
    description: "Baseline Kubernetes deployment",
    aliases: ["kubernetes", "k8s"],
    category: "deploy",
    icon: "kubernetes",
    requires: ["container"],
    provides: ["deploy"]
  }),
  defineModule({
    id: "docs/local-dev",
    version: "1.0.0",
    title: "Local development docs",
    description: "Local development documentation",
    provides: ["docs"]
  }),
  defineModule({
    id: "docs/readme",
    version: "1.0.0",
    title: "README",
    description: "Project README documentation",
    provides: ["docs"]
  }),
  defineModule({
    id: "docs/architecture",
    version: "1.0.0",
    title: "Architecture docs",
    description: "Architecture documentation",
    provides: ["docs"]
  }),
  defineModule({
    id: "docs/env",
    version: "1.0.0",
    title: "Environment docs",
    description: "Environment variable documentation",
    provides: ["docs"]
  }),
  defineModule({
    id: "ai/skills",
    version: "1.0.0",
    title: "AI skills",
    description: "Local AI skill guidance setup",
    provides: ["ai-guidance"]
  }),
  defineModule({
    id: "quality/vitest",
    version: "1.0.0",
    title: "Vitest",
    description: "JavaScript and TypeScript test runner",
    requires: ["typescript"],
    provides: ["javascript-test"]
  })
] as const;

export const builtinModules = builtinModuleDefinitions.map((module) =>
  defineModule({ ...module, support: moduleSupport(module.id), removalPolicy: moduleRemovalPolicy(module.id) })
);

function moduleRemovalPolicy(moduleId: string) {
  if (moduleId === "postgres/local") {
    return {
      mode: "managed-files-only" as const,
      retainedData: ["The Docker pgdata volume and its PostgreSQL data are retained."],
      manualCleanup: ["Run docker compose down --volumes only when the database data is no longer needed."]
    };
  }
  if (moduleId === "db/sqlalchemy") {
    return {
      mode: "managed-files-only" as const,
      retainedData: ["Applied database schema and application rows are retained."],
      manualCleanup: ["Use a reviewed Alembic downgrade or a manual migration before dropping application tables."]
    };
  }
  if (moduleId === "deploy/docker") {
    return {
      mode: "managed-files-only" as const,
      retainedData: ["Docker images, containers, and named volumes are retained."],
      manualCleanup: ["Remove runtime resources explicitly with Docker after confirming retained data is disposable."]
    };
  }
  if (moduleId === "auth/auth0-nextjs" || moduleId === "auth/auth0-fastapi") {
    return {
      mode: "managed-files-only" as const,
      retainedData: ["Auth0 tenant applications, APIs, users, and secrets are retained."],
      manualCleanup: ["Remove Auth0 tenant resources separately after verifying no other deployment uses them."]
    };
  }
  return { mode: "managed-files-only" as const, retainedData: [], manualCleanup: [] };
}

const builtinPresetDefinitions = [
  definePreset({
    id: "next",
    title: "Next.js",
    description: "A pnpm and Turborepo workspace with a Next.js app and ShadCN UI",
    modules: ["workspace/pnpm-turbo", "workspace/typescript", "web/nextjs", "ui/shadcn", "quality/eslint", "quality/prettier", "quality/tsc"]
  }),
  definePreset({
    id: "vite",
    title: "Vite",
    description: "A pnpm and Turborepo workspace with a Vite React app and ShadCN UI",
    modules: ["workspace/pnpm-turbo", "workspace/typescript", "web/vite", "ui/shadcn", "quality/eslint", "quality/prettier"]
  }),
  definePreset({
    id: "tanstack-start",
    title: "TanStack Start",
    description: "A pnpm and Turborepo workspace with a TanStack Start app and ShadCN UI",
    modules: ["workspace/pnpm-turbo", "workspace/typescript", "web/tanstack-start", "ui/shadcn", "quality/eslint", "quality/prettier"]
  }),
  definePreset({
    id: "next-postgres-clerk",
    title: "Next.js, Postgres, and Clerk",
    description: "A Next.js app with ShadCN, Postgres, Drizzle, and Clerk",
    modules: [
      "workspace/pnpm-turbo",
      "workspace/typescript",
      "web/nextjs",
      "ui/shadcn",
      "db/postgres",
      "db/drizzle",
      "auth/clerk",
      "deploy/vercel",
      "quality/eslint",
      "quality/prettier",
      "quality/tsc"
    ]
  }),
  definePreset({
    id: "next-postgres-better-auth",
    title: "Next.js, Postgres, and Better Auth",
    description: "A Next.js app with ShadCN, Postgres, Drizzle, and self-hosted Better Auth",
    modules: [
      "workspace/pnpm-turbo",
      "workspace/typescript",
      "web/nextjs",
      "ui/shadcn",
      "db/postgres",
      "db/drizzle",
      "auth/better-auth",
      "deploy/vercel",
      "quality/eslint",
      "quality/prettier",
      "quality/tsc"
    ]
  }),
  definePreset({
    id: "next-fastapi-postgres-auth0",
    title: "Next.js, FastAPI, Postgres, and Auth0",
    description: "A multi-language app with Next.js, FastAPI, Postgres, SQLAlchemy, and Auth0",
    modules: [
      "workspace/pnpm-turbo",
      "workspace/typescript",
      "web/nextjs",
      "ui/shadcn",
      "api/fastapi",
      "db/postgres",
      "db/sqlalchemy",
      "postgres/local",
      "auth/auth0-nextjs",
      "auth/auth0-fastapi",
      "deploy/docker",
      "quality/eslint",
      "quality/prettier",
      "quality/tsc",
      "quality/ruff",
      "quality/mypy",
      "quality/pytest"
    ]
  }),
  definePreset({
    id: "next-axum-postgres-auth0",
    title: "Next.js, Axum, Postgres, and Auth0",
    description: "A Next.js app with an Axum service, Postgres, Rust SQLx, and Auth0 where supported",
    modules: [
      "workspace/pnpm-turbo",
      "workspace/typescript",
      "web/nextjs",
      "ui/shadcn",
      "rust/tokio",
      "rust/axum",
      "db/postgres",
      "rust/sqlx",
      "auth/auth0-nextjs",
      "deploy/vercel",
      "deploy/docker",
      "quality/eslint",
      "quality/prettier",
      "quality/tsc",
      "quality/clippy",
      "quality/rustfmt",
      "quality/cargo-check"
    ]
  }),
  definePreset({
    id: "containerized",
    title: "Containerized Next.js and FastAPI",
    description: "A Docker-ready Next.js and FastAPI workspace with local Compose support",
    modules: [
      "workspace/pnpm-turbo",
      "workspace/typescript",
      "workspace/docker-compose",
      "web/nextjs",
      "ui/shadcn",
      "api/fastapi",
      "db/postgres",
      "db/sqlalchemy",
      "deploy/docker",
      "docs/local-dev",
      "quality/tsc",
      "quality/mypy"
    ]
  }),
  definePreset({
    id: "next-neon-drizzle",
    title: "Next.js, Neon, and Drizzle",
    description: "A Next.js app with ShadCN, Neon Postgres, and Drizzle",
    modules: [
      "workspace/pnpm-turbo",
      "workspace/typescript",
      "web/nextjs",
      "ui/shadcn",
      "db/postgres",
      "db/drizzle",
      "postgres/neon",
      "deploy/vercel",
      "quality/eslint",
      "quality/prettier",
      "quality/tsc"
    ]
  }),
  definePreset({
    id: "next-supabase-drizzle",
    title: "Next.js, Supabase, and Drizzle",
    description: "A Next.js app with ShadCN, Supabase Postgres, and Drizzle",
    modules: [
      "workspace/pnpm-turbo",
      "workspace/typescript",
      "web/nextjs",
      "ui/shadcn",
      "db/postgres",
      "db/drizzle",
      "postgres/supabase",
      "deploy/vercel",
      "quality/eslint",
      "quality/prettier",
      "quality/tsc"
    ]
  })
] as const;

export const builtinPresets = builtinPresetDefinitions.map((preset) =>
  definePreset({ ...preset, support: presetSupport(preset.id) })
);

export const builtinRegistry = stackkitRegistrySchema.parse({
  schemaVersion: 1,
  namespace: "@stackkit",
  name: "Stackkit built-in registry",
  modules: builtinModules,
  presets: builtinPresets
});
