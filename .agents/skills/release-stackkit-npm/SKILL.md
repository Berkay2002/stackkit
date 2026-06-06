---
name: release-stackkit-npm
description: Use when preparing, versioning, verifying, dry-running, or publishing a new npm release for the Stackkit monorepo packages.
---

# Release Stackkit Npm

## Overview

Release Stackkit through Changesets and pnpm. Do not hand-edit package versions unless the release tooling is broken and the user approves the fallback.

Stackkit publishes these runtime packages as a fixed Changesets group:

| Package | Path |
| --- | --- |
| `@berkayorhan/stackkit` | `packages/cli` |
| `@berkayorhan/stackkit-core` | `packages/core` |
| `@berkayorhan/stackkit-registry` | `packages/registry` |
| `@berkayorhan/stackkit-schemas` | `packages/schemas` |
| `@berkayorhan/stackkit-templates` | `packages/templates` |

The root package, `apps/*`, and `packages/test-utils` are private and should not be bumped for npm unless the user explicitly asks.

## Release Workflow

1. Inspect state:
   - `git status --short --branch`
   - `rg '"version"' package.json packages apps -g package.json`
   - `Get-ChildItem -Force .changeset`
   - `npm view @berkayorhan/stackkit versions --json`

2. Derive release scope from history before writing a changeset:
   - Find the last npm-published version you are releasing from. Prefer a matching git tag if one exists.
   - If there is no matching tag, locate the version bump commit with `git log --oneline -S'"version": "<version>"' -- packages/cli/package.json`.
   - Review commits after that point with `git log --oneline <version-commit>..HEAD`.
   - Inspect relevant diffs for those commits when commit titles are too broad: `git show --stat <commit>` or `git show --name-only <commit>`.
   - Base the changeset summary on this full history, not on the immediate user prompt or the last code change.
   - If the release has already been published with incomplete notes, do not republish the same version. Prepare a new patch release with corrected, complete changelog text.

3. Decide release type:
   - Default to `patch` for fixes and small generated-output changes.
   - Use `minor` only for user-visible capabilities or CLI behavior additions.
   - Use `major` only for breaking CLI, schema, manifest, or package API changes.
   - If uncertain, ask the user before versioning.

4. Add a changeset when none exists for the release:
   - Include only the five published runtime packages.
   - Keep the summary plain and specific.
   - Summarize every material commit since the previous published version.
   - Use multiple short bullets when one sentence would hide distinct changes.
   - Do not include private packages.

5. Run versioning:
   - `pnpm version-packages`
   - Review the diff.
   - If Changesets bumps private package `version` fields only, restore those private package files and remove private changelogs.
   - Keep generated changelogs for the five published packages.

6. Verify:
   - `pnpm install --lockfile-only`
   - `pnpm --filter @berkayorhan/stackkit-schemas typecheck`
   - `pnpm --filter @berkayorhan/stackkit-templates typecheck`
   - `pnpm --filter @berkayorhan/stackkit-registry typecheck`
   - `pnpm --filter @berkayorhan/stackkit-core typecheck`
   - `pnpm --filter @berkayorhan/stackkit typecheck`

7. Clean generated artifacts before finishing:
   - Remove `packages/**/dist`.
   - Remove `packages/**/*.tsbuildinfo`.
   - Keep `.next/cache` artifacts out of scope unless they are in the package diff.

8. Dry-run before publish:
   - `pnpm build`
   - `pnpm publish -r --dry-run --access public --no-git-checks`
   - If either fails, diagnose and fix before publishing.

9. Publish only when explicitly requested:
   - Confirm npm auth if needed with `npm whoami`.
   - Run `pnpm publish -r --access public --no-git-checks`.
   - Do not publish with unexplained dirty files.

10. Verify the published npm state:
   - `npm view @berkayorhan/stackkit version dist-tags --json`
   - Spot-check at least `@berkayorhan/stackkit-core` and `@berkayorhan/stackkit-templates`.
   - If the user is testing the global `stackkit` command, update it with `npm install -g @berkayorhan/stackkit@latest` and verify with `npm list -g @berkayorhan/stackkit --depth=0`.

## Commit Rules

If the user asks to commit the release bump, stage only release files unless they explicitly ask for a broader commit:

- published package `package.json` files
- published package `CHANGELOG.md` files
- relevant `.changeset/*.md` files when they have not been consumed
- lockfile only if `pnpm install --lockfile-only` changed it

Use a direct message such as `bump: release stackkit 0.1.2`.

## Common Mistakes

| Mistake | Fix |
| --- | --- |
| Hand-editing versions first | Use Changesets so fixed-group versions and changelogs stay consistent. |
| Bumping private packages | Restore private package manifests and delete private changelogs. |
| Publishing before dry-run | Run build and publish dry-run first. |
| Writing a changeset from the immediate task only | Use npm version state plus git history since the last published version, then summarize all material commits. |
| Publishing incomplete changelog text | Release a follow-up patch with corrected notes; npm versions are immutable. |
| npm latest is updated but local command is old | Run `npm install -g @berkayorhan/stackkit@latest` and verify the global package version. |
| Leaving build artifacts | Remove `packages/**/dist` and `*.tsbuildinfo` before final status. |
| Mixing unrelated work | Stage release files explicitly and leave unrelated dirty files alone. |
