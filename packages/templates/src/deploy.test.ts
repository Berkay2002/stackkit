import { describe, expect, it } from "vitest";

import {
  type DockerEnvVar,
  renderDockerFiles,
  renderKubernetesFiles,
  renderPostgresLocalFiles,
  renderVercelFiles
} from "./index.js";

describe("deploy templates", () => {
  it("renders Vercel, Docker, and Kubernetes files", () => {
    expect(renderVercelFiles()).toEqual([
      expect.objectContaining({
        kind: "write",
        path: "vercel.json",
        owner: "deploy/vercel",
        overwrite: "if-owned"
      })
    ]);

    expect(renderDockerFiles()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "write",
          path: "docker-compose.yml",
          owner: "deploy/docker",
          overwrite: "if-owned"
        }),
        expect.objectContaining({
          kind: "write",
          path: "apps/web/Dockerfile",
          owner: "deploy/docker",
          overwrite: "if-owned"
        })
      ])
    );

    expect(renderKubernetesFiles()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "write",
          path: "deploy/kubernetes/web-deployment.yaml",
          owner: "deploy/kubernetes",
          overwrite: "if-owned"
        })
      ])
    );
  });

  it("builds web from the repository root so workspace packages resolve", () => {
    const files = renderDockerFiles();
    const compose = files.find((file) => file.path === "docker-compose.yml")?.content ?? "";
    const dockerfile = files.find((file) => file.path === "apps/web/Dockerfile")?.content ?? "";

    // The build context must be the repo root, not ./apps/web, otherwise packages/* (referenced
    // through workspace:* dependencies) are absent and a frozen install fails.
    expect(compose).toContain("context: .");
    expect(compose).toContain("dockerfile: apps/web/Dockerfile");
    expect(compose).not.toContain("build: ./apps/web");
    // Install and build happen at the workspace root; the app is started from its own directory.
    expect(dockerfile).toContain("WORKDIR /app/apps/web");
  });

  it("renders Docker commands for the selected package manager", () => {
    const files = renderDockerFiles({
      packageManagerName: "bun",
      installCommand: ["bun", "install"],
      runBuildCommand: ["bun", "run", "build"],
      runStartCommand: ["bun", "run", "start"]
    });
    const dockerfile = files.find((file) => file.path === "apps/web/Dockerfile")?.content ?? "";

    expect(dockerfile).toContain("RUN bun install");
    expect(dockerfile).toContain("RUN bun run build");
    expect(dockerfile).toContain('CMD ["bun", "run", "start"]');
    expect(dockerfile).not.toContain("pnpm");
  });

  it("renders Docker Corepack setup for Yarn", () => {
    const files = renderDockerFiles({
      packageManagerName: "yarn",
      installCommand: ["corepack", "enable", "&&", "yarn", "install"],
      runBuildCommand: ["yarn", "build"],
      runStartCommand: ["yarn", "start"]
    });
    const dockerfile = files.find((file) => file.path === "apps/web/Dockerfile")?.content ?? "";

    expect(dockerfile).toContain("FROM node:22-alpine");
    expect(dockerfile).toContain("RUN corepack enable && yarn install");
    expect(dockerfile).toContain("RUN yarn build");
    expect(dockerfile).toContain('CMD ["yarn", "start"]');
  });

  it("renders FastAPI Docker and Kubernetes files when an API service is selected", () => {
    const dockerFiles = renderDockerFiles({ serviceTargets: ["api"] });
    const compose = dockerFiles.find((file) => file.path === "docker-compose.yml")?.content ?? "";
    const dockerfile = dockerFiles.find((file) => file.path === "apps/api/Dockerfile")?.content ?? "";

    expect(compose).toContain("api:");
    expect(compose).toContain("context: .");
    expect(compose).toContain("dockerfile: apps/api/Dockerfile");
    expect(compose).not.toContain("build: ./apps/api");
    expect(compose).toContain('"8000:8000"');
    expect(dockerfile).toContain("FROM python:3.13-slim");
    expect(dockerfile).toContain("WORKDIR /app/apps/api");
    expect(dockerfile).toContain('"uvicorn", "app.main:app"');

    expect(renderKubernetesFiles({ serviceTargets: ["api"] })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "write",
          path: "deploy/kubernetes/api-deployment.yaml",
          owner: "deploy/kubernetes",
          overwrite: "if-owned"
        })
      ])
    );
  });

  it("renders the golden web, API, and Postgres topology", () => {
    const files = renderDockerFiles({
      serviceTargets: ["web", "api"],
      envVars: [...auth0EnvVars, { name: "DATABASE_URL", required: true, target: "api" }],
      withPostgres: true,
      withSqlAlchemy: true
    });
    const compose = files.find((file) => file.path === "docker-compose.yml")?.content ?? "";
    const apiDockerfile = files.find((file) => file.path === "apps/api/Dockerfile")?.content ?? "";

    expect(compose).toContain("image: postgres:17-alpine");
    expect(serviceEnvironment(compose, "web")).toEqual([
      "API_BASE_URL=http://api:8000",
      "APP_BASE_URL=${APP_BASE_URL:-http://localhost:3000}",
      "AUTH0_ALLOW_INSECURE_REQUESTS=${AUTH0_ALLOW_INSECURE_REQUESTS:-}",
      "AUTH0_AUDIENCE=${AUTH0_AUDIENCE}",
      "AUTH0_CLIENT_ID=${AUTH0_CLIENT_ID}",
      "AUTH0_DOMAIN=${AUTH0_DOMAIN}"
    ]);
    expect(serviceEnvironment(compose, "api")).toEqual([
      "AUTH0_AUDIENCE=${AUTH0_AUDIENCE}",
      "AUTH0_DOMAIN=${AUTH0_DOMAIN}",
      "AUTH0_ISSUER=${AUTH0_ISSUER:-}",
      "DATABASE_URL=postgresql+psycopg://postgres:postgres@db:5432/app"
    ]);
    expect(compose).toContain("pg_isready -U postgres -d app");
    expect(compose).toContain("db:\n        condition: service_healthy");
    expect(files.find((file) => file.path === ".dockerignore")?.content).toContain(".env.*");
    expect(apiDockerfile).toContain("alembic upgrade head && uvicorn");
  });

  it("gives the API its Auth0 env when auth is selected without a database", () => {
    const compose = renderDockerFiles({ serviceTargets: ["web", "api"], envVars: auth0EnvVars })[0]?.content ?? "";

    expect(serviceEnvironment(compose, "api")).toEqual([
      "AUTH0_AUDIENCE=${AUTH0_AUDIENCE}",
      "AUTH0_DOMAIN=${AUTH0_DOMAIN}",
      "AUTH0_ISSUER=${AUTH0_ISSUER:-}"
    ]);
    expect(compose).not.toContain("db:");
  });

  it("passes no Auth0 env when only a database is selected", () => {
    const compose =
      renderDockerFiles({
        serviceTargets: ["web", "api"],
        envVars: [{ name: "DATABASE_URL", required: true, target: "api" }],
        withPostgres: true
      })[0]?.content ?? "";

    expect(compose).not.toContain("AUTH0");
    expect(serviceEnvironment(compose, "web")).toEqual([]);
    expect(serviceEnvironment(compose, "api")).toEqual(["DATABASE_URL=postgresql+psycopg://postgres:postgres@db:5432/app"]);
  });

  it("builds a lean, non-root API image from only the API service", () => {
    const dockerfile = renderDockerFiles({ serviceTargets: ["api"] }).find((file) => file.path === "apps/api/Dockerfile")?.content ?? "";

    expect(dockerfile).not.toContain("COPY . .");
    expect(dockerfile).toContain("COPY apps/api ./");
    expect(dockerfile).toContain("uv sync --locked --no-dev");
    expect(dockerfile).toContain("USER app");
  });

  it("shares one Postgres service definition between docker-compose.yml and docker-compose.db.yml", () => {
    const compose = renderDockerFiles({ serviceTargets: ["api"], withPostgres: true })[0]?.content ?? "";
    const [dbCompose] = renderPostgresLocalFiles();
    const dbService = (content: string) => content.slice(content.indexOf("\n  db:\n"), content.indexOf("\nvolumes:\n  pgdata:"));

    expect(dbCompose).toEqual(expect.objectContaining({ path: "docker-compose.db.yml", owner: "postgres/local" }));
    expect(dbService(dbCompose?.content ?? "")).toBe(dbService(compose));
    expect(dbService(compose)).toContain("image: postgres:17-alpine");
  });
});

const auth0EnvVars: DockerEnvVar[] = [
  { name: "AUTH0_DOMAIN", required: true, target: "root" },
  { name: "AUTH0_AUDIENCE", required: true, target: "root" },
  { name: "AUTH0_CLIENT_ID", required: true, target: "web" },
  { name: "APP_BASE_URL", required: true, target: "web" },
  { name: "API_BASE_URL", required: true, target: "web" },
  { name: "AUTH0_ALLOW_INSECURE_REQUESTS", required: false, target: "web" },
  { name: "AUTH0_ISSUER", required: false, target: "api" }
];

function serviceEnvironment(compose: string, service: string): string[] {
  const block = compose.split(/\n(?=  \w)/).find((section) => section.trimStart().startsWith(`${service}:`)) ?? "";
  return [...block.matchAll(/^ {6}- (\w+=.*)$/gm)].map((match) => match[1] ?? "");
}
