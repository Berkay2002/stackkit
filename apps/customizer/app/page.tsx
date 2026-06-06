"use client";

import {
  Check,
  Copy,
  Terminal
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  siAuth0,
  siBetterauth,
  siBiome,
  siClerk,
  siDjango,
  siDocker,
  siDrizzle,
  siEslint,
  siFastapi,
  siKubernetes,
  siNeon,
  siNextdotjs,
  siPnpm,
  siPostgresql,
  siPrettier,
  siPython,
  siRuff,
  siRust,
  siShadcnui,
  siSqlalchemy,
  siSupabase,
  siTailwindcss,
  siTanstack,
  siTokio,
  siTypescript,
  siTurborepo,
  siVercel,
  siVitest,
  siVite,
  type SimpleIcon
} from "simple-icons";
import type { StackkitModule } from "@berkayorhan/stackkit-schemas";

import {
  applyPresetBaseline,
  buildCustomizerState,
  createInitialCustomizerState,
  hasPythonApplicationShape,
  hasTypeScriptApplicationShape,
  isAuthChoiceSupported,
  isDatabaseChoiceSupported,
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
  icons?: SimpleIcon[];
  customIcon?: LocalIconKey;
  iconLabel?: string;
};

type LocalIconKey = "pyright";

const iconByKey: Record<string, SimpleIcon> = {
  auth0: siAuth0,
  "better-auth": siBetterauth,
  biome: siBiome,
  clerk: siClerk,
  django: siDjango,
  docker: siDocker,
  drizzle: siDrizzle,
  eslint: siEslint,
  fastapi: siFastapi,
  kubernetes: siKubernetes,
  neon: siNeon,
  nextjs: siNextdotjs,
  pnpm: siPnpm,
  postgres: siPostgresql,
  prettier: siPrettier,
  python: siPython,
  ruff: siRuff,
  rust: siRust,
  shadcn: siShadcnui,
  sqlalchemy: siSqlalchemy,
  supabase: siSupabase,
  tailwind: siTailwindcss,
  tanstack: siTanstack,
  tokio: siTokio,
  typescript: siTypescript,
  turborepo: siTurborepo,
  vercel: siVercel,
  vitest: siVitest,
  vite: siVite
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
  { value: "eslint-prettier", label: "ESLint + Prettier", description: "Default lint and format", icons: [siEslint, siPrettier] },
  { value: "biome", label: "Biome", description: "Combined linter and formatter", icon: siBiome }
];

const presetChoices: Choice<string>[] = [
  { value: "custom", label: "Custom", description: "Choose technology below", iconLabel: "Custom" },
  { value: "next", label: "Next.js", description: "Next.js with shadcn/ui", icons: [siNextdotjs, siShadcnui] },
  {
    value: "next-postgres-clerk",
    label: "Next + Clerk",
    description: "Postgres and Clerk",
    icons: [siNextdotjs, siShadcnui, siPostgresql, siClerk]
  },
  {
    value: "next-fastapi-postgres-auth0",
    label: "Next + FastAPI",
    description: "Postgres and Auth0",
    icons: [siNextdotjs, siFastapi, siPostgresql, siAuth0]
  }
];

