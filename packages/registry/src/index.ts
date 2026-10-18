import {
  defineModule,
  definePreset,
  type ModuleRemovalPolicy,
  type NativeInitializerInput,
  type StackkitModule,
  type StackkitPreset,
  type StackkitRegistry,
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
  "https://github.com/bobmatnyc/claude-mpm-skills/tree/v1.0.9",
  "https://github.com/apollographql/skills",
  "https://github.com/wshobson/agents",
  "https://github.com/actionbook/rust-skills",
  "https://github.com/nodnarbnitram/claude-code-extensions"
] as const;

const researchedInitializerDisabledReason =
  "Researched and mapped, but not enabled until Stackkit replaces the matching deterministic template path.";

// Support tiers are declared inline on each module and preset (Quality Modules take theirs from the
// tooling catalog), so promoting an entry is a one-line change next to its declaration.
const support = {
  supported: { level: "supported" },
  preview: {
    level: "preview",
    reason: "Generated output exists, but this module has not passed the golden-path release profile."
  },
  markerPreview: {
    level: "preview",
    reason: "Marker module: it records an explicit choice in the manifest and generates no files."
  },
  declarationOnly: {
    level: "planned",
    reason: "Declaration only: Stackkit does not generate any files for this module yet."
  },
  planned: {
    level: "planned",
    reason: "The registry declaration is not backed by a supported generated integration."
  },
  previewPreset: {
    level: "preview",
    reason: "The preset generates a starter, but it has not passed the golden-path release profile."
  },
  plannedPreset: {
    level: "planned",
    reason: "One or more preset integrations are declaration-only and cannot be created."
  }
} as const satisfies Record<string, SupportMetadata>;

const removalPolicies = {
  postgresLocal: {
    mode: "managed-files-only",
    retainedData: ["The Docker pgdata volume and its PostgreSQL data are retained."],
    manualCleanup: ["Run docker compose down --volumes only when the database data is no longer needed."]
  },
  sqlalchemy: {
    mode: "managed-files-only",
    retainedData: ["Applied database schema and application rows are retained."],
    manualCleanup: ["Use a reviewed Alembic downgrade or a manual migration before dropping application tables."]
  },
  docker: {
    mode: "managed-files-only",
    retainedData: ["Docker images, containers, and named volumes are retained."],
    manualCleanup: ["Remove runtime resources explicitly with Docker after confirming retained data is disposable."]
  },
  auth0: {
    mode: "managed-files-only",
    retainedData: ["Auth0 tenant applications, APIs, users, and secrets are retained."],
    manualCleanup: ["Remove Auth0 tenant resources separately after verifying no other deployment uses them."]
  }
} as const satisfies Record<string, ModuleRemovalPolicy>;

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

// Shared by both Auth0 modules so the README lists it once.
const auth0ApiPrerequisite =
  "An Auth0 API whose Identifier is AUTH0_AUDIENCE, with Allow Offline Access enabled so the web app receives refresh tokens";

