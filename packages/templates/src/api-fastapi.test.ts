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
    expect(pyproject).toContain('"fastapi>=0.135,<1"');
    expect(pyproject).toContain('"uvicorn[standard]>=0.41,<1"');
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

  it("renders the supported SQLAlchemy, Alembic, Auth0, and Todo vertical slice", () => {
    const files = renderFastApiService({
      serviceName: "api",
      projectName: "acme",
      withSqlAlchemy: true,
      withAuth0: true
    });
    const paths = files.map((file) => file.path);
    const pyproject = files.find((file) => file.path === "apps/api/pyproject.toml")?.content ?? "";
    const main = files.find((file) => file.path === "apps/api/app/main.py")?.content ?? "";
    const migrationEnv = files.find((file) => file.path === "apps/api/migrations/env.py")?.content ?? "";
    const model = files.find((file) => file.path === "apps/api/app/models.py")?.content ?? "";
    const repository = files.find((file) => file.path === "apps/api/app/repository.py")?.content ?? "";
    const todoTests = files.find((file) => file.path === "apps/api/tests/test_todos.py")?.content ?? "";
    const auth = files.find((file) => file.path === "apps/api/app/auth.py")?.content ?? "";

    expect(pyproject).toContain('"sqlalchemy>=2.0,<3"');
    expect(pyproject).toContain('"pyjwt[crypto]>=2.13,<3"');
    expect(paths).toEqual(
      expect.arrayContaining([
        "apps/api/alembic.ini",
        "apps/api/migrations/env.py",
        "apps/api/migrations/versions/0001_create_todos.py",
        "apps/api/app/auth.py",
        "apps/api/app/database.py",
        "apps/api/app/models.py",
        "apps/api/app/repository.py",
        "apps/api/app/routes/todos.py",
        "apps/api/tests/test_auth.py",
        "apps/api/tests/test_todos.py"
      ])
    );
    expect(main).toContain('@app.get("/ready")');
    expect(main).toContain("app.include_router(todos.router)");
    expect(migrationEnv).toContain("from app.database import Base, DATABASE_URL");
    expect(migrationEnv).not.toContain('os.environ["DATABASE_URL"]');
    expect(model).toContain("owner_sub:");
    expect(repository).toContain("Todo.owner_sub == owner_sub");
    expect(todoTests).toContain('current_user["sub"] = "another-user"');
    expect(auth).toContain('os.environ.get("AUTH0_JWKS_URL")');
  });
});
