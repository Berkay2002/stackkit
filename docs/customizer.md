# Stackkit Customizer

`apps/customizer` is a local Next.js app for building offline Stackkit recipe commands visually.

It renders choices backed by registry presets and support levels and outputs offline recipe commands. It must not duplicate module, preset, recipe, or resolver logic from the CLI.

The shared boundary is:

- read presets and module support levels from `@berkayorhan/stackkit-registry`; the app owns only labels, icons, and the choice-to-module mapping
- validate choices by resolving them with `@berkayorhan/stackkit-core/customizer` and showing the core error when a choice does not fit
- show canonical module and preset IDs alongside display labels
- use the shared recipe encode/decode APIs for copied `npx @berkayorhan/stackkit@<version> create <name> --recipe <code>` commands
- use shared resolver behavior to preview resolved modules

The current customizer is client-side only:

- choose preset
- choose package manager
- choose web, API, database, auth, deploy, and AI options
- allow Docker for the containerized generated targets Stackkit can render today (Next.js and FastAPI); Kubernetes and Vercel are preview-only
- preview resolved modules
- copy `npx @berkayorhan/stackkit@<version> create <name> --recipe <code>`
- view decoded config

No accounts, hosted recipe IDs, or backend storage are part of the first customizer.

Run it locally:

```bash
pnpm --filter @berkayorhan/stackkit-customizer dev
```
