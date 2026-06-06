import { describe, expect, it } from "vitest";

import { builtinModules } from "./index.js";

const byId = (id: string) => builtinModules.find((module) => module.id === id);

const nativeInitializersFor = (id: string) => {
  const module = byId(id);
  expect(module, id).toBeDefined();
  return module!.nativeInitializers ?? [];
};

const nativeInitializerByName = (id: string, name: string) => {
  const initializer = nativeInitializersFor(id).find((candidate) => candidate.name === name);
  expect(initializer, `${id} native initializer ${name}`).toBeDefined();
  return initializer!;
};

describe("builtin native initializers", () => {
  it("enables shadcn init for ui/shadcn", () => {
    const initializer = nativeInitializerByName("ui/shadcn", "shadcn init");

    expect(initializer).toMatchObject({
      enabled: true,
      name: "shadcn init",
      tool: {
        execution: "package-manager-dlx",
        package: "shadcn@latest"
      },
      mutationPolicy: "merge-owned"
    });
  });

  it("enables clerk init for auth/clerk", () => {
    const initializer = nativeInitializerByName("auth/clerk", "clerk init");

    expect(initializer).toMatchObject({
      enabled: true,
      name: "clerk init",
      tool: {
        execution: "package-manager-dlx",
        package: "clerk@latest"
      },
      mutationPolicy: "external-state"
    });
    expect(initializer.args).toEqual(expect.arrayContaining(["--keyless", "--yes", "--no-skills"]));
    expect(initializer.redactExpectedFiles).toContain("apps/web/.env.local");
  });

  it("keeps researched scaffold candidates disabled with reasons", () => {
    const researchedCandidates = [
      "web/nextjs",
      "web/vite",
      "web/tanstack-start",
      "db/prisma",
      "postgres/supabase-local",
      "quality/biome",
      "workspace/pnpm-turbo",
      "web/django",
      "rust/axum",
      "desktop/tauri"
    ];

    for (const id of researchedCandidates) {
      const disabledInitializer = nativeInitializersFor(id).find((initializer) => initializer.enabled === false);

      expect(disabledInitializer, `${id} disabled native initializer`).toBeDefined();
      expect(disabledInitializer!.disabledReason, `${id} disabled reason`).toEqual(expect.any(String));
      expect(disabledInitializer!.disabledReason!.length, `${id} disabled reason length`).toBeGreaterThan(0);
    }
  });
});
