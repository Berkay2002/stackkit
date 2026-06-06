# Changesets

This folder is managed by [Changesets](https://github.com/changesets/changesets). It is how Stackkit
versions packages and keeps npm in sync with GitHub Releases.

## Workflow

1. After making a change that should ship, run:

   ```bash
   pnpm changeset
   ```

   Pick the bump type (patch / minor / major) and write a short summary. This creates a markdown
   file in `.changeset/` — commit it alongside your code.

2. When that lands on `master`, the **Release** GitHub Action opens (or updates) a
   `chore: release stackkit packages` pull request that bumps versions and updates changelogs.

3. Merging that PR triggers the action again, which publishes the bumped packages to npm and
   creates the matching git tags + GitHub Releases.

The five public packages are configured as a **fixed** group, so they always share one version
number and release together. Private packages (`apps/*`, `test-utils`) are ignored automatically.
