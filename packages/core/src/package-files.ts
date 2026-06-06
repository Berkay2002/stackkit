import { join } from "node:path";

import { type FileOperation, type PackageChange } from "@berkayorhan/stackkit-schemas";

import { normalizeProjectPath, readExistingFile } from "./fs-utils.js";
import { applyFilePlan, buildFilePlan, type ManifestFileRecord } from "./file-plan.js";

export async function planPackageChangeFiles(
  projectDirectory: string,
  changes: readonly PackageChange[]
): Promise<FileOperation[]> {
  const packageByPath = new Map<string, Record<string, unknown>>();

  for (const change of changes) {
    const packagePath = normalizeProjectPath(change.packagePath);
    const existingPackage = packageByPath.get(packagePath) ?? (await readPackageJson(join(projectDirectory, packagePath)));
    const nextPackage = mergePackageJson(existingPackage, change);

    packageByPath.set(packagePath, nextPackage);
  }

  return [...packageByPath.entries()].map(([path, pkg]) => ({
    kind: "write",
    path,
    owner: "workspace/pnpm-turbo",
    content: `${JSON.stringify(pkg, null, 2)}\n`,
    overwrite: "if-owned"
  }));
}

export async function applyPackageChanges(
  projectDirectory: string,
  changes: readonly PackageChange[]
): Promise<ManifestFileRecord[]> {
  return await applyFilePlan(projectDirectory, buildFilePlan(await planPackageChangeFiles(projectDirectory, changes)));
}

export function mergePackageOperations(left: FileOperation, right: FileOperation): FileOperation {
  return {
    ...left,
    owner: right.owner,
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

export function mergePackageJson(
  pkg: Record<string, unknown>,
  change: PackageChange | Record<string, unknown>
): Record<string, unknown> {
  return {
    ...pkg,
    ...pickNonPackageFields(change),
    scripts: mergePackageField(pkg.scripts, change.scripts),
    dependencies: mergePackageField(pkg.dependencies, change.dependencies),
    devDependencies: mergePackageField(pkg.devDependencies, change.devDependencies),
    peerDependencies: mergePackageField(pkg.peerDependencies, change.peerDependencies),
    optionalDependencies: mergePackageField(pkg.optionalDependencies, change.optionalDependencies)
  };
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
