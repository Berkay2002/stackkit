# Modules

A module is a typed declaration of generated project behavior.

Modules can declare:

- `requires`: capabilities the module needs.
- `provides`: capabilities the module supplies.
- `conflicts`: module IDs that cannot be selected together.
- `files`: generated file operations.
- `packageChanges`: package.json script and dependency changes.
- `envVars`: entries for `.env.example`.
- `postCreate` and `postAdd`: lifecycle hooks.
- `migrations`: versioned changes for managed updates.
- `aiSkills`: official, curated, local, or unresolved AI guidance.

Registry modules should stay declarative. Files are staged by core before anything is written.
