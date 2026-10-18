import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

// Every `stackkit create` example in the docs is dry-run through the built CLI, so documented
// commands cannot drift from what the CLI accepts.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const cliEntry = fileURLToPath(import.meta.resolve('@berkayorhan/stackkit'));
const cliVersion = (
  JSON.parse(readFileSync(join(repoRoot, 'packages', 'cli', 'package.json'), 'utf8')) as { version: string }
).version;
const workDir = mkdtempSync(join(tmpdir(), 'stackkit-docs-commands-'));

afterAll(() => rmSync(workDir, { recursive: true, force: true }));

const docFiles = [
  'README.md',
  'packages/cli/README.md',
  ...listFiles('docs', '.md'),
  ...listFiles('apps/docs/content/docs', '.mdx'),
];

function listFiles(dir: string, extension: string): string[] {
  return readdirSync(join(repoRoot, dir))
    .filter((name) => name.endsWith(extension))
    .map((name) => `${dir}/${name}`);
}

function runCli(args: string[]) {
  return spawnSync(process.execPath, [cliEntry, ...args], { cwd: workDir, encoding: 'utf8' });
}

/** Pulls `stackkit create` invocations out of fenced shell code blocks, joining `\` continuations. */
function extractCreateCommands(source: string): string[] {
  const commands: string[] = [];
  let fence: string | undefined;

  for (const line of source.replace(/\\\n\s*/g, ' ').split('\n')) {
    const fenceMatch = /^```(\S*)/.exec(line);
    if (fenceMatch) {
      fence = fence === undefined ? fenceMatch[1] : undefined;
      continue;
    }
    if (fence === undefined || !['', 'bash', 'sh', 'shell'].includes(fence)) {
      continue;
    }

    const match = /(?:^|\s)(?:npx (?:--yes )?@berkayorhan\/stackkit(?:@\S+)? |stackkit )(create\b.*)$/.exec(line.trim());
    if (match) {
      commands.push(match[1].trim().replace(/\s+/g, ' '));
    }
  }

  return commands;
}

function isRunnable(command: string): boolean {
  // Placeholders (`<name>`, `sk_...`), resume flows and config files that do not exist are not runnable.
  return !/[<>]|sk_\.\.\.|--resume|--config/.test(command);
}

const documented = docFiles.flatMap((file) =>
  extractCreateCommands(readFileSync(join(repoRoot, file), 'utf8').replaceAll('\r\n', '\n'))
    .filter(isRunnable)
    .map((command) => ({ file, command }))
);
const uniqueCommands = [...new Map(documented.map((entry) => [entry.command, entry])).values()];

describe('documented stackkit create commands', () => {
  it('finds the documented examples', () => {
    expect(uniqueCommands.length).toBeGreaterThan(20);
  });

  for (const { file, command } of uniqueCommands) {
    it(`${file}: stackkit ${command}`, () => {
      const args = command.split(/\s+/);
      const result = runCli(args.includes('--dry-run') ? args : [...args, '--dry-run']);

      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
    });
  }

  it('pins the current CLI version wherever docs use npx with a version', () => {
    for (const file of [...docFiles, 'apps/docs/app/(home)/page.tsx']) {
      for (const match of readFileSync(join(repoRoot, file), 'utf8').matchAll(/@berkayorhan\/stackkit@(\d+\.\d+\.\d+)/g)) {
        expect(match[1], `${file} pins ${match[0]}`).toBe(cliVersion);
      }
    }
  });
});

describe('examples', () => {
  const examples = readdirSync(join(repoRoot, 'examples'));
  // Only the golden-path example may be created without opting in to preview modules.
  const supported = new Set(['next-fastapi-postgres-auth0']);

  for (const example of examples) {
    it(`creates examples/${example} in a dry run`, () => {
      const config = join(repoRoot, 'examples', example, 'stackkit.config.json');
      const args = ['create', '--config', config, '--dry-run', ...(supported.has(example) ? [] : ['--include-preview'])];
      const result = runCli(args);

      expect(result.stderr, relative(repoRoot, config)).toBe('');
      expect(result.status).toBe(0);
    });
  }
});