export const builtinModules: StackkitModule[] = [
  defineModule({
    id: "workspace/pnpm-turbo",
    version: "1.0.0",
    support: support.supported,
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
    support: support.supported,
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
    support: support.supported,
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
    ]
  }),
  defineModule({
    id: "web/vite",
    version: "1.0.0",
    support: support.preview,
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
    support: support.preview,
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
    support: support.supported,
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
    support: support.declarationOnly,
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
    support: support.supported,
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
    support: support.planned,
    title: "Flask",
    description: "Flask API service",
    aliases: ["flask"],
    category: "api",
    provides: ["api", "python"]
  }),
  defineModule({
    id: "api/litestar",
    version: "1.0.0",
    support: support.planned,
    title: "Litestar",
    description: "Litestar API service",
    provides: ["api", "python"]
  }),
  ...buildQualityModules(),
  defineModule({
    id: "quality/pytest",
    version: "1.0.0",
    support: support.supported,
    title: "pytest",
    description: "Python test runner",
    requires: ["python"],
    provides: ["python-test"]
  }),
  defineModule({
    id: "db/postgres",
    version: "1.0.0",
    support: support.supported,
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
    support: support.preview,
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
    support: support.planned,
    title: "Prisma",
    description: "TypeScript ORM for Postgres",
    requires: ["postgres", "typescript"],
    provides: ["typescript-db"],
    nativeInitializers: [nativeInitializers.prismaInit]
  }),
  defineModule({
    id: "db/sqlalchemy",
    version: "1.0.0",
    support: support.supported,
    removalPolicy: removalPolicies.sqlalchemy,
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
      stack: ["SQLAlchemy"],
      commands: [{ label: "Apply database migrations (the API dev script also runs them)", command: "pnpm db:migrate" }]
    }
  }),
  defineModule({
    id: "db/sqlx",
    version: "1.0.0",
    support: support.planned,
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
    support: support.planned,
    title: "Diesel",
    description: "Diesel ORM for Postgres",
    requires: ["postgres"],
    provides: ["diesel-db"]
  }),
  defineModule({
    id: "postgres/neon",
    version: "1.0.0",
    support: support.preview,
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
    support: support.preview,
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
    support: support.preview,
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
    support: support.supported,
    removalPolicy: removalPolicies.postgresLocal,
    title: "Local Postgres (Docker)",
    description: "Local Postgres via a Docker Compose service",
    aliases: ["postgres-local"],
    category: "database-provider",
    requires: ["postgres"],
    conflicts: ["postgres/neon", "postgres/supabase", "postgres/supabase-local"],
    // docker-compose.db.yml is rendered by @berkayorhan/stackkit-templates (renderPostgresLocalFiles), which
    // shares one Postgres service definition with deploy/docker's docker-compose.yml.
    validate: [{ kind: "file-exists", path: "docker-compose.db.yml" }],
    readme: {
      stack: ["Local Postgres (Docker)"],
      layout: [{ path: "docker-compose.db.yml", description: "Local Postgres service for development" }],
      devCommands: [{ label: "Start Postgres", command: "docker compose -f docker-compose.db.yml up -d" }]
    }
  }),
  defineModule({
    id: "auth/clerk",
    version: "1.0.0",
    support: support.preview,
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
    support: support.planned,
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
    support: support.supported,
    removalPolicy: removalPolicies.auth0,
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
      },
      {
        name: "AUTH0_ALLOW_INSECURE_REQUESTS",
        description: "Set to true only to allow plain-HTTP Auth0 endpoints (local mock issuers); AUTH0_DOMAIN must then be an http:// URL.",
        required: false,
        example: "",
        target: "web"
      }
    ],
    readme: {
      stack: ["Auth0 for Next.js"],
      prerequisites: [
        "An Auth0 Regular Web Application with Allowed Callback URL http://localhost:3000/auth/callback and Allowed Logout URL http://localhost:3000 (generate AUTH0_SECRET with `openssl rand -hex 32`)",
        auth0ApiPrerequisite
      ]
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
    support: support.supported,
    removalPolicy: removalPolicies.auth0,
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
      },
      {
        name: "AUTH0_ISSUER",
        description: "Token issuer override; defaults to https://AUTH0_DOMAIN/.",
        required: false,
        example: "",
        target: "api"
      },
      {
        name: "AUTH0_JWKS_URL",
        description: "JWKS URL override; defaults to the issuer's .well-known/jwks.json.",
        required: false,
        example: "",
        target: "api"
      }
    ],
    readme: {
      stack: ["Auth0 for FastAPI"],
      prerequisites: [auth0ApiPrerequisite]
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
    support: support.planned,
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
    support: support.markerPreview,
    title: "No auth",
    description: "Explicitly skip application authentication",
    conflicts: ["auth/clerk", "auth/auth0-nextjs", "auth/auth0-fastapi", "auth/auth0-flask", "auth/better-auth"],
    provides: ["auth:none"]
  }),
  defineModule({
    id: "deploy/vercel",
    version: "1.0.0",
    support: support.preview,
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
    support: support.planned,
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
    support: support.planned,
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
    support: support.planned,
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
    support: support.planned,
    title: "Actix Web",
    description: "Actix Web API service",
    provides: ["api", "rust"]
  }),
  defineModule({
    id: "rust/rocket",
    version: "1.0.0",
    support: support.planned,
    title: "Rocket",
    description: "Rocket web API service",
    provides: ["api", "rust"]
  }),
  defineModule({
    id: "rust/sqlx",
    version: "1.0.0",
    support: support.planned,
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
    support: support.planned,
    title: "Diesel for Rust",
    description: "Rust Diesel ORM integration for Postgres",
    requires: ["postgres", "rust"],
    provides: ["rust-db"]
  }),
  defineModule({
    id: "desktop/tauri",
    version: "1.0.0",
    support: support.planned,
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
    support: support.supported,
    removalPolicy: removalPolicies.docker,
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
    support: support.declarationOnly,
    title: "Docker Compose",
    description: "Local multi-service Docker Compose setup",
    requires: ["container"],
    provides: ["local-compose"]
  }),
  defineModule({
    id: "workspace/github-actions",
    version: "1.0.0",
    support: support.declarationOnly,
    title: "GitHub Actions",
    description: "Baseline CI workflow",
    provides: ["ci"]
  }),
  defineModule({
    id: "deploy/kubernetes",
    version: "1.0.0",
    support: support.preview,
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
    support: support.declarationOnly,
    title: "Local development docs",
    description: "Local development documentation",
    provides: ["docs"]
  }),
  defineModule({
    id: "docs/readme",
    version: "1.0.0",
    support: support.preview,
    title: "README",
    description: "Project README documentation",
    provides: ["docs"]
  }),
  defineModule({
    id: "docs/architecture",
    version: "1.0.0",
    support: support.declarationOnly,
    title: "Architecture docs",
    description: "Architecture documentation",
    provides: ["docs"]
  }),
  defineModule({
    id: "docs/env",
    version: "1.0.0",
    support: support.preview,
    title: "Environment docs",
    description: "Environment variable documentation",
    provides: ["docs"]
  }),
  defineModule({
    id: "ai/skills",
    version: "1.0.0",
    support: support.declarationOnly,
    title: "AI skills",
    description: "Local AI skill guidance setup",
    provides: ["ai-guidance"]
  }),
  defineModule({
    id: "quality/vitest",
    version: "1.0.0",
    support: support.declarationOnly,
    title: "Vitest",
    description: "JavaScript and TypeScript test runner",
    requires: ["typescript"],
    provides: ["javascript-test"]
  })
];

