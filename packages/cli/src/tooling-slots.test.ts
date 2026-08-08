import { describe, expect, it } from "vitest";

import { createDryRunPlanFromConfig } from "./index.js";

describe("create --ts-quality / --py-typecheck", () => {
  it("resolves quality/biome and suppresses eslint/prettier for --ts-quality biome", async () => {
    const plan = await createDryRunPlanFromConfig({
      name: "acme",
      includePreview: true,
      axes: { web: "next", tsQuality: "biome" }
    });

    const ids = plan.modules.map((module) => module.id);
    expect(ids).toContain("quality/biome");
    expect(ids).not.toContain("quality/eslint");
    expect(ids).not.toContain("quality/prettier");
  });

  it("gap-fills eslint/prettier and omits biome for the default --ts-quality eslint-prettier", async () => {
    const plan = await createDryRunPlanFromConfig({
      name: "acme",
      axes: { web: "next", tsQuality: "eslint-prettier" }
    });

    const ids = plan.modules.map((module) => module.id);
    expect(ids).toContain("quality/eslint");
    expect(ids).toContain("quality/prettier");
    expect(ids).not.toContain("quality/biome");
  });

  it("resolves quality/pyright and suppresses mypy for --py-typecheck pyright", async () => {
    const plan = await createDryRunPlanFromConfig({
      name: "acme",
      includePreview: true,
      axes: { api: "fastapi", pyTypecheck: "pyright" }
    });

    const ids = plan.modules.map((module) => module.id);
    expect(ids).toContain("quality/pyright");
    expect(ids).not.toContain("quality/mypy");
  });

  it("gap-fills mypy and omits pyright for the default --py-typecheck mypy", async () => {
    const plan = await createDryRunPlanFromConfig({
      name: "acme",
      axes: { api: "fastapi", pyTypecheck: "mypy" }
    });

    const ids = plan.modules.map((module) => module.id);
    expect(ids).toContain("quality/mypy");
    expect(ids).not.toContain("quality/pyright");
  });

  it("rejects an invalid --ts-quality value", async () => {
    await expect(
      createDryRunPlanFromConfig({ name: "acme", axes: { web: "next", tsQuality: "rome" as never } })
    ).rejects.toThrow(/--ts-quality/);
  });

  it("rejects an invalid --py-typecheck value", async () => {
    await expect(
      createDryRunPlanFromConfig({ name: "acme", axes: { api: "fastapi", pyTypecheck: "pytype" as never } })
    ).rejects.toThrow(/--py-typecheck/);
  });
});
