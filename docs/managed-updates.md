# Managed Updates

Stackkit records generated ownership in `.stackkit/project.json`.

Each managed file record has:

- path
- owner module
- content hash

`diff` shows planned changes. `update` plans module version changes. `migrate` applies automatic migrations and refuses review-required or manual migrations until the user reviews them.

Stackkit never silently overwrites user-modified managed files. If the current file hash does not match the manifest hash, the operation is refused or marked review-required.
