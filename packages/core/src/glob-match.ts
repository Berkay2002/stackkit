import { normalizeProjectPath } from "./fs-utils.js";

const REGEX_SPECIAL = /[\\^$+?.()|[\]{}]/g;

export function matchGlob(path: string, pattern: string): boolean {
  const normalizedPath = normalizeProjectPath(path);
  const normalizedPattern = normalizeProjectPath(pattern);
  const regex = new RegExp(`^${globToRegexSource(normalizedPattern)}$`);

  return regex.test(normalizedPath);
}

export function expandExpectedFiles(patterns: readonly string[], projectFiles: Iterable<string>): string[] {
  const normalizedFiles = Array.from(projectFiles, normalizeProjectPath);
  const expanded: string[] = [];

  for (const pattern of patterns.map(normalizeProjectPath)) {
    if (!hasGlobSyntax(pattern)) {
      if (normalizedFiles.includes(pattern)) {
        expanded.push(pattern);
      }
      continue;
    }

    for (const file of normalizedFiles) {
      if (matchGlob(file, pattern)) {
        expanded.push(file);
      }
    }
  }

  return [...new Set(expanded)];
}

function hasGlobSyntax(pattern: string): boolean {
  return pattern.includes("*") || pattern.includes("?");
}

function globToRegexSource(pattern: string): string {
  let source = "";

  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];

    if (char === "*" && next === "*") {
      const following = pattern[index + 2];
      if (following === "/") {
        source += "(?:.*/)?";
        index += 2;
      } else {
        source += ".*";
        index += 1;
      }
      continue;
    }

    if (char === "*") {
      source += "[^/]*";
      continue;
    }

    if (char === "?") {
      source += "[^/]";
      continue;
    }

    source += char.replace(REGEX_SPECIAL, "\\$&");
  }

  return source;
}
