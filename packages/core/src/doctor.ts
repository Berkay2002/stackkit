import { join } from "node:path";

import {
  stackkitManifestSchema,
  type DoctorCheck,
  type DoctorResult,
  type StackkitModule
} from "@berkayorhan/stackkit-schemas";

import { hashContent, normalizeProjectPath, readExistingFile } from "./fs-utils.js";
import { readOptionalSkillsLock } from "./manifest.js";
import type { RunCommand } from "./package-manager.js";

export type RunDoctorOptions = {
  runCommand?: RunCommand;
  /**
   * Trusted module definitions (the installed registry). `command-succeeds` validations run only
   * from these, matched by module id; commands recorded in the project manifest are never run.
   */
  modules?: readonly StackkitModule[];
  /** Omit command-succeeds validations entirely (e.g. right after create, before dependencies are installed). */
  skipRuntimeValidations?: boolean;
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
    const content = await readProjectFile(projectDirectory, file.path);

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

  // skills-lock.json is what `skills sync`/`skills update` maintain, so it wins over the manifest copy (same as info).
  const unresolvedSkills = ((await readOptionalSkillsLock(projectDirectory)) ?? manifest.aiSkills).unresolved;

  if (unresolvedSkills.length > 0) {
    checks.push(createDoctorCheck({
      id: "skills.unresolved",
      status: "warning",
      message: `${unresolvedSkills.length} AI skill dependency could not be resolved`,
      actions: ["stackkit skills sync --apply"]
    }));
  }

  const trustedModules = new Map(
    (options.skipRuntimeValidations ? [] : options.modules ?? []).map((module) => [module.id, module])
  );

  for (const module of manifest.modules) {
    const trusted = trustedModules.get(module.id);

    for (const validation of trusted?.validate ?? []) {
      if (validation.kind !== "command-succeeds") {
        continue;
      }

      const commandLine = [validation.command, ...validation.args].join(" ");
      const id = `modules.${module.id}.command-${slugifyCheckId([validation.command, ...validation.args].join("-"))}`;

      if (!options.runCommand) {
        checks.push(createDoctorCheck({
          id,
          status: "warning",
          message: `Runtime validation was not run for ${module.id}: ${commandLine}`,
          actions: ["Run stackkit doctor from the Stackkit CLI"]
        }));
        continue;
      }

      const result = await options.runCommand(validation.command, validation.args, { cwd: projectDirectory });
      checks.push(createDoctorCheck({
        id,
        status: result.exitCode === 0 ? "ok" : "error",
        message: result.exitCode === 0
          ? `Runtime validation passed for ${module.id}: ${commandLine}`
          : `Runtime validation failed for ${module.id}: ${commandLine}`,
        actions: result.exitCode === 0 ? [] : [`Re-run: ${commandLine}`]
      }));
    }

    for (const validation of module.snapshot?.validate ?? []) {
      if (validation.kind === "command-succeeds") {
        if (!trusted) {
          checks.push(createDoctorCheck({
            id: `modules.${module.id}.command-${slugifyCheckId([validation.command, ...validation.args].join("-"))}`,
            status: "warning",
            message: `Runtime validation was not run for ${module.id}: ${module.id} is not in the installed Stackkit registry, and commands recorded in .stackkit/project.json are never executed`
          }));
        }
        continue;
      }

      const content = await readProjectFile(projectDirectory, validation.path);
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

/** Read a manifest-recorded path; paths that escape the project read as missing. */
async function readProjectFile(projectDirectory: string, path: string): Promise<string | undefined> {
  let normalized: string;

  try {
    normalized = normalizeProjectPath(path);
  } catch {
    return undefined;
  }

  return await readExistingFile(join(projectDirectory, normalized));
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
