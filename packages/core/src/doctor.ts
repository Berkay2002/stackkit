import { join } from "node:path";

import {
  stackkitManifestSchema,
  type DoctorCheck,
  type DoctorResult
} from "@berkayorhan/stackkit-schemas";

import { hashContent, readExistingFile } from "./fs-utils.js";

export async function runDoctor(projectDirectory: string): Promise<DoctorResult> {
  const checks: DoctorCheck[] = [];
  const manifestPath = join(projectDirectory, ".stackkit", "project.json");
  const manifestContent = await readExistingFile(manifestPath);

  if (!manifestContent) {
    return {
      ok: false,
      checks: [
        createDoctorCheck({
          id: "manifest.exists",
          status: "error",
          message: ".stackkit/project.json is missing"
        })
      ]
    };
  }

  const manifest = stackkitManifestSchema.parse(JSON.parse(manifestContent));
  checks.push(createDoctorCheck({ id: "manifest.exists", status: "ok", message: ".stackkit/project.json exists" }));

  for (const file of manifest.files) {
    const content = await readExistingFile(join(projectDirectory, file.path));

    if (content === undefined) {
      checks.push(createDoctorCheck({
        id: `files.${file.path}`,
        status: "error",
        message: `Managed file is missing: ${file.path}`,
        actions: [`stackkit diff --file ${file.path}`]
      }));
      continue;
    }

    if (hashContent(content) !== file.hash) {
      checks.push(createDoctorCheck({
        id: `files.${file.path}`,
        status: "warning",
        message: `Managed file was modified: ${file.path}`,
        actions: [`stackkit diff --file ${file.path}`]
      }));
      continue;
    }

    checks.push(createDoctorCheck({
      id: `files.${file.path}`,
      status: "ok",
      message: `Managed file is unchanged: ${file.path}`
    }));
  }

  if (manifest.aiSkills.unresolved.length > 0) {
    checks.push(createDoctorCheck({
      id: "skills.unresolved",
      status: "warning",
      message: `${manifest.aiSkills.unresolved.length} AI skill dependency could not be resolved`,
      actions: ["stackkit skills sync --apply"]
    }));
  }

  for (const initializer of manifest.skippedInitializers) {
    checks.push(createDoctorCheck({
      id: `initializers.skipped.${slugifyCheckId(initializer.name)}`,
      status: "warning",
      message: `Native initializer was skipped: ${initializer.name} (${initializer.mutationPolicy})`,
      actions: ["stackkit create --allow-external-state"]
    }));
  }

  return {
    ok: checks.every((check) => check.status !== "error"),
    checks
  };
}

function createDoctorCheck(check: Omit<DoctorCheck, "actions"> & { actions?: string[] }): DoctorCheck {
  return {
    ...check,
    actions: check.actions ?? []
  };
}

function slugifyCheckId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
