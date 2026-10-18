import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { renderPnpmTurboFoundation } from "./index.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

// Writes an executable stub named `name` (a .cmd shim on Windows, like npx.cmd) that records its
// arguments and exits 3, so the exit code proves the generated script really started it.
async function writeStub(directory: string, name: string): Promise<string> {
  await writeFile(
    join(directory, "record.js"),
    "require('fs').writeFileSync(require('path').join(__dirname, 'args.json'), JSON.stringify(process.argv.slice(2)));\nprocess.exit(3);\n",
    "utf8"
  );

  if (process.platform === "win32") {
    await writeFile(join(directory, `${name}.cmd`), '@node "%~dp0record.js" %*\r\n', "utf8");
  } else {
    await writeFile(join(directory, name), '#!/bin/sh\nexec node "$(dirname "$0")/record.js" "$@"\n', "utf8");
    await chmod(join(directory, name), 0o755);
  }

  return join(directory, name);
}

async function runDoctorScript(env: NodeJS.ProcessEnv): Promise<{ status: number | null; stderr: string }> {
  const directory = await mkdtemp(join(tmpdir(), "stackkit-doctor-script-"));
  tempDirectories.push(directory);
  const script = renderPnpmTurboFoundation({ projectName: "acme-app" }).find((file) => file.path === ".stackkit/doctor.cjs");
  await writeFile(join(directory, "doctor.cjs"), script?.content ?? "", "utf8");
  // The script runs the Stackkit version recorded in the sibling manifest.
  await writeFile(join(directory, "project.json"), JSON.stringify({ stackkitVersion: "0.3.0" }), "utf8");
  const result = spawnSync(process.execPath, [join(directory, "doctor.cjs")], { env, encoding: "utf8" });

  return { status: result.status, stderr: result.stderr };
}

describe(".stackkit/doctor.cjs", () => {
  it("starts STACKKIT_DOCTOR_BIN and passes its exit code through", async () => {
    const stubDirectory = await mkdtemp(join(tmpdir(), "stackkit-doctor-bin-"));
    tempDirectories.push(stubDirectory);
    const stub = await writeStub(stubDirectory, "stackkit");

    const result = await runDoctorScript({ ...process.env, STACKKIT_DOCTOR_BIN: stub });

    expect(result.status).toBe(3);
    expect(JSON.parse(await readFile(join(stubDirectory, "args.json"), "utf8"))).toEqual(["doctor"]);
  });

  it("starts npx from PATH, including the npx.cmd shim on Windows", async () => {
    const stubDirectory = await mkdtemp(join(tmpdir(), "stackkit-doctor-npx-"));
    tempDirectories.push(stubDirectory);
    await writeStub(stubDirectory, "npx");
    const pathKey = Object.keys(process.env).find((key) => key.toUpperCase() === "PATH") ?? "PATH";
    const env: NodeJS.ProcessEnv = { ...process.env, [pathKey]: `${stubDirectory}${delimiter}${process.env[pathKey] ?? ""}` };
    delete env.STACKKIT_DOCTOR_BIN;

    const result = await runDoctorScript(env);

    expect(result.status).toBe(3);
    expect(JSON.parse(await readFile(join(stubDirectory, "args.json"), "utf8"))).toEqual([
      "--yes",
      "@berkayorhan/stackkit@0.3.0",
      "doctor"
    ]);
  });
});
