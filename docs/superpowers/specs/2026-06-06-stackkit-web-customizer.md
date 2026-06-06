# Stackkit Web Customizer Spec

## Goal

Ship `apps/customizer`, a local Next.js app that lets developers compose a Stackkit monorepo visually and copy an offline `stackkit create` recipe command.

## Scope

- Use the built-in Stackkit registry and the shared core resolver and recipe APIs.
- Keep the first app offline. No accounts, hosted recipe IDs, persistence, telemetry, or backend storage.
- Present a small polished choice set with friendly technology names, big toggle buttons, icons, and an onboarding feel.
- Show the generated command, decoded recipe JSON, and resolved module list.
- Support package manager, preset, web, API, database, auth, deployment, and AI skill choices.
- Keep advanced choices visible but secondary. The default path should be understandable without reading documentation.

## Architecture

`@berkayorhan/stackkit-core/customizer` is a browser-safe subpath for catalog building, stack-axis resolution, module graph validation, and recipe encoding/decoding. The app imports this subpath from client code and imports `@berkayorhan/stackkit-registry` for the built-in catalog.

The app logic lives in `apps/customizer/src/stackkit-customizer.ts`. It maps friendly UI state to canonical module IDs, validates the combination with the shared resolver, and returns a generated command plus decoded recipe. `apps/customizer/app/page.tsx` renders the onboarding UI.

## Done

- `pnpm --filter @berkayorhan/stackkit-core test -- customizer-browser` passes.
- `pnpm --filter @berkayorhan/stackkit-customizer test` passes.
- `pnpm typecheck`, `pnpm test`, and `pnpm build` pass.
- The local customizer page renders and shows a `stackkit create` command.
- A recipe generated through the app logic works with the CLI `create --recipe ... --dry-run` path.
