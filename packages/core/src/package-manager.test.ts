import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { getPackageManagerAdapter, resolveSpawnCommand } from "./index.js";

describe("package manager adapters", () => {
  it("returns pnpm metadata and commands", () => {
    const adapter = getPackageManagerAdapter("pnpm");

    expect(adapter).toEqual(
      expect.objectContaining({
        name: "pnpm",
        lockfile: "pnpm-lock.yaml",
        workspaceFile: "pnpm-workspace.yaml",
        packageManagerField: "pnpm@10.5.1"
      })
    );
    expect(adapter.installCommand).toEqual(["pnpm", "install"]);
    expect(adapter.runCommand("build")).toEqual(["pnpm", "build"]);
    expect(adapter.addCommand(["next", "react"])).toEqual(["pnpm", "add", "next", "react"]);
    expect(adapter.dlxCommand("skills", ["--help"])).toEqual(["pnpm", "dlx", "skills", "--help"]);
  });

  it("returns npm metadata and commands", () => {
    const adapter = getPackageManagerAdapter("npm");

    expect(adapter.lockfile).toBe("package-lock.json");
    expect(adapter.workspaceFile).toBeUndefined();
    expect(adapter.packageManagerField).toMatch(/^npm@/);
    expect(adapter.installCommand).toEqual(["npm", "install"]);
    expect(adapter.runCommand("build")).toEqual(["npm", "run", "build"]);
    expect(adapter.addCommand(["next", "react"])).toEqual(["npm", "install", "next", "react"]);
    expect(adapter.dlxCommand("skills", ["--help"])).toEqual(["npx", "-y", "skills", "--help"]);
  });

  it("returns yarn metadata and commands", () => {
    const adapter = getPackageManagerAdapter("yarn");

    expect(adapter.lockfile).toBe("yarn.lock");
    expect(adapter.workspaceFile).toBeUndefined();
    expect(adapter.packageManagerField).toMatch(/^yarn@/);
    expect(adapter.installCommand).toEqual(["yarn", "install"]);
    expect(adapter.runCommand("build")).toEqual(["yarn", "build"]);
    expect(adapter.addCommand(["next", "react"])).toEqual(["yarn", "add", "next", "react"]);
    expect(adapter.dlxCommand("skills", ["--help"])).toEqual(["yarn", "dlx", "skills", "--help"]);
  });

  it("returns bun metadata and commands", () => {
    const adapter = getPackageManagerAdapter("bun");

    expect(adapter.lockfile).toBe("bun.lock");
    expect(adapter.workspaceFile).toBeUndefined();
    expect(adapter.packageManagerField).toMatch(/^bun@/);
    expect(adapter.installCommand).toEqual(["bun", "install"]);
    expect(adapter.runCommand("build")).toEqual(["bun", "run", "build"]);
    expect(adapter.addCommand(["next", "react"])).toEqual(["bun", "add", "next", "react"]);
    expect(adapter.dlxCommand("skills", ["--help"])).toEqual(["bunx", "skills", "--help"]);
  });
});

describe("resolveSpawnCommand", () => {
  it("keeps non-Windows commands as executable plus args", () => {
    expect(resolveSpawnCommand("pnpm", ["test", "--", "unit"], { platform: "linux" })).toEqual({
      command: "pnpm",
      args: ["test", "--", "unit"]
    });
  });

  const tempDirectories: string[] = [];
  afterEach(async () => {
    await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  });

  async function pathWith(file: string): Promise<{ directory: string; env: NodeJS.ProcessEnv }> {
    const directory = await mkdtemp(join(tmpdir(), "stackkit-spawn-"));
    tempDirectories.push(directory);
    await writeFile(join(directory, file), "", "utf8");
    return { directory, env: { PATH: directory, PATHEXT: ".EXE;.CMD" } };
  }

  it("routes Windows executables through cmd.exe with a single escaping pass", async () => {
    const { env } = await pathWith("node.exe");

    expect(resolveSpawnCommand("node", ["test", "--", "unit"], { platform: "win32", comspec: "cmd.exe", env })).toEqual({
      command: "cmd.exe",
      args: ["/d", "/s", "/c", '"node ^"test^" ^"--^" ^"unit^""'],
      windowsVerbatimArguments: true
    });
    expect(resolveSpawnCommand("node", ['quote"here', "x&y", "path with spaces"], { platform: "win32", comspec: "cmd.exe", env })).toEqual({
      command: "cmd.exe",
      args: ["/d", "/s", "/c", '"node ^"quote\\^"here^" ^"x^&y^" ^"path^ with^ spaces^""'],
      windowsVerbatimArguments: true
    });
  });

  it("double-escapes arguments for .cmd shims such as npx.cmd", async () => {
    const { env } = await pathWith("npx.cmd");

    expect(resolveSpawnCommand("npx", ["x&y"], { platform: "win32", comspec: "cmd.exe", env }).args).toEqual([
      "/d", "/s", "/c", '"npx ^^^"x^^^&y^^^""'
    ]);
  });

  it.runIf(process.platform === "win32")("passes shell metacharacters through a real .cmd shim verbatim", async () => {
    const { directory } = await pathWith("echoargs.js");
    await writeFile(
      join(directory, "echoargs.js"),
      "require('fs').writeFileSync(require('path').join(__dirname, 'argv.json'), JSON.stringify(process.argv.slice(2)));\n",
      "utf8"
    );
    await writeFile(join(directory, "echoargs.cmd"), '@node "%~dp0echoargs.js" %*\r\n', "utf8");
    const payload = ['ok" & echo PWNED> pwned.txt & "', "a|b", "100%", "x^y", "plain"];
    const invocation = resolveSpawnCommand(join(directory, "echoargs"), payload, { cwd: directory });

    spawnSync(invocation.command, invocation.args, {
      cwd: directory,
      windowsVerbatimArguments: invocation.windowsVerbatimArguments,
      windowsHide: true
    });

    expect(existsSync(join(directory, "pwned.txt"))).toBe(false);
    expect(JSON.parse(await readFile(join(directory, "argv.json"), "utf8"))).toEqual(payload);
  });
});
