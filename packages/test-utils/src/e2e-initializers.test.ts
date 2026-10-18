import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { applyCreatePlan, createCreatePlan, runDoctor } from "@berkayorhan/stackkit-core";
import { builtinModules, curatedSkillSourceAllowlist } from "@berkayorhan/stackkit-registry";

import { simulateNativeInitializer } from "./index.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true, maxRetries: 5 })));
}, 120_000);

describe("generated-project initializer e2e", () => {
  it("runs merge-owned initializers and records gated external-state initializers by default", async () => {
    const parent = await mkdtemp(join(tmpdir(), "stackkit-initializers-default-"));
    tempDirectories.push(parent);

    const calls: NativeInitializerCall[] = [];
    const plan = createCreatePlan({
      config: nextShadcnClerkConfig("next-shadcn-clerk-default"),
      availableModules: builtinModules,
      curatedSkillSourceAllowlist,
      allowExternalState: false
    });

    const result = await applyCreatePlan(plan, {
      parentDirectory: parent,
      allowExternalState: false,
      runCommand: async (command, args, options) => {
        calls.push({ command, args: [...args], cwd: options.cwd ?? resultlessProjectDirectory(parent, "next-shadcn-clerk-default") });
        await simulateNativeInitializer(command, args, options.cwd ?? resultlessProjectDirectory(parent, "next-shadcn-clerk-default"));

        return { exitCode: 0, stdout: "ok", stderr: "" };
      }
    });

    expect(calls.some((call) => isShadcnCommand(call))).toBe(true);
    expect(calls.some((call) => isClerkCommand(call))).toBe(false);
    await expect(readFile(join(result.projectDirectory, "packages", "ui", "src", "lib", "utils.ts"), "utf8")).resolves.toContain(
      "export function cn"
    );
    await expect(access(join(result.projectDirectory, "apps", "web", "app", "sign-in", "[[...sign-in]]", "page.tsx"))).rejects.toThrow();
    expect(result.manifest.skippedInitializers).toEqual([
      expect.objectContaining({
        name: "clerk init",
        moduleId: "auth/clerk",
        mutationPolicy: "external-state"
      })
    ]);

    const doctor = await runDoctor(result.projectDirectory);
    expect(doctor.ok).toBe(true);
    expect(doctor.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "initializers.skipped.clerk-init",
          status: "warning",
          actions: []
        })
      ])
    );
  });

  it("runs external-state initializers when explicitly allowed", async () => {
    const parent = await mkdtemp(join(tmpdir(), "stackkit-initializers-allowed-"));
    tempDirectories.push(parent);

    const calls: NativeInitializerCall[] = [];
    const plan = createCreatePlan({
      config: nextShadcnClerkConfig("next-shadcn-clerk-allowed"),
      availableModules: builtinModules,
      curatedSkillSourceAllowlist,
      allowExternalState: true
    });

    const result = await applyCreatePlan(plan, {
      parentDirectory: parent,
      allowExternalState: true,
      runCommand: async (command, args, options) => {
        calls.push({ command, args: [...args], cwd: options.cwd ?? resultlessProjectDirectory(parent, "next-shadcn-clerk-allowed") });
        await simulateNativeInitializer(command, args, options.cwd ?? resultlessProjectDirectory(parent, "next-shadcn-clerk-allowed"));

        return { exitCode: 0, stdout: "ok", stderr: "" };
      }
    });

    expect(calls.some((call) => isShadcnCommand(call))).toBe(true);
    expect(calls.some((call) => isClerkCommand(call))).toBe(true);
    await expect(readFile(join(result.projectDirectory, "packages", "ui", "src", "lib", "utils.ts"), "utf8")).resolves.toContain(
      "export function cn"
    );
    await expect(readFile(join(result.projectDirectory, "apps", "web", "app", "sign-in", "[[...sign-in]]", "page.tsx"), "utf8")).resolves.toContain(
      "Sign in"
    );
    expect(result.manifest.skippedInitializers).toEqual([]);
    expect(result.manifest.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "apps/web/app/sign-in/[[...sign-in]]/page.tsx", owner: "auth/clerk" })
      ])
    );
  });
});

type NativeInitializerCall = {
  command: string;
  args: string[];
  cwd: string;
};

function nextShadcnClerkConfig(projectName: string) {
  return {
    projectName,
    packageManager: "pnpm" as const,
    workspace: "pnpm-turbo" as const,
    modules: ["workspace/pnpm-turbo", "workspace/typescript", "web/nextjs", "ui/shadcn", "auth/clerk"],
    ai: { skillMode: "skip" as const, skillTargets: ["codex" as const] }
  };
}

function resultlessProjectDirectory(parent: string, projectName: string): string {
  return join(parent, projectName);
}

function isShadcnCommand(call: NativeInitializerCall): boolean {
  return call.command === "pnpm" && call.args[0] === "dlx" && call.args[1] === "shadcn@4.16.2";
}

function isClerkCommand(call: NativeInitializerCall): boolean {
  return call.command === "pnpm" && call.args[0] === "dlx" && call.args[1] === "clerk@3.0.0";
}
