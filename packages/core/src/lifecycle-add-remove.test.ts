import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyAddModules,
  applyRemoveModules,
  buildCreateFilePlan,
  createManifest,
  defineModule,
  hashContent,
  planAddModules,
  planRemoveModules,
  readOptionalSkillsLock,
  writeManifest,
  type StackkitManifest
} from "./index.js";

const tempDirectories: string[] = [];

/** Lifecycle add applies the create support contract, so fixtures must opt out of the "planned" default. */
function supportedModule(module: Parameters<typeof defineModule>[0]) {
  return defineModule({ support: { level: "supported" }, ...module });
}

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function baseManifest(files: StackkitManifest["files"] = []): StackkitManifest {
  return createManifest({
    schemaVersion: 1,
    stackkitVersion: "0.1.0",
    projectName: "acme",
    createdAt: "2026-06-02T00:00:00.000Z",
    modules: [{ id: "workspace/pnpm-turbo", version: "1.0.0", options: {} }],
    files,
    aiSkills: {
      targets: [{ agent: "codex", directory: ".agents", enabled: true }],
      installed: [],
      unresolved: []
    },
    migrations: {
      applied: []
    }
  });
}

describe("planAddModules", () => {
  it("plans adding new modules to an existing manifest", async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), "stackkit-plan-add-"));
    tempDirectories.push(projectDirectory);
    const plan = await planAddModules({
      projectDirectory,
      manifest: baseManifest(),
      moduleIds: ["web/nextjs"],
      availableModules: [
        supportedModule({
          id: "workspace/pnpm-turbo",
          version: "1.0.0",
          title: "Workspace",
          description: "Existing workspace",
          provides: ["workspace/node"]
        }),
        supportedModule({
          id: "web/nextjs",
          version: "2.0.0",
          title: "Next.js",
          description: "Next.js app",
          requires: ["workspace/node"]
        })
      ]
    });

    expect(plan.safe).toBe(true);
    expect(plan.modules.map((module) => module.id)).toEqual(["workspace/pnpm-turbo", "web/nextjs"]);
    expect(plan.modulesToAdd.map((module) => module.id)).toEqual(["web/nextjs"]);
    expect(plan.manifest.modules).toEqual([
      expect.objectContaining({ id: "workspace/pnpm-turbo", version: "1.0.0", options: {} }),
      expect.objectContaining({ id: "web/nextjs", version: "2.0.0", options: {} })
    ]);
    expect(plan.manifest.modules.map((module) => module.snapshot?.id)).toEqual(["workspace/pnpm-turbo", "web/nextjs"]);
  });
});

describe("planAddModules support, aliases and conflicts", () => {
  const workspace = () =>
    supportedModule({ id: "workspace/pnpm-turbo", version: "1.0.0", title: "Workspace", description: "Workspace", provides: ["workspace/node"] });

  it("refuses planned modules and requires an explicit opt-in for preview modules", async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), "stackkit-plan-add-"));
    tempDirectories.push(projectDirectory);
    const availableModules = [
      workspace(),
      defineModule({ id: "rust/tokio", version: "1.0.0", title: "Tokio", description: "Planned", support: { level: "planned", reason: "Not built" } }),
      defineModule({ id: "docs/readme", version: "1.0.0", title: "Docs", description: "Preview", support: { level: "preview", reason: "Preview" } })
    ];
    const input = { projectDirectory, manifest: baseManifest(), availableModules };

    await expect(planAddModules({ ...input, moduleIds: ["rust/tokio"], includePreview: true })).rejects.toThrow(
      "Module rust/tokio is planned and cannot be created"
    );
    await expect(planAddModules({ ...input, moduleIds: ["docs/readme"] })).rejects.toThrow("--include-preview");
    await expect(planAddModules({ ...input, moduleIds: ["docs/readme"], includePreview: true })).resolves.toMatchObject({
      modulesToAdd: [expect.objectContaining({ id: "docs/readme" })]
    });
  });

  it("resolves aliases to canonical module ids", async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), "stackkit-plan-add-"));
    tempDirectories.push(projectDirectory);

    const plan = await planAddModules({
      projectDirectory,
      manifest: baseManifest(),
      moduleIds: ["pytest"],
      availableModules: [
        workspace(),
        supportedModule({ id: "quality/pytest", version: "1.0.0", title: "pytest", description: "Tests", aliases: ["pytest"] })
      ]
    });

    expect(plan.modulesToAdd.map((module) => module.id)).toEqual(["quality/pytest"]);
  });

  it("reports the conflicts apply would refuse on", async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), "stackkit-plan-add-"));
    tempDirectories.push(projectDirectory);
    await writeFile(join(projectDirectory, "vercel.json"), "{}\n", "utf8");

    const plan = await planAddModules({
      projectDirectory,
      manifest: baseManifest(),
      moduleIds: ["deploy/vercel"],
      availableModules: [
        workspace(),
        supportedModule({
          id: "deploy/vercel",
          version: "1.0.0",
          title: "Vercel",
          description: "Deploy",
          files: [{ kind: "write", path: "vercel.json", owner: "deploy/vercel", content: "{ }\n" }]
        })
      ]
    });

    expect(plan.safe).toBe(false);
    expect(plan.refusals).toEqual([{ path: "vercel.json", reason: "exists-unowned" }]);
    expect(plan.writes.map((file) => file.path)).toEqual(["vercel.json"]);
  });
});

