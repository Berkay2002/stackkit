import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("./", import.meta.url);
const { compilerOptions } = JSON.parse(readFileSync(new URL("tsconfig.base.json", root), "utf8")) as {
  compilerOptions: { paths: Record<string, string[]> };
};

// Workspace package -> src entry, derived from tsconfig.base.json paths so there is one alias map.
// Longest names first: Vite matches aliases by prefix, so "stackkit-core/customizer" must win over "stackkit-core".
export const workspaceAlias = Object.fromEntries(
  Object.entries(compilerOptions.paths)
    .sort(([left], [right]) => right.length - left.length)
    .map(([name, [target]]) => [name, fileURLToPath(new URL(target!, root))])
);