// Presets list only the modules a user would choose. Default developer tooling (ESLint, Prettier, tsc,
// Ruff, mypy, ...) is gap-filled from the tooling catalog during resolution, so an explicit
// alternative such as `--ts-quality biome` replaces the default instead of conflicting with it.
export const builtinPresets: StackkitPreset[] = [
  definePreset({
    id: "next",
    title: "Next.js",
    description: "A pnpm and Turborepo workspace with a Next.js app and ShadCN UI",
    support: support.previewPreset,
    modules: [
      "workspace/pnpm-turbo",
      "workspace/typescript",
      "web/nextjs",
      "ui/shadcn"
    ]
  }),
  definePreset({
    id: "vite",
    title: "Vite",
    description: "A pnpm and Turborepo workspace with a Vite React app and ShadCN UI",
    support: support.previewPreset,
    modules: [
      "workspace/pnpm-turbo",
      "workspace/typescript",
      "web/vite",
      "ui/shadcn"
    ]
  }),
  definePreset({
    id: "tanstack-start",
    title: "TanStack Start",
    description: "A pnpm and Turborepo workspace with a TanStack Start app and ShadCN UI",
    support: support.previewPreset,
    modules: [
      "workspace/pnpm-turbo",
      "workspace/typescript",
      "web/tanstack-start",
      "ui/shadcn"
    ]
  }),
  definePreset({
    id: "next-postgres-clerk",
    title: "Next.js, Postgres, and Clerk",
    description: "A Next.js app with ShadCN, Postgres, Drizzle, and Clerk",
    support: support.previewPreset,
    modules: [
      "workspace/pnpm-turbo",
      "workspace/typescript",
      "web/nextjs",
      "ui/shadcn",
      "db/postgres",
      "db/drizzle",
      "auth/clerk",
      "deploy/vercel"
    ]
  }),
  definePreset({
    id: "next-postgres-better-auth",
    title: "Next.js, Postgres, and Better Auth",
    description: "A Next.js app with ShadCN, Postgres, Drizzle, and self-hosted Better Auth",
    support: support.plannedPreset,
    modules: [
      "workspace/pnpm-turbo",
      "workspace/typescript",
      "web/nextjs",
      "ui/shadcn",
      "db/postgres",
      "db/drizzle",
      "auth/better-auth",
      "deploy/vercel"
    ]
  }),
  definePreset({
    id: "next-fastapi-postgres-auth0",
    title: "Next.js, FastAPI, Postgres, and Auth0",
    description: "A multi-language app with Next.js, FastAPI, Postgres, SQLAlchemy, and Auth0",
    support: support.supported,
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
      "quality/pytest"
    ]
  }),
  definePreset({
    id: "next-axum-postgres-auth0",
    title: "Next.js, Axum, Postgres, and Auth0",
    description: "A Next.js app with an Axum service, Postgres, Rust SQLx, and Auth0 where supported",
    support: support.plannedPreset,
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
      "deploy/docker"
    ]
  }),
  definePreset({
    id: "containerized",
    title: "Containerized Next.js and FastAPI",
    description: "A Docker-ready Next.js and FastAPI workspace with a local Postgres Compose service",
    support: support.previewPreset,
    modules: [
      "workspace/pnpm-turbo",
      "workspace/typescript",
      "web/nextjs",
      "ui/shadcn",
      "api/fastapi",
      "db/postgres",
      "db/sqlalchemy",
      "postgres/local",
      "deploy/docker"
    ]
  }),
  definePreset({
    id: "next-neon-drizzle",
    title: "Next.js, Neon, and Drizzle",
    description: "A Next.js app with ShadCN, Neon Postgres, and Drizzle",
    support: support.previewPreset,
    modules: [
      "workspace/pnpm-turbo",
      "workspace/typescript",
      "web/nextjs",
      "ui/shadcn",
      "db/postgres",
      "db/drizzle",
      "postgres/neon",
      "deploy/vercel"
    ]
  }),
  definePreset({
    id: "next-supabase-drizzle",
    title: "Next.js, Supabase, and Drizzle",
    description: "A Next.js app with ShadCN, Supabase Postgres, and Drizzle",
    support: support.previewPreset,
    modules: [
      "workspace/pnpm-turbo",
      "workspace/typescript",
      "web/nextjs",
      "ui/shadcn",
      "db/postgres",
      "db/drizzle",
      "postgres/supabase",
      "deploy/vercel"
    ]
  })
];

/** The supported golden-path preset used when create or recipe encode names no preset. */
export const defaultPresetId = "next-fastapi-postgres-auth0";

// Modules and presets are validated once by defineModule/definePreset; the registry is assembled from
// those parsed values. Registry-level invariants (unique ids) are checked by the registry tests.
export const builtinRegistry: StackkitRegistry = {
  schemaVersion: 1,
  namespace: "@stackkit",
  name: "Stackkit built-in registry",
  modules: builtinModules,
  presets: builtinPresets
};
