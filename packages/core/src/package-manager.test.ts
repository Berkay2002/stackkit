import { describe, expect, it } from "vitest";

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

  it("routes Windows commands through cmd.exe without shell mode", () => {
    expect(resolveSpawnCommand("pnpm", ["test", "--", "unit"], { platform: "win32", comspec: "cmd.exe" })).toEqual({
      command: "cmd.exe",
      args: ["/d", "/s", "/c", '"pnpm ^"test^" ^"--^" ^"unit^""'],
      windowsVerbatimArguments: true
    });
  });

  it("escapes Windows shell metacharacters in arguments", () => {
    const invocation = resolveSpawnCommand("node", ['quote"here', "x&y", "path with spaces"], {
      platform: "win32",
      comspec: "cmd.exe"
    });

    expect(invocation).toEqual({
      command: "cmd.exe",
      args: ["/d", "/s", "/c", '"node ^"quote\\^"here^" ^"x^&y^" ^"path^ with^ spaces^""'],
      windowsVerbatimArguments: true
    });
  });
});
