"use client";

import {
  Check,
  ChevronRight,
  Copy,
  Terminal
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  siAuth0,
  siBetterauth,
  siClerk,
  siDjango,
  siDocker,
  siFastapi,
  siKubernetes,
  siNeon,
  siNextdotjs,
  siPostgresql,
  siRust,
  siShadcnui,
  siSupabase,
  siTailwindcss,
  siTanstack,
  siVercel,
  siVite,
  type SimpleIcon
} from "simple-icons";

import {
  buildCustomizerState,
  createInitialCustomizerState,
  isDeployChoiceSupported,
  normalizeCustomizerState,
  type AiSkillModeChoice,
  type ApiChoice,
  type AuthChoice,
  type CustomizerState,
  type DatabaseChoice,
  type DatabaseProviderChoice,
  type DeployChoice,
  type PyTypecheckChoice,
  type TsQualityChoice,
  type UiChoice,
  type WebChoice
} from "../src/stackkit-customizer";

type Choice<T extends string> = {
  value: T;
  label: string;
  description: string;
  icon?: SimpleIcon;
  iconLabel?: string;
};

const webChoices: Choice<WebChoice>[] = [
  { value: "nextjs", label: "Next.js", description: "React app with shadcn/ui", icon: siNextdotjs },
  { value: "vite", label: "Vite", description: "React SPA with Vite", icon: siVite },
  { value: "tanstack", label: "TanStack Start", description: "Full-stack React", icon: siTanstack },
  { value: "django", label: "Django", description: "Python web app baseline", icon: siDjango },
  { value: "none", label: "No web app", description: "API or service only", iconLabel: "None" }
];

const uiChoices: Choice<UiChoice>[] = [
  { value: "shadcn", label: "ShadCN", description: "shadcn/ui components", icon: siShadcnui },
  { value: "tailwind", label: "Tailwind", description: "Tailwind CSS only", icon: siTailwindcss },
  { value: "none", label: "No UI kit", description: "Plain framework", iconLabel: "None" }
];

const apiChoices: Choice<ApiChoice>[] = [
  { value: "none", label: "No API", description: "Frontend-only stack", iconLabel: "None" },
  { value: "fastapi", label: "FastAPI", description: "Python service", icon: siFastapi },
  { value: "axum", label: "Axum", description: "Rust API service", icon: siRust }
];

const databaseChoices: Choice<DatabaseChoice>[] = [
  { value: "none", label: "No database", description: "Skip persistence", iconLabel: "None" },
  { value: "postgres", label: "Postgres", description: "Adds matching client defaults", icon: siPostgresql }
];

const databaseProviderChoices: Choice<DatabaseProviderChoice>[] = [
  { value: "byo", label: "Bring your own", description: "Provide your own DATABASE_URL", iconLabel: "URL" },
  { value: "neon", label: "Neon", description: "Serverless Postgres in the cloud", icon: siNeon },
  { value: "supabase", label: "Supabase", description: "Hosted Postgres (host only)", icon: siSupabase },
  { value: "supabase-local", label: "Supabase (local)", description: "Local stack via the Supabase CLI", icon: siSupabase },
  { value: "postgres-local", label: "Postgres (Docker)", description: "Local Postgres compose service", icon: siDocker }
];

const authChoices: Choice<AuthChoice>[] = [
  { value: "none", label: "No auth", description: "Keep auth out", iconLabel: "None" },
  { value: "auth0", label: "Auth0", description: "Framework-aware Auth0 modules", icon: siAuth0 },
  { value: "clerk", label: "Clerk", description: "Hosted auth for React", icon: siClerk },
  { value: "better-auth", label: "Better Auth", description: "Self-hosted TypeScript auth", icon: siBetterauth }
];

const deployChoices: Choice<DeployChoice>[] = [
  { value: "vercel", label: "Vercel", description: "Web deployment", icon: siVercel },
  { value: "docker", label: "Docker", description: "Next.js container files", icon: siDocker },
  { value: "kubernetes", label: "Kubernetes", description: "Adds Docker and manifests", icon: siKubernetes }
];

const tsQualityChoices: Choice<TsQualityChoice>[] = [
  { value: "eslint-prettier", label: "ESLint + Prettier", description: "Default lint and format", iconLabel: "ES+P" },
  { value: "biome", label: "Biome", description: "Combined linter and formatter", iconLabel: "Biome" }
];

