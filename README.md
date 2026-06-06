# Stackkit

Stackkit is a TypeScript CLI for generating and maintaining multi-language monorepos.

It creates managed Turborepo projects from modules, presets, stack-axis flags, or offline recipe codes. Stackkit records what it owns in `.stackkit/project.json`, so later commands can inspect, diff, validate, and evolve the project without guessing.

## Why Stackkit

Most boilerplate generators stop after the first write. Stackkit is built around a longer lifecycle:

- generate a project from friendly stack choices
- preserve canonical module IDs in config and manifests
- write deterministic docs, env examples, scripts, and starter files
- run `doctor` and `diff` against managed files
- add, remove, update, migrate, and sync AI skills as the project changes

The goal is not a single fixed starter. The goal is a generator platform for customizable monorepo boilerplates.

## Status

Stackkit is an early alpha. It can generate and validate real starter monorepos, but some framework integrations are still intentionally shallow.

Verified today:

- pnpm, npm, yarn, and bun project metadata
- Next.js, ShadCN, FastAPI, Postgres metadata, Auth0 metadata, Vercel, Docker, and Kubernetes file generation
- deterministic `README.md` and `.env.example`
- root `dev`, `build`, `test`, `typecheck`, `lint`, and `format` scripts
- `stackkit doctor`, `stackkit diff --file`, `stackkit info`, module discovery, presets, recipes, and local registry listing
- project-local AI skill targets for Codex `.agents` and Claude Code `.claude`

Known gaps:

- auth and database modules mostly emit metadata, docs, env examples, and AI skills rather than full application integration code
- Rust services are declared but not deeply templated yet
- remote registries are intentionally unsupported
- the visual customizer is local-only and does not host or persist recipes

## Install

After the first npm publish:

```bash
npx @berkayorhan/stackkit@latest create my-app --web next --api fastapi --db postgres --auth auth0
```

Or install globally:

```bash
npm install -g @berkayorhan/stackkit
stackkit create my-app --web next
```

## Quick Start

Generate a representative full-stack starter:

```bash
stackkit create my-app \
  --web next \
  --api fastapi \
  --db postgres \
  --auth auth0 \
  --with shadcn,docker \
  --deploy vercel
```

Skip AI skill installation during a quick local test:

```bash
stackkit create my-app --web next --skills skip --yes
```

Validate the generated project:

```bash
cd my-app
pnpm install --lockfile-only
pnpm install --ignore-scripts
pnpm test
pnpm typecheck
pnpm build
pnpm lint
stackkit doctor
```

## Create Without Writing Files

Preview a preset:

```bash
stackkit create my-app --preset next-postgres-clerk --dry-run
```

Preview explicit stack choices as JSON:

```bash
stackkit create my-app --web next --api fastapi --db postgres --auth auth0 --dry-run --json
```

View a planned file:

```bash
stackkit create my-app --web next --dry-run --view apps/web/package.json
```

## Presets And Recipes

List built-in presets:

```bash
stackkit preset list
stackkit preset inspect next-fastapi-postgres-auth0
```

Create an offline recipe code:

```bash
stackkit recipe encode --preset next-fastapi-postgres-auth0
stackkit recipe inspect sk_...
stackkit create my-app --recipe sk_...
```

Recipes are local and offline. They do not require hosted preset IDs or a Stackkit account.

## Web Customizer

Run the local visual customizer:

```bash
pnpm --filter @berkayorhan/stackkit-customizer dev
```

The app lets you choose a small set of polished presets or customize the stack with friendly technology names. It outputs an offline `stackkit create <name> --recipe <code>` command and previews the canonical modules behind that command.

## Inspect And Maintain

```bash
stackkit info
stackkit doctor
stackkit diff --file apps/web/package.json
stackkit module list
stackkit module search fastapi
stackkit module inspect fastapi --json
stackkit registry list
```

Lifecycle commands are available but should still be treated as alpha:

```bash
stackkit add
stackkit remove
stackkit update
stackkit migrate
stackkit skills sync
stackkit skills update
```

## AI Skills

Stackkit always uses `.agents/skills` as the default skill target because that is how `npx skills` works for Codex-compatible skills. Claude Code can be selected as an additional target, which writes `.claude/skills` as well.

Useful flags:

```bash
stackkit create my-app --ai codex,claude-code
stackkit create my-app --skills install
stackkit create my-app --skills plan
stackkit create my-app --skills skip
stackkit create my-app --skill-link copy
stackkit create my-app --skill-link symlink
```

## Packages

Runtime packages published from this repo:

- `@berkayorhan/stackkit`
- `@berkayorhan/stackkit-core`
- `@berkayorhan/stackkit-registry`
- `@berkayorhan/stackkit-schemas`
- `@berkayorhan/stackkit-templates`

`@berkayorhan/stackkit-test-utils` is private test infrastructure and is not published.

## Development

Requirements:

- Node.js 22 or newer
- pnpm 10
- `uv` for Python/FastAPI generated-project checks

Install and verify:

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm smoke
```

Build the CLI locally:

```bash
pnpm build
node packages/cli/dist/index.js --help
```

Run a local generated-project check from this repository:

```powershell
$target = "$env:TEMP/stackkit-playground"

node packages/cli/dist/index.js create my-app `
  --dir "$target/my-app" `
  --web next `
  --api fastapi `
  --db postgres `
  --auth auth0 `
  --with shadcn,docker `
  --deploy vercel `
  --skills skip `
  --yes

pnpm --dir "$target/my-app" install --lockfile-only
pnpm --dir "$target/my-app" install --ignore-scripts
pnpm --dir "$target/my-app" test
pnpm --dir "$target/my-app" typecheck
pnpm --dir "$target/my-app" build
pnpm --dir "$target/my-app" lint
node packages/cli/dist/index.js doctor --dir "$target/my-app"
```

## Publishing

The repo is configured for a public npm release of the runtime packages at `0.1.0`.

Before publishing:

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm smoke
pnpm publish -r --dry-run --access public --no-git-checks
```

When ready and authenticated to npm:

```bash
pnpm publish -r --access public --no-git-checks
```

## License

MIT
