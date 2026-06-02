import { defineModule, definePreset } from "@stackkit/core";

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
    provides: ["workspace/node"]
  }),
  defineModule({
    id: "workspace/typescript",
    version: "1.0.0",
    title: "TypeScript",
    description: "Shared TypeScript configuration",
    requires: ["workspace/node"],
    provides: ["typescript"]
  }),
  defineModule({
    id: "web/nextjs",
    version: "1.0.0",
    title: "Next.js",
    description: "Next.js web application",
    requires: ["workspace/node"],
    provides: ["web-app", "nextjs-app", "react"],
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
    id: "ui/shadcn",
    version: "1.0.0",
    title: "ShadCN",
    description: "ShadCN UI components",
    requires: ["react"],
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
    provides: ["api", "python"],
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
    provides: ["postgres"],
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
    requires: ["postgres", "typescript"],
    provides: ["typescript-db"],
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
    requires: ["postgres", "python"],
    provides: ["python-db"],
    aiSkills: localGuidance("db/sqlalchemy", "stackkit-sqlalchemy-guidance", "SQLAlchemy model, session, and migration guidance")
  }),
  defineModule({
    id: "db/sqlx",
    version: "1.0.0",
    title: "SQLx",
    description: "SQLx database access for Postgres",
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
    requires: ["postgres"],
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
    id: "auth/clerk",
    version: "1.0.0",
    title: "Clerk",
    description: "Clerk hosted auth",
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
    requires: ["react"],
    provides: ["auth"],
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
    requires: ["python"],
    provides: ["auth"],
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
    requires: ["web-app"],
    provides: ["deploy"],
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
    requires: ["nextjs-app"],
    provides: ["container"],
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
    id: "next-only",
    title: "Next.js only",
    description: "A pnpm/Turborepo workspace with a Next.js app",
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
    id: "next-fastapi-postgres-auth0",
    title: "Next.js, FastAPI, Postgres, and Auth0",
    description: "A multi-language app with Next.js, FastAPI, Postgres, and Auth0",
    modules: [
      "workspace/pnpm-turbo",
      "workspace/typescript",
      "web/nextjs",
      "ui/shadcn",
      "api/fastapi",
      "db/postgres",
      "db/drizzle",
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
    id: "next-rust-postgres-auth0",
    title: "Next.js, Rust, Postgres, and Auth0",
    description: "A Next.js app with Rust service, Postgres, and Auth0",
    modules: [
      "workspace/pnpm-turbo",
      "workspace/typescript",
      "web/nextjs",
      "ui/shadcn",
      "rust/axum",
      "rust/tokio",
      "rust/sqlx",
      "db/postgres",
      "auth/auth0-nextjs",
      "deploy/vercel",
      "deploy/docker",
      "quality/eslint",
      "quality/prettier",
      "quality/cargo"
    ]
  }),
  definePreset({
    id: "fullstack-containerized",
    title: "Full stack containerized",
    description: "A Docker-ready Next.js and API workspace",
    modules: [
      "workspace/pnpm-turbo",
      "workspace/typescript",
      "workspace/docker-compose",
      "web/nextjs",
      "ui/shadcn",
      "api/fastapi",
      "db/postgres",
      "deploy/docker",
      "docs/local-dev"
    ]
  }),
  definePreset({
    id: "work-kubernetes-ready",
    title: "Work Kubernetes ready",
    description: "A containerized workspace with Kubernetes manifests",
    modules: [
      "workspace/pnpm-turbo",
      "workspace/typescript",
      "workspace/github-actions",
      "web/nextjs",
      "api/fastapi",
      "db/postgres",
      "deploy/docker",
      "deploy/kubernetes",
      "docs/architecture",
      "docs/env"
    ]
  })
] as const;
