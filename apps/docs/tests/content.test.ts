import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const docsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'content', 'docs');
const expectedPages = ['index', 'getting-started', 'cli-reference', 'configuration'];

describe('docs content', () => {
  it('ships an MDX file for every page declared in meta.json', () => {
    const meta = JSON.parse(readFileSync(join(docsDir, 'meta.json'), 'utf8')) as {
      pages: string[];
    };
    expect(meta.pages).toEqual(expectedPages);
    for (const slug of meta.pages) {
      expect(existsSync(join(docsDir, `${slug}.mdx`)), `${slug}.mdx should exist`).toBe(true);
    }
  });

  it('gives every page frontmatter with a title and description', () => {
    for (const slug of expectedPages) {
      const src = readFileSync(join(docsDir, `${slug}.mdx`), 'utf8');
      expect(src.startsWith('---'), `${slug}.mdx should start with frontmatter`).toBe(true);
      expect(/\ntitle:\s*\S/.test(src), `${slug}.mdx should declare a title`).toBe(true);
      expect(/\ndescription:\s*\S/.test(src), `${slug}.mdx should declare a description`).toBe(true);
    }
  });
});
