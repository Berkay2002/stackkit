import { join } from "node:path";

import { hashContent, normalizeProjectPath, readExistingFile } from "./fs-utils.js";
import { readManifest } from "./manifest.js";
import { buildExpectedManagedFilePlan } from "./create.js";

export type FileDiffPart = {
  kind: "same" | "added" | "removed";
  value: string;
};

export type FileContentDiff = {
  parts: FileDiffPart[];
};

export type ManagedFileDiff = {
  path: string;
  owner: string;
  expectedHash: string;
  currentHash: string | undefined;
  expectedContent: string;
  currentContent: string | undefined;
  diff: FileContentDiff;
};

export function createFileContentDiff(expectedContent: string, currentContent: string): FileContentDiff {
  const expectedLines = splitLines(expectedContent);
  const currentLines = splitLines(currentContent);
  const lcs = buildLineLcs(expectedLines, currentLines);
  const parts: FileDiffPart[] = [];
  let expectedIndex = 0;
  let currentIndex = 0;

  for (const entry of lcs) {
    while (expectedIndex < entry.expectedIndex) {
      appendDiffPart(parts, "removed", expectedLines[expectedIndex] ?? "");
      expectedIndex += 1;
    }
    while (currentIndex < entry.currentIndex) {
      appendDiffPart(parts, "added", currentLines[currentIndex] ?? "");
      currentIndex += 1;
    }

    appendDiffPart(parts, "same", entry.value);
    expectedIndex = entry.expectedIndex + 1;
    currentIndex = entry.currentIndex + 1;
  }

  while (expectedIndex < expectedLines.length) {
    appendDiffPart(parts, "removed", expectedLines[expectedIndex] ?? "");
    expectedIndex += 1;
  }
  while (currentIndex < currentLines.length) {
    appendDiffPart(parts, "added", currentLines[currentIndex] ?? "");
    currentIndex += 1;
  }

  return { parts };
}

export async function diffManagedFile(projectDirectory: string, filePath: string): Promise<ManagedFileDiff> {
  const path = normalizeProjectPath(filePath);
  const manifest = await readManifest(projectDirectory);
  const managedFile = manifest.files.find((file) => normalizeProjectPath(file.path) === path);

  if (!managedFile) {
    throw new Error(`File is not managed by Stackkit: ${path}`);
  }

  const expectedFile = buildExpectedManagedFilePlan(manifest).files.find((file) => file.path === path);

  if (!expectedFile) {
    throw new Error(`Managed file cannot be deterministically re-rendered: ${path}`);
  }

  const currentContent = await readExistingFile(join(projectDirectory, path));

  return {
    path,
    owner: managedFile.owner,
    expectedHash: expectedFile.hash,
    currentHash: currentContent === undefined ? undefined : hashContent(currentContent),
    expectedContent: expectedFile.content,
    currentContent,
    diff: createFileContentDiff(expectedFile.content, currentContent ?? "")
  };
}

function splitLines(content: string): string[] {
  if (content.length === 0) {
    return [];
  }

  return content.match(/[^\n]*\n|[^\n]+/g) ?? [];
}

function buildLineLcs(
  expectedLines: readonly string[],
  currentLines: readonly string[]
): { expectedIndex: number; currentIndex: number; value: string }[] {
  const table = Array.from({ length: expectedLines.length + 1 }, () => Array<number>(currentLines.length + 1).fill(0));

  for (let expectedIndex = expectedLines.length - 1; expectedIndex >= 0; expectedIndex -= 1) {
    for (let currentIndex = currentLines.length - 1; currentIndex >= 0; currentIndex -= 1) {
      table[expectedIndex]![currentIndex] =
        expectedLines[expectedIndex] === currentLines[currentIndex]
          ? (table[expectedIndex + 1]?.[currentIndex + 1] ?? 0) + 1
          : Math.max(table[expectedIndex + 1]?.[currentIndex] ?? 0, table[expectedIndex]?.[currentIndex + 1] ?? 0);
    }
  }

  const entries: { expectedIndex: number; currentIndex: number; value: string }[] = [];
  let expectedIndex = 0;
  let currentIndex = 0;

  while (expectedIndex < expectedLines.length && currentIndex < currentLines.length) {
    if (expectedLines[expectedIndex] === currentLines[currentIndex]) {
      entries.push({ expectedIndex, currentIndex, value: expectedLines[expectedIndex] ?? "" });
      expectedIndex += 1;
      currentIndex += 1;
      continue;
    }

    if ((table[expectedIndex + 1]?.[currentIndex] ?? 0) >= (table[expectedIndex]?.[currentIndex + 1] ?? 0)) {
      expectedIndex += 1;
    } else {
      currentIndex += 1;
    }
  }

  return entries;
}

function appendDiffPart(parts: FileDiffPart[], kind: FileDiffPart["kind"], value: string): void {
  const previous = parts.at(-1);

  if (previous?.kind === kind) {
    previous.value += value;
    return;
  }

  parts.push({ kind, value });
}
