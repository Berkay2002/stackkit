import { describe, expect, it } from "vitest";

import { doctorResultSchema, migrationOperationSchema, skillsLockSchema } from "./index.js";

describe("migrationOperationSchema", () => {
  it("accepts a write operation", () => {
    expect(
      migrationOperationSchema.parse({
        kind: "write",
        path: "apps/web/app/page.tsx",
        content: "export default function Page() {}"
      })
    ).toEqual({
      kind: "write",
      path: "apps/web/app/page.tsx",
      content: "export default function Page() {}"
    });
  });
});

describe("skillsLockSchema", () => {
  it("accepts schema version, targets, installed, local, and unresolved skill arrays", () => {
    const skill = {
      skills: ["deploy"],
      trust: "official",
      causedBy: "web",
      reason: "Needed for deploy guidance"
    };

    expect(
      skillsLockSchema.parse({
        schemaVersion: 1,
        targets: [
          {
            agent: "codex",
            directory: ".agents",
            enabled: true
          }
        ],
        installed: [skill],
        local: [{ ...skill, trust: "local" }],
        unresolved: [{ ...skill, trust: "unresolved" }]
      })
    ).toEqual({
      schemaVersion: 1,
      targets: [
        {
          agent: "codex",
          directory: ".agents",
          enabled: true
        }
      ],
      installed: [skill],
      local: [{ ...skill, trust: "local" }],
      unresolved: [{ ...skill, trust: "unresolved" }]
    });
  });
});

describe("doctorResultSchema", () => {
  it("accepts ok, error, and warning checks", () => {
    expect(
      doctorResultSchema.parse({
        ok: false,
        checks: [
          {
            id: "typescript",
            status: "ok",
            message: "TypeScript check passed"
          },
          {
            id: "missing-file",
            status: "error",
            message: "Expected app file to exist"
          },
          {
            id: "optional-skill",
            status: "warning",
            message: "Optional skill was not installed"
          }
        ]
      })
    ).toEqual({
        ok: false,
        checks: [
          {
            id: "typescript",
            status: "ok",
            message: "TypeScript check passed"
          },
          {
            id: "missing-file",
            status: "error",
            message: "Expected app file to exist"
          },
          {
            id: "optional-skill",
            status: "warning",
            message: "Optional skill was not installed"
          }
        ]
    });
  });
});
