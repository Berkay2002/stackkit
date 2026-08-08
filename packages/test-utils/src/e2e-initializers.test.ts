import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { applyCreatePlan, createCreatePlan, runDoctor } from "@berkayorhan/stackkit-core";
import { builtinModules, curatedSkillSourceAllowlist } from "@berkayorhan/stackkit-registry";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
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
          actions: expect.arrayContaining([expect.stringContaining("--allow-external-state")])
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
  return call.command === "pnpm" && call.args[0] === "dlx" && call.args[1] === "shadcn@latest";
}

function isClerkCommand(call: NativeInitializerCall): boolean {
  return call.command === "pnpm" && call.args[0] === "dlx" && call.args[1] === "clerk@latest";
}

async function simulateNativeInitializer(command: string, args: readonly string[], cwd: string): Promise<void> {
  if (command !== "pnpm" || args[0] !== "dlx") {
    return;
  }

  if (args[1] === "shadcn@latest") {
    await simulateShadcnInit(cwd);
    return;
  }

  if (args[1] === "clerk@latest") {
    await simulateClerkInit(cwd);
  }
}

async function simulateShadcnInit(projectDirectory: string): Promise<void> {
  const libDirectory = join(projectDirectory, "packages", "ui", "src", "lib");
  const packagePath = join(projectDirectory, "packages", "ui", "package.json");
  const pkg = JSON.parse(await readFile(packagePath, "utf8"));

  await mkdir(libDirectory, { recursive: true });
  await writeFile(
    join(libDirectory, "utils.ts"),
    "export function cn(...inputs: string[]) {\n  return inputs.filter(Boolean).join(\" \");\n}\n",
    "utf8"
  );
  await writeFile(
    packagePath,
    `${JSON.stringify(
      {
        ...pkg,
        dependencies: {
          ...(pkg.dependencies ?? {}),
          tailwindcss: "^4"
        }
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

async function simulateClerkInit(webDirectory: string): Promise<void> {
  await mkdir(join(webDirectory, "app", "sign-in", "[[...sign-in]]"), { recursive: true });
  await mkdir(join(webDirectory, "app", "sign-up", "[[...sign-up]]"), { recursive: true });
  await writeFile(join(webDirectory, "proxy.ts"), "export const config = { matcher: [] };\n", "utf8");
  await writeFile(
    join(webDirectory, "app", "sign-in", "[[...sign-in]]", "page.tsx"),
    'export default function SignInPage() {\n  return <div>Sign in</div>;\n}\n',
    "utf8"
  );
  await writeFile(
    join(webDirectory, "app", "sign-up", "[[...sign-up]]", "page.tsx"),
    'export default function SignUpPage() {\n  return <div>Sign up</div>;\n}\n',
    "utf8"
  );
}
