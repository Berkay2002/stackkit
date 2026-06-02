# Stackkit Long-Term Generator Plan

## Summary

Build `stackkit` as a long-term, public-grade TypeScript CLI for generating and maintaining multi-language monorepos. Do not design it as a minimal starter. Design it as a durable generator platform with composable modules, managed updates, official and curated AI skill installation, and strong defaults across TypeScript, Python, Rust, database, auth, deployment, and UI stacks.

The default foundation is `pnpm + Turborepo`. The CLI itself is TypeScript. Generated repos can include Next.js, ShadCN, FastAPI, Flask, Django, Litestar, Axum, Actix, Rocket, Tauri, Postgres, Drizzle, Prisma, SQLAlchemy, sqlx, Clerk, Auth0, Vercel, Docker, Kubernetes, CI, docs, and project-local AI skills.

## Core Product Direction

`stackkit` should solve four problems:

1. Generate complete monorepos from selected stack choices.
2. Keep those choices recorded in a project manifest.
3. Allow later updates, migrations, additions, removals, and diagnostics.
4. Install official or curated AI skills that match the selected stack modules, with local generated guidance as the fallback.

The generator should not be a folder copier. It should be a registry-driven project engine.

## CLI Surface

Expose a full lifecycle command surface:

```bash
stackkit create
stackkit add
stackkit remove
stackkit update
stackkit migrate
stackkit diff
stackkit doctor
stackkit skills sync
stackkit skills update
stackkit preset list
stackkit preset inspect
stackkit config validate
```

`create` generates a new project.

`add` adds new modules to an existing project, for example adding `deploy/kubernetes` later.

`remove` supports only safe removals. If generated files were modified or ownership is ambiguous, it should refuse and explain.

`update` upgrades selected modules using versioned migrations.

`migrate` applies pending module migrations.

`diff` shows what would change before applying an update.

`doctor` validates repo health, module compatibility, package manager state, env files, dependency versions, and AI skill state.

`skills sync` restores project-local skills from the recorded skill lock.

`skills update` updates installed official and curated skills.

## Runtime And Tooling

Use TypeScript for the CLI.

Recommended implementation stack:

```text
Runtime: Node.js
Language: TypeScript
Package manager: pnpm
CLI parser: commander
Prompts: @clack/prompts
Schema validation: zod
Template rendering: small explicit renderer, preferably Eta or a minimal typed renderer
Tests: Vitest
Filesystem helpers: fs-extra or native fs/promises
Process execution: execa
Formatting: Prettier
Linting: ESLint
Release tooling: Changesets
```

Avoid adding a large framework unless the module system becomes too complex for plain TypeScript.

## Repository Shape For Stackkit Itself

Use a monorepo for the generator:

```text
apps/
  docs/
packages/
  cli/
  core/
  registry/
  templates/
  test-utils/
  schemas/
examples/
  next-fastapi-postgres-clerk/
  next-rust-postgres-auth0/
docs/
  architecture.md
  modules.md
  skills.md
  updates.md
  contributing.md
```

`packages/core` owns orchestration.

`packages/registry` contains built-in modules.

`packages/templates` contains shared template utilities and file fragments.

`packages/schemas` exports config and manifest schemas.

`apps/docs` documents public usage and module authoring.

## Module Interface

Each module must be a typed unit. It declares what it needs, what it provides, what files it owns, what commands it runs, and what AI skills it wants.

```ts
type StackkitModule = {
  id: ModuleId;
  version: SemVer;

  title: string;
  description: string;

  requires?: Capability[];
  provides?: Capability[];
  conflicts?: ModuleId[];

  prompts?: PromptDefinition[];

  files?: FileOperation[];
  packageChanges?: PackageChange[];
  envVars?: EnvVarDefinition[];
  tasks?: TaskDefinition[];

  postCreate?: LifecycleHook[];
  postAdd?: LifecycleHook[];

  migrations?: ModuleMigration[];

  aiSkills?: AiSkillDependency[];

  validate?: ModuleValidation[];
};
```

Example:

```ts
{
  id: "web/nextjs",
  version: "1.0.0",
  provides: ["web-app", "react"],
  requires: ["workspace/node"],
  aiSkills: [
    {
      source: "https://github.com/vercel-labs/agent-skills",
      skills: ["vercel-react-best-practices"],
      trust: "official",
      reason: "React and Next.js app code"
    }
  ]
}
```

