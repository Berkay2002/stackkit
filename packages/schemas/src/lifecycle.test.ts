import { describe, expect, it } from "vitest";

import { doctorResultSchema, migrationOperationSchema, skillsLockSchema, stackkitManifestSchema } from "./index.js";

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
  it("accepts mode, link mode, planned, and skill state arrays", () => {
    const skill = {
      skills: ["deploy"],
      trust: "official",
      causedBy: "web",
      reason: "Needed for deploy guidance"
    };

    expect(
      skillsLockSchema.parse({
        schemaVersion: 1,
        mode: "plan",
        linkMode: "symlink",
        targets: [
          {
            agent: "codex",
            directory: ".agents",
            enabled: true
          }
        ],
        installed: [skill],
        planned: [skill],
        local: [{ ...skill, trust: "local" }],
        unresolved: [{ ...skill, trust: "unresolved" }]
      })
    ).toEqual({
      schemaVersion: 1,
      mode: "plan",
      linkMode: "symlink",
      targets: [
        {
          agent: "codex",
          directory: ".agents",
          enabled: true
        }
      ],
      installed: [skill],
      planned: [skill],
      local: [{ ...skill, trust: "local" }],
      unresolved: [{ ...skill, trust: "unresolved" }]
    });
  });
});

describe("stackkitManifestSchema", () => {
  it("records local AI skill state", () => {
    const skill = {
      skills: ["stackkit-local-guidance"],
      trust: "local",
      causedBy: "custom/local-skill",
      reason: "No external skill is configured"
    };

    expect(
      stackkitManifestSchema.parse({
        schemaVersion: 1,
        stackkitVersion: "0.1.0",
        projectName: "acme",
        createdAt: "2026-06-02T00:00:00.000Z",
        modules: [],
        files: [],
        aiSkills: {
          targets: [{ agent: "codex", directory: ".agents", enabled: true }],
          installed: [],
          planned: [],
          local: [skill],
          unresolved: []
        },
        migrations: {
          applied: []
        }
      }).aiSkills.local
    ).toEqual([skill]);
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
            message: "Optional skill was not installed",
            actions: ["stackkit skills sync --apply"]
          }
        ]
      })
    ).toEqual({
        ok: false,
        checks: [
          {
            id: "typescript",
            status: "ok",
            message: "TypeScript check passed",
            actions: []
          },
          {
            id: "missing-file",
            status: "error",
            message: "Expected app file to exist",
            actions: []
          },
          {
            id: "optional-skill",
            status: "warning",
            message: "Optional skill was not installed",
            actions: ["stackkit skills sync --apply"]
          }
        ]
    });
  });
});
