import { createMDX } from 'fumadocs-mdx/next';

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        // Index page: `/docs.md` has no path segment, so it needs its own rule.
        source: '/docs.md',
        destination: '/llms.mdx/docs',
      },
      {
        // Serve raw Markdown for any nested docs page by appending `.md`.
        source: '/docs/:path*.md',
        destination: '/llms.mdx/docs/:path*',
      },
    ];
  },
};

const withMDX = createMDX();

export default withMDX(config);
