import { describe, expect, it } from "vitest";

import { resolveAiSkills } from "@stackkit/core";

import { builtinModules, curatedSkillSourceAllowlist } from "./index.js";

describe("builtin AI skill registry", () => {
  it("contains official AI skill sources verified in the Stackkit plan", () => {
    const skills = resolveAiSkills(builtinModules);

    expect(skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "https://github.com/shadcn/ui", skills: ["shadcn"], causedBy: "ui/shadcn" }),
        expect.objectContaining({ source: "https://github.com/fastapi/fastapi", skills: ["fastapi"], causedBy: "api/fastapi" }),
        expect.objectContaining({
          source: "https://github.com/vercel-labs/agent-skills",
          skills: ["vercel-react-best-practices"],
          causedBy: "web/nextjs"
        }),
        expect.objectContaining({
          source: "https://github.com/vercel-labs/agent-skills",
          skills: ["deploy-to-vercel"],
          causedBy: "deploy/vercel"
        }),
        expect.objectContaining({
          source: "https://github.com/supabase/agent-skills",
          skills: ["supabase-postgres-best-practices"],
          causedBy: "db/postgres"
        }),
        expect.objectContaining({
          source: "https://github.com/neondatabase/agent-skills",
          skills: ["neon-postgres", "neon-postgres-branches"],
          causedBy: "postgres/neon"
        }),
        expect.objectContaining({
          source: "https://github.com/clerk/skills",
          skills: ["clerk-setup", "clerk-nextjs-patterns", "clerk-testing"],
          causedBy: "auth/clerk"
        }),
        expect.objectContaining({
          source: "https://github.com/better-auth/skills",
          skills: ["better-auth-best-practices", "create-auth-skill", "better-auth-security-best-practices"],
          causedBy: "auth/better-auth"
        }),
        expect.objectContaining({
          source: "https://github.com/auth0/agent-skills",
          skills: ["auth0-nextjs"],
          causedBy: "auth/auth0-nextjs"
        }),
        expect.objectContaining({
          source: "https://github.com/auth0/agent-skills",
          skills: ["auth0-fastapi-api"],
          causedBy: "auth/auth0-fastapi"
        }),
        expect.objectContaining({
          source: "https://github.com/auth0/agent-skills",
          skills: ["auth0-flask"],
          causedBy: "auth/auth0-flask"
        })
      ])
    );
  });

  it("resolves curated candidates only when Stackkit passes its allowlist", () => {
    const skills = resolveAiSkills(builtinModules, { curatedAllowlist: curatedSkillSourceAllowlist });

    expect(skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "https://github.com/affaan-m/everything-claude-code",
          skills: ["django-patterns", "django-security", "django-tdd", "django-verification"],
          causedBy: "web/django"
        }),
        expect.objectContaining({
          source: "https://github.com/wshobson/agents",
          skills: ["rust-async-patterns"],
          causedBy: "rust/tokio"
        }),
        expect.objectContaining({
          source: "https://github.com/nodnarbnitram/claude-code-extensions",
          skills: ["tauri-v2"],
          causedBy: "desktop/tauri"
        })
      ])
    );
  });
});
