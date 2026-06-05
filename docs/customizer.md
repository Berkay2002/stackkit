# Stackkit Customizer

The customizer is planned as a future Next.js and shadcn/ui app.

It should render choices from the shared Stackkit catalog and output offline recipe commands. It must not duplicate module, preset, recipe, or resolver logic from the CLI.

The shared boundary is:

- read UI-neutral catalog data from `buildCustomizerCatalog`
- show canonical module and preset IDs alongside display labels
- use existing recipe encode/decode APIs for copied `stackkit create <name> --recipe <code>` commands
- use existing resolver behavior to preview resolved modules

The first customizer should be client-side only:

- choose preset
- choose package manager
- choose web, API, database, auth, deploy, and AI options
- preview resolved modules
- copy `stackkit create <name> --recipe <code>`
- view decoded config

No accounts, hosted recipe IDs, or backend storage are part of the first customizer.

This repository does not implement `apps/customizer` yet.
