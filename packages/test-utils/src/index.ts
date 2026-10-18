import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { RunCommand } from "@berkayorhan/stackkit-core";

/**
 * A RunCommand stub for create/doctor flows: every command succeeds, and the pinned native
 * initializers (shadcn, clerk) write the files they would produce, without touching the network.
 */
export function simulatedRunCommand(projectDirectory: string): RunCommand {
  return async (command, args, options) => {
    await simulateNativeInitializer(command, args, options.cwd ?? projectDirectory);

    return { exitCode: 0, stdout: "ok", stderr: "" };
  };
}

export async function simulateNativeInitializer(command: string, args: readonly string[], cwd: string): Promise<void> {
  if (command !== "pnpm" || args[0] !== "dlx") {
    return;
  }

  if (args[1] === "shadcn@4.16.2") {
    await simulateShadcnInit(cwd);
    return;
  }

  if (args[1] === "clerk@3.0.0") {
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
