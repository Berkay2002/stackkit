import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="flex flex-col items-center px-4 py-20 text-fd-foreground">
      <section className="w-full max-w-3xl flex flex-col items-center text-center gap-6">
        {/* Eyebrow */}
        <span className="inline-block rounded-full border border-fd-border bg-fd-muted px-3 py-1 text-xs font-medium text-fd-muted-foreground tracking-wide uppercase">
          Alpha
        </span>

        {/* Headline */}
        <h1 className="text-4xl font-bold tracking-tight text-fd-foreground sm:text-5xl">
          Generate and maintain multi-language monorepos
        </h1>

        {/* Subheading */}
        <p className="max-w-xl text-lg text-fd-muted-foreground leading-relaxed">
          Stackkit is a TypeScript CLI that scaffolds and evolves full-stack
          monorepos across multiple languages — from a single declarative
          configuration.
        </p>

        {/* CTAs */}
        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          <Link
            href="/docs"
            className="rounded-lg bg-fd-primary px-6 py-2.5 text-sm font-semibold text-fd-primary-foreground transition-opacity hover:opacity-90"
          >
            Read the docs
          </Link>
          <Link
            href="/docs/getting-started"
            className="rounded-lg border border-fd-border bg-fd-background px-6 py-2.5 text-sm font-semibold text-fd-foreground transition-colors hover:bg-fd-muted"
          >
            Get started
          </Link>
        </div>
      </section>

      {/* Feature blurbs */}
      <section className="mt-20 w-full max-w-3xl">
        <h2 className="sr-only">Features</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="border border-fd-border rounded-lg p-4 bg-fd-background">
            <p className="text-sm font-semibold text-fd-card-foreground">
              Deterministic output
            </p>
            <p className="mt-1 text-sm text-fd-muted-foreground">
              Same config always produces the same scaffold — no surprises
              across machines or CI.
            </p>
          </div>
          <div className="border border-fd-border rounded-lg p-4 bg-fd-background">
            <p className="text-sm font-semibold text-fd-card-foreground">
              Managed lifecycle
            </p>
            <p className="mt-1 text-sm text-fd-muted-foreground">
              Evolve generated projects over time with upgrade commands and
              structured migrations.
            </p>
          </div>
          <div className="border border-fd-border rounded-lg p-4 bg-fd-background">
            <p className="text-sm font-semibold text-fd-card-foreground">
              Offline recipes
            </p>
            <p className="mt-1 text-sm text-fd-muted-foreground">
              Built-in templates for TypeScript, Go, Python, and more — no
              network required.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
