import { createHash } from "node:crypto";
import { lstat, readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, posix, relative, sep } from "node:path";

export function hashContent(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

export async function readExistingFile(path: string): Promise<string | undefined> {
  try {
    const fileStat = await stat(path);

    if (!fileStat.isFile()) {
      return "";
    }

    return await readFile(path, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
}

export function normalizeProjectPath(path: string): string {
  if (isAbsolute(path) || /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("/") || path.startsWith("\\")) {
    throw new Error(`File path must be project-relative: ${path}`);
  }

  const normalized = posix.normalize(path.replaceAll("\\", "/"));

  if (normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`File path escapes project directory: ${path}`);
  }

  if (normalized === ".") {
    throw new Error(`File path must not resolve to the project directory: ${path}`);
  }

  return normalized;
}

/**
 * Resolve a project-relative path for writing or deleting, refusing paths that leave the project
 * through a symlink or junction: the deepest existing ancestor must realpath inside the project
 * root, and the target itself must not be a symlink. The project directory must exist.
 */
// ponytail: check-then-write, not race-free against a concurrent attacker swapping links mid-write.
export async function resolveContainedProjectPath(projectDirectory: string, path: string): Promise<string> {
  const normalized = normalizeProjectPath(path);
  const target = join(projectDirectory, normalized);
  const root = await realpath(projectDirectory);
  let existing = target;

  for (;;) {
    const stats = await lstat(existing).catch((error: unknown) => {
      if (isNodeError(error) && error.code === "ENOENT") {
        return undefined;
      }

      throw error;
    });

    if (stats) {
      if (existing === target && stats.isSymbolicLink()) {
        throw new Error(`Refusing to write through a symlink: ${normalized}`);
      }

      break;
    }

    existing = dirname(existing);
  }

  const fromRoot = relative(root, await realpath(existing));

  if (fromRoot === ".." || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new Error(`File path escapes project directory through a symlink: ${normalized}`);
  }

  return target;
}

/** Resolve a project-relative working directory ("." or empty means the project root). */
export function resolveProjectCwd(projectDirectory: string, cwd: string | undefined): string {
  return !cwd || cwd === "." ? projectDirectory : joinProjectDirectory(projectDirectory, normalizeProjectPath(cwd));
}

export function normalizeTargetDirectoryName(name: string): string {
  if (
    isAbsolute(name) ||
    /^[a-zA-Z]:[\\/]/.test(name) ||
    name.startsWith("/") ||
    name.startsWith("\\") ||
    name.includes("/") ||
    name.includes("\\")
  ) {
    throw new Error(`Create target directory must be a single relative directory name: ${name}`);
  }

  const normalized = posix.normalize(name);

  if (normalized === "." || normalized === ".." || normalized.startsWith("../") || normalized !== name) {
    throw new Error(`Create target directory must be a single relative directory name: ${name}`);
  }

  return name;
}

export function joinProjectDirectory(projectDirectory: string, path: string): string {
  if (projectDirectory.includes("/")) {
    return posix.join(projectDirectory.replaceAll("\\", "/"), path.replaceAll("\\", "/"));
  }

  return join(projectDirectory, path);
}
