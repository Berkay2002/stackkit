import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { applyCreatePlan, createCreatePlan, defineModule } from "./index.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("applyCreatePlan", () => {
  it("writes planned files and the Stackkit manifest", async () => {
    const parentDirectory = await mkdtemp(join(tmpdir(), "stackkit-create-apply-"));
    tempDirectories.push(parentDirectory);

    const plan = createCreatePlan({
      config: {
        projectName: "acme-dashboard",
        packageManager: "pnpm",
        workspace: "pnpm-turbo",
        modules: ["workspace/pnpm-turbo"],
        ai: {
          skillTargets: ["codex"]
        }
      },
      availableModules: [
        defineModule({
          id: "workspace/pnpm-turbo",
          version: "1.0.0",
          title: "pnpm and Turborepo",
          description: "pnpm workspace with Turborepo task orchestration",
          provides: ["workspace/node"]
        })
      ]
    });

    const result = await applyCreatePlan(plan, {
      parentDirectory,
      stackkitVersion: "0.1.0",
      now: () => new Date("2026-06-02T00:00:00.000Z")
    });

    expect(result.projectDirectory).toBe(join(parentDirectory, "acme-dashboard"));
    await expect(readFile(join(result.projectDirectory, "package.json"), "utf8")).resolves.toContain(
      "\"name\": \"acme-dashboard\""
    );

    const manifest = JSON.parse(await readFile(join(result.projectDirectory, ".stackkit", "project.json"), "utf8"));
    expect(manifest).toEqual(
      expect.objectContaining({
        schemaVersion: 1,
        stackkitVersion: "0.1.0",
        projectName: "acme-dashboard",
        createdAt: "2026-06-02T00:00:00.000Z",
        modules: [{ id: "workspace/pnpm-turbo", version: "1.0.0", options: {} }]
      })
    );
    expect(manifest.files).toEqual(expect.arrayContaining([expect.objectContaining({ path: "package.json" })]));
    expect(result.manifest).toEqual(manifest);
  });

  it("writes to an explicit target directory", async () => {
    const parentDirectory = await mkdtemp(join(tmpdir(), "stackkit-create-apply-"));
    tempDirectories.push(parentDirectory);
    const targetDirectory = join(parentDirectory, "custom-target");

    const plan = createCreatePlan({
      config: {
        projectName: "acme-dashboard",
        packageManager: "pnpm",
        workspace: "pnpm-turbo",
        modules: ["workspace/pnpm-turbo"],
        ai: {
          skillTargets: ["codex"]
        }
      },
      availableModules: [
        defineModule({
          id: "workspace/pnpm-turbo",
          version: "1.0.0",
          title: "pnpm and Turborepo",
          description: "pnpm workspace with Turborepo task orchestration"
        })
      ]
    });

    const result = await applyCreatePlan(plan, { parentDirectory, targetDirectory });

    expect(result.projectDirectory).toBe(targetDirectory);
    await expect(readFile(join(targetDirectory, "package.json"), "utf8")).resolves.toContain(
      "\"name\": \"acme-dashboard\""
    );
  });

  it("rejects existing unowned files with conflict reasons", async () => {
    const parentDirectory = await mkdtemp(join(tmpdir(), "stackkit-create-apply-"));
    tempDirectories.push(parentDirectory);
    const targetDirectory = join(parentDirectory, "acme-dashboard");

    await mkdir(targetDirectory, { recursive: true });
    await writeFile(join(targetDirectory, "package.json"), "{\"name\":\"existing\"}\n", "utf8");

    const plan = createCreatePlan({
      config: {
        projectName: "acme-dashboard",
        packageManager: "pnpm",
        workspace: "pnpm-turbo",
        modules: ["workspace/pnpm-turbo"],
        ai: {
          skillTargets: ["codex"]
        }
      },
      availableModules: [
        defineModule({
          id: "workspace/pnpm-turbo",
          version: "1.0.0",
          title: "pnpm and Turborepo",
          description: "pnpm workspace with Turborepo task orchestration"
        })
      ]
    });

    await expect(applyCreatePlan(plan, { parentDirectory })).rejects.toThrow(
      "Create target has conflicts: package.json (exists-unowned)"
    );
  });

  it("rejects unsafe generated target directory names", async () => {
    const parentDirectory = await mkdtemp(join(tmpdir(), "stackkit-create-apply-"));
    tempDirectories.push(parentDirectory);

    expect(() =>
      createCreatePlan({
        config: {
          projectName: "../outside",
          packageManager: "pnpm",
          workspace: "pnpm-turbo",
          modules: ["workspace/pnpm-turbo"],
          ai: {
            skillTargets: ["codex"]
          }
        },
        availableModules: [
          defineModule({
            id: "workspace/pnpm-turbo",
            version: "1.0.0",
            title: "pnpm and Turborepo",
            description: "pnpm workspace with Turborepo task orchestration"
          })
        ]
      })
    ).toThrow("Create target directory must be a single relative directory name: ../outside");
  });

  it("records only official and curated AI skills as installed", async () => {
    const parentDirectory = await mkdtemp(join(tmpdir(), "stackkit-create-apply-"));
    tempDirectories.push(parentDirectory);

    const plan = createCreatePlan({
      config: {
        projectName: "skills-app",
        packageManager: "pnpm",
        workspace: "pnpm-turbo",
        modules: ["workspace/pnpm-turbo", "custom/local-skill"],
        ai: {
          skillTargets: ["codex"]
        }
      },
      availableModules: [
        defineModule({
          id: "workspace/pnpm-turbo",
          version: "1.0.0",
          title: "pnpm and Turborepo",
          description: "pnpm workspace with Turborepo task orchestration",
          provides: ["workspace/node"]
        }),
        defineModule({
          id: "custom/local-skill",
          version: "1.0.0",
          title: "Local skill",
          description: "Local fallback guidance",
          aiSkills: [
            {
              skills: ["custom-local-guidance"],
              trust: "local",
              causedBy: "custom/local-skill",
              reason: "No external skill is configured"
            }
          ]
        })
      ]
    });

    const result = await applyCreatePlan(plan, { parentDirectory });

    expect(result.manifest.aiSkills.installed).toEqual([]);
  });

  it("writes skills lock and local guidance when skill installation is disabled", async () => {
    const parentDirectory = await mkdtemp(join(tmpdir(), "stackkit-create-apply-"));
    tempDirectories.push(parentDirectory);

    const plan = createCreatePlan({
      config: {
        projectName: "skills-app",
        packageManager: "pnpm",
        workspace: "pnpm-turbo",
        modules: ["custom/local-skill"],
        ai: {
          skillTargets: ["codex"]
        }
      },
      availableModules: [
        defineModule({
          id: "custom/local-skill",
          version: "1.0.0",
          title: "Local skill",
          description: "Local fallback guidance",
          aiSkills: [
            {
              skills: ["stackkit-kubernetes-guidance"],
              trust: "local",
              causedBy: "deploy/kubernetes",
              reason: "No accepted official or curated Kubernetes skill source is configured"
            }
          ]
        })
      ]
    });

    const result = await applyCreatePlan(plan, { parentDirectory, installSkills: false });

    const lock = JSON.parse(await readFile(join(result.projectDirectory, "skills-lock.json"), "utf8"));
    expect(lock.local).toEqual([
      expect.objectContaining({
        skills: ["stackkit-kubernetes-guidance"],
        trust: "local",
        causedBy: "deploy/kubernetes"
      })
    ]);
    expect(lock.installed).toEqual([]);

    const guidance = await readFile(
      join(result.projectDirectory, ".agents", "skills", "stackkit-kubernetes-guidance", "SKILL.md"),
      "utf8"
    );
    expect(guidance).toContain("deploy/kubernetes");
    expect(guidance).toContain("No accepted official or curated Kubernetes skill source is configured");
  });

  it("records failed AI skill installs as unresolved in the manifest and skills lock", async () => {
    const parentDirectory = await mkdtemp(join(tmpdir(), "stackkit-create-apply-"));
    tempDirectories.push(parentDirectory);

    const plan = createCreatePlan({
      config: {
        projectName: "skills-app",
        packageManager: "pnpm",
        workspace: "pnpm-turbo",
        modules: ["web/nextjs"],
        ai: {
          skillTargets: ["codex"]
        }
      },
      availableModules: [
        defineModule({
          id: "web/nextjs",
          version: "1.0.0",
          title: "Next.js",
          description: "Next.js web application",
          aiSkills: [
            {
              source: "https://github.com/vercel-labs/agent-skills",
              skills: ["vercel-react-best-practices"],
              trust: "official",
              causedBy: "web/nextjs",
              reason: "React and Next.js app code"
            }
          ]
        })
      ]
    });

    const result = await applyCreatePlan(plan, {
      parentDirectory,
      runCommand: async () => ({ exitCode: 1, stdout: "", stderr: "network unavailable" })
    });

    const expectedUnresolved = [
      {
        source: "https://github.com/vercel-labs/agent-skills",
        skills: ["vercel-react-best-practices"],
        trust: "unresolved",
        causedBy: "web/nextjs",
        reason: "Skill install failed: network unavailable"
      }
    ];
    expect(result.manifest.aiSkills.installed).toEqual([]);
    expect(result.manifest.aiSkills.unresolved).toEqual(expectedUnresolved);

    const manifest = JSON.parse(await readFile(join(result.projectDirectory, ".stackkit", "project.json"), "utf8"));
    expect(manifest.aiSkills.unresolved).toEqual(expectedUnresolved);

    const lock = JSON.parse(await readFile(join(result.projectDirectory, "skills-lock.json"), "utf8"));
    expect(lock.installed).toEqual([]);
    expect(lock.unresolved).toEqual(expectedUnresolved);
  });
});
