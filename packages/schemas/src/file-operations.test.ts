import { describe, expect, it } from "vitest";

import { fileOperationSchema, packageChangeSchema, stackkitModuleSchema } from "./index.js";

describe("fileOperationSchema", () => {
  it("accepts a write operation", () => {
    expect(
      fileOperationSchema.parse({
        kind: "write",
        path: "apps/web/app/page.tsx",
        owner: "next",
        content: "export default function Page() {}",
        overwrite: "always"
      })
    ).toEqual({
      kind: "write",
      path: "apps/web/app/page.tsx",
      owner: "next",
      content: "export default function Page() {}",
      overwrite: "always"
    });
  });

  it("accepts a numeric file mode", () => {
    expect(
      fileOperationSchema.parse({
        kind: "write",
        path: "apps/web/app/page.tsx",
        owner: "next",
        content: "export default function Page() {}",
        mode: 0o644
      })
    ).toEqual({
      kind: "write",
      path: "apps/web/app/page.tsx",
      owner: "next",
      content: "export default function Page() {}",
      mode: 0o644,
      overwrite: "if-owned"
    });
  });
});

describe("packageChangeSchema", () => {
  it("accepts package scripts and dependencies", () => {
    expect(
      packageChangeSchema.parse({
        packagePath: "apps/web/package.json",
        scripts: {
          dev: "next dev"
        },
        dependencies: {
          next: "^16.0.0"
        },
        devDependencies: {
          typescript: "^5.9.0"
        }
      })
    ).toEqual({
      packagePath: "apps/web/package.json",
      scripts: {
        dev: "next dev"
      },
      dependencies: {
        next: "^16.0.0"
      },
      devDependencies: {
        typescript: "^5.9.0"
      },
      peerDependencies: {},
      optionalDependencies: {}
    });
  });
});

describe("stackkitModuleSchema", () => {
  it("accepts concrete operation, package, env var, task, hook, and validation shapes", () => {
    expect(
      stackkitModuleSchema.parse({
        id: "web",
        version: "1.0.0",
        title: "Web app",
        description: "A Next.js web app",
        files: [
          {
            kind: "write",
            path: "apps/web/app/page.tsx",
            owner: "web",
            content: "export default function Page() {}"
          }
        ],
        packageChanges: [
          {
            packagePath: "apps/web/package.json",
            scripts: {
              dev: "next dev"
            },
            dependencies: {
              next: "^16.0.0"
            }
          }
        ],
        envVars: [
          {
            name: "DATABASE_URL",
            description: "Postgres connection string",
            example: "postgres://user:pass@localhost:5432/app"
          }
        ],
        tasks: [
          {
            name: "install",
            command: "pnpm",
            args: ["install"],
            cwd: "apps/web"
          }
        ],
        postCreate: [
          {
            name: "generate",
            command: "pnpm",
            args: ["db:generate"]
          }
        ],
        validate: [
          {
            kind: "file-exists",
            path: "apps/web/app/page.tsx"
          },
          {
            kind: "command-succeeds",
            command: "pnpm",
            args: ["typecheck"]
          }
        ]
      }).files
    ).toEqual([
      {
        kind: "write",
        path: "apps/web/app/page.tsx",
        owner: "web",
        content: "export default function Page() {}",
        overwrite: "if-owned"
      }
    ]);
  });
});