## Manifest

Every generated project gets:

```text
.stackkit/project.json
skills-lock.json
```

`.stackkit/project.json` records:

```json
{
  "schemaVersion": 1,
  "stackkitVersion": "x.y.z",
  "projectName": "example",
  "createdAt": "2026-06-01T00:00:00.000Z",
  "modules": [
    {
      "id": "web/nextjs",
      "version": "1.0.0",
      "options": {}
    }
  ],
  "files": [
    {
      "path": "apps/web/package.json",
      "owner": "web/nextjs",
      "hash": "..."
    }
  ],
  "aiSkills": {
    "targets": [
      {
        "agent": "codex",
        "directory": ".agents",
        "enabled": true
      }
    ],
    "installed": [],
    "unresolved": []
  },
  "migrations": {
    "applied": []
  }
}
```

This manifest is required for managed updates.

## Built-In Modules

Include the full core set as long-term target:

```text
workspace/pnpm-turbo
workspace/typescript
workspace/github-actions
workspace/docker-compose

web/nextjs
ui/shadcn
ui/tailwind

api/fastapi
api/flask
api/litestar
web/django

rust/axum
rust/actix
rust/rocket
rust/tokio
rust/sqlx
rust/diesel
desktop/tauri

db/postgres
db/drizzle
db/prisma
db/sqlalchemy
db/sqlx
db/diesel

auth/clerk
auth/auth0
auth/better-auth
auth/none

deploy/vercel
deploy/docker
deploy/kubernetes

docs/readme
docs/architecture
docs/env
docs/local-dev

ai/skills
quality/eslint
quality/prettier
quality/ruff
quality/pytest
quality/cargo
quality/vitest
```

ShadCN should be the default UI module whenever a Next.js UI is selected.

Postgres is the default database family. Database providers are adapters, not separate app architectures:

```text
postgres/local-docker
postgres/neon
postgres/supabase
postgres/existing-url
```

Database access is idiomatic per language:

```text
TypeScript: default Drizzle, optional Prisma
Python: SQLAlchemy
Rust: sqlx by default, Diesel optional later
```

FastAPI and Axum are recommended defaults, but not the only serious backend paths. Python modules should cover FastAPI, Flask, Django, and Litestar. Rust modules should cover Axum, Actix, Rocket, Tokio, sqlx, Diesel, and Tauri.

## Presets

Presets are compositions of modules, not separate templates.

Examples:

```text
next-only
next-postgres-clerk
next-fastapi-postgres-clerk
next-fastapi-postgres-auth0
next-rust-postgres-auth0
fullstack-containerized
work-kubernetes-ready
```

A preset can preselect modules, but the user can override choices interactively or via config.

## Config-Driven And Interactive Flow

Support both interactive and config-driven generation.

Interactive:

```bash
stackkit create
```

Config-driven:

```bash
stackkit create --config stackkit.config.json
```

Example config:

```json
{
  "projectName": "acme-dashboard",
  "packageManager": "pnpm",
  "workspace": "pnpm-turbo",
  "modules": [
    "web/nextjs",
    "ui/shadcn",
    "api/fastapi",
    "db/postgres",
    "db/drizzle",
    "auth/auth0",
    "deploy/vercel",
    "deploy/docker",
    "deploy/kubernetes",
    "ai/skills"
  ],
  "options": {
    "db/postgres": {
      "provider": "local-docker"
    },
    "auth/auth0": {
      "targets": ["nextjs", "fastapi"]
    }
  },
  "ai": {
    "skillTargets": ["codex", "claude-code"]
  }
}
```

Every prompt answer must map to config. No hidden wizard-only behavior.

## AI Skills Design

AI skills are selected from the same module graph as code.

Rules:

1. Official skill sources are preferred whenever available.
2. Curated skill sources are allowed only when explicitly allowlisted.
3. Local generated guidance is used when no official or curated source is accepted.
4. Skills are project-local by default.
5. Skill installation happens during generation.
6. Skill failures warn and continue.
7. Failed skills are recorded in `.stackkit/project.json`.
8. `stackkit skills sync` retries installation later.
9. No untrusted free-form skill URL is accepted in the normal wizard.
10. Codex-compatible project skills install to `.agents/skills` by default.
11. Claude Code project skills install to `.claude/skills` only when selected.

