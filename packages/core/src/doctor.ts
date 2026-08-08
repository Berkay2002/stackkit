import { join } from "node:path";

import {
  stackkitManifestSchema,
  type DoctorCheck,
  type DoctorResult
} from "@berkayorhan/stackkit-schemas";

import { hashContent, readExistingFile } from "./fs-utils.js";
import type { RunCommand } from "./package-manager.js";

export type RunDoctorOptions = {
  runCommand?: RunCommand;
};

export async function runDoctor(projectDirectory: string, options: RunDoctorOptions = {}): Promise<DoctorResult> {
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

  for (const module of manifest.modules) {
    for (const validation of module.snapshot?.validate ?? []) {
      if (validation.kind === "command-succeeds") {
        if (!options.runCommand) {
          checks.push(createDoctorCheck({
            id: `modules.${module.id}.command-${slugifyCheckId([validation.command, ...validation.args].join("-"))}`,
            status: "warning",
            message: `Runtime validation was not run for ${module.id}: ${[validation.command, ...validation.args].join(" ")}`,
            actions: ["Run stackkit doctor from the Stackkit CLI"]
          }));
          continue;
        }

        const result = await options.runCommand(validation.command, validation.args, { cwd: projectDirectory });
        checks.push(createDoctorCheck({
          id: `modules.${module.id}.command-${slugifyCheckId([validation.command, ...validation.args].join("-"))}`,
          status: result.exitCode === 0 ? "ok" : "error",
          message: result.exitCode === 0
            ? `Runtime validation passed for ${module.id}: ${[validation.command, ...validation.args].join(" ")}`
            : `Runtime validation failed for ${module.id}: ${[validation.command, ...validation.args].join(" ")}`,
          actions: result.exitCode === 0 ? [] : [`Re-run: ${[validation.command, ...validation.args].join(" ")}`]
        }));
        continue;
      }

      const content = await readExistingFile(join(projectDirectory, validation.path));
      checks.push(
        createDoctorCheck({
          id: `modules.${module.id}.${slugifyCheckId(validation.path)}`,
          status: content === undefined ? "error" : "ok",
          message:
            content === undefined
              ? `Module validation failed for ${module.id}: missing ${validation.path}`
              : `Module validation passed for ${module.id}: ${validation.path}`,
          actions: content === undefined ? [`stackkit diff --file ${validation.path}`] : []
        })
      );
    }
  }

  for (const initializer of manifest.skippedInitializers) {
    checks.push(createDoctorCheck({
      id: `initializers.skipped.${slugifyCheckId(initializer.name)}`,
      status: "warning",
      message: `Native initializer was skipped: ${initializer.name} (${initializer.mutationPolicy})`
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
