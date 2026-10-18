import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { hashContent, normalizeProjectPath, readExistingFile, resolveContainedProjectPath } from "./fs-utils.js";

export type FileOverwritePolicy = "never" | "if-owned" | "always";

export type PlannedFile = {
  path: string;
  owner: string;
  content: string;
  hash: string;
  overwrite: FileOverwritePolicy;
};

export type FilePlan = {
  files: PlannedFile[];
};

export type FileConflict = {
  path: string;
  reason: "exists-unowned" | "modified-owned";
};

export type ManifestFileRecord = {
  path: string;
  owner: string;
  hash: string;
};

export type ApplyFilePlanOptions = {
  ownedFiles?: readonly ManifestFileRecord[];
  conflictLabel?: string;
};

type FilePlanOperation = {
  kind: string;
  path?: string;
  owner?: string;
  content?: string;
  overwrite?: string;
};

export function buildFilePlan(operations: readonly FilePlanOperation[]): FilePlan {
  return {
    files: operations
      .filter((operation) => operation.kind === "write")
      .map((operation) => {
        if (!operation.path) {
          throw new Error("Write operation is missing a file path");
        }

        if (!operation.owner) {
          throw new Error(`Write operation is missing an owner for ${operation.path}`);
        }

        const content = operation.content ?? "";

        return {
          path: normalizeProjectPath(operation.path),
          owner: operation.owner,
          content,
          hash: hashContent(content),
          overwrite: normalizeOverwritePolicy(operation.overwrite)
        };
      })
  };
}

export async function detectFileConflicts(
  projectDirectory: string,
  plan: FilePlan,
  ownedFiles: readonly ManifestFileRecord[]
): Promise<FileConflict[]> {
  const ownedFileByPath = new Map(ownedFiles.map((file) => [normalizeProjectPath(file.path), file]));
  const conflicts: FileConflict[] = [];

  for (const rawFile of plan.files) {
    const file = normalizePlannedFile(rawFile);

    if (file.overwrite === "always") {
      continue;
    }

    const existingContent = await readExistingFile(join(projectDirectory, file.path));

    if (existingContent === undefined) {
      continue;
    }

    const ownedFile = ownedFileByPath.get(file.path);

    if (!ownedFile) {
      conflicts.push({ path: file.path, reason: "exists-unowned" });
      continue;
    }

    if (ownedFile.hash !== hashContent(existingContent)) {
      conflicts.push({ path: file.path, reason: "modified-owned" });
    }
  }

  return conflicts;
}

export async function applyFilePlan(
  projectDirectory: string,
  plan: FilePlan,
  options: ApplyFilePlanOptions = {}
): Promise<ManifestFileRecord[]> {
  const conflicts = await detectFileConflicts(projectDirectory, plan, options.ownedFiles ?? []);

  if (conflicts.length > 0) {
    throw new Error(
      `${options.conflictLabel ?? "File plan"} has conflicts: ${conflicts
        .map((conflict) => `${conflict.path} (${conflict.reason})`)
        .join(", ")}`
    );
  }

  return await applyFilePlanUnchecked(projectDirectory, plan);
}

export async function applyFilePlanUnchecked(projectDirectory: string, plan: FilePlan): Promise<ManifestFileRecord[]> {
  const records: ManifestFileRecord[] = [];

  await mkdir(projectDirectory, { recursive: true });

  for (const rawFile of plan.files) {
    const file = normalizePlannedFile(rawFile);
    const targetPath = await resolveContainedProjectPath(projectDirectory, file.path);

    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, file.content, "utf8");
    records.push({ path: file.path, owner: file.owner, hash: file.hash });
  }

  return records;
}

/** Merge file records by normalized path; later records replace earlier ones. */
export function mergeManifestFiles<T extends { path: string }>(existingFiles: readonly T[], newFiles: readonly T[]): T[] {
  const fileByPath = new Map<string, T>();

  for (const file of [...existingFiles, ...newFiles]) {
    const path = normalizeProjectPath(file.path);
    fileByPath.set(path, { ...file, path });
  }

  return [...fileByPath.values()];
}

function normalizeOverwritePolicy(overwrite: string | undefined): FileOverwritePolicy {
  if (overwrite === "never" || overwrite === "always") {
    return overwrite;
  }

  return "if-owned";
}

function normalizePlannedFile(file: PlannedFile): PlannedFile {
  return {
    ...file,
    path: normalizeProjectPath(file.path)
  };
}
