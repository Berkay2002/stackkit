import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createStackkitProgram } from "@berkayorhan/stackkit";
import type { RunCommand } from "@berkayorhan/stackkit-core";

import { simulatedRunCommand } from "./index.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
}, 120_000);

// The supported 0.3.0 golden path, driven through the CLI command surface with every
// external command (native initializers, installs, runtime checks) stubbed, so it runs offline.
describe("golden preset through the CLI", () => {
  it("creates next-fastapi-postgres-auth0, passes doctor, and has no pending migrations", async () => {
    const parent = await mkdtemp(join(tmpdir(), "stackkit-golden-"));
    tempDirectories.push(parent);
    const projectDirectory = join(parent, "golden-app");
    const commands: string[] = [];
    const simulate = simulatedRunCommand(projectDirectory);
    const cli = (argv: string[]) =>
      runCli(argv, async (command, args, options) => {
        commands.push([command, ...args].join(" "));
        return simulate(command, args, options);
      });

    const created = await cli([
      "create",
      "golden-app",
      "--preset",
      "next-fastapi-postgres-auth0",
      "--skills",
      "skip",
      "--yes",
      "--dir",
      projectDirectory
    ]);
    expect(created).toContain("Created Stackkit project");
    expect(commands).toContainEqual(expect.stringMatching(/^pnpm dlx shadcn@4\.16\.2 init/));

    const manifest = JSON.parse(await readFile(join(projectDirectory, ".stackkit", "project.json"), "utf8")) as {
      modules: { id: string }[];
    };
    expect(manifest.modules.map((module) => module.id)).toEqual(
      expect.arrayContaining(["web/nextjs", "ui/shadcn", "api/fastapi", "db/postgres", "auth/auth0-nextjs", "auth/auth0-fastapi"])
    );

    expect(await cli(["doctor", "--dir", projectDirectory])).toMatch(/^Stackkit doctor passed\n/);

    const migrate = await cli(["migrate", "--dry-run", "--dir", projectDirectory]);
    const migrationPlan = JSON.parse(migrate.split("STACKKIT_MIGRATE_JSON_START\n")[1]!.split("\nSTACKKIT_MIGRATE_JSON_END")[0]!);
    // TODO(audit #13/#23/#42): web/nextjs ships a placeholder automatic migration; tighten to `automatic: []` once removed.
    expect(migrationPlan).toEqual(expect.objectContaining({ reviewRequired: [], manual: [] }));
  }, 120_000);
});

async function runCli(argv: string[], runCommand: RunCommand): Promise<string> {
  let output = "";
  const program = createStackkitProgram({ runCommand });
  program.configureOutput({
    writeOut: (value) => {
      output += value;
    },
    writeErr: (value) => {
      output += value;
    }
  });

  await program.parseAsync(argv, { from: "user" });

  return output;
}
