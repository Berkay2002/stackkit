# Contributing

Use pnpm from the repository root.

```bash
pnpm install
pnpm test
pnpm build
pnpm typecheck
```

Keep package responsibilities separate. Put schemas in `packages/schemas`, orchestration in `packages/core`, generated file content in `packages/templates`, built-in declarations in `packages/registry`, and user-facing command behavior in `packages/cli`.

Do not add remote templates without a signing or trust model. Do not add untrusted AI skill sources to the default registry.
