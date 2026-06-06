import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

/** GitHub repository backing the docs (owner/repo), used for source links. */
export const GITHUB_REPO = 'Berkay2002/stackkit';

/** Default branch used when linking to source files on GitHub. */
export const GITHUB_BRANCH = 'master';

/** Simple geometric "stacked layers" mark — one flat glyph, no icon library. */
function StackkitMark() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="text-brand"
    >
      <path
        d="M12 3 21 7.5 12 12 3 7.5 12 3Z"
        fill="currentColor"
        fillOpacity="0.9"
      />
      <path
        d="M3 12 12 16.5 21 12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.55"
      />
      <path
        d="M3 16.5 12 21 21 16.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.3"
      />
    </svg>
  );
}

/** Shared layout options for both the docs and home layouts. */
export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="inline-flex items-center gap-2 font-semibold">
          <StackkitMark />
          Stackkit
        </span>
      ),
    },
    githubUrl: `https://github.com/${GITHUB_REPO}`,
  };
}
