import type { FileOperation } from "@berkayorhan/stackkit-schemas";

/**
 * Build a single `if-owned` write {@link FileOperation}. The one shared helper for every renderer in
 * this package — previously duplicated byte-for-byte in `index.ts` and `tooling-configs.ts`.
 */
export function writeFile(path: string, owner: FileOperation["owner"], content: string): FileOperation {
  return {
    kind: "write",
    path,
    owner,
    content,
    overwrite: "if-owned"
  };
}
