# Stackkit Customizer

`apps/customizer` is a local Next.js app for building offline Stackkit recipe commands visually.

It renders choices from the shared Stackkit catalog and outputs offline recipe commands. It must not duplicate module, preset, recipe, or resolver logic from the CLI.

The shared boundary is:

- read UI-neutral catalog data from `@berkayorhan/stackkit-core/customizer`
- show canonical module and preset IDs alongside display labels
- use the shared recipe encode/decode APIs for copied `stackkit create <name> --recipe <code>` commands
- use shared resolver behavior to preview resolved modules

The current customizer is client-side only:

- choose preset
- choose package manager
- choose web, API, database, auth, deploy, and AI options
- preview resolved modules
- copy `stackkit create <name> --recipe <code>`
- view decoded config

No accounts, hosted recipe IDs, or backend storage are part of the first customizer.

Run it locally:

```bash
pnpm --filter @berkayorhan/stackkit-customizer dev
```
