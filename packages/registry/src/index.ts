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
    provides: ["web-app", "react"],
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
    id: "quality/eslint",
    version: "1.0.0",
    title: "ESLint",
    description: "JavaScript and TypeScript linting",
    requires: ["typescript"],
    provides: ["lint"]
  }),
  defineModule({
    id: "quality/prettier",
    version: "1.0.0",
    title: "Prettier",
    description: "Shared code formatting",
    provides: ["format"]
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
    id: "quality/ruff",
    version: "1.0.0",
    title: "Ruff",
    description: "Python linting and formatting",
    requires: ["python"],
    provides: ["python-quality"]
  }),
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
    provides: ["typescript-db"]
  }),
  defineModule({
    id: "db/sqlalchemy",
    version: "1.0.0",
    title: "SQLAlchemy",
    description: "Python database toolkit for Postgres",
    requires: ["postgres", "python"],
    provides: ["python-db"]
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
    provides: ["api", "rust"]
  }),
  defineModule({
    id: "rust/sqlx",
    version: "1.0.0",
    title: "sqlx",
    description: "Rust SQL toolkit for Postgres",
    requires: ["postgres", "rust"],
    provides: ["rust-db"]
  }),
  defineModule({
    id: "quality/cargo",
    version: "1.0.0",
    title: "Cargo checks",
    description: "Rust formatting, linting, and tests",
    requires: ["rust"],
    provides: ["rust-quality"]
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
    provides: ["container"]
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
