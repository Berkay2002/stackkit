import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  skillsLockSchema,
  stackkitManifestSchema,
  type SkillsLock,
  type StackkitManifest
} from "@berkayorhan/stackkit-schemas";

import { readExistingFile } from "./fs-utils.js";

export function createManifest(input: StackkitManifest): StackkitManifest {
  return stackkitManifestSchema.parse(input);
}

export async function writeManifest(projectDirectory: string, manifest: StackkitManifest): Promise<StackkitManifest> {
  const parsed = createManifest(manifest);
  const stackkitDirectory = join(projectDirectory, ".stackkit");

  await mkdir(stackkitDirectory, { recursive: true });
  await writeFile(join(stackkitDirectory, "project.json"), `${JSON.stringify(parsed, null, 2)}\n`, "utf8");

  return parsed;
}

export async function readManifest(projectDirectory: string): Promise<StackkitManifest> {
  const manifestPath = join(projectDirectory, ".stackkit", "project.json");
  const existing = await readExistingFile(manifestPath);

  if (existing === undefined) {
    throw new Error(`No Stackkit manifest found at ${manifestPath}`);
  }

  return stackkitManifestSchema.parse(JSON.parse(existing));
}

export async function writeSkillsLock(projectDirectory: string, lock: SkillsLock): Promise<SkillsLock> {
  const parsed = skillsLockSchema.parse(lock);

  await writeFile(join(projectDirectory, "skills-lock.json"), `${JSON.stringify(parsed, null, 2)}\n`, "utf8");

  return parsed;
}

export async function readOptionalSkillsLock(projectDirectory: string): Promise<SkillsLock | undefined> {
  const existing = await readExistingFile(join(projectDirectory, "skills-lock.json"));

  if (existing === undefined) {
    return undefined;
  }

  return skillsLockSchema.parse(JSON.parse(existing));
}

export async function readSkillsLock(projectDirectory: string): Promise<SkillsLock> {
  const content = await readFile(join(projectDirectory, "skills-lock.json"), "utf8");

  return skillsLockSchema.parse(JSON.parse(content));
}
