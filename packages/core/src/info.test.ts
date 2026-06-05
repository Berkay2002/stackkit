import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { collectInfo, writeManifest, writeSkillsLock } from "./index.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("collectInfo", () => {
  it("returns project inventory from manifest, config, and skills lock", async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), "stackkit-info-"));
    tempDirectories.push(projectDirectory);

    await writeFile(
      join(projectDirectory, "stackkit.config.json"),
      JSON.stringify(
        {
          projectName: "acme",
          packageManager: "pnpm",
          preset: "next",
          modules: ["workspace/pnpm-turbo"],
          ai: { skillTargets: ["codex"] }
        },
        null,
        2
      ),
      "utf8"
    );
    await writeManifest(projectDirectory, {
      schemaVersion: 1,
      stackkitVersion: "0.1.0",
      projectName: "acme",
      packageManager: "pnpm",
      source: { kind: "config", path: "stackkit.config.json" },
      paths: { root: ".", web: "apps/web" },
      createdAt: "2026-06-05T00:00:00.000Z",
      modules: [{ id: "workspace/pnpm-turbo", version: "1.0.0", options: {} }],
      files: [],
      aiSkills: {
        mode: "install",
        linkMode: "copy",
        targets: [{ agent: "codex", directory: ".agents", enabled: true }],
        installed: [],
        planned: [],
        local: [],
        unresolved: []
      },
      migrations: { applied: [] }
    });
    await writeSkillsLock(projectDirectory, {
      schemaVersion: 1,
      mode: "install",
      linkMode: "copy",
      targets: [{ agent: "claude-code", directory: ".claude", enabled: true }],
      installed: [
        {
          source: "https://github.com/vercel-labs/agent-skills",
          skills: ["vercel-react-best-practices"],
          trust: "official",
          causedBy: "web/nextjs",
          reason: "React and Next.js app code"
        }
      ],
      planned: [],
      local: [
        {
          skills: ["stackkit-local-guidance"],
          trust: "local",
          causedBy: "ai/skills",
          reason: "Local guidance"
        }
      ],
      unresolved: [
        {
          source: "https://example.com/missing-skills",
          skills: ["missing"],
          trust: "unresolved",
          causedBy: "web/nextjs",
          reason: "Skill install failed: missing"
        }
      ]
    });

    await expect(collectInfo(projectDirectory)).resolves.toEqual({
      project: { name: "acme", packageManager: "pnpm", stackkitVersion: "0.1.0" },
      source: { kind: "config", path: "stackkit.config.json", preset: "next" },
      modules: [{ id: "workspace/pnpm-turbo", version: "1.0.0" }],
      paths: { root: ".", web: "apps/web" },
      ai: { targets: ["claude-code"], installed: 1, local: 1, unresolved: 1 }
    });
  });
});
