import type { FileOperation } from "@berkayorhan/stackkit-schemas";

/**
 * Which TypeScript lint/format tooling a project uses. Derived from selected module ids by the
 * renderer dispatch (`quality/biome` selected → `"biome"`, otherwise the default eslint + prettier
 * pair). Kept here so both the templates and the core dispatch share a single descriptor.
 */
export type TsToolingChoice = "eslint-prettier" | "biome";

/** Which Python type checker a project uses. Default `mypy`; `quality/pyright` selects `"pyright"`. */
export type PyTypecheckChoice = "mypy" | "pyright";

function writeFile(path: string, owner: FileOperation["owner"], content: string): FileOperation {
  return {
    kind: "write",
    path,
    owner,
    content,
    overwrite: "if-owned"
  };
}

const ESLINT_CONFIG =
  'import js from "@eslint/js";\nimport tseslint from "typescript-eslint";\n\nexport default tseslint.config(js.configs.recommended, ...tseslint.configs.recommended);\n';

const PRETTIER_CONFIG = "export default {};\n";

/** `eslint.config.mjs` owned by `quality/eslint`. */
export function renderEslintConfig(): FileOperation[] {
  return [writeFile("eslint.config.mjs", "quality/eslint", ESLINT_CONFIG)];
}

/** `prettier.config.mjs` owned by `quality/prettier`. */
export function renderPrettierConfig(): FileOperation[] {
  return [writeFile("prettier.config.mjs", "quality/prettier", PRETTIER_CONFIG)];
}

/** `biome.json` owned by `quality/biome` — combined linter + formatter, both enabled. */
export function renderBiomeConfig(): FileOperation[] {
  const content = `${JSON.stringify(
    {
      $schema: "https://biomejs.dev/schemas/2.0.0/schema.json",
      vcs: { enabled: false, clientKind: "git", useIgnoreFile: true },
      files: { ignoreUnknown: false },
      formatter: { enabled: true, indentStyle: "space", indentWidth: 2 },
      linter: { enabled: true, rules: { recommended: true } }
    },
    null,
    2
  )}\n`;

  return [writeFile("biome.json", "quality/biome", content)];
}

/**
 * `ruff.toml` owned by `quality/ruff` — Ruff's default rule set (`E` pycodestyle errors + `F`
 * pyflakes). Import-sorting (`I`) is intentionally left out of the generated default so a freshly
 * scaffolded service passes `ruff check` without an immediate fix pass.
 */
export function renderRuffConfig(): FileOperation[] {
  const content = ["line-length = 100", "", "[lint]", 'select = ["E", "F"]', ""].join("\n");

  return [writeFile("ruff.toml", "quality/ruff", content)];
}

/**
 * `mypy.ini` owned by `quality/mypy` — strict type checking. `mypy_path`/`explicit_package_bases`
 * let `mypy .` (run from the service root) resolve the local `app` package from `tests/` without a
 * separate src layout, matching how pytest discovers it via `pythonpath = ["."]`.
 */
export function renderMypyConfig(): FileOperation[] {
  const content = ["[mypy]", "strict = true", "mypy_path = .", "explicit_package_bases = true", ""].join("\n");

  return [writeFile("mypy.ini", "quality/mypy", content)];
}

/** `pyrightconfig.json` owned by `quality/pyright`. */
export function renderPyrightConfig(): FileOperation[] {
  const content = `${JSON.stringify({ typeCheckingMode: "standard" }, null, 2)}\n`;

  return [writeFile("pyrightconfig.json", "quality/pyright", content)];
}