const pyTypecheckChoices: Choice<PyTypecheckChoice>[] = [
  { value: "mypy", label: "mypy", description: "Default Python type checker", icon: siPython },
  { value: "pyright", label: "pyright", description: "Alternative Python type checker", customIcon: "pyright" }
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

  function patchStack(next: Partial<CustomizerState>) {
    patch({ ...next, preset: "custom" });
  }

  function selectPreset(preset: string) {
    setCopied(false);
    setState((current) => applyPresetBaseline(current, preset));
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
              {presetChoices.map((choice) => (
                <button
                  className={state.preset === choice.value ? "preset active" : "preset"}
                  key={choice.value}
                  onClick={() => selectPreset(choice.value)}
                  aria-pressed={state.preset === choice.value}
                  type="button"
                >
                  <ChoiceIcon choice={choice} />
                  <span>{choice.label}</span>
                  <small>{choice.description}</small>
                </button>
              ))}
            </div>
          </Step>

          <Step title="Application shape">
            <ChoiceGrid choices={webChoices} value={state.web} onChange={(web) => patchStack({ web })} />
            <ChoiceGrid choices={uiChoices} value={state.ui} onChange={(ui) => patchStack({ ui })} />
            <ChoiceGrid choices={apiChoices} value={state.api} onChange={(api) => patchStack({ api })} />
          </Step>

          <Step title="Data and auth">
            <ChoiceGrid
              choices={databaseChoices}
              value={state.database}
              onChange={(database) => patchStack({ database })}
              isDisabled={(database) => !isDatabaseChoiceSupported(state, database)}
              disabledDescription={() => "Select an app or API first"}
            />
            <div className="choice-group">
              <h3>Postgres provider</h3>
              <ChoiceGrid
                choices={databaseProviderChoices}
                value={state.database === "postgres" ? state.dbProvider : undefined}
                onChange={(dbProvider) => patchStack({ database: "postgres", dbProvider })}
                isDisabled={() => !isDatabaseChoiceSupported(state, "postgres")}
                disabledDescription={() => "Select an app or API first"}
              />
            </div>
            {state.database === "postgres" && state.dbProvider === "neon" ? (
              <div className="switch-row">
                <label>
                  <input
                    checked={state.dbRuntime === "edge"}
                    onChange={(event) => patchStack({ dbRuntime: event.target.checked ? "edge" : "node" })}
                    type="checkbox"
                  />
                  Use Neon serverless (edge) driver
                </label>
              </div>
            ) : null}
            <ChoiceGrid
              choices={authChoices}
              value={state.auth}
              onChange={(auth) => patchStack({ auth })}
              isDisabled={(auth) => !isAuthChoiceSupported(state, auth)}
              disabledDescription={(auth) => unsupportedAuthReason(auth)}
            />
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
                        ? patchStack({
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
            {hasTypeScriptApplicationShape(state) ? (
              <div className="choice-group">
                <h3>TypeScript quality</h3>
                <ChoiceGrid
                  choices={tsQualityChoices}
                  value={state.tsQuality}
                  onChange={(tsQuality) => patchStack({ tsQuality })}
                />
              </div>
            ) : null}
            {hasPythonApplicationShape(state) ? (
              <div className="choice-group">
                <h3>Python typecheck</h3>
                <ChoiceGrid
                  choices={pyTypecheckChoices}
                  value={state.pyTypecheck}
                  onChange={(pyTypecheck) => patchStack({ pyTypecheck })}
                />
              </div>
            ) : null}
          </Step>

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
                    <ModuleIcon module={module} />
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

function unsupportedAuthReason(auth: AuthChoice) {
  if (auth === "auth0") {
    return "Select Next.js or FastAPI first";
  }

  if (auth === "clerk" || auth === "better-auth") {
    return "Select a React web app first";
  }

  return "Unavailable";
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
  disabledDescription,
  isDisabled,
  onChange,
  value
}: {
  choices: Choice<T>[];
  disabledDescription?: (value: T) => string;
  isDisabled?: (value: T) => boolean;
  onChange: (value: T) => void;
  value?: T;
}) {
  return (
    <div className="choice-grid">
      {choices.map((choice) => {
        const disabled = isDisabled?.(choice.value) ?? false;

        return (
          <button
            className={value === choice.value ? "choice active" : disabled ? "choice disabled" : "choice"}
            disabled={disabled}
            key={choice.value}
            onClick={() => (disabled ? undefined : onChange(choice.value))}
            aria-disabled={disabled}
            aria-pressed={value === choice.value}
            type="button"
          >
            <ChoiceIcon choice={choice} />
            <span>{choice.label}</span>
            <small>{disabled ? (disabledDescription?.(choice.value) ?? choice.description) : choice.description}</small>
          </button>
        );
      })}
    </div>
  );
}

function ChoiceIcon<T extends string>({ choice }: { choice: Choice<T> }) {
  if (choice.icons) {
    return <IconStack icons={choice.icons} />;
  }

  if (choice.customIcon) {
    return <LocalToolIcon icon={choice.customIcon} />;
  }

  if (choice.icon) {
    return <BrandIcon icon={choice.icon} />;
  }

  return (
    <span aria-hidden="true" className="text-icon">
      {choice.iconLabel}
    </span>
  );
}

function ModuleIcon({ module }: { module: StackkitModule }) {
  if (module.id === "workspace/pnpm-turbo") {
    return <IconStack icons={[siPnpm, siTurborepo]} />;
  }

  const localIcon = resolveLocalIconKey(module);
  if (localIcon) {
    return <LocalToolIcon icon={localIcon} />;
  }

  const icon = resolveModuleIcon(module);

  if (icon) {
    return <BrandIcon icon={icon} />;
  }

  return (
    <span aria-hidden="true" className="text-icon module-fallback-icon">
      {moduleFallbackLabel(module)}
    </span>
  );
}

function IconStack({ icons }: { icons: readonly SimpleIcon[] }) {
  return (
    <span aria-hidden="true" className="brand-icon-stack">
      {icons.map((icon) => (
        <BrandIcon icon={icon} key={icon.slug} />
      ))}
    </span>
  );
}

function BrandIcon({ icon }: { icon: SimpleIcon }) {
  const needsContrast = isLightBrandColor(icon.hex);

  return (
    <span className={needsContrast ? "brand-icon-frame contrast" : "brand-icon-frame"}>
      <svg
        aria-hidden="true"
        className="brand-icon"
        style={{ color: `#${icon.hex}` }}
        viewBox="0 0 24 24"
      >
        <path d={icon.path} fill="currentColor" />
      </svg>
    </span>
  );
}

function LocalToolIcon({ icon }: { icon: LocalIconKey }) {
  return (
    <span aria-hidden="true" className={`local-icon-frame ${icon}`}>
      {icon === "pyright" ? <PyrightIcon /> : null}
    </span>
  );
}

function PyrightIcon() {
  return (
    <svg className="local-icon" viewBox="0 0 24 24">
      <path d="M5 6.6 10.8 3l8.1 3.4 1.2 8-6.2 5.6-8.7-3.3L3.9 9.2Z" fill="#d7d9a8" />
      <path d="M10.8 3 12 9.2l7.9-2.8Z" fill="#889261" />
      <path d="M12 9.2 20.1 8l-3.1 4.7-5.8 1.1Z" fill="#4f5c35" />
      <path d="m5.2 16.7 6-2.9 2.7 6.2Z" fill="#2e3521" />
      <path d="m3.9 9.2 6.9-6.2L12 9.2 5.2 16.7Z" fill="#c5c783" />
      <path d="M10.8 3 5.9 12.3h8.2Z" fill="#f1efb8" opacity=".72" />
    </svg>
  );
}

function resolveLocalIconKey(module: StackkitModule): LocalIconKey | undefined {
  const key = module.icon ?? module.id.split("/").at(-1);

  if (key === "pyright") {
    return key;
  }

  return undefined;
}

function resolveModuleIcon(module: StackkitModule): SimpleIcon | undefined {
  if (module.icon && iconByKey[module.icon]) {
    return iconByKey[module.icon];
  }

  const idIcon = iconByKey[module.id.split("/").at(-1) ?? ""];
  if (idIcon) {
    return idIcon;
  }

  if (module.id.startsWith("postgres/")) {
    return module.id.includes("supabase") ? siSupabase : module.id.includes("neon") ? siNeon : siPostgresql;
  }

  if (module.category === "quality" && module.id.includes("vitest")) {
    return siVitest;
  }

  return undefined;
}

function moduleFallbackLabel(module: StackkitModule): string {
  if (module.category === "workspace") {
    return "WS";
  }

  return module.id.slice(0, 2).toUpperCase();
}

function isLightBrandColor(hex: string) {
  const normalized = hex.length === 3 ? hex.split("").map((char) => `${char}${char}`).join("") : hex;
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  return (red * 299 + green * 587 + blue * 114) / 1000 > 210;
}