const pyTypecheckChoices: Choice<PyTypecheckChoice>[] = [
  { value: "mypy", label: "mypy", description: "Default Python type checker", iconLabel: "mypy" },
  { value: "pyright", label: "pyright", description: "Alternative Python type checker", iconLabel: "pyr" }
];

const aiModeChoices: Choice<AiSkillModeChoice>[] = [
  { value: "install", label: "Install skills", description: "Write skill files during create", iconLabel: "Add" },
  { value: "plan", label: "Plan only", description: "Show skill install plan", iconLabel: "Plan" },
  { value: "skip", label: "Skip skills", description: "No skill installation", iconLabel: "Skip" }
];

export default function Page() {
  const [state, setState] = useState<CustomizerState>(() => createInitialCustomizerState());
  const [copied, setCopied] = useState(false);
  const result = useMemo(() => buildCustomizerState(state), [state]);

  function patch(next: Partial<CustomizerState>) {
    setCopied(false);
    setState((current) => normalizeCustomizerState({ ...current, ...next }));
  }

  async function copyCommand() {
    if (!result.ok) {
      return;
    }

    await navigator.clipboard.writeText(result.command);
    setCopied(true);
  }

  return (
    <>
      <a className="skip-link" href="#builder">
        Skip to builder
      </a>
      <main className="shell">
      <section className="intro">
        <div>
          <h1>Build a monorepo starter without memorizing flags.</h1>
        </div>
        <div className="project-row">
          <label>
            Project
            <input
              value={state.projectName}
              onChange={(event) => patch({ projectName: event.target.value })}
              placeholder="my-stack"
            />
          </label>
          <label>
            Package manager
            <select
              value={state.packageManager}
              onChange={(event) => patch({ packageManager: event.target.value as CustomizerState["packageManager"] })}
            >
              <option value="pnpm">pnpm</option>
              <option value="npm">npm</option>
              <option value="yarn">yarn</option>
              <option value="bun">bun</option>
            </select>
          </label>
        </div>
      </section>

      <section className="workspace" id="builder">
        <div className="builder">
          <Step title="Start from a preset">
            <div className="preset-grid">
              {[
                ["custom", "Custom", "Choose technology below"],
                ["next", "Next.js", "Next.js with shadcn/ui"],
                ["next-postgres-clerk", "Next + Clerk", "Postgres and Clerk"],
                ["next-fastapi-postgres-auth0", "Next + FastAPI", "Postgres and Auth0"]
              ].map(([value, label, description]) => (
                <button
                  className={state.preset === value ? "preset active" : "preset"}
                  key={value}
                  onClick={() => patch({ preset: value })}
                  aria-pressed={state.preset === value}
                  type="button"
                >
                  <span>{label}</span>
                  <small>{description}</small>
                </button>
              ))}
            </div>
          </Step>

          {state.preset === "custom" ? (
            <>
              <Step title="Application shape">
                <ChoiceGrid choices={webChoices} value={state.web} onChange={(web) => patch({ web })} />
                <ChoiceGrid choices={uiChoices} value={state.ui} onChange={(ui) => patch({ ui })} />
                <ChoiceGrid choices={apiChoices} value={state.api} onChange={(api) => patch({ api })} />
              </Step>

              <Step title="Data and auth">
                <ChoiceGrid choices={databaseChoices} value={state.database} onChange={(database) => patch({ database })} />
                {state.database === "postgres" ? (
                  <>
                    <ChoiceGrid
                      choices={databaseProviderChoices}
                      value={state.dbProvider}
                      onChange={(dbProvider) => patch({ dbProvider })}
                    />
                    {state.dbProvider === "neon" ? (
                      <div className="switch-row">
                        <label>
                          <input
                            checked={state.dbRuntime === "edge"}
                            onChange={(event) => patch({ dbRuntime: event.target.checked ? "edge" : "node" })}
                            type="checkbox"
                          />
                          Use Neon serverless (edge) driver
                        </label>
                      </div>
                    ) : null}
                  </>
                ) : null}
                <ChoiceGrid choices={authChoices} value={state.auth} onChange={(auth) => patch({ auth })} />
              </Step>

              <Step title="Deployment">
                <div className="choice-grid">
                  {deployChoices.map((choice) => {
                    const supported = isDeployChoiceSupported(state, choice.value);
                    const active = supported && state.deploy.includes(choice.value);

                    return (
                      <button
                        className={active ? "choice active" : supported ? "choice" : "choice disabled"}
                        disabled={!supported}
                        key={choice.value}
                        onClick={() =>
                          supported
                            ? patch({
                                deploy: active
                                  ? state.deploy.filter((item) => item !== choice.value)
                                  : [...state.deploy, choice.value]
                              })
                            : undefined
                        }
                        aria-disabled={!supported}
                        aria-pressed={active}
                        type="button"
                      >
                        <ChoiceIcon choice={choice} />
                        <span>{choice.label}</span>
                        <small>{supported ? choice.description : unsupportedDeployReason(choice.value)}</small>
                      </button>
                    );
                  })}
                </div>
              </Step>

              <Step title="Code quality">
                <ChoiceGrid
                  choices={tsQualityChoices}
                  value={state.tsQuality}
                  onChange={(tsQuality) => patch({ tsQuality })}
                />
                <ChoiceGrid
                  choices={pyTypecheckChoices}
                  value={state.pyTypecheck}
                  onChange={(pyTypecheck) => patch({ pyTypecheck })}
                />
              </Step>
            </>
          ) : null}

          <Step title="AI skills">
            <ChoiceGrid choices={aiModeChoices} value={state.aiSkillMode} onChange={(aiSkillMode) => patch({ aiSkillMode })} />
            <div className="switch-row">
              <label>
                <input
                  checked={state.claudeCode}
                  onChange={(event) => patch({ claudeCode: event.target.checked })}
                  type="checkbox"
                />
                Also install Claude Code skills
              </label>
              <label>
                <input
                  checked={state.linkMode === "symlink"}
                  onChange={(event) => patch({ linkMode: event.target.checked ? "symlink" : "copy" })}
                  type="checkbox"
                />
                Symlink secondary skill targets
              </label>
            </div>
          </Step>
        </div>

        <aside className="summary" aria-live="polite">
          <div className="summary-header">
            <Terminal aria-hidden="true" />
            <div>
              <h2>Recipe command</h2>
              <p>Offline and ready for the CLI.</p>
            </div>
          </div>

          {result.ok ? (
            <>
              <pre className="command">{result.command}</pre>
              <button className="copy" onClick={copyCommand} type="button">
                {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                {copied ? "Copied" : "Copy command"}
              </button>
              <div className="module-list">
                <h3>Resolved modules</h3>
                {result.modules.map((module) => (
                  <div className="module" key={module.id}>
                    <ChevronRight aria-hidden="true" />
                    <span>{module.title}</span>
                    <code>{module.id}</code>
                  </div>
                ))}
              </div>
              <details>
                <summary>Decoded recipe JSON</summary>
                <pre className="json">{JSON.stringify(result.decoded, null, 2)}</pre>
              </details>
            </>
          ) : (
            <div className="error" role="alert">
              {result.error}
            </div>
          )}
        </aside>
      </section>
    </main>
    </>
  );
}

function unsupportedDeployReason(deploy: DeployChoice) {
  if (deploy === "vercel") {
    return "Select a web app first";
  }

  return "Requires Next.js support today";
}

function Step({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="step">
      <div className="step-title">
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function ChoiceGrid<T extends string>({
  choices,
  onChange,
  value
}: {
  choices: Choice<T>[];
  onChange: (value: T) => void;
  value: T;
}) {
  return (
    <div className="choice-grid">
      {choices.map((choice) => {
        return (
          <button
            className={value === choice.value ? "choice active" : "choice"}
            key={choice.value}
            onClick={() => onChange(choice.value)}
            aria-pressed={value === choice.value}
            type="button"
          >
            <ChoiceIcon choice={choice} />
            <span>{choice.label}</span>
            <small>{choice.description}</small>
          </button>
        );
      })}
    </div>
  );
}

function ChoiceIcon<T extends string>({ choice }: { choice: Choice<T> }) {
  if (choice.icon) {
    const needsContrast = isLightBrandColor(choice.icon.hex);

    return (
      <span className={needsContrast ? "brand-icon-frame contrast" : "brand-icon-frame"}>
        <svg
          aria-hidden="true"
          className="brand-icon"
          style={{ color: `#${choice.icon.hex}` }}
          viewBox="0 0 24 24"
        >
          <path d={choice.icon.path} fill="currentColor" />
        </svg>
      </span>
    );
  }

  return (
    <span aria-hidden="true" className="text-icon">
      {choice.iconLabel}
    </span>
  );
}

function isLightBrandColor(hex: string) {
  const normalized = hex.length === 3 ? hex.split("").map((char) => `${char}${char}`).join("") : hex;
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  return (red * 299 + green * 587 + blue * 114) / 1000 > 210;
}
