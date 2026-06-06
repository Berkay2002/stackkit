import { describe, expect, it } from "vitest";

import { renderDatabaseClient } from "./index.js";

const clientFile = (files: ReturnType<typeof renderDatabaseClient>, suffix: string) =>
  files.find((file) => file.path.endsWith(suffix));

describe("renderDatabaseClient", () => {
  it("emits a standard node-postgres Drizzle client by default", () => {
    const files = renderDatabaseClient({ client: "drizzle", runtime: "node" });
    const file = clientFile(files, "apps/web/db/client.ts");

    expect(file).toBeDefined();
    expect(file!.owner).toBe("db/drizzle");
    expect(file!.content).toContain('from "drizzle-orm/node-postgres"');
    expect(file!.content).toContain('from "pg"');
  });

  it("emits the neon-http serverless client for neon + edge", () => {
    const files = renderDatabaseClient({ client: "drizzle", runtime: "edge", provider: "postgres/neon" });
    const file = clientFile(files, "apps/web/db/client.ts");

    expect(file!.content).toContain('from "drizzle-orm/neon-http"');
    expect(file!.content).toContain('from "@neondatabase/serverless"');
  });

  it("falls back to the standard client for edge with a non-neon provider", () => {
    const files = renderDatabaseClient({ client: "drizzle", runtime: "edge", provider: "postgres/supabase" });
    const file = clientFile(files, "apps/web/db/client.ts");

    expect(file!.content).toContain('from "drizzle-orm/node-postgres"');
  });

  it("emits a Prisma datasource with directUrl for Supabase", () => {
    const files = renderDatabaseClient({ client: "prisma", provider: "postgres/supabase" });
    const file = clientFile(files, "apps/web/prisma/schema.prisma");

    expect(file).toBeDefined();
    expect(file!.owner).toBe("db/prisma");
    expect(file!.content).toContain('provider  = "postgresql"');
    expect(file!.content).toContain('directUrl = env("DIRECT_URL")');
  });

  it("omits directUrl for a non-Supabase Prisma datasource", () => {
    const files = renderDatabaseClient({ client: "prisma", provider: "postgres/neon" });
    const file = clientFile(files, "apps/web/prisma/schema.prisma");

    expect(file!.content).not.toContain("directUrl");
  });
});
