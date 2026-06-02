# Architecture

Stackkit is split into small packages with one direction of dependency.

`packages/schemas` defines public data shapes.

`packages/templates` renders file operations from typed inputs.

`packages/core` resolves modules, plans changes, checks safety, writes files, records manifests, installs skills, and runs diagnostics.

`packages/registry` declares built-in modules and presets. It does not write files.

`packages/cli` owns commands, prompts, output formatting, and process execution.

## Create flow

`create` loads config or prompts, resolves presets and modules, validates capabilities and conflicts, builds a plan, renders files, checks conflicts, writes files, installs skills, writes manifests, runs doctor, and prints next commands.
