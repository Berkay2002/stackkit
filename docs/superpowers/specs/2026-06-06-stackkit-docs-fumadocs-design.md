# Stackkit Docs Site (Fumadocs) — Design

**Date:** 2026-06-06
**Status:** Approved design, pending implementation plan
**Package:** `@berkayorhan/stackkit-docs` at `apps/docs`

## Goal

Add a Fumadocs-powered documentation site to the Stackkit monorepo as a new
workspace app, mirroring the conventions of the existing `apps/customizer`
Next.js app. Content is authored fresh (not migrated from the existing
root `docs/*.md` files). Includes AI/LLM-friendly outputs (`llms.txt`,
`llms-full.txt`, per-page `.md`, copy/view actions) but **no** in-docs AI chat.

## Context

- Monorepo: `stackkit`, pnpm@10.5.1, Turborepo, workspaces globbed as
  `apps/*` and `packages/*` (`pnpm-workspace.yaml`).
- Node 24 (satisfies Fumadocs' Node 22+ requirement).
- Existing app `apps/customizer`: Next.js 16, React 19, App Router,
  `type: module`, `next.config.ts` with `transpilePackages`, `tsconfig.json`
  extends `../../tsconfig.base.json`, fonts via `next/font` (Geist), and
  **plain hand-written CSS — no Tailwind.**
- `turbo.json` defines `dev` (persistent, no cache), `build`
  (outputs `.next/**`), `test`, `typecheck`. Tasks auto-apply to any
  `apps/*` package that defines the matching script.
- Git remote: `https://github.com/Berkay2002/stackkit.git` →
  owner/repo `Berkay2002/stackkit`.

### Key constraint: Tailwind is new to this repo

Fumadocs UI requires Tailwind CSS 4. The customizer does not use Tailwind.
`apps/docs` introduces its own Tailwind 4 setup, fully scoped to this package
(its own `globals.css`, PostCSS config). The customizer's CSS is untouched.
This is expected and acceptable in a monorepo — packages may have independent
styling stacks.

## Architecture

New package `apps/docs`:

```
apps/docs/
  package.json              # @berkayorhan/stackkit-docs, scripts: dev/build/test/typecheck
  next.config.mjs           # createMDX() wrapper + .md rewrite (ESM, per Fumadocs MDX ESM-only)
  source.config.ts          # defineDocs(content/docs) + includeProcessedMarkdown
  postcss.config.mjs        # @tailwindcss/postcss
  tsconfig.json             # extends ../../tsconfig.base.json + Next overrides + collections alias
  .gitignore                # .source/, .next/
  content/docs/
    index.mdx               # Stackkit intro
    getting-started.mdx     # install + first project
    cli-reference.mdx       # core commands
    meta.json               # page ordering
  lib/
    source.ts               # loader({ baseUrl: '/docs', source: docs.toFumadocsSource() })
    layout.shared.tsx       # baseOptions(): nav title, githubUrl, GITHUB_REPO constant
    get-llm-text.ts         # per-page LLM markdown builder
  components/
    mdx.tsx                 # getMDXComponents / useMDXComponents
    ai/
      page-actions.tsx      # LLMCopyButton + ViewOptions (from @fumadocs/cli add ai/page-actions)
  app/
    layout.tsx              # RootProvider + Tailwind/Fumadocs styles + fonts
    globals.css             # @import tailwindcss + fumadocs-ui neutral + preset
    (home)/
      layout.tsx            # HomeLayout
      page.tsx              # landing hero -> link into /docs
    docs/
      layout.tsx            # DocsLayout(tree, baseOptions)
      [[...slug]]/page.tsx  # DocsPage with page actions
    api/search/route.ts     # createFromSource (Orama)
    llms.txt/route.ts       # llms(source).index()
    llms-full.txt/route.ts  # concatenated getLLMText over all pages
    llms.mdx/docs/[[...slug]]/route.ts   # raw markdown per page
```

### Why `next.config.mjs` (not `.ts`)

Fumadocs MDX is ESM-only and the docs recommend `next.config.mjs` for accurate
ESM resolution. The customizer uses `next.config.ts`, but for this package we
follow the Fumadocs recommendation to avoid native TS-resolver friction.
`transpilePackages` is not needed here (docs site does not import the
stackkit workspace packages).

## Components / Data Flow

1. **Content source.** `source.config.ts` `defineDocs({ dir: 'content/docs' })`
   with `postprocess.includeProcessedMarkdown: true`. `createMDX()` generates
   `.source/` on `dev`/`build`. `lib/source.ts` wraps it with
   `loader({ baseUrl: '/docs' })`.

2. **Rendering.** `app/docs/[[...slug]]/page.tsx` resolves the page via
   `source.getPage(slug)`, renders `DocsPage` → `DocsTitle` / `DocsDescription`
   / `DocsBody` with `getMDXComponents` (incl. `createRelativeLink`).
   `generateStaticParams` + `generateMetadata` per the Fumadocs Next.js guide.
   So the dynamic route is statically generated.

3. **Layouts.** `lib/layout.shared.tsx` exports `baseOptions()` with nav title
   ("Stackkit"), `githubUrl`, and an exported `GITHUB_REPO = 'Berkay2002/stackkit'`
   constant. `app/docs/layout.tsx` uses `DocsLayout` with
   `source.getPageTree()`. `app/(home)/layout.tsx` uses `HomeLayout`.

4. **Search.** `app/api/search/route.ts` = `createFromSource(source, { language: 'english' })`
   (Orama, static/local search).

5. **Home page.** `app/(home)/page.tsx`: small hero (Tailwind + Fumadocs theme
   tokens) with a primary CTA linking to `/docs`. Kept intentionally light.

## AI / LLM Features (no chat)

- **`llms.txt`** — `app/llms.txt/route.ts`, `revalidate = false`, returns
  `llms(source).index()`.
- **`llms-full.txt`** — `app/llms-full.txt/route.ts`, maps `getLLMText` over
  `source.getPages()`, joins with blank lines.
- **`get-llm-text.ts`** — `# {title} ({url})\n\n{await page.data.getText('processed')}`.
  Requires `includeProcessedMarkdown` (set in source.config).
- **Per-page `.md`** — `app/llms.mdx/docs/[[...slug]]/route.ts` returns
  `getLLMText(page)` as `text/markdown`, with `generateStaticParams`. A
  `next.config` rewrite maps `/docs/:path*.md` → `/llms.mdx/docs/:path*`.
- **Page actions** — install via `pnpm dlx @fumadocs/cli add ai/page-actions`,
  render `LLMCopyButton` + `ViewOptions` on each docs page, wired to
  `${page.url}.md` (markdown URL) and the GitHub source link
  `https://github.com/Berkay2002/stackkit/blob/master/apps/docs/content/docs/${page.path}`.

Note: branch in GitHub source link is `master` (this repo's default branch).

## Authored Content (fresh)

Three starter pages, ordered by `meta.json`:

1. **`index.mdx`** — what Stackkit is, the generator-platform framing,
   pointer to getting started.
2. **`getting-started.mdx`** — install the CLI, generate a first project,
   run `doctor`.
3. **`cli-reference.mdx`** — overview of `generate`, `doctor`, `diff`, `info`,
   module discovery.

Content is written from scratch (not copied from root `docs/*.md`), kept
accurate to README claims and intentionally extendable. `meta.json` controls
ordering.

## Error Handling

- Unknown docs slug → `notFound()` (404) in page + `.md` route.
- Missing/empty `content/docs` → build still succeeds with empty tree
  (home page renders); at least `index.mdx` ships so this is not hit.
- `.source` and `.next` gitignored; regenerated on every `dev`/`build`.

## Testing & Verification

- `pnpm install` resolves the new package (workspace glob already covers `apps/*`).
- `pnpm --filter @berkayorhan/stackkit-docs build` succeeds — validates MDX
  parsing and static param generation.
- `pnpm --filter @berkayorhan/stackkit-docs typecheck` passes.
- Manual smoke (`dev`): `/` renders home, `/docs` renders with sidebar +
  search, a page's `.md` returns markdown, `/llms.txt` and `/llms-full.txt`
  return content, copy/view buttons appear on docs pages.
- A minimal `vitest` `test` script is included for turbo parity (even if it
  only asserts a trivial sanity check initially), matching the customizer's
  `test` script so `turbo run test` stays green.

## Out of Scope (YAGNI)

- In-docs AI chat (`ai/openrouter` / `llmgateway` / `inkeep`) — explicitly excluded.
- Migrating existing root `docs/*.md` content.
- i18n, OpenAPI, custom layout slots, Flux/Notebook layouts.
- Hosting/deploy configuration.

## Open Decisions (resolved)

- Setup: **manual install** (not `create-fumadocs-app`).
- Content: **authored fresh**, 3 starter pages.
- AI: **llms.txt + llms-full.txt + .md route + page actions**, no chat.
- GitHub URL: **`Berkay2002/stackkit`** constant (from git remote).
- Root route: **home page** via `HomeLayout`.
