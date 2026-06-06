import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, join, posix } from "node:path";

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
