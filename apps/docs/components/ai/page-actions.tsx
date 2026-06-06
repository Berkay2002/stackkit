'use client';

import { useState } from 'react';
import { CopyIcon, CheckIcon, FileTextIcon, ExternalLinkIcon } from 'lucide-react';

export function PageActions({
  markdownUrl,
  githubUrl,
}: {
  markdownUrl: string;
  githubUrl: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      const res = await fetch(markdownUrl);
      if (!res.ok) throw new Error(`Failed to fetch markdown: ${res.status}`);
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // silently fail — clipboard may be unavailable in some contexts
    }
  }

  const linkClass =
    'inline-flex items-center gap-1.5 rounded-lg border border-fd-border px-2.5 py-1 text-sm text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground active:translate-y-px';

  return (
    <div className="flex flex-row flex-wrap gap-2 not-prose my-4">
      <button
        type="button"
        aria-label={copied ? 'Copied to clipboard' : 'Copy page content for LLM'}
        onClick={handleCopy}
        className={linkClass}
      >
        {copied ? (
          <CheckIcon className="size-4 text-brand" />
        ) : (
          <CopyIcon className="size-4" />
        )}
        {copied ? 'Copied' : 'Copy for LLM'}
      </button>

      <a
        href={markdownUrl}
        target="_blank"
        rel="noreferrer"
        aria-label="View this page as Markdown"
        className={linkClass}
      >
        <FileTextIcon className="size-4" />
        View as Markdown
      </a>

      <a
        href={githubUrl}
        target="_blank"
        rel="noreferrer"
        aria-label="Open this page on GitHub"
        className={linkClass}
      >
        <ExternalLinkIcon className="size-4" />
        Open on GitHub
      </a>
    </div>
  );
}