describe("planRemoveModules", () => {
  it("refuses to remove modified owned files", async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), "stackkit-plan-remove-"));
    tempDirectories.push(projectDirectory);
    await mkdir(join(projectDirectory, "apps", "web"), { recursive: true });
    await writeFile(join(projectDirectory, "apps", "web", "page.tsx"), "changed\n", "utf8");
    const manifest = baseManifest([{ path: "apps/web/page.tsx", owner: "web/nextjs", hash: hashContent("original\n") }]);

    const plan = await planRemoveModules({
      projectDirectory,
      manifest: {
        ...manifest,
        modules: [...manifest.modules, { id: "web/nextjs", version: "1.0.0", options: {} }]
      },
      moduleIds: ["web/nextjs"],
      availableModules: [
        supportedModule({
          id: "web/nextjs",
          version: "1.0.0",
          title: "Next.js",
          description: "Next.js app",
          removalPolicy: {
            mode: "managed-files-only",
            retainedData: ["Hosted deployments are retained."],
            manualCleanup: ["Delete hosted deployments separately."]
          }
        })
      ]
    });

    expect(plan.safe).toBe(false);
    expect(plan.refusals).toEqual([{ path: "apps/web/page.tsx", reason: "modified-owned" }]);
    expect(plan.removalAdvisories).toEqual([
      {
        moduleId: "web/nextjs",
        policy: {
          mode: "managed-files-only",
          retainedData: ["Hosted deployments are retained."],
          manualCleanup: ["Delete hosted deployments separately."]
        }
      }
    ]);
  });

  it("blocks automatic removal when the module policy forbids it", async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), "stackkit-plan-remove-"));
    tempDirectories.push(projectDirectory);
    const manifest = baseManifest();
    const plan = await planRemoveModules({
      projectDirectory,
      manifest: {
        ...manifest,
        modules: [...manifest.modules, { id: "service/manual", version: "1.0.0", options: {} }]
      },
      moduleIds: ["service/manual"],
      availableModules: [
        supportedModule({
          id: "service/manual",
          version: "1.0.0",
          title: "Manual service",
          description: "Requires a manual removal workflow",
          removalPolicy: { mode: "blocked", retainedData: [], manualCleanup: ["Follow the service runbook."] }
        })
      ]
    });

    expect(plan.safe).toBe(false);
    expect(plan.blockedModules).toEqual(["service/manual"]);
  });
});

