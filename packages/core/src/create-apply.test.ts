import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

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
        packageManager: "pnpm",
        source: { kind: "config", path: "stackkit.config.json" },
        paths: { root: "." },
        createdAt: "2026-06-02T00:00:00.000Z",
        modules: [
          expect.objectContaining({
            id: "workspace/pnpm-turbo",
            version: "1.0.0",
            options: {},
            snapshot: expect.objectContaining({ id: "workspace/pnpm-turbo" })
          })
        ]
      })
    );
    expect(manifest.expectedFiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "stackkit.config.json", owner: "stackkit/config", content: expect.any(String) }),
        expect.objectContaining({ path: "package.json", owner: "workspace/pnpm-turbo", content: expect.any(String) })
      ])
    );
    expect(manifest.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "stackkit.config.json", owner: "stackkit/config" }),
        expect.objectContaining({ path: "package.json" })
      ])
    );
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

  it("records scripted create provenance in the manifest", async () => {
    const parentDirectory = await mkdtemp(join(tmpdir(), "stackkit-create-apply-"));
    tempDirectories.push(parentDirectory);

    const plan = createCreatePlan({
      config: {
        projectName: "scripted-app",
        packageManager: "pnpm",
        workspace: "pnpm-turbo",
        modules: ["workspace/pnpm-turbo"],
        ai: {
          skillTargets: ["codex"]
        }
      },
      source: { kind: "scripted" },
      availableModules: [
        defineModule({
          id: "workspace/pnpm-turbo",
          version: "1.0.0",
          title: "pnpm and Turborepo",
          description: "pnpm workspace with Turborepo task orchestration"
        })
      ]
    });

    const result = await applyCreatePlan(plan, { parentDirectory, installSkills: false });

    expect(result.manifest.source).toEqual({ kind: "scripted" });
    expect(result.manifest.paths).toEqual({ root: "." });
  });

  it("refuses to create in a non-empty unmanaged directory", async () => {
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

    await expect(applyCreatePlan(plan, { parentDirectory })).rejects.toThrow("Refusing to create in non-empty directory");
  });

  it("allows create in an existing empty target directory", async () => {
    const parentDirectory = await mkdtemp(join(tmpdir(), "stackkit-create-apply-"));
    tempDirectories.push(parentDirectory);
    const targetDirectory = join(parentDirectory, "empty");

    await mkdir(targetDirectory, { recursive: true });

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

    const result = await applyCreatePlan(plan, { parentDirectory, targetDirectory, installSkills: false });

    expect(result.projectDirectory).toBe(targetDirectory);
  });

  it("refuses to create in an existing Stackkit-managed directory", async () => {
    const parentDirectory = await mkdtemp(join(tmpdir(), "stackkit-create-apply-"));
    tempDirectories.push(parentDirectory);
    const targetDirectory = join(parentDirectory, "acme-dashboard");

    await mkdir(join(targetDirectory, ".stackkit"), { recursive: true });
    await writeFile(join(targetDirectory, ".stackkit", "project.json"), "{}\n", "utf8");

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
      "already Stackkit-managed. Use stackkit add, stackkit update, or stackkit diff"
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
    ).toThrow('Invalid project name: "../outside"');
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
    expect(result.manifest.aiSkills.local).toEqual([
      expect.objectContaining({
        skills: ["stackkit-kubernetes-guidance"],
        trust: "local",
        causedBy: "deploy/kubernetes"
      })
    ]);

    const manifest = JSON.parse(await readFile(join(result.projectDirectory, ".stackkit", "project.json"), "utf8"));
    expect(manifest.aiSkills.local).toEqual([
      expect.objectContaining({
        skills: ["stackkit-kubernetes-guidance"],
        trust: "local",
        causedBy: "deploy/kubernetes"
      })
    ]);

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

  it("writes planned external skills without running installs in plan mode", async () => {
    const parentDirectory = await mkdtemp(join(tmpdir(), "stackkit-create-apply-"));
    tempDirectories.push(parentDirectory);
    const runCommand = vi.fn(async () => ({ exitCode: 0, stdout: "ok", stderr: "" }));

    const plan = createCreatePlan({
      config: {
        projectName: "skills-app",
        packageManager: "pnpm",
        workspace: "pnpm-turbo",
        modules: ["web/nextjs"],
        ai: {
          skillTargets: ["codex"],
          skillMode: "plan",
          linkMode: "copy"
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

    const result = await applyCreatePlan(plan, { parentDirectory, runCommand });

    expect(runCommand).not.toHaveBeenCalled();
    expect(result.manifest.aiSkills).toEqual(
      expect.objectContaining({
        mode: "plan",
        linkMode: "copy",
        installed: [],
        planned: [
          expect.objectContaining({
            skills: ["vercel-react-best-practices"],
            trust: "official",
            causedBy: "web/nextjs"
          })
        ],
        unresolved: []
      })
    );

    const lock = JSON.parse(await readFile(join(result.projectDirectory, "skills-lock.json"), "utf8"));
    expect(lock).toEqual(
      expect.objectContaining({
        mode: "plan",
        linkMode: "copy",
        installed: [],
        planned: [
          expect.objectContaining({
            skills: ["vercel-react-best-practices"],
            trust: "official",
            causedBy: "web/nextjs"
          })
        ],
        unresolved: []
      })
    );
  });

  it("skips skill commands and skill artifacts in skip mode", async () => {
    const parentDirectory = await mkdtemp(join(tmpdir(), "stackkit-create-apply-"));
    tempDirectories.push(parentDirectory);

    const plan = createCreatePlan({
      config: {
        projectName: "skip-skills-app",
        packageManager: "pnpm",
        workspace: "pnpm-turbo",
        modules: ["web/nextjs", "custom/local-skill"],
        ai: {
          skillTargets: ["codex", "claude-code"],
          skillMode: "skip",
          linkMode: "symlink"
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
        }),
        defineModule({
          id: "custom/local-skill",
          version: "1.0.0",
          title: "Local skill",
          description: "Local fallback guidance",
          aiSkills: [
            {
              skills: ["stackkit-local-guidance"],
              trust: "local",
              causedBy: "custom/local-skill",
              reason: "No external skill is configured"
            }
          ]
        })
      ]
    });

    expect(plan.skillInstallCommands).toEqual([]);
    expect(plan.aiSkills.local).toEqual([]);
    expect(plan.aiSkills.planned).toEqual([]);
    expect(plan.aiSkills.unresolved).toEqual([]);

    const result = await applyCreatePlan(plan, { parentDirectory });

    expect(result.manifest.aiSkills).toEqual(
      expect.objectContaining({
        mode: "skip",
        linkMode: "symlink",
        installed: [],
        planned: [],
        unresolved: []
      })
    );
    await expect(readFile(join(result.projectDirectory, "skills-lock.json"), "utf8")).rejects.toThrow();
    await expect(stat(join(result.projectDirectory, ".agents", "skills"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(join(result.projectDirectory, ".claude", "skills"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("includes package and env operations in the manifest", async () => {
    const parentDirectory = await mkdtemp(join(tmpdir(), "stackkit-create-apply-"));
    tempDirectories.push(parentDirectory);

    const plan = createCreatePlan({
      config: {
        projectName: "module-app",
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
          packageChanges: [
            {
              packagePath: "package.json",
              scripts: { dev: "next dev" },
              dependencies: { next: "^15.0.0" },
              devDependencies: {},
              peerDependencies: {},
              optionalDependencies: {}
            }
          ],
          envVars: [
            {
              name: "DATABASE_URL",
              description: "Postgres connection string",
              required: true,
              example: "postgres://postgres:postgres@localhost:5432/app"
            }
          ]
        })
      ]
    });

    const result = await applyCreatePlan(plan, { parentDirectory });

    const pkg = JSON.parse(await readFile(join(result.projectDirectory, "package.json"), "utf8"));
    expect(pkg.scripts.dev).toBe("next dev");
    expect(pkg.dependencies.next).toBe("^15.0.0");
    await expect(readFile(join(result.projectDirectory, ".env.example"), "utf8")).resolves.toContain(
      "DATABASE_URL=postgres://postgres:postgres@localhost:5432/app"
    );
    expect(result.manifest.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "package.json", owner: "workspace/pnpm-turbo" }),
        expect.objectContaining({ path: ".env.example", owner: "docs/env" })
      ])
    );
  });

  it("runs doctor after create and returns the result", async () => {
    const parent = await mkdtemp(join(tmpdir(), "stackkit-create-doctor-"));
    tempDirectories.push(parent);

    const plan = createCreatePlan({
      config: {
        projectName: "doctor-project",
        packageManager: "pnpm",
        workspace: "pnpm-turbo",
        modules: ["workspace/pnpm-turbo", "workspace/typescript"],
        ai: { skillTargets: ["codex"] }
      },
      availableModules: [
        defineModule({
          id: "workspace/pnpm-turbo",
          version: "1.0.0",
          title: "pnpm and Turborepo",
          description: "Workspace foundation",
          provides: ["workspace/node"]
        }),
        defineModule({
          id: "workspace/typescript",
          version: "1.0.0",
          title: "TypeScript",
          description: "TypeScript config",
          requires: ["workspace/node"],
          provides: ["typescript"]
        })
      ],
      curatedSkillSourceAllowlist: []
    });

    const result = await applyCreatePlan(plan, {
      parentDirectory: parent,
      installSkills: false
    });

    expect(result.doctor.ok).toBe(true);
  });

  it("runs post-create lifecycle hooks after writing files", async () => {
    const parentDirectory = await mkdtemp(join(tmpdir(), "stackkit-create-apply-"));
    tempDirectories.push(parentDirectory);
    const projectDirectory = join(parentDirectory, "hook-app");
    const seen: string[][] = [];

    const plan = createCreatePlan({
      config: {
        projectName: "hook-app",
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
          files: [{ kind: "write", path: "apps/web/package.json", owner: "web/nextjs", content: "{}\n" }],
          postCreate: [{ name: "format", command: "pnpm", args: ["format"], cwd: "apps/web" }]
        })
      ]
    });

    const result = await applyCreatePlan(plan, {
      parentDirectory,
      runCommand: async (command, args, options) => {
        await expect(readFile(join(projectDirectory, "apps", "web", "package.json"), "utf8")).resolves.toContain(
          "\"name\": \"@acme/web\""
        );
        seen.push([options.cwd ?? "", command, ...args]);
        return { exitCode: 0, stdout: "", stderr: "" };
      }
    });

    expect(seen).toEqual([[join(result.projectDirectory, "apps/web"), "pnpm", "format"]]);
  });

  it("runs shadcn monorepo initialization through the package manager for Next.js shadcn projects", async () => {
    const parentDirectory = await mkdtemp(join(tmpdir(), "stackkit-create-shadcn-"));
    tempDirectories.push(parentDirectory);
    const calls: { command: string; args: string[]; cwd?: string }[] = [];

    const plan = createCreatePlan({
      config: {
        projectName: "shadcn-app",
        packageManager: "pnpm",
        workspace: "pnpm-turbo",
        modules: ["workspace/pnpm-turbo", "workspace/typescript", "web/nextjs", "ui/shadcn"],
        ai: {
          skillTargets: ["codex"],
          skillMode: "skip"
        }
      },
      availableModules: [
        defineModule({
          id: "workspace/pnpm-turbo",
          version: "1.0.0",
          title: "pnpm and Turborepo",
          description: "Workspace",
          provides: ["workspace/node"]
        }),
        defineModule({
          id: "workspace/typescript",
          version: "1.0.0",
          title: "TypeScript",
          description: "TypeScript",
          requires: ["workspace/node"],
          provides: ["typescript"]
        }),
        defineModule({
          id: "web/nextjs",
          version: "1.0.0",
          title: "Next.js",
          description: "Next.js",
          requires: ["workspace/node"],
          provides: ["web-app", "nextjs-app", "react"]
        }),
        defineModule({
          id: "ui/shadcn",
          version: "1.0.0",
          title: "shadcn/ui",
          description: "shadcn/ui",
          requires: ["react"]
        })
      ]
    });

    await applyCreatePlan(plan, {
      parentDirectory,
      runCommand: async (command, args, options) => {
        calls.push({ command, args: [...args], cwd: options.cwd });
        return { exitCode: 0, stdout: "", stderr: "" };
      }
    });

    expect(calls).toEqual([
      {
        command: "pnpm",
        args: ["dlx", "shadcn@latest", "init", "-d", "--base", "radix", "--monorepo", "-t", "next", "--cwd", "."],
        cwd: join(parentDirectory, "shadcn-app")
      }
    ]);
  });
});
