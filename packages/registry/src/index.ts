import { defineModule, definePreset } from "@berkayorhan/stackkit-core/customizer";
import { stackkitRegistrySchema } from "@berkayorhan/stackkit-schemas";

export const curatedSkillSourceAllowlist = [
  "https://github.com/affaan-m/everything-claude-code",
  "https://github.com/vintasoftware/django-ai-plugins",
  "https://github.com/mindrally/skills",
  "https://github.com/bobmatnyc/claude-mpm-skills",
  "https://github.com/apollographql/skills",
  "https://github.com/wshobson/agents",
  "https://github.com/actionbook/rust-skills",
  "https://github.com/nodnarbnitram/claude-code-extensions"
] as const;

function localGuidance(moduleId: string, skill: string, reason: string) {
  return [
    {
      skills: [skill],
      trust: "local" as const,
      causedBy: moduleId,
      reason
    }
  ];
}

export const builtinModules = [
  defineModule({
    id: "workspace/pnpm-turbo",
    version: "1.0.0",
    title: "pnpm and Turborepo",
    description: "pnpm workspace with Turborepo task orchestration",
    aliases: ["workspace"],
    category: "workspace",
    provides: ["workspace/node"],
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
    provides: ["web-app", "nextjs-app", "react"],
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
    id: "ui/shadcn",
    version: "1.0.0",
    title: "ShadCN",
    description: "ShadCN UI components",
    aliases: ["shadcn"],
    category: "ui",
    icon: "shadcn",
    requires: ["react"],
    readme: {
      stack: ["ShadCN UI", "Tailwind CSS"],
      layout: [
        { path: "apps/web/components.json", description: "ShadCN component registry configuration" },
        { path: "apps/web/app/globals.css", description: "Tailwind CSS entrypoint" }
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
    provides: ["css", "tailwind"],
    aiSkills: [
      {
        skills: ["stackkit-tailwind-guidance"],
        trust: "local",
        causedBy: "ui/tailwind",
        reason: "Tailwind configuration and utility composition guidance"
      }
    ]
  }),
  defineModule({
    id: "quality/eslint",
    version: "1.0.0",
    title: "ESLint",
    description: "JavaScript and TypeScript linting",
    requires: ["typescript"],
    provides: ["lint"],
    aiSkills: localGuidance("quality/eslint", "stackkit-eslint-guidance", "ESLint configuration and rule maintenance guidance")
  }),
  defineModule({
    id: "quality/prettier",
    version: "1.0.0",
    title: "Prettier",
    description: "Shared code formatting",
    provides: ["format"],
    aiSkills: localGuidance("quality/prettier", "stackkit-prettier-guidance", "Prettier configuration and formatting policy guidance")
  }),
  defineModule({
    id: "api/fastapi",
    version: "1.0.0",
    title: "FastAPI",
    description: "FastAPI API service",
    aliases: ["fastapi"],
    category: "api",
    icon: "fastapi",
    provides: ["api", "python"],
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
    provides: ["api", "python"],
    aiSkills: [
      {
        skills: ["stackkit-flask-guidance"],
        trust: "local",
        causedBy: "api/flask",
        reason: "Flask service structure and testing guidance"
      }
    ]
  }),
  defineModule({
    id: "api/litestar",
    version: "1.0.0",
    title: "Litestar",
    description: "Litestar API service",
    provides: ["api", "python"],
    aiSkills: [
      {
        skills: ["stackkit-litestar-guidance"],
        trust: "local",
        causedBy: "api/litestar",
        reason: "Litestar service structure and testing guidance"
      }
    ]
  }),
  defineModule({
    id: "quality/ruff",
    version: "1.0.0",
    title: "Ruff",
    description: "Python linting and formatting",
    requires: ["python"],
    provides: ["python-quality"],
    aiSkills: localGuidance("quality/ruff", "stackkit-ruff-guidance", "Ruff linting and formatting guidance")
  }),
  defineModule({
    id: "quality/pytest",
    version: "1.0.0",
    title: "pytest",
    description: "Python test runner",
    requires: ["python"],
    provides: ["python-test"],
    aiSkills: localGuidance("quality/pytest", "stackkit-pytest-guidance", "pytest layout and test authoring guidance")
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
    },
    aiSkills: localGuidance("db/drizzle", "stackkit-drizzle-guidance", "Drizzle schema and migration guidance")
  }),
  defineModule({
    id: "db/prisma",
    version: "1.0.0",
    title: "Prisma",
    description: "TypeScript ORM for Postgres",
    requires: ["postgres", "typescript"],
    provides: ["typescript-db"],
    aiSkills: [
      {
        skills: ["stackkit-prisma-guidance"],
        trust: "local",
        causedBy: "db/prisma",
        reason: "Prisma schema and migration guidance"
      }
    ]
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
    envVars: [
      {
        name: "DATABASE_URL",
        description: "Postgres connection string.",
        required: true,
        example: "",
        target: "api"
      }
    ],
    readme: {
      stack: ["SQLAlchemy"]
    },
    aiSkills: localGuidance("db/sqlalchemy", "stackkit-sqlalchemy-guidance", "SQLAlchemy model, session, and migration guidance")
  }),
  defineModule({
    id: "db/sqlx",
    version: "1.0.0",
    title: "SQLx",
    description: "SQLx database access for Postgres",
    aliases: ["sqlx"],
    category: "database-client",
    requires: ["postgres"],
    provides: ["sqlx-db"],
    aiSkills: [
      {
        skills: ["stackkit-sqlx-guidance"],
        trust: "local",
        causedBy: "db/sqlx",
        reason: "SQLx query and migration guidance"
      }
    ]
  }),
  defineModule({
    id: "db/diesel",
    version: "1.0.0",
    title: "Diesel",
    description: "Diesel ORM for Postgres",
    requires: ["postgres"],
    provides: ["diesel-db"],
    aiSkills: [
      {
        skills: ["stackkit-diesel-guidance"],
        trust: "local",
        causedBy: "db/diesel",
        reason: "Diesel schema and migration guidance"
      }
    ]
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
        example: "",
        target: "api"
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
    requires: ["rust-async"],
    provides: ["api", "rust"],
    aiSkills: localGuidance("rust/axum", "stackkit-axum-guidance", "Axum service structure and async handler guidance")
  }),
  defineModule({
    id: "rust/actix",
    version: "1.0.0",
    title: "Actix Web",
    description: "Actix Web API service",
    provides: ["api", "rust"],
    aiSkills: [
      {
        skills: ["stackkit-actix-guidance"],
        trust: "local",
        causedBy: "rust/actix",
        reason: "Actix Web service structure and testing guidance"
      }
    ]
  }),
  defineModule({
    id: "rust/rocket",
    version: "1.0.0",
    title: "Rocket",
    description: "Rocket web API service",
    provides: ["api", "rust"],
    aiSkills: [
      {
        skills: ["stackkit-rocket-guidance"],
        trust: "local",
        causedBy: "rust/rocket",
        reason: "Rocket service structure and testing guidance"
      }
    ]
  }),
  defineModule({
    id: "rust/sqlx",
    version: "1.0.0",
    title: "sqlx",
    description: "Rust SQL toolkit for Postgres",
    aliases: ["rust-sqlx"],
    category: "database-client",
    requires: ["postgres", "rust"],
    provides: ["rust-db"],
    aiSkills: localGuidance("rust/sqlx", "stackkit-rust-sqlx-guidance", "Rust SQLx query and migration guidance")
  }),
  defineModule({
    id: "rust/diesel",
    version: "1.0.0",
    title: "Diesel for Rust",
    description: "Rust Diesel ORM integration for Postgres",
    requires: ["postgres", "rust"],
    provides: ["rust-db"],
    aiSkills: localGuidance("rust/diesel", "stackkit-rust-diesel-guidance", "Rust Diesel schema and migration guidance")
  }),
  defineModule({
    id: "quality/cargo",
    version: "1.0.0",
    title: "Cargo checks",
    description: "Rust formatting, linting, and tests",
    requires: ["rust"],
    provides: ["rust-quality"],
    aiSkills: localGuidance("quality/cargo", "stackkit-cargo-guidance", "Cargo formatting, linting, and test guidance")
  }),
  defineModule({
    id: "desktop/tauri",
    version: "1.0.0",
    title: "Tauri",
    description: "Tauri desktop application",
    provides: ["desktop"],
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
    requires: ["nextjs-app"],
    provides: ["container"],
    readme: {
      stack: ["Docker"],
      layout: [
        { path: "docker-compose.yml", description: "Local container orchestration" },
        { path: "apps/web/Dockerfile", description: "Next.js container image" }
      ]
    },
    aiSkills: localGuidance("deploy/docker", "stackkit-docker-guidance", "Dockerfile and image build guidance")
  }),
  defineModule({
    id: "workspace/docker-compose",
    version: "1.0.0",
    title: "Docker Compose",
    description: "Local multi-service Docker Compose setup",
    requires: ["container"],
    provides: ["local-compose"],
    aiSkills: localGuidance("workspace/docker-compose", "stackkit-docker-compose-guidance", "Local multi-service Compose guidance")
  }),
  defineModule({
    id: "workspace/github-actions",
    version: "1.0.0",
    title: "GitHub Actions",
    description: "Baseline CI workflow",
    provides: ["ci"],
    aiSkills: localGuidance("workspace/github-actions", "stackkit-github-actions-guidance", "GitHub Actions CI workflow guidance")
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
    provides: ["deploy"],
    aiSkills: [
      {
        skills: ["stackkit-kubernetes-guidance"],
        trust: "local",
        causedBy: "deploy/kubernetes",
        reason: "No accepted official or curated Kubernetes skill source is configured"
      }
    ]
  }),
  defineModule({
    id: "docs/local-dev",
    version: "1.0.0",
    title: "Local development docs",
    description: "Local development documentation",
    provides: ["docs"],
    aiSkills: localGuidance("docs/local-dev", "stackkit-local-dev-docs-guidance", "Local development documentation guidance")
  }),
  defineModule({
    id: "docs/readme",
    version: "1.0.0",
    title: "README",
    description: "Project README documentation",
    provides: ["docs"],
    aiSkills: localGuidance("docs/readme", "stackkit-readme-guidance", "README structure and project overview guidance")
  }),
  defineModule({
    id: "docs/architecture",
    version: "1.0.0",
    title: "Architecture docs",
    description: "Architecture documentation",
    provides: ["docs"],
    aiSkills: localGuidance("docs/architecture", "stackkit-architecture-docs-guidance", "Architecture documentation guidance")
  }),
  defineModule({
    id: "docs/env",
    version: "1.0.0",
    title: "Environment docs",
    description: "Environment variable documentation",
    provides: ["docs"],
    aiSkills: localGuidance("docs/env", "stackkit-env-docs-guidance", "Environment variable documentation guidance")
  }),
  defineModule({
    id: "ai/skills",
    version: "1.0.0",
    title: "AI skills",
    description: "Local AI skill guidance setup",
    provides: ["ai-guidance"],
    aiSkills: [
      {
        skills: ["stackkit-local-skill-guidance"],
        trust: "local",
        causedBy: "ai/skills",
        reason: "Local AI guidance should be written into the generated workspace"
      }
    ]
  }),
  defineModule({
    id: "quality/vitest",
    version: "1.0.0",
    title: "Vitest",
    description: "JavaScript and TypeScript test runner",
    requires: ["typescript"],
    provides: ["javascript-test"],
    aiSkills: localGuidance("quality/vitest", "stackkit-vitest-guidance", "Vitest configuration and test authoring guidance")
  })
] as const;

export const builtinPresets = [
  definePreset({
    id: "next",
    title: "Next.js",
    description: "A pnpm and Turborepo workspace with a Next.js app and ShadCN UI",
    modules: ["workspace/pnpm-turbo", "workspace/typescript", "web/nextjs", "ui/shadcn", "quality/eslint", "quality/prettier"]
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
      "quality/prettier"
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
      "quality/prettier"
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
      "auth/auth0-nextjs",
      "auth/auth0-fastapi",
      "deploy/vercel",
      "deploy/docker",
      "quality/eslint",
      "quality/prettier",
      "quality/ruff",
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
      "quality/cargo"
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
      "docs/local-dev"
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
      "quality/prettier"
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
      "quality/prettier"
    ]
  })
] as const;

export const builtinRegistry = stackkitRegistrySchema.parse({
  schemaVersion: 1,
  namespace: "@stackkit",
  name: "Stackkit built-in registry",
  modules: builtinModules,
  presets: builtinPresets
});