Skill sources are tiered:

```text
official: vendor, framework, or platform-owned skill repositories
curated: manually allowlisted community repositories with strong usage, stars, relevance, and non-archived status
local: Stackkit-generated project guidance when no official or curated skill exists
unresolved: recorded when a desired skill cannot be installed or verified
```

Official sources may have lower GitHub stars if the owning organization is clearly authoritative. Curated sources require explicit allowlisting. Search results alone are not enough.

Verified official skill sources as of the current planning pass:

| Module | Source | Skills | Notes |
| --- | --- | --- | --- |
| `ui/shadcn` | `https://github.com/shadcn/ui` | `shadcn` | Official shadcn/ui source |
| `api/fastapi` | `https://github.com/fastapi/fastapi` | `fastapi` | Official FastAPI source |
| `web/nextjs` | `https://github.com/vercel-labs/agent-skills` | `vercel-react-best-practices` | Official Vercel source |
| `deploy/vercel` | `https://github.com/vercel-labs/agent-skills` | `deploy-to-vercel` | Official Vercel deployment skill |
| `db/postgres` | `https://github.com/supabase/agent-skills` | `supabase-postgres-best-practices` | General Postgres patterns, not only Supabase |
| `postgres/neon` | `https://github.com/neondatabase/agent-skills` | `neon-postgres`, `neon-postgres-branches` | Provider-specific Neon guidance |
| `db/postgres-alt` | `https://github.com/planetscale/database-skills` | `postgres` | Strong alternative official Postgres guidance |
| `db/mysql` | `https://github.com/planetscale/database-skills` | `mysql` | For future MySQL support |
| `db/vitess` | `https://github.com/planetscale/database-skills` | `vitess` | For future Vitess support |
| `auth/clerk` | `https://github.com/clerk/skills` | `clerk-setup`, `clerk-nextjs-patterns`, `clerk-testing` | Use `clerk`, the router skill, only when broad Clerk guidance is wanted |
| `auth/better-auth` | `https://github.com/better-auth/skills` | `better-auth-best-practices`, `create-auth-skill`, `better-auth-security-best-practices` | Official Better Auth source for TypeScript/JavaScript auth |
| `auth/better-auth-email-password` | `https://github.com/better-auth/skills` | `email-and-password-best-practices` | Use when email/password auth is selected |
| `auth/better-auth-orgs` | `https://github.com/better-auth/skills` | `organization-best-practices` | Use when organizations, teams, RBAC, or multi-tenant SaaS are selected |
| `auth/better-auth-2fa` | `https://github.com/better-auth/skills` | `two-factor-authentication-best-practices` | Use when 2FA/MFA is selected |
| `auth/auth0-nextjs` | `https://github.com/auth0/agent-skills` | `auth0-nextjs` | Auth0 with Next.js |
| `auth/auth0-fastapi` | `https://github.com/auth0/agent-skills` | `auth0-fastapi-api` | Auth0 JWT protection for FastAPI APIs |
| `auth/auth0-flask` | `https://github.com/auth0/agent-skills` | `auth0-flask` | Auth0 with Flask |
| `auth/auth0-general` | `https://github.com/auth0/agent-skills` | `auth0-quickstart` | Use only when stack-specific Auth0 skills are not enough |

Auth0 must resolve skills per selected framework and service target. For example, a generated repo with Next.js and FastAPI should install `auth0-nextjs` and `auth0-fastapi-api`; a Flask app should install `auth0-flask`. Do not collapse framework-specific Auth0 choices into only `auth0-quickstart`.

Curated skill candidates:

