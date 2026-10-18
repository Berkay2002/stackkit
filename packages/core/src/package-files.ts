import { join } from "node:path";

import { type FileOperation, type StackkitModule } from "@berkayorhan/stackkit-schemas";

import { normalizeProjectPath, readExistingFile } from "./fs-utils.js";
import { applyFilePlan, buildFilePlan, type ManifestFileRecord } from "./file-plan.js";

type PackageChangeSource = Pick<StackkitModule, "id" | "packageChanges">;

/**
 * Render package.json writes for module package changes. Each file is owned by its existing owner
 * (`owners`) or else by the first module that changes it; `seeds` holds current package.json contents.
 */
export function renderPackageChangeFiles(
  modules: readonly PackageChangeSource[],
  options: { seeds?: ReadonlyMap<string, Record<string, unknown>>; owners?: ReadonlyMap<string, string> } = {}
): FileOperation[] {
  const packageByPath = new Map<string, { owner: string; pkg: Record<string, unknown> }>();

  for (const module of modules) {
    for (const change of module.packageChanges ?? []) {
      const path = normalizeProjectPath(change.packagePath);
      const current = packageByPath.get(path) ?? {
        owner: options.owners?.get(path) ?? module.id,
        pkg: options.seeds?.get(path) ?? {}
      };

      packageByPath.set(path, { owner: current.owner, pkg: mergePackageJson(current.pkg, change) });
    }
  }

  return [...packageByPath.entries()].map(([path, { owner, pkg }]) => ({
    kind: "write",
    path,
    owner,
    content: `${JSON.stringify(pkg, null, 2)}\n`,
    overwrite: "if-owned"
  }));
}

/** Like {@link renderPackageChangeFiles}, seeded from the package.json files on disk and their manifest owners. */
export async function planPackageChangeFiles(
  projectDirectory: string,
  modules: readonly PackageChangeSource[],
  ownedFiles: readonly ManifestFileRecord[] = []
): Promise<FileOperation[]> {
  const paths = [
    ...new Set(modules.flatMap((module) => (module.packageChanges ?? []).map((change) => normalizeProjectPath(change.packagePath))))
  ];
  const seeds = new Map(
    await Promise.all(paths.map(async (path) => [path, await readPackageJson(join(projectDirectory, path))] as const))
  );
  const owners = new Map(ownedFiles.map((file) => [normalizeProjectPath(file.path), file.owner]));

  return renderPackageChangeFiles(modules, { seeds, owners });
}

export async function applyPackageChanges(
  projectDirectory: string,
  modules: readonly PackageChangeSource[]
): Promise<ManifestFileRecord[]> {
  return await applyFilePlan(projectDirectory, buildFilePlan(await planPackageChangeFiles(projectDirectory, modules)));
}

/** Merge a module's package.json changes into the base file; the base renderer keeps ownership. */
export function mergePackageOperations(left: FileOperation, right: FileOperation): FileOperation {
  return {
    ...left,
    content: `${JSON.stringify(mergePackageJson(parsePackageJson(left.content ?? ""), parsePackageJson(right.content ?? "")), null, 2)}\n`,
    overwrite: right.overwrite
  };
}

export function appendFileContent(left: string, right: string): string {
  if (left.length === 0) {
    return right;
  }

  if (right.length === 0) {
    return left;
  }

  return `${left}${left.endsWith("\n") ? "" : "\n"}${right}`;
}

async function readPackageJson(path: string): Promise<Record<string, unknown>> {
  const existing = await readExistingFile(path);

  return existing ? parsePackageJson(existing) : {};
}

export function parsePackageJson(content: string): Record<string, unknown> {
  if (content.trim().length === 0) {
    return {};
  }

  const parsed: unknown = JSON.parse(content);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }

  return parsed as Record<string, unknown>;
}

const packageJsonFields = ["scripts", "dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;

export function mergePackageJson(
  pkg: Record<string, unknown>,
  change: Record<string, unknown>
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...pkg, ...pickNonPackageFields(change) };

  for (const field of packageJsonFields) {
    const value = mergePackageField(pkg[field], change[field]);

    // Keep a field only when it has entries or the base already declared it (no empty objects added).
    if (Object.keys(value).length > 0 || field in pkg) {
      merged[field] = value;
    } else {
      delete merged[field];
    }
  }

  return merged;
}

function pickNonPackageFields(input: Record<string, unknown>): Record<string, unknown> {
  const { scripts, dependencies, devDependencies, peerDependencies, optionalDependencies, packagePath, ...fields } = input;

  return fields;
}

function mergePackageField(left: unknown, right: unknown): Record<string, string> {
  return {
    ...(isPackageJsonField(left) ? left : {}),
    ...(isPackageJsonField(right) ? right : {})
  };
}

function isPackageJsonField(value: unknown): value is Record<string, string> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).every((fieldValue) => typeof fieldValue === "string")
  );
}
