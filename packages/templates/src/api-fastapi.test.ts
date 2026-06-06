import { describe, expect, it } from "vitest";

import { renderFastApiService } from "./index.js";

describe("api templates", () => {
  it("renders a FastAPI service", () => {
    const files = renderFastApiService({ serviceName: "api" });

    expect(files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "write",
          path: "apps/api/package.json",
          owner: "api/fastapi",
          overwrite: "if-owned"
        }),
        expect.objectContaining({
          kind: "write",
          path: "apps/api/pyproject.toml",
          owner: "api/fastapi",
          overwrite: "if-owned"
        }),
        expect.objectContaining({
          kind: "write",
          path: "apps/api/app/main.py",
          owner: "api/fastapi",
          content: expect.stringContaining("FastAPI"),
          overwrite: "if-owned"
        }),
        expect.objectContaining({
          kind: "write",
          path: "apps/api/tests/test_health.py",
          owner: "api/fastapi",
          overwrite: "if-owned"
        })
      ])
    );
  });

  it("renders FastAPI package bridge and health test", () => {
    const files = renderFastApiService({ serviceName: "api", projectName: "acme" });
    const packageJson = JSON.parse(files.find((file) => file.path === "apps/api/package.json")?.content ?? "{}");
    const pyproject = files.find((file) => file.path === "apps/api/pyproject.toml")?.content ?? "";

    expect(packageJson.name).toBe("@acme/api");
    expect(packageJson.scripts).toEqual({
      dev: "uv run uvicorn app.main:app --reload",
      test: "uv run pytest",
      typecheck: "uv run mypy .",
      lint: "uv run ruff check .",
      format: "uv run ruff format ."
    });
    expect(pyproject).toContain('"fastapi"');
    expect(pyproject).toContain('"uvicorn[standard]"');
    expect(pyproject).toContain("[dependency-groups]");
    expect(pyproject).toContain('"httpx"');
    expect(pyproject).toContain('"pytest"');
    expect(pyproject).toContain('"ruff"');
    expect(pyproject).toContain('"mypy"');
    // Ruff config now lives in ruff.toml, not embedded in pyproject.
    expect(pyproject).not.toContain("[tool.ruff]");
    expect(files.find((file) => file.path === "apps/api/app/main.py")?.content).toContain('@app.get("/health")');
    expect(files.find((file) => file.path === "apps/api/tests/test_health.py")?.content).toContain("test_health");
  });

  it("uses pyright for typecheck when the pyright choice is selected", () => {
    const files = renderFastApiService({ serviceName: "api", projectName: "acme", pyTypecheck: "pyright" });
    const packageJson = JSON.parse(files.find((file) => file.path === "apps/api/package.json")?.content ?? "{}");
    const pyproject = files.find((file) => file.path === "apps/api/pyproject.toml")?.content ?? "";

    expect(packageJson.scripts.typecheck).toBe("uv run pyright .");
    expect(pyproject).toContain('"pyright"');
    expect(pyproject).not.toContain('"mypy"');
    expect(pyproject).toContain('"ruff"');
  });
});
