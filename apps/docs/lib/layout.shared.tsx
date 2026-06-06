import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

/** GitHub repository backing the docs (owner/repo), used for source links. */
export const GITHUB_REPO = 'Berkay2002/stackkit';

/** Default branch used when linking to source files on GitHub. */
export const GITHUB_BRANCH = 'master';

/** Shared layout options for both the docs and home layouts. */
export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: 'Stackkit',
    },
    githubUrl: `https://github.com/${GITHUB_REPO}`,
  };
}
