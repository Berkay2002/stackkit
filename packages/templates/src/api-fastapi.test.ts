import { describe, expect, it } from "vitest";

import { renderFastApiService } from "./index.js";

describe("api templates", () => {
  it("renders a FastAPI service", () => {
    const files = renderFastApiService({ serviceName: "api" });

    expect(files).toEqual(
      expect.arrayContaining([
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
          owner: "quality/pytest",
          overwrite: "if-owned"
        })
      ])
    );
  });
});
