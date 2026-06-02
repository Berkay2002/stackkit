# Stackkit

Stackkit is a TypeScript CLI for generating and maintaining multi-language monorepos.

It is built around modules. Modules declare generated files, dependencies, lifecycle hooks, migrations, validation rules, and AI skill guidance. Stackkit records what it owns in `.stackkit/project.json` so future updates can be planned safely.

## Current status

Stackkit is under active development. The CLI surface is being built toward:

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

## Defaults

- pnpm and Turborepo
- Next.js and ShadCN for web apps
- Postgres for databases
- Drizzle for TypeScript database access
- SQLAlchemy for Python database access
- sqlx for Rust database access
- Clerk, Auth0, or Better Auth for auth
- Vercel, Docker, and optional Kubernetes for deployment
- Project-local AI skills through `.agents/skills` by default

## Development

Commands:

- `pnpm install`
- `pnpm test`
- `pnpm build`
- `pnpm typecheck`