| Module | Source | Skills | Status |
| --- | --- | --- | --- |
| `api/flask` | `mindrally/skills` | `flask-python` | Curated candidate |
| `web/django` | `affaan-m/everything-claude-code` | `django-patterns`, `django-security`, `django-tdd`, `django-verification` | Strong curated candidate with high install counts |
| `web/django-alt` | `vintasoftware/django-ai-plugins` | `django-expert` | Curated candidate for general Django expertise |
| `db/drizzle` | `bobmatnyc/claude-mpm-skills` | `drizzle-orm` | Curated candidate, needs extra review due lower repo stars |
| `db/sqlalchemy` | `bobmatnyc/claude-mpm-skills` | `sqlalchemy-orm` | Curated candidate, needs extra review |
| `rust/core` | `apollographql/skills` | `rust-best-practices` | Strong curated candidate with high install count; Apollo-owned but not the official Rust project |
| `rust/patterns` | `affaan-m/everything-claude-code` | `rust-patterns` | Strong curated candidate |
| `rust/testing` | `affaan-m/everything-claude-code` | `rust-testing` | Strong curated candidate |
| `rust/tokio` | `wshobson/agents` | `rust-async-patterns` | Strong curated candidate |
| `rust/web` | `actionbook/rust-skills` | `domain-web` | Strong curated candidate |
| `rust/axum` | `bobmatnyc/claude-mpm-skills` | `axum` | Curated candidate, needs extra review |
| `desktop/tauri` | `nodnarbnitram/claude-code-extensions` | `tauri-v2` | Curated candidate preferred for Tauri v2+ |

Docker, Kubernetes, GitHub Actions, Litestar, Pydantic, SQLx, and Diesel should currently fall back to local Stackkit guidance unless better official or curated sources are later verified.

Skill targets are installed through the `skills` CLI agent selector:

```text
codex -> npx -y skills add ... --agent codex -> .agents/skills
claude-code -> npx -y skills add ... --agent claude-code -> .claude/skills
```

Interactive generation should default to Codex-compatible `.agents` skills and require the user to explicitly select Claude Code:

```text
AI skill targets
[x] .agents  Codex-compatible project skills
[ ] .claude  Claude Code project skills
```

Example install commands:

```bash
npx -y skills add https://github.com/shadcn/ui --skill shadcn --agent codex -y --copy
npx -y skills add https://github.com/fastapi/fastapi --skill fastapi --agent codex -y --copy
npx -y skills add https://github.com/supabase/agent-skills --skill supabase-postgres-best-practices --agent codex -y --copy
npx -y skills add https://github.com/vercel-labs/agent-skills --skill vercel-react-best-practices --agent codex -y --copy
npx -y skills add https://github.com/auth0/agent-skills --skill auth0-nextjs auth0-fastapi-api auth0-flask --agent codex -y --copy
npx -y skills add https://github.com/clerk/skills --skill clerk-setup clerk-nextjs-patterns clerk-testing --agent codex -y --copy
npx -y skills add https://github.com/better-auth/skills --skill better-auth-best-practices create-auth-skill better-auth-security-best-practices --agent codex -y --copy
npx -y skills add https://github.com/nodnarbnitram/claude-code-extensions --skill tauri-v2 --agent codex -y --copy
npx -y skills add https://github.com/affaan-m/everything-claude-code --skill django-patterns django-security django-tdd django-verification --agent codex -y --copy
npx -y skills add https://github.com/apollographql/skills --skill rust-best-practices --agent codex -y --copy
npx -y skills add https://github.com/wshobson/agents --skill rust-async-patterns --agent codex -y --copy
npx -y skills add https://github.com/affaan-m/everything-claude-code --skill rust-patterns rust-testing --agent codex -y --copy
```

Use `supabase-postgres-best-practices` for general Postgres guidance even when the selected Postgres provider is not Supabase.

Use `auth0-nextjs` when Auth0 is selected for Next.js.

Use `auth0-fastapi-api` when Auth0 is selected for FastAPI API protection.

Use `auth0-flask` when Auth0 is selected for Flask.

Use Clerk skills from `https://github.com/clerk/skills`, not `https://github.com/clerk/agent-skills`.

Use Better Auth skills from `https://github.com/better-auth/skills`. Install `better-auth-best-practices`, `create-auth-skill`, and `better-auth-security-best-practices` for a baseline Better Auth module. Add `email-and-password-best-practices`, `organization-best-practices`, and `two-factor-authentication-best-practices` only when the selected auth options need those capabilities.

Skill selection resolver order:

1. If a selected module has an official skill, install that.
2. If no official skill exists, install an allowlisted curated skill.
3. If no curated skill is approved, generate local guidance under the selected project skill targets or project docs.
4. If a desired source fails to install, record it as unresolved and continue.

