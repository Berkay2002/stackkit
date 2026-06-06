import Link from 'next/link';
import { GITHUB_REPO } from '@/lib/layout.shared';

/** Languages and tooling Stackkit scaffolds, shown as real brand marks. */
const STACKS: { slug: string; hex: string; label: string }[] = [
  { slug: 'typescript', hex: '3178C6', label: 'TypeScript' },
  { slug: 'rust', hex: '000000', label: 'Rust' },
  { slug: 'python', hex: '3776AB', label: 'Python' },
  { slug: 'nodedotjs', hex: '5FA04E', label: 'Node.js' },
  { slug: 'react', hex: '149ECA', label: 'React' },
  { slug: 'fastapi', hex: '009688', label: 'FastAPI' },
  { slug: 'postgresql', hex: '4169E1', label: 'PostgreSQL' },
  { slug: 'docker', hex: '2496ED', label: 'Docker' },
  { slug: 'kubernetes', hex: '326CE5', label: 'Kubernetes' },
  { slug: 'turborepo', hex: 'EF4444', label: 'Turborepo' },
  { slug: 'pnpm', hex: 'F69220', label: 'pnpm' },
];

export default function HomePage() {
  return (
    <main className="flex flex-col text-fd-foreground">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-fd-border">
        {/* Ambient wash, kept inside the hero only (page theme stays locked). */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(70%_60%_at_50%_0%,black,transparent)]"
        >
          <div className="absolute inset-0 bg-[radial-gradient(40rem_24rem_at_70%_-10%,color-mix(in_oklch,var(--color-brand)_18%,transparent),transparent)]" />
        </div>

        <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-6 py-20 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-16 lg:py-28">
          {/* Copy */}
          <div className="anim-fade-up flex flex-col items-start gap-6">
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Multi-language monorepos, generated and maintained.
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-fd-muted-foreground text-pretty">
              Stackkit is a TypeScript CLI that scaffolds full-stack monorepos
              from one declarative config, then evolves them with managed
              migrations.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                href="/docs/getting-started"
                className="rounded-lg bg-fd-primary px-5 py-2.5 text-sm font-semibold text-fd-primary-foreground transition-all hover:opacity-90 active:translate-y-px"
              >
                Get started
              </Link>
              <a
                href={`https://github.com/${GITHUB_REPO}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-fd-border px-5 py-2.5 text-sm font-semibold text-fd-foreground transition-colors hover:bg-fd-muted active:translate-y-px"
              >
                GitHub
              </a>
            </div>
          </div>

          {/* Real command panel — the natural product visual for a CLI. */}
          <div className="anim-fade-up [animation-delay:120ms]">
            <div className="overflow-hidden rounded-xl border border-fd-border bg-fd-card shadow-sm shadow-fd-border/40">
              <div className="flex items-center gap-2 border-b border-fd-border px-4 py-2.5">
                <span className="size-2 rounded-full bg-brand" />
                <span className="font-mono text-xs text-fd-muted-foreground">
                  stackkit
                </span>
              </div>
              <pre className="overflow-x-auto px-4 py-4 font-mono text-[13px] leading-relaxed">
                <code>
                  <span className="text-fd-muted-foreground">$ </span>
                  npx @berkayorhan/stackkit init
                  {'\n'}
                  <span className="text-brand">?</span> Preset{'  '}
                  <span className="text-fd-muted-foreground">
                    next-fastapi-postgres-auth0
                  </span>
                  {'\n'}
                  <span className="text-brand">✓</span> Resolved web, API, and
                  deployment modules
                  {'\n'}
                  <span className="text-brand">✓</span> Wrote 42 files{'  '}
                  <span className="text-fd-muted-foreground">· 0 conflicts</span>
                  {'\n\n'}
                  <span className="text-fd-muted-foreground">
                    $ </span>
                  pnpm dev{'  '}
                  <span className="text-fd-muted-foreground">
                    # web + api, ready
                  </span>
                </code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features (asymmetric bento, exact cell count) ────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-6 py-20 lg:py-24">
        <h2 className="max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
          A generator you can keep using after day one.
        </h2>
        <p className="mt-3 max-w-2xl text-fd-muted-foreground text-pretty">
          Most scaffolders write files once and walk away. Stackkit owns the
          full lifecycle of the workspace it creates.
        </p>

        <div className="mt-10 grid gap-4 lg:grid-cols-6">
          {/* Wide tile with its own mono detail for visual variation */}
          <article className="group flex flex-col gap-3 rounded-xl border border-fd-border bg-fd-card p-6 lg:col-span-3">
            <h3 className="text-base font-semibold">Deterministic output</h3>
            <p className="text-sm leading-relaxed text-fd-muted-foreground">
              The same config produces the same tree on every machine and in CI.
              Files are content-hashed so upgrades know exactly what they own.
            </p>
            <div className="mt-auto rounded-lg border border-fd-border bg-fd-background p-3 font-mono text-xs text-fd-muted-foreground">
              files[].hash{' '}
              <span className="text-brand">·</span> owner-tracked
            </div>
          </article>

          <article className="flex flex-col gap-3 rounded-xl border border-fd-border bg-fd-card p-6 lg:col-span-3">
            <h3 className="text-base font-semibold">Managed migrations</h3>
            <p className="text-sm leading-relaxed text-fd-muted-foreground">
              Generated projects evolve with versioned, recorded migrations.
              Bump a module and Stackkit applies only what has not run yet.
            </p>
          </article>

          <article className="flex flex-col gap-3 rounded-xl border border-fd-border bg-fd-card p-6 lg:col-span-2">
            <h3 className="text-base font-semibold">Offline recipes</h3>
            <p className="text-sm leading-relaxed text-fd-muted-foreground">
              Templates for TypeScript, Python, Rust and more ship in the binary.
              No network, no surprise registry fetches.
            </p>
          </article>

          <article className="flex flex-col gap-3 rounded-xl border border-fd-border bg-fd-card p-6 lg:col-span-2">
            <h3 className="text-base font-semibold">Workspace-native</h3>
            <p className="text-sm leading-relaxed text-fd-muted-foreground">
              Output is a real pnpm + Turborepo workspace. Tasks, caching and
              filters work the way your team already expects.
            </p>
          </article>

          <article className="flex flex-col gap-3 rounded-xl border border-fd-border bg-fd-card p-6 lg:col-span-2">
            <h3 className="text-base font-semibold">AI skill targets</h3>
            <p className="text-sm leading-relaxed text-fd-muted-foreground">
              Emit skill files for the agents you use, linked or copied, so the
              generated repo is legible to tooling from the first commit.
            </p>
          </article>
        </div>
      </section>

      {/* ── Supported stacks (logos only) ───────────────────────────────── */}
      <section className="border-y border-fd-border bg-fd-muted/30">
        <div className="mx-auto w-full max-w-6xl px-6 py-12">
          <p className="text-center text-sm font-medium text-fd-muted-foreground">
            Scaffolds and maintains projects across the stack
          </p>
          <ul className="mt-7 flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
            {STACKS.map((s) => (
              <li key={s.slug}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://cdn.simpleicons.org/${s.slug}/${s.hex}`}
                  alt={s.label}
                  width={28}
                  height={28}
                  loading="lazy"
                  className="h-7 w-auto opacity-80 transition-opacity hover:opacity-100"
                />
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Closing CTA band ────────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-6 py-20 lg:py-24">
        <div className="flex flex-col items-start gap-6 rounded-2xl border border-fd-border bg-fd-card p-8 sm:p-12 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Read the documentation
            </h2>
            <p className="mt-2 text-fd-muted-foreground text-pretty">
              From your first scaffold to the full CLI reference and the
              <code className="mx-1 rounded bg-fd-muted px-1.5 py-0.5 font-mono text-sm">
                .stackkit/project.json
              </code>
              manifest.
            </p>
          </div>
          <Link
            href="/docs"
            className="shrink-0 rounded-lg bg-fd-primary px-6 py-3 text-sm font-semibold text-fd-primary-foreground transition-all hover:opacity-90 active:translate-y-px"
          >
            Browse the docs
          </Link>
        </div>
      </section>
    </main>
  );
}