describe("applyAddModules", () => {
  it("writes new module files and updates manifest", async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), "stackkit-add-"));
    tempDirectories.push(projectDirectory);
    const manifest = await writeManifest(projectDirectory, baseManifest());

    const result = await applyAddModules({
      projectDirectory,
      manifest,
      moduleIds: ["web/nextjs"],
      availableModules: [
        supportedModule({
          id: "workspace/pnpm-turbo",
          version: "1.0.0",
          title: "Workspace",
          description: "Existing workspace",
          provides: ["workspace/node"]
        }),
        supportedModule({
          id: "web/nextjs",
          version: "1.0.0",
          title: "Next.js",
          description: "Next.js app",
          requires: ["workspace/node"],
          files: [{ kind: "write", path: "apps/web/page.tsx", owner: "web/nextjs", content: "export default Page;\n" }]
        })
      ]
    });

    await expect(readFile(join(projectDirectory, "apps", "web", "page.tsx"), "utf8")).resolves.toBe(
      "export default Page;\n"
    );
    expect(result.manifest.modules).toEqual([
      expect.objectContaining({ id: "workspace/pnpm-turbo", version: "1.0.0", options: {} }),
      expect.objectContaining({ id: "web/nextjs", version: "1.0.0", options: {} })
    ]);
    expect(result.manifest.modules.map((module) => module.snapshot?.id)).toEqual(["workspace/pnpm-turbo", "web/nextjs"]);
    expect(result.manifest.files).toEqual(
      expect.arrayContaining([
        { path: "apps/web/page.tsx", owner: "web/nextjs", hash: hashContent("export default Page;\n") }
      ])
    );
  });

  it("refuses when package change would modify an unowned existing package file", async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), "stackkit-add-"));
    tempDirectories.push(projectDirectory);
    await writeManifest(projectDirectory, baseManifest());
    await writeFile(join(projectDirectory, "package.json"), "{\"name\":\"existing\"}\n", "utf8");

    await expect(
      applyAddModules({
        projectDirectory,
        manifest: baseManifest(),
        moduleIds: ["web/nextjs"],
        availableModules: [
          supportedModule({
            id: "workspace/pnpm-turbo",
            version: "1.0.0",
            title: "Workspace",
            description: "Existing workspace",
            provides: ["workspace/node"]
          }),
          supportedModule({
            id: "web/nextjs",
            version: "1.0.0",
            title: "Next.js",
            description: "Next.js app",
            requires: ["workspace/node"],
            packageChanges: [
              {
                packagePath: "package.json",
                scripts: { dev: "next dev" },
                dependencies: { next: "^15.0.0" },
                devDependencies: {},
                peerDependencies: {},
                optionalDependencies: {}
              }
            ]
          })
        ]
      })
    ).rejects.toThrow("Add target has conflicts: package.json (exists-unowned)");
  });

  it("updates skills-lock.json when add introduces AI skills", async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), "stackkit-add-"));
    tempDirectories.push(projectDirectory);
    const manifest = await writeManifest(projectDirectory, baseManifest());

    await applyAddModules({
      projectDirectory,
      manifest,
      moduleIds: ["custom/local-skill"],
      availableModules: [
        supportedModule({
          id: "workspace/pnpm-turbo",
          version: "1.0.0",
          title: "Workspace",
          description: "Existing workspace"
        }),
        supportedModule({
          id: "custom/local-skill",
          version: "1.0.0",
          title: "Local skill",
          description: "Local skill guidance",
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

    const lock = await readOptionalSkillsLock(projectDirectory);

    expect(lock?.local).toEqual([
      expect.objectContaining({
        skills: ["custom-local-guidance"],
        trust: "local",
        causedBy: "custom/local-skill"
      })
    ]);
    await expect(
      readFile(join(projectDirectory, ".agents", "skills", "custom-local-guidance", "SKILL.md"), "utf8")
    ).resolves.toContain("custom/local-skill");
  });

  it("does not install or write skill artifacts when the manifest skill mode is skip", async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), "stackkit-add-"));
    tempDirectories.push(projectDirectory);
    const manifest = await writeManifest(projectDirectory, {
      ...baseManifest(),
      aiSkills: {
        ...baseManifest().aiSkills,
        mode: "skip",
        linkMode: "symlink"
      }
    });
    const runCommand = vi.fn(async () => ({ exitCode: 0, stdout: "installed", stderr: "" }));

    const result = await applyAddModules({
      projectDirectory,
      manifest,
      moduleIds: ["web/nextjs", "custom/local-skill"],
      runCommand,
      availableModules: [
        supportedModule({
          id: "workspace/pnpm-turbo",
          version: "1.0.0",
          title: "Workspace",
          description: "Existing workspace",
          provides: ["workspace/node"]
        }),
        supportedModule({
          id: "web/nextjs",
          version: "1.0.0",
          title: "Next.js",
          description: "Next.js app",
          requires: ["workspace/node"],
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
        supportedModule({
          id: "custom/local-skill",
          version: "1.0.0",
          title: "Local skill",
          description: "Local skill guidance",
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

    expect(runCommand).not.toHaveBeenCalled();
    expect(result.manifest.aiSkills).toEqual(
      expect.objectContaining({
        mode: "skip",
        linkMode: "symlink",
        installed: [],
        planned: [],
        local: [],
        unresolved: []
      })
    );
    await expect(stat(join(projectDirectory, "skills-lock.json"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(join(projectDirectory, ".agents", "skills"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("records addable external skills as planned without installing when the manifest skill mode is plan", async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), "stackkit-add-"));
    tempDirectories.push(projectDirectory);
    const manifest = await writeManifest(projectDirectory, {
      ...baseManifest(),
      aiSkills: {
        ...baseManifest().aiSkills,
        mode: "plan",
        linkMode: "symlink"
      }
    });
    const runCommand = vi.fn(async () => ({ exitCode: 0, stdout: "installed", stderr: "" }));

    const result = await applyAddModules({
      projectDirectory,
      manifest,
      moduleIds: ["web/nextjs"],
      runCommand,
      availableModules: [
        supportedModule({
          id: "workspace/pnpm-turbo",
          version: "1.0.0",
          title: "Workspace",
          description: "Existing workspace",
          provides: ["workspace/node"]
        }),
        supportedModule({
          id: "web/nextjs",
          version: "1.0.0",
          title: "Next.js",
          description: "Next.js app",
          requires: ["workspace/node"],
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

    expect(runCommand).not.toHaveBeenCalled();
    expect(result.manifest.aiSkills).toEqual(
      expect.objectContaining({
        mode: "plan",
        linkMode: "symlink",
        installed: [],
        planned: [
          expect.objectContaining({
            skills: ["vercel-react-best-practices"],
            trust: "official",
            causedBy: "web/nextjs"
          })
        ],
        local: [],
        unresolved: []
      })
    );

    const lock = await readOptionalSkillsLock(projectDirectory);
    expect(lock).toEqual(
      expect.objectContaining({
        mode: "plan",
        linkMode: "symlink",
        installed: [],
        planned: [
          expect.objectContaining({
            skills: ["vercel-react-best-practices"],
            trust: "official",
            causedBy: "web/nextjs"
          })
        ],
        local: [],
        unresolved: []
      })
    );
  });

  it("records allowlisted curated external skills as planned in plan mode", async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), "stackkit-add-"));
    tempDirectories.push(projectDirectory);
    const manifest = await writeManifest(projectDirectory, {
      ...baseManifest(),
      aiSkills: {
        ...baseManifest().aiSkills,
        mode: "plan",
        linkMode: "symlink"
      }
    });
    const runCommand = vi.fn(async () => ({ exitCode: 0, stdout: "installed", stderr: "" }));

    const result = await applyAddModules({
      projectDirectory,
      manifest,
      moduleIds: ["web/django"],
      runCommand,
      curatedSkillSourceAllowlist: ["https://github.com/example/curated-skills"],
      availableModules: [
        supportedModule({
          id: "workspace/pnpm-turbo",
          version: "1.0.0",
          title: "Workspace",
          description: "Existing workspace"
        }),
        supportedModule({
          id: "web/django",
          version: "1.0.0",
          title: "Django",
          description: "Django app",
          aiSkills: [
            {
              source: "https://github.com/example/curated-skills",
              skills: ["django-patterns"],
              trust: "curated",
              causedBy: "web/django",
              reason: "Allowlisted Django guidance"
            }
          ]
        })
      ]
    });

    expect(runCommand).not.toHaveBeenCalled();
    expect(result.manifest.aiSkills.planned).toEqual([
      expect.objectContaining({
        source: "https://github.com/example/curated-skills",
        skills: ["django-patterns"],
        trust: "curated",
        causedBy: "web/django"
      })
    ]);
    expect(result.manifest.aiSkills.unresolved).toEqual([]);
  });

  it("installs allowlisted curated external skills in install mode", async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), "stackkit-add-"));
    tempDirectories.push(projectDirectory);
    const manifest = await writeManifest(projectDirectory, baseManifest());
    const runCommand = vi.fn(async () => ({ exitCode: 0, stdout: "installed", stderr: "" }));

    const result = await applyAddModules({
      projectDirectory,
      manifest,
      moduleIds: ["rust/tokio"],
      runCommand,
      curatedSkillSourceAllowlist: ["https://github.com/example/rust-skills"],
      availableModules: [
        supportedModule({
          id: "workspace/pnpm-turbo",
          version: "1.0.0",
          title: "Workspace",
          description: "Existing workspace"
        }),
        supportedModule({
          id: "rust/tokio",
          version: "1.0.0",
          title: "Tokio",
          description: "Tokio async runtime",
          aiSkills: [
            {
              source: "https://github.com/example/rust-skills",
              skills: ["rust-async-patterns"],
              trust: "curated",
              causedBy: "rust/tokio",
              reason: "Allowlisted Rust guidance"
            }
          ]
        })
      ]
    });

    expect(runCommand).toHaveBeenCalledWith(
      "npx",
      expect.arrayContaining(["skills", "add", "https://github.com/example/rust-skills", "--skill", "rust-async-patterns"]),
      { cwd: projectDirectory }
    );
    expect(result.manifest.aiSkills.installed).toEqual([
      expect.objectContaining({
        source: "https://github.com/example/rust-skills",
        skills: ["rust-async-patterns"],
        trust: "curated",
        causedBy: "rust/tokio"
      })
    ]);
    expect(result.manifest.aiSkills.unresolved).toEqual([]);
  });

  it("does not mark addable external skills as installed without a command runner", async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), "stackkit-add-"));
    tempDirectories.push(projectDirectory);
    const manifest = await writeManifest(projectDirectory, baseManifest());

    const result = await applyAddModules({
      projectDirectory,
      manifest,
      moduleIds: ["web/nextjs", "custom/local-skill"],
      availableModules: [
        supportedModule({
          id: "workspace/pnpm-turbo",
          version: "1.0.0",
          title: "Workspace",
          description: "Existing workspace",
          provides: ["workspace/node"]
        }),
        supportedModule({
          id: "web/nextjs",
          version: "1.0.0",
          title: "Next.js",
          description: "Next.js app",
          requires: ["workspace/node"],
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
        supportedModule({
          id: "custom/local-skill",
          version: "1.0.0",
          title: "Local skill",
          description: "Local skill guidance",
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

    expect(result.manifest.aiSkills.installed).toEqual([]);
    expect(result.manifest.aiSkills.unresolved).toEqual([
      {
        source: "https://github.com/vercel-labs/agent-skills",
        skills: ["vercel-react-best-practices"],
        trust: "unresolved",
        causedBy: "web/nextjs",
        reason: "Skill install failed: No command runner configured for AI skill installation"
      }
    ]);
    expect(result.manifest.aiSkills.local).toEqual([
      expect.objectContaining({
        skills: ["custom-local-guidance"],
        trust: "local",
        causedBy: "custom/local-skill"
      })
    ]);

    const lock = await readOptionalSkillsLock(projectDirectory);
    expect(lock?.installed).toEqual([]);
    expect(lock?.unresolved).toEqual(result.manifest.aiSkills.unresolved);
    await expect(
      readFile(join(projectDirectory, ".agents", "skills", "custom-local-guidance", "SKILL.md"), "utf8")
    ).resolves.toContain("custom/local-skill");
  });

  it("uses the manifest package manager when adding generated module files", async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), "stackkit-add-"));
    tempDirectories.push(projectDirectory);
    const manifest = await writeManifest(projectDirectory, {
      ...baseManifest(),
      packageManager: "bun"
    });

    await applyAddModules({
      projectDirectory,
      manifest,
      moduleIds: ["web/nextjs", "deploy/docker"],
      availableModules: [
        supportedModule({
          id: "workspace/pnpm-turbo",
          version: "1.0.0",
          title: "Workspace",
          description: "Existing workspace",
          provides: ["workspace/node"]
        }),
        supportedModule({
          id: "web/nextjs",
          version: "1.0.0",
          title: "Next.js",
          description: "Next.js app",
          requires: ["workspace/node"],
          provides: ["nextjs-app"]
        }),
        supportedModule({
          id: "deploy/docker",
          version: "1.0.0",
          title: "Docker",
          description: "Docker deployment",
          requires: ["nextjs-app"]
        })
      ]
    });

    const dockerfile = await readFile(join(projectDirectory, "apps", "web", "Dockerfile"), "utf8");

    expect(dockerfile).toContain("RUN bun install");
    expect(dockerfile).not.toContain("pnpm");
  });
});

describe("applyRemoveModules", () => {
  it("deletes owned unchanged files and updates manifest", async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), "stackkit-remove-"));
    tempDirectories.push(projectDirectory);
    await mkdir(join(projectDirectory, "apps", "web"), { recursive: true });
    await writeFile(join(projectDirectory, "apps", "web", "page.tsx"), "original\n", "utf8");
    const manifest = await writeManifest(
      projectDirectory,
      createManifest({
        ...baseManifest([{ path: "apps/web/page.tsx", owner: "web/nextjs", hash: hashContent("original\n") }]),
        modules: [
          { id: "workspace/pnpm-turbo", version: "1.0.0", options: {} },
          { id: "web/nextjs", version: "1.0.0", options: {} }
        ]
      })
    );

    const result = await applyRemoveModules({ projectDirectory, manifest, moduleIds: ["web/nextjs"] });

    await expect(readFile(join(projectDirectory, "apps", "web", "page.tsx"), "utf8")).rejects.toMatchObject({
      code: "ENOENT"
    });
    expect(result.manifest.modules).toEqual([{ id: "workspace/pnpm-turbo", version: "1.0.0", options: {} }]);
    expect(result.manifest.files).toEqual([]);
  });

  it("regenerates unchanged shared files from the remaining module snapshots", async () => {
    const { projectDirectory, manifest, readmeWithWeb } = await createReadmeProject();

    const result = await applyRemoveModules({ projectDirectory, manifest, moduleIds: ["web/nextjs"] });

    const nextReadme = await readFile(join(projectDirectory, "README.md"), "utf8");
    expect(nextReadme).toContain("- Workspace");
    expect(nextReadme).not.toContain("Next.js");
    expect(result.manifest.files).toEqual([
      { path: "README.md", owner: "docs/readme", hash: hashContent(nextReadme) }
    ]);
    expect(nextReadme).not.toBe(readmeWithWeb);
    expect(result.manifest.expectedFiles).toEqual([
      { path: "README.md", owner: "docs/readme", content: nextReadme, hash: hashContent(nextReadme) }
    ]);
  });

  it("refuses to rewrite a drifted file owned by a module that stays installed", async () => {
    const { projectDirectory, manifest, readmeWithWeb } = await createReadmeProject();
    const editedReadme = `${readmeWithWeb}\nMy notes\n`;
    await writeFile(join(projectDirectory, "README.md"), editedReadme, "utf8");

    const plan = await planRemoveModules({ projectDirectory, manifest, moduleIds: ["web/nextjs"] });

    expect(plan.safe).toBe(false);
    expect(plan.refusals).toEqual([{ path: "README.md", reason: "modified-owned" }]);
    await expect(applyRemoveModules({ projectDirectory, manifest, moduleIds: ["web/nextjs"] })).rejects.toThrow(
      "Remove target has conflicts: README.md (modified-owned)"
    );
    await expect(readFile(join(projectDirectory, "README.md"), "utf8")).resolves.toBe(editedReadme);

    const forced = await applyRemoveModules({ projectDirectory, manifest, moduleIds: ["web/nextjs"], force: true });
    expect(forced.manifest.modules.map((module) => module.id)).toEqual(["workspace/pnpm-turbo"]);
    await expect(readFile(join(projectDirectory, "README.md"), "utf8")).resolves.not.toContain("My notes");
  });

  it("leaves native-initializer and migration output of remaining modules alone", async () => {
    const { projectDirectory, manifest } = await createReadmeProject();
    const utils = "export function cn() {}\n";
    await mkdir(join(projectDirectory, "packages", "ui", "src", "lib"), { recursive: true });
    await writeFile(join(projectDirectory, "packages", "ui", "src", "lib", "utils.ts"), utils, "utf8");
    const withInitializerFile = createManifest({
      ...manifest,
      files: [...manifest.files, { path: "packages/ui/src/lib/utils.ts", owner: "workspace/pnpm-turbo", hash: hashContent(utils) }]
    });

    const result = await applyRemoveModules({ projectDirectory, manifest: withInitializerFile, moduleIds: ["web/nextjs"] });

    expect(result.plan.deletes).toEqual([]);
    await expect(readFile(join(projectDirectory, "packages", "ui", "src", "lib", "utils.ts"), "utf8")).resolves.toBe(utils);
    expect(result.manifest.files).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "packages/ui/src/lib/utils.ts" })])
    );
  });

  it("refuses module ids that are unknown or not installed, and resolves aliases", async () => {
    const { projectDirectory, manifest } = await createReadmeProject();
    const availableModules = manifest.modules.map((module) => module.snapshot!);

    await expect(planRemoveModules({ projectDirectory, manifest, moduleIds: ["nope/typo"], availableModules })).rejects.toThrow(
      "Unknown Stackkit module or alias: nope/typo"
    );
    await expect(
      planRemoveModules({
        projectDirectory,
        manifest,
        moduleIds: ["api/fastapi"],
        availableModules: [...availableModules, supportedModule({ id: "api/fastapi", version: "1.0.0", title: "FastAPI", description: "API" })]
      })
    ).rejects.toThrow("Module api/fastapi is not installed in acme.");

    const plan = await planRemoveModules({ projectDirectory, manifest, moduleIds: ["next"], availableModules });
    expect(plan.modulesToRemove).toEqual(["web/nextjs"]);
  });

  it("refuses to remove a module that remaining modules depend on", async () => {
    const { projectDirectory, manifest } = await createReadmeProject();

    const plan = await planRemoveModules({ projectDirectory, manifest, moduleIds: ["workspace/pnpm-turbo"] });

    expect(plan.safe).toBe(false);
    expect(plan.dependents).toEqual(["web/nextjs"]);
    await expect(applyRemoveModules({ projectDirectory, manifest, moduleIds: ["workspace/pnpm-turbo"] })).rejects.toThrow(
      "Cannot remove workspace/pnpm-turbo: still required by web/nextjs"
    );
  });
});