Do not install random search results automatically.

Do not install multiple overlapping skills for the same module unless they cover different scopes. For example, `auth0-nextjs` and `auth0-fastapi-api` can both install because they cover different services.

Rust skills should be resolved by scope. `rust-best-practices` and `rust-patterns` cover general idiomatic Rust guidance, `rust-async-patterns` covers async/Tokio-heavy work, and `rust-testing` covers test strategy. A project with a simple Rust CLI should not automatically install every Rust-related skill, but a Rust API service with async runtime and generated tests can install all relevant scoped skills.

## Skill Registry Shape

Use an allowlisted registry:

```ts
type AiSkillDependency = {
  source?: string;
  skills: string[];
  trust: "official" | "curated" | "local" | "unresolved";
  causedBy: ModuleId;
  reason: string;
  installCount?: number;
  repoStars?: number;
  verifiedAt?: string;
  optional?: boolean;
};
```

Example registry entry:

```ts
{
  module: "db/postgres",
  aiSkills: [
        {
          source: "https://github.com/supabase/agent-skills",
          skills: ["supabase-postgres-best-practices"],
          trust: "official",
      causedBy: "db/postgres",
      reason: "General Postgres schema, indexing, and query performance"
    }
  ]
}
```

Public registry helpers should preserve this provenance:

```ts
export type AiSkillTrust = "official" | "curated" | "local" | "unresolved";
export type AiSkillDependency;
export type AiSkillRegistryEntry;

export function defineSkillSource(entry: AiSkillRegistryEntry): AiSkillRegistryEntry;
export function resolveAiSkills(modules: StackkitModule[]): AiSkillDependency[];
```

## Generation Data Flow

`stackkit create` should run in this order:

1. Load config if provided.
2. Run interactive prompts for missing values.
3. Resolve selected modules and presets into a module graph.
4. Validate required capabilities and conflicts.
5. Build an execution plan.
6. Show a summary before writing.
7. Render files into a staging model.
8. Detect conflicts with existing files.
9. Write project files.
10. Install package dependencies.
11. Run module post-create hooks.
12. Install official and curated AI skills, and generate local guidance for modules without accepted skill sources.
13. Write `.stackkit/project.json`.
14. Write or update `skills-lock.json`.
15. Run `stackkit doctor`.
16. Print next commands.

## Updates And Migrations

Managed updates are central to the design.

Each module can ship migrations:

```ts
type ModuleMigration = {
  from: SemVerRange;
  to: SemVer;
  title: string;
  operations: MigrationOperation[];
  safety: "automatic" | "review-required" | "manual";
};
```

Update behavior:

```bash
stackkit update
stackkit update web/nextjs
stackkit update --dry-run
stackkit update --interactive
```

Rules:

1. Never overwrite user-modified files silently.
2. Use recorded hashes to detect generated files that changed.
3. For conflicted files, generate a patch or mark review required.
4. Prefer additive migrations.
5. Destructive migrations must require explicit confirmation.
6. `stackkit diff` must show planned changes before applying.

## Deployment Design

Deployment is modular.

Vercel module:

```text
deploy/vercel
```

Targets Next.js first. It can generate Vercel config, environment docs, and deployment instructions.

Docker module:

```text
deploy/docker
```

Generates Dockerfiles for web, FastAPI, Rust services, and optional compose files.

Kubernetes module:

```text
deploy/kubernetes
```

Generates baseline manifests or Helm/Kustomize structure. Keep it generic and production-conscious, but avoid pretending it can know every company cluster policy.

A project can select multiple deployment modules.

## Auth Design

Auth is provider-adapter based.

Generated app code should depend on a small internal auth boundary, not directly scatter provider-specific code everywhere.

Modules:

```text
auth/clerk
auth/auth0
auth/better-auth
auth/none
```

Auth0 supports:

```text
Next.js login/session integration
FastAPI JWT API protection
shared env docs
callback/logout URL documentation
```

Clerk supports:

```text
Next.js app auth
middleware/protected routes
shared user identity boundary
```

Clerk AI skills should resolve from `https://github.com/clerk/skills`, with `clerk-setup`, `clerk-nextjs-patterns`, and `clerk-testing` selected when the generated project includes Clerk with Next.js and test scaffolding.

