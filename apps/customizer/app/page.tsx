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
import { builtinModules } from "@berkayorhan/stackkit-registry";
import type { StackkitModule, StackkitPreset } from "@berkayorhan/stackkit-schemas";

import {
  applyPresetBaseline,
  buildCustomizerState,
  choiceError,
  choiceSupportLevel,
  createInitialCustomizerState,
  customizerPresets,
  hasLanguage,
  normalizeCustomizerState,
  projectNameError,
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

type ChoiceAxis = Parameters<typeof choiceSupportLevel>[0];

const moduleById = new Map(builtinModules.map((module) => [module.id, module]));

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

// Labels and icons are presentation only; support levels and validity come from the registry and core.
const webChoices: Choice<WebChoice>[] = [
  { value: "nextjs", label: "Next.js", description: "React app with shadcn/ui", icon: siNextdotjs },
  { value: "vite", label: "Vite", description: "React SPA with Vite", icon: siVite },
  { value: "tanstack", label: "TanStack Start", description: "Full-stack React", icon: siTanstack },
  { value: "none", label: "No web app", description: "API or service only", iconLabel: "None" }
];

const uiChoices: Choice<UiChoice>[] = [
  { value: "shadcn", label: "ShadCN", description: "shadcn/ui components", icon: siShadcnui },
  { value: "tailwind", label: "Tailwind", description: "Tailwind CSS only", icon: siTailwindcss },
  { value: "none", label: "No UI kit", description: "Plain framework", iconLabel: "None" }
];

const apiChoices: Choice<ApiChoice>[] = [
  { value: "none", label: "No API", description: "Frontend-only stack", iconLabel: "None" },
  { value: "fastapi", label: "FastAPI", description: "Python service", icon: siFastapi }
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
  { value: "clerk", label: "Clerk", description: "Hosted auth for React", icon: siClerk }
];

const deployChoices: Choice<DeployChoice>[] = [
  { value: "vercel", label: "Vercel", description: "Web deployment", icon: siVercel },
  { value: "docker", label: "Docker", description: "Next.js or FastAPI containers", icon: siDocker },
  { value: "kubernetes", label: "Kubernetes", description: "Container manifests", icon: siKubernetes }
];

const tsQualityChoices: Choice<TsQualityChoice>[] = [
  { value: "eslint-prettier", label: "ESLint + Prettier", description: "Default lint and format", icons: [siEslint, siPrettier] },
  { value: "biome", label: "Biome", description: "Combined linter and formatter", icon: siBiome }
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

const customPresetChoice: Choice<string> = {
  value: "custom",
  label: "Custom",
  description: "Choose technology below",
  iconLabel: "Custom"
};

export default function Page() {
  const [state, setState] = useState<CustomizerState>(() => createInitialCustomizerState());
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const result = useMemo(() => buildCustomizerState(state), [state]);
  const presetChoices = useMemo(
    () => [{ choice: customPresetChoice, preview: false }, ...customizerPresets(state.includePreview).map(presetChoice)],
    [state.includePreview]
  );
  const nameError = projectNameError(state.projectName);

  function patch(next: Partial<CustomizerState>) {
    setCopyStatus("idle");
    setState((current) => normalizeCustomizerState({ ...current, ...next }));
  }

  function patchStack(next: Partial<CustomizerState>) {
    patch({ ...next, preset: "custom" });
  }

  function selectPreset(preset: string) {
    setCopyStatus("idle");
    setState((current) => applyPresetBaseline(current, preset));
  }

  function setPreviewMode(includePreview: boolean) {
    setCopyStatus("idle");
    setState((current) =>
      includePreview
        ? { ...current, includePreview: true }
        : applyPresetBaseline({ ...current, includePreview: false }, "next-fastapi-postgres-auth0")
    );
  }

  async function copyCommand() {
    if (!result.ok) {
      return;
    }

    try {
      await navigator.clipboard.writeText(result.command);
      setCopyStatus("copied");
    } catch {
      // Clipboard is unavailable outside secure contexts or when permission is denied:
      // select the command so it can be copied manually.
      const command = document.getElementById("recipe-command");
      if (command) {
        window.getSelection()?.selectAllChildren(command);
      }
      setCopyStatus("failed");
    }
  }

  const choiceProps = {
    includePreview: state.includePreview,
    disabledReason: (patchValue: Partial<CustomizerState>) => choiceError(state, patchValue)
  };

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
              aria-describedby={nameError ? "project-name-error" : undefined}
              aria-invalid={nameError ? true : undefined}
              value={state.projectName}
              onChange={(event) => patch({ projectName: event.target.value })}
              placeholder="my-stack"
            />
            {nameError ? (
              <span className="field-error" id="project-name-error">
                {nameError}
              </span>
            ) : null}
          </label>
          <label>
            Package manager
            <select
              value={state.packageManager}
              onChange={(event) => patch({ packageManager: event.target.value as CustomizerState["packageManager"] })}
            >
              <option value="pnpm">pnpm</option>
              {state.includePreview ? <option value="npm">npm</option> : null}
              {state.includePreview ? <option value="yarn">yarn</option> : null}
              {state.includePreview ? <option value="bun">bun</option> : null}
            </select>
          </label>
        </div>
      </section>

      <section className="workspace" id="builder">
        <div className="builder">
          <div className="switch-row preview-toggle">
            <label>
              <input
                checked={state.includePreview}
                onChange={(event) => setPreviewMode(event.target.checked)}
                type="checkbox"
              />
              Show preview choices with incomplete release verification
            </label>
          </div>
          <Step title="Start from a preset">
            <div aria-label="Preset" className="preset-grid" role="radiogroup">
              {presetChoices.map(({ choice, preview }) => (
                <button
                  aria-checked={state.preset === choice.value}
                  className={state.preset === choice.value ? "preset active" : "preset"}
                  key={choice.value}
                  onClick={() => selectPreset(choice.value)}
                  role="radio"
                  type="button"
                >
                  <ChoiceIcon choice={choice} />
                  <span>{choice.label}</span>
                  {preview ? <span className="preview-badge">Preview</span> : null}
                  <small>{choice.description}</small>
                </button>
              ))}
            </div>
          </Step>

          <Step title="Application shape">
            <ChoiceGrid {...choiceProps} axis="web" label="Web app" choices={webChoices} value={state.web} toPatch={(web) => ({ web })} onChange={patchStack} />
            <ChoiceGrid {...choiceProps} axis="ui" label="UI kit" choices={uiChoices} value={state.ui} toPatch={(ui) => ({ ui })} onChange={patchStack} />
            <ChoiceGrid {...choiceProps} axis="api" label="API" choices={apiChoices} value={state.api} toPatch={(api) => ({ api })} onChange={patchStack} />
          </Step>

          <Step title="Data and auth">
            <ChoiceGrid
              {...choiceProps}
              label="Database"
              choices={databaseChoices}
              value={state.database}
              toPatch={(database) => ({ database })}
              onChange={patchStack}
            />
            <div className="choice-group">
              <h3 id="postgres-provider-label">Postgres provider</h3>
              <ChoiceGrid
                {...choiceProps}
                axis="dbProvider"
                labelledBy="postgres-provider-label"
                choices={databaseProviderChoices}
                value={state.database === "postgres" ? state.dbProvider : undefined}
                toPatch={(dbProvider) => ({ database: "postgres", dbProvider })}
                onChange={patchStack}
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
            <ChoiceGrid {...choiceProps} axis="auth" label="Auth" choices={authChoices} value={state.auth} toPatch={(auth) => ({ auth })} onChange={patchStack} />
          </Step>

          <Step title="Deployment">
            <div aria-label="Deployment targets" className="choice-grid" role="group">
              {visibleChoices(deployChoices, state.includePreview, "deploy").map((choice) => {
                const active = state.deploy.includes(choice.value);
                const reason = active ? undefined : choiceError(state, { deploy: [...state.deploy, choice.value] });

                return (
                  <button
                    aria-disabled={reason ? true : undefined}
                    aria-pressed={active}
                    className={active ? "choice active" : reason ? "choice disabled" : "choice"}
                    key={choice.value}
                    onClick={() =>
                      reason
                        ? undefined
                        : patchStack({
                            deploy: active
                              ? state.deploy.filter((item) => item !== choice.value)
                              : [...state.deploy, choice.value]
                          })
                    }
                    type="button"
                  >
                    <ChoiceIcon choice={choice} />
                    <span>{choice.label}</span>
                    {isPreview("deploy", choice.value) ? <span className="preview-badge">Preview</span> : null}
                    <small>{reason ?? choice.description}</small>
                  </button>
                );
              })}
            </div>
          </Step>

          <Step title="Code quality">
            {hasLanguage(state, "ts") ? (
              <div className="choice-group">
                <h3 id="ts-quality-label">TypeScript quality</h3>
                <ChoiceGrid
                  {...choiceProps}
                  axis="tsQuality"
                  labelledBy="ts-quality-label"
                  choices={tsQualityChoices}
                  value={state.tsQuality}
                  toPatch={(tsQuality) => ({ tsQuality })}
                  onChange={patchStack}
                />
              </div>
            ) : null}
            {hasLanguage(state, "py") ? (
              <div className="choice-group">
                <h3 id="py-typecheck-label">Python typecheck</h3>
                <ChoiceGrid
                  {...choiceProps}
                  axis="pyTypecheck"
                  labelledBy="py-typecheck-label"
                  choices={pyTypecheckChoices}
                  value={state.pyTypecheck}
                  toPatch={(pyTypecheck) => ({ pyTypecheck })}
                  onChange={patchStack}
                />
              </div>
            ) : null}
          </Step>

          <Step title="AI skills">
            <ChoiceGrid
              includePreview={state.includePreview}
              label="AI skill mode"
              choices={aiModeChoices}
              value={state.aiSkillMode}
              toPatch={(aiSkillMode) => ({ aiSkillMode })}
              onChange={patch}
            />
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

        <aside className="summary">
          <div className="summary-header">
            <Terminal aria-hidden="true" />
            <div>
              <h2>Recipe command</h2>
              <p>Offline and ready for the CLI.</p>
            </div>
          </div>

          <p aria-live="polite" className="sr-only">
            {result.ok
              ? copyStatus === "copied"
                ? "Command copied"
                : copyStatus === "failed"
                  ? "Copy failed. The command is selected; copy it manually."
                  : ""
              : result.error}
          </p>

          {result.ok ? (
            <>
              <pre className="command" id="recipe-command">
                {result.command}
              </pre>
              <button className="copy" onClick={copyCommand} type="button">
                {copyStatus === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                {copyStatus === "copied"
                  ? "Copied"
                  : copyStatus === "failed"
                    ? "Copy failed, select the command manually"
                    : "Copy command"}
              </button>
              <nav className="summary-links" aria-label="Stackkit guidance">
                <a href="https://github.com/Berkay2002/stackkit/blob/master/apps/docs/content/docs/getting-started.mdx">
                  Setup guide
                </a>
                <a href="https://github.com/Berkay2002/stackkit/blob/master/apps/docs/content/docs/status.mdx">
                  Support and limitations
                </a>
              </nav>
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
            <div className="error">{result.error}</div>
          )}
        </aside>
      </section>
    </main>
    </>
  );
}

function presetChoice(preset: StackkitPreset): { choice: Choice<string>; preview: boolean } {
  const icons = [
    ...new Set(
      preset.modules
        .filter((id) => /^(web|api|db|auth|rust)\//.test(id))
        .map((id) => moduleById.get(id))
        .flatMap((module) => (module ? [resolveModuleIcon(module)] : []))
        .filter((icon): icon is SimpleIcon => Boolean(icon))
    )
  ].slice(0, 4);

  return {
    choice: { value: preset.id, label: preset.title, description: preset.description, icons },
    preview: preset.support.level === "preview"
  };
}

function isPreview(axis: ChoiceAxis, value: string): boolean {
  return choiceSupportLevel(axis, value) === "preview";
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
  axis,
  choices,
  disabledReason,
  includePreview,
  label,
  labelledBy,
  onChange,
  toPatch,
  value
}: {
  axis?: ChoiceAxis;
  choices: Choice<T>[];
  disabledReason?: (patch: Partial<CustomizerState>) => string | undefined;
  includePreview: boolean;
  label?: string;
  labelledBy?: string;
  onChange: (patch: Partial<CustomizerState>) => void;
  toPatch: (value: T) => Partial<CustomizerState>;
  value?: T;
}) {
  return (
    <div aria-label={label} aria-labelledby={labelledBy} className="choice-grid" role="radiogroup">
      {visibleChoices(choices, includePreview, axis).map((choice) => {
        const selected = value === choice.value;
        const reason = selected ? undefined : disabledReason?.(toPatch(choice.value));

        return (
          <button
            aria-checked={selected}
            aria-disabled={reason ? true : undefined}
            className={selected ? "choice active" : reason ? "choice disabled" : "choice"}
            key={choice.value}
            onClick={() => (reason ? undefined : onChange(toPatch(choice.value)))}
            role="radio"
            type="button"
          >
            <ChoiceIcon choice={choice} />
            <span>{choice.label}</span>
            {axis && isPreview(axis, choice.value) ? <span className="preview-badge">Preview</span> : null}
            <small>{reason ?? choice.description}</small>
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

function visibleChoices<T extends string>(
  choices: readonly Choice<T>[],
  includePreview: boolean,
  axis?: ChoiceAxis
): Choice<T>[] {
  return choices.filter((choice) => {
    const level = axis ? choiceSupportLevel(axis, choice.value) : "supported";
    return level === "supported" || (includePreview && level === "preview");
  });
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
