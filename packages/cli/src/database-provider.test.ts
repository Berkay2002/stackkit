import { describe, expect, it } from "vitest";

import { createDryRunPlanFromConfig } from "./index.js";

describe("create --db-provider / --db-runtime", () => {
  it("resolves a provider module from --db-provider", async () => {
    const plan = await createDryRunPlanFromConfig({
      name: "acme",
      axes: { web: "next", db: "postgres", dbProvider: "neon" }
    });

    expect(plan.modules.map((module) => module.id)).toContain("postgres/neon");
  });

  it("emits the Neon serverless client when --db-runtime edge is set", async () => {
    const plan = await createDryRunPlanFromConfig({
      name: "acme",
      axes: { web: "next", db: "postgres", dbProvider: "neon" },
      dbRuntime: "edge"
    });

    const client = plan.filePlan.files.find((file) => file.path === "apps/web/db/client.ts");
    expect(client?.content).toContain("@neondatabase/serverless");
  });

  it("errors when --db-provider is used without a Postgres database", async () => {
    await expect(
      createDryRunPlanFromConfig({ name: "acme", axes: { web: "next", dbProvider: "neon" } })
    ).rejects.toThrow(/--db-provider requires/);
  });

  it("defaults to the standard client without --db-runtime edge", async () => {
    const plan = await createDryRunPlanFromConfig({
      name: "acme",
      axes: { web: "next", db: "postgres", dbProvider: "neon" }
    });

    const client = plan.filePlan.files.find((file) => file.path === "apps/web/db/client.ts");
    expect(client?.content).toContain("drizzle-orm/node-postgres");
  });
});

describe("create --ui", () => {
  it("threads --ui none through create axes", async () => {
    const plan = await createDryRunPlanFromConfig({ name: "demo", axes: { web: "vite", ui: "none" } });
    expect(plan.modules.map((m) => m.id)).not.toContain("ui/shadcn");
    expect(plan.modules.map((m) => m.id)).toContain("web/vite");
  });

  it("defaults to shadcn for --web vite when --ui omitted", async () => {
    const plan = await createDryRunPlanFromConfig({ name: "demo", axes: { web: "vite" } });
    expect(plan.modules.map((m) => m.id)).toContain("ui/shadcn");
  });
});