/** A workspace + Next.js project whose README is exactly what Stackkit renders for those modules. */
async function createReadmeProject() {
  const projectDirectory = await mkdtemp(join(tmpdir(), "stackkit-remove-shared-"));
  tempDirectories.push(projectDirectory);
  const workspaceModule = supportedModule({
    id: "workspace/pnpm-turbo",
    version: "1.0.0",
    title: "Workspace",
    description: "Workspace foundation",
    provides: ["workspace/node"]
  });
  const webModule = supportedModule({
    id: "web/nextjs",
    version: "1.0.0",
    title: "Next.js",
    description: "Next.js app",
    aliases: ["next"],
    requires: ["workspace/node"]
  });
  const readmeWithWeb = buildCreateFilePlan(
    {
      projectName: "acme",
      packageManager: "pnpm",
      workspace: "pnpm-turbo",
      modules: [],
      registries: {},
      ai: { skillTargets: ["codex"], skillMode: "install", linkMode: "copy" }
    },
    [workspaceModule, webModule]
  ).files.find((file) => file.path === "README.md")!.content;
  await writeFile(join(projectDirectory, "README.md"), readmeWithWeb, "utf8");
  const manifest = await writeManifest(
    projectDirectory,
    createManifest({
      ...baseManifest([{ path: "README.md", owner: "docs/readme", hash: hashContent(readmeWithWeb) }]),
      modules: [
        { id: "workspace/pnpm-turbo", version: "1.0.0", options: {}, snapshot: workspaceModule },
        { id: "web/nextjs", version: "1.0.0", options: {}, snapshot: webModule }
      ],
      expectedFiles: [{ path: "README.md", owner: "docs/readme", content: readmeWithWeb, hash: hashContent(readmeWithWeb) }]
    })
  );

  return { projectDirectory, manifest, readmeWithWeb };
}