Better Auth supports:

```text
TypeScript/JavaScript auth owned in the generated app
server and client setup
database adapters
session management
email/password auth
OAuth providers
organizations and RBAC
two-factor authentication
security hardening
```

Better Auth is the default self-hosted TypeScript auth option. It is different from Clerk and Auth0 because the generated project owns more of the auth implementation and database integration. The generator should surface that tradeoff clearly: Better Auth gives more control and fewer external platform assumptions, while Clerk and Auth0 reduce the amount of auth infrastructure the project owns.

## Public API And Types

Public package exports:

```ts
export type StackkitConfig;
export type StackkitManifest;
export type StackkitModule;
export type StackkitPreset;
export type AiSkillTrust;
export type AiSkillDependency;
export type AiSkillRegistryEntry;
export type ModuleMigration;

export function defineModule(module: StackkitModule): StackkitModule;
export function definePreset(preset: StackkitPreset): StackkitPreset;
export function defineSkillSource(entry: AiSkillRegistryEntry): AiSkillRegistryEntry;
export function resolveAiSkills(modules: StackkitModule[]): AiSkillDependency[];
```

Module authors should not import internal engine details.

Keep the public module API stable and versioned.

## Open Source Operating Model

Use MIT license.

Open-source posture: personal-first, public-grade. That means the project can start private or solo-maintained, but the repo structure, docs, issue templates, license, and contribution path should be clean enough to publish without a rewrite.

Relevant Open Source Guides:

**Starting an Open Source Project**

Why it applies: Stackkit is being designed for eventual public release, so scope, license, README, and maintainer expectations should be clear early.

URL: <https://opensource.guide/starting-a-project/>

**Best Practices for Maintainers**

Why it applies: A generator with plugins, templates, issues, and stack compatibility can become maintenance-heavy unless boundaries are explicit.

URL: <https://opensource.guide/best-practices/>

**Security Best Practices for your Project**

Why it applies: Stackkit installs dependencies, runs commands, and installs AI skills, so trusted sources and supply-chain hygiene matter.

URL: <https://opensource.guide/security-best-practices-for-your-project/>

Required public-grade repo files:

```text
README.md
LICENSE
CONTRIBUTING.md
SECURITY.md
CODE_OF_CONDUCT.md
CHANGELOG.md
docs/modules.md
docs/skills.md
docs/managed-updates.md
```

Keep governance light initially. Do not invent committees or heavy process before the project has contributors.

## Security And Trust

Security rules:

1. Default official and curated skill sources must be allowlisted.
2. No arbitrary code execution from module definitions outside trusted packages.
3. External commands must be visible in dry-run output.
4. Generated `.env.example` files must not contain secrets.
5. Skill install failures must not be hidden.
6. Project updates must not overwrite user code silently.
7. Remote templates should not be supported until there is a signing or trust model.
8. Curated skill sources must record install count, repository stars, verification date, and the reason they are allowed.

## Testing Plan

Unit tests:

```text
module graph resolution
capability validation
conflict detection
config schema parsing
manifest writing
AI skill resolution
command plan generation
migration planning
file ownership hashing
```

Integration tests:

```text
create Next.js + ShadCN
create Next.js + FastAPI + Postgres + Auth0
create Next.js + Rust + Postgres
create Docker-enabled project
create Kubernetes-enabled project
sync AI skills with mocked skills CLI
warn and continue when skill install fails
update generated project with unchanged files
update generated project with user-modified files
```

Snapshot tests:

```text
generated package.json files
turbo.json
pnpm-workspace.yaml
Dockerfiles
docker-compose.yml
Kubernetes manifests
.env.example files
.stackkit/project.json
```

End-to-end tests:

```text
stackkit create --config examples/next-fastapi-postgres-auth0.json
pnpm install
pnpm lint
pnpm test
pnpm build
docker compose config
stackkit doctor
```

AI skill tests:

```text
Default AI skill target resolves to codex and `.agents/skills`
Claude Code target resolves to claude-code and `.claude/skills` only when selected
Skill installer plans one `npx skills add` command per selected target
Postgres module resolves supabase-postgres-best-practices
Neon Postgres resolves neon-postgres and neon-postgres-branches
Next.js module resolves vercel-react-best-practices
Vercel deployment resolves deploy-to-vercel
ShadCN resolves official shadcn/ui skill `shadcn`
FastAPI resolves official fastapi/fastapi skill `fastapi`
Clerk resolves clerk/skills, not clerk/agent-skills
Clerk + Next.js resolves clerk-setup and clerk-nextjs-patterns
Better Auth resolves better-auth/skills, not a curated substitute
Better Auth baseline resolves better-auth-best-practices, create-auth-skill, and better-auth-security-best-practices
Better Auth email/password option resolves email-and-password-best-practices
Better Auth organizations option resolves organization-best-practices
Better Auth 2FA option resolves two-factor-authentication-best-practices
Auth0 + Next.js resolves auth0-nextjs
Auth0 + FastAPI resolves auth0-fastapi-api
Auth0 + Flask resolves auth0-flask
Flask can resolve curated mindrally/skills when allowlisted
Django can resolve curated affaan-m/everything-claude-code skill bundle when allowlisted
Django can resolve curated vintasoftware/django-ai-plugins as an alternative when allowlisted
Drizzle can resolve curated bobmatnyc/claude-mpm-skills when allowlisted
SQLAlchemy can resolve curated bobmatnyc/claude-mpm-skills when allowlisted
Rust core can resolve curated apollographql/skills rust-best-practices when allowlisted
Rust patterns can resolve curated affaan-m/everything-claude-code rust-patterns when allowlisted
Rust testing can resolve curated affaan-m/everything-claude-code rust-testing when allowlisted
Rust async can resolve curated wshobson/agents when allowlisted
Rust web can resolve curated actionbook/rust-skills when allowlisted
Tauri can resolve curated nodnarbnitram/claude-code-extensions tauri-v2 when allowlisted
Simple Rust modules do not install every Rust skill by default; resolver selects skills by project scope
Docker and Kubernetes fall back to local guidance when no accepted source is configured
Unknown official skill source records unresolved skill and continues
Untrusted custom source is rejected by default
Failed skill installation records unresolved skill and does not fail project generation
```

## Acceptance Criteria

The design is successful when:

1. A user can generate a complete multi-language monorepo from interactive prompts.
2. The same project can be generated from config without prompts.
3. Selected modules produce matching files, dependencies, env docs, scripts, and AI skills.
4. The project records enough metadata to support future updates.
5. AI skills are installed from official sources first, curated allowlisted sources second, and local guidance fallback third.
6. Failed skill installs do not break project generation.
7. `stackkit doctor` can explain what is missing or inconsistent.
8. Updates are dry-run capable and do not silently overwrite user changes.
9. The repo is public-open-source ready without needing a documentation rewrite.
10. Python and Rust modules participate in AI skill resolution the same way TypeScript modules do.
11. Curated skills require explicit allowlisting.
12. Modules without accepted skills generate local guidance instead of being ignored.
13. The manifest records trust level, source, selected skill names, and unresolved skill failures.

## Explicit Defaults

Use these defaults unless the user config overrides them:

```text
CLI language: TypeScript
Workspace: pnpm + Turborepo
Frontend: Next.js
UI: ShadCN
Database family: Postgres
TypeScript DB default: Drizzle
Python DB default: SQLAlchemy
Rust DB default: sqlx
Auth strategy: provider adapters
Personal auth default: Clerk
Work-friendly auth default: Auth0/OIDC
Self-hosted TypeScript auth default: Better Auth
Deployment: Vercel for web, Docker for services, Kubernetes optional
AI skills: installed during generation
AI skill trust policy: official first, curated allowlist second, local guidance fallback
Skill failure policy: warn and continue
License: MIT
Manifest path: .stackkit/project.json
```

## Assumptions

`stackkit` is the working project name.

The implementation should treat unverified skill sources as local guidance or unresolved, not as installable.

The skill audit was done with `npx skills find`, `npx skills add --list`, and `gh repo view`. Install counts and GitHub stars are current only at audit time and should be refreshed before implementation.

The generator should be designed long-term from the start. Implementation may still be sequenced, but the architecture should not be a throwaway MVP.

The first implementation plan should start by building the core engine, schemas, module registry contract, manifest format, and AI skill resolver before filling out every stack module.
