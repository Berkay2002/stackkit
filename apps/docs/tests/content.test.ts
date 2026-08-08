import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const docsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'content', 'docs');
const expectedPages = [
  'index',
  'getting-started',
  'cli-reference',
  'configuration',
  'glossary',
  'architecture',
  'modules',
  'managed-updates',
  'skills',
  'customizer',
  'api',
  'status',
  'contributing',
];

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

  it('documents the same supported golden path and preview opt-in as the CLI', () => {
    const gettingStarted = readFileSync(join(docsDir, 'getting-started.mdx'), 'utf8');
    const modules = readFileSync(join(docsDir, 'modules.mdx'), 'utf8');
    const status = readFileSync(join(docsDir, 'status.mdx'), 'utf8');

    expect(gettingStarted).toContain(
      'npx @berkayorhan/stackkit@0.3.0 create my-app --preset next-fastapi-postgres-auth0 --db-provider postgres-local'
    );
    expect(gettingStarted).toContain('--include-preview');
    expect(modules).toContain('supported | Safe default');
    expect(modules).toContain('preview | Explicit opt-in');
    expect(modules).toContain('planned | Documentation only');
    expect(status).toContain('one supported preset');
  });
});
