import { describe, expect, it } from "vitest";

import { defineModule, resolveAiSkills } from "./index.js";

describe("resolveAiSkills", () => {
  it("resolves official skill sources for core web, API, database, auth, and deployment modules", () => {
    const skills = resolveAiSkills([
      defineModule({
        id: "ui/shadcn",
        version: "1.0.0",
        title: "ShadCN",
        description: "ShadCN UI",
        aiSkills: [
          {
            source: "https://github.com/shadcn/ui",
            skills: ["shadcn"],
            trust: "official",
            causedBy: "ui/shadcn",
            reason: "ShadCN UI components"
          }
        ]
      }),
      defineModule({
        id: "api/fastapi",
        version: "1.0.0",
        title: "FastAPI",
        description: "FastAPI service",
        aiSkills: [
          {
            source: "https://github.com/fastapi/fastapi",
            skills: ["fastapi"],
            trust: "official",
            causedBy: "api/fastapi",
            reason: "FastAPI service code"
          }
        ]
      }),
      defineModule({
        id: "db/postgres",
        version: "1.0.0",
        title: "Postgres",
        description: "Postgres database",
        aiSkills: [
          {
            source: "https://github.com/supabase/agent-skills",
            skills: ["supabase-postgres-best-practices"],
            trust: "official",
            causedBy: "db/postgres",
            reason: "General Postgres guidance"
          }
        ]
      }),
      defineModule({
        id: "postgres/neon",
        version: "1.0.0",
        title: "Neon",
        description: "Neon Postgres provider",
        aiSkills: [
          {
            source: "https://github.com/neondatabase/agent-skills",
            skills: ["neon-postgres", "neon-postgres-branches"],
            trust: "official",
            causedBy: "postgres/neon",
            reason: "Neon provider guidance"
          }
        ]
      }),
      defineModule({
        id: "auth/clerk",
        version: "1.0.0",
        title: "Clerk",
        description: "Clerk auth",
        aiSkills: [
          {
            source: "https://github.com/clerk/skills",
            skills: ["clerk-setup", "clerk-nextjs-patterns", "clerk-testing"],
            trust: "official",
            causedBy: "auth/clerk",
            reason: "Clerk with Next.js and test scaffolding"
          }
        ]
      }),
      defineModule({
        id: "auth/better-auth",
        version: "1.0.0",
        title: "Better Auth",
        description: "Self-hosted TypeScript auth",
        aiSkills: [
          {
            source: "https://github.com/better-auth/skills",
            skills: [
              "better-auth-best-practices",
              "create-auth-skill",
              "better-auth-security-best-practices",
              "email-and-password-best-practices",
              "organization-best-practices",
              "two-factor-authentication-best-practices"
            ],
            trust: "official",
            causedBy: "auth/better-auth",
            reason: "Better Auth baseline and selected capabilities"
          }
        ]
      }),
      defineModule({
        id: "auth/auth0",
        version: "1.0.0",
        title: "Auth0",
        description: "Auth0 adapters",
        aiSkills: [
          {
            source: "https://github.com/auth0/agent-skills",
            skills: ["auth0-nextjs", "auth0-fastapi-api", "auth0-flask"],
            trust: "official",
            causedBy: "auth/auth0",
            reason: "Auth0 framework-specific integrations"
          }
        ]
      }),
      defineModule({
        id: "deploy/vercel",
        version: "1.0.0",
        title: "Vercel",
        description: "Vercel deployment",
        aiSkills: [
          {
            source: "https://github.com/vercel-labs/agent-skills",
            skills: ["deploy-to-vercel"],
            trust: "official",
            causedBy: "deploy/vercel",
            reason: "Vercel deployment"
          }
        ]
      })
    ]);

    expect(skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "https://github.com/shadcn/ui", skills: ["shadcn"], trust: "official" }),
        expect.objectContaining({ source: "https://github.com/fastapi/fastapi", skills: ["fastapi"], trust: "official" }),
        expect.objectContaining({
          source: "https://github.com/supabase/agent-skills",
          skills: ["supabase-postgres-best-practices"],
          trust: "official"
        }),
        expect.objectContaining({
          source: "https://github.com/neondatabase/agent-skills",
          skills: ["neon-postgres", "neon-postgres-branches"],
          trust: "official"
        }),
        expect.objectContaining({
          source: "https://github.com/clerk/skills",
          skills: ["clerk-setup", "clerk-nextjs-patterns", "clerk-testing"],
          trust: "official"
        }),
        expect.objectContaining({
          source: "https://github.com/better-auth/skills",
          skills: [
            "better-auth-best-practices",
            "create-auth-skill",
            "better-auth-security-best-practices",
            "email-and-password-best-practices",
            "organization-best-practices",
            "two-factor-authentication-best-practices"
          ],
          trust: "official"
        }),
        expect.objectContaining({
          source: "https://github.com/auth0/agent-skills",
          skills: ["auth0-nextjs", "auth0-fastapi-api", "auth0-flask"],
          trust: "official"
        }),
        expect.objectContaining({
          source: "https://github.com/vercel-labs/agent-skills",
          skills: ["deploy-to-vercel"],
          trust: "official"
        })
      ])
    );
  });

  it("uses allowlisted curated sources without installing unrelated skills", () => {
    const skills = resolveAiSkills(
      [
        defineModule({
          id: "web/django",
          version: "1.0.0",
          title: "Django",
          description: "Django app",
          aiSkills: [
            {
              source: "https://github.com/affaan-m/everything-claude-code",
              skills: ["django-patterns", "django-security", "django-tdd", "django-verification"],
              trust: "curated",
              causedBy: "web/django",
              reason: "Allowlisted Django guidance"
            }
          ]
        }),
        defineModule({
          id: "rust/tokio",
          version: "1.0.0",
          title: "Tokio",
          description: "Async Rust runtime",
          aiSkills: [
            {
              source: "https://github.com/wshobson/agents",
              skills: ["rust-async-patterns"],
              trust: "curated",
              causedBy: "rust/tokio",
              reason: "Async Rust guidance"
            }
          ]
        }),
        defineModule({
          id: "desktop/tauri",
          version: "1.0.0",
          title: "Tauri",
          description: "Tauri desktop app",
          aiSkills: [
            {
              source: "https://github.com/nodnarbnitram/claude-code-extensions",
              skills: ["tauri-v2"],
              trust: "curated",
              causedBy: "desktop/tauri",
              reason: "Tauri v2 guidance"
            }
          ]
        })
      ],
      {
        curatedAllowlist: [
          "https://github.com/affaan-m/everything-claude-code",
          "https://github.com/wshobson/agents",
          "https://github.com/nodnarbnitram/claude-code-extensions"
        ]
      }
    );

    expect(skills).toEqual([
      expect.objectContaining({
        source: "https://github.com/affaan-m/everything-claude-code",
        skills: ["django-patterns", "django-security", "django-tdd", "django-verification"],
        trust: "curated"
      }),
      expect.objectContaining({
        source: "https://github.com/wshobson/agents",
        skills: ["rust-async-patterns"],
        trust: "curated"
      }),
      expect.objectContaining({
        source: "https://github.com/nodnarbnitram/claude-code-extensions",
        skills: ["tauri-v2"],
        trust: "curated"
      })
    ]);
  });

  it("records unaccepted sources as unresolved instead of failing generation", () => {
    const skills = resolveAiSkills([
      defineModule({
        id: "api/unknown",
        version: "1.0.0",
        title: "Unknown API",
        description: "Unknown API module",
        aiSkills: [
          {
            source: "https://github.com/example/random-skills",
            skills: ["random-api"],
            trust: "curated",
            causedBy: "api/unknown",
            reason: "Untrusted source"
          }
        ]
      })
    ]);

    expect(skills).toEqual([
      expect.objectContaining({
        source: "https://github.com/example/random-skills",
        skills: ["random-api"],
        trust: "unresolved",
        causedBy: "api/unknown"
      })
    ]);
  });

  it("preserves local guidance fallbacks for modules without accepted skill sources", () => {
    const skills = resolveAiSkills([
      defineModule({
        id: "deploy/kubernetes",
        version: "1.0.0",
        title: "Kubernetes",
        description: "Kubernetes deployment",
        aiSkills: [
          {
            skills: ["stackkit-kubernetes-guidance"],
            trust: "local",
            causedBy: "deploy/kubernetes",
            reason: "No accepted official or curated Kubernetes skill source"
          }
        ]
      })
    ]);

    expect(skills).toEqual([
      expect.objectContaining({
        skills: ["stackkit-kubernetes-guidance"],
        trust: "local",
        causedBy: "deploy/kubernetes"
      })
    ]);
  });
});
