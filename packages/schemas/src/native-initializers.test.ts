import { describe, expect, it } from "vitest";

import { stackkitModuleSchema } from "./index.js";

describe("native initializers", () => {
  it("parses module-level native initializer declarations", () => {
    const module = stackkitModuleSchema.parse({
      id: "ui/shadcn",
      version: "1.0.0",
      title: "ShadCN",
      description: "ShadCN UI components",
      nativeInitializers: [
        {
          name: "shadcn init",
          phase: "integration",
          tool: {
            execution: "package-manager-dlx",
            package: "shadcn@latest"
          },
          args: [
            "init",
            "-d",
            "--base",
            "radix",
            "--monorepo",
            "-t",
            { token: "web-framework", values: { nextjs: "next", vite: "vite", "tanstack-start": "start" } },
            "--cwd",
            "."
          ],
          cwd: ".",
          when: {
            anyModules: ["web/nextjs", "web/vite", "web/tanstack-start"]
          },
          mutationPolicy: "merge-owned",
          expectedFiles: ["apps/web/components.json", "packages/ui/components.json"]
        }
      ]
    });

    expect(module.nativeInitializers?.[0]).toMatchObject({
      name: "shadcn init",
      phase: "integration",
      tool: {
        execution: "package-manager-dlx",
        package: "shadcn@latest"
      },
      mutationPolicy: "merge-owned"
    });
  });

  it("rejects invalid native initializer mutation policies", () => {
    expect(() =>
      stackkitModuleSchema.parse({
        id: "bad/native",
        version: "1.0.0",
        title: "Bad",
        description: "Bad native initializer",
        nativeInitializers: [
          {
            name: "bad",
            phase: "integration",
            tool: { execution: "package-manager-dlx", package: "bad@latest" },
            args: [],
            cwd: ".",
            mutationPolicy: "unsafe"
          }
        ]
      })
    ).toThrow();
  });
});
