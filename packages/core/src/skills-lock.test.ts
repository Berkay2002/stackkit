import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { writeLocalAiGuidance, writeSkillsLock } from "./index.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("writeSkillsLock", () => {
  it("writes skills-lock.json and returns the parsed lock", async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), "stackkit-skills-lock-"));
    tempDirectories.push(projectDirectory);

    const lock = await writeSkillsLock(projectDirectory, {
      schemaVersion: 1,
      targets: [{ agent: "codex", directory: ".agents", enabled: true }],
      installed: [
        {
          source: "https://github.com/vercel-labs/agent-skills",
          skills: ["vercel-react-best-practices"],
          trust: "official",
          causedBy: "web/nextjs",
          reason: "React and Next.js app code"
        }
      ],
      local: [],
      unresolved: []
    });

    expect(lock.installed).toEqual([
      expect.objectContaining({
        source: "https://github.com/vercel-labs/agent-skills",
        skills: ["vercel-react-best-practices"]
      })
    ]);

    const written = JSON.parse(await readFile(join(projectDirectory, "skills-lock.json"), "utf8"));
    expect(written).toEqual(lock);
  });
});

describe("writeLocalAiGuidance", () => {
  it("writes local SKILL.md files under enabled target directories", async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), "stackkit-local-guidance-"));
    tempDirectories.push(projectDirectory);

    await writeLocalAiGuidance(projectDirectory, {
      targets: [
        { agent: "codex", directory: ".agents", enabled: true },
        { agent: "claude-code", directory: ".claude", enabled: false }
      ],
      local: [
        {
          skills: ["stackkit-kubernetes-guidance"],
          trust: "local",
          causedBy: "deploy/kubernetes",
          reason: "No accepted official or curated Kubernetes skill source is configured"
        }
      ]
    });

    const skill = await readFile(
      join(projectDirectory, ".agents", "skills", "stackkit-kubernetes-guidance", "SKILL.md"),
      "utf8"
    );
    expect(skill).toContain("deploy/kubernetes");
    expect(skill).toContain("No accepted official or curated Kubernetes skill source is configured");

    await expect(
      readFile(join(projectDirectory, ".claude", "skills", "stackkit-kubernetes-guidance", "SKILL.md"), "utf8")
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
