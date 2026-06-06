import { defineConfig, defineDocs } from 'fumadocs-mdx/config';

export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    // Required for the LLM features (llms-full.txt, per-page .md):
    // exposes the processed Markdown via page.data.getText('processed').
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
});

export default defineConfig();
