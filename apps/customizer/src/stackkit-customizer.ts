import {
  assertCreateSupport,
  decodeRecipe,
  encodeRecipe,
  languageCapability,
  resolveModuleGraph,
  resolveStackAxes,
  validateProjectSlug,
  type ToolingLanguage
} from "@berkayorhan/stackkit-core/customizer";
import { builtinModules, builtinPresets } from "@berkayorhan/stackkit-registry";
import type { PackageManager, StackkitModule, StackkitPreset, StackkitRecipe, SupportLevel } from "@berkayorhan/stackkit-schemas";

import cliPackage from "../../../packages/cli/package.json";

/**
 * UI choice -> canonical module ID. This is the only mapping the customizer owns; support levels,
 * preset contents, requirements, and conflicts all come from the registry and core resolver.
 */
const choiceModules = {
  web: { nextjs: "web/nextjs", vite: "web/vite", tanstack: "web/tanstack-start" },
  ui: { shadcn: "ui/shadcn", tailwind: "ui/tailwind" },
  api: { fastapi: "api/fastapi" },
  dbProvider: {
    neon: "postgres/neon",
    supabase: "postgres/supabase",
    "supabase-local": "postgres/supabase-local",
    "postgres-local": "postgres/local"
  },
  // `auth0` expands per framework in core; its Next.js module stands in for support and presets.
  auth: { auth0: "auth/auth0-nextjs", clerk: "auth/clerk" },
  deploy: { vercel: "deploy/vercel", docker: "deploy/docker", kubernetes: "deploy/kubernetes" },
  tsQuality: { "eslint-prettier": "quality/eslint", biome: "quality/biome" },
  pyTypecheck: { mypy: "quality/mypy", pyright: "quality/pyright" }
} as const;

type ChoiceAxis = keyof typeof choiceModules;

export type WebChoice = keyof typeof choiceModules.web | "none";
export type UiChoice = keyof typeof choiceModules.ui | "none";
export type ApiChoice = keyof typeof choiceModules.api | "none";
export type DatabaseChoice = "none" | "postgres";
export type DatabaseProviderChoice = keyof typeof choiceModules.dbProvider | "byo";
export type DatabaseRuntimeChoice = "node" | "edge";
export type AuthChoice = keyof typeof choiceModules.auth | "none";
export type DeployChoice = keyof typeof choiceModules.deploy;
export type AiSkillModeChoice = "install" | "plan" | "skip";
export type TsQualityChoice = keyof typeof choiceModules.tsQuality;
export type PyTypecheckChoice = keyof typeof choiceModules.pyTypecheck;

export type CustomizerState = {
  projectName: string;
  packageManager: PackageManager;
  preset: string;
  web: WebChoice;
  ui: UiChoice;
  api: ApiChoice;
  database: DatabaseChoice;
  dbProvider: DatabaseProviderChoice;
  dbRuntime: DatabaseRuntimeChoice;
  auth: AuthChoice;
  deploy: DeployChoice[];
  tsQuality: TsQualityChoice;
  pyTypecheck: PyTypecheckChoice;
  aiSkillMode: AiSkillModeChoice;
  claudeCode: boolean;
  linkMode: "copy" | "symlink";
  includePreview: boolean;
};

export type CustomizerSuccess = {
  ok: true;
  recipe: StackkitRecipe;
  recipeCode: string;
  command: string;
  decoded: StackkitRecipe;
  modules: StackkitModule[];
};

export type CustomizerFailure = {
  ok: false;
  error: string;
};

export type CustomizerResult = CustomizerSuccess | CustomizerFailure;

export const stackkitVersion: string = cliPackage.version;

const moduleById = new Map<string, StackkitModule>(builtinModules.map((module) => [module.id, module]));
const presetById = new Map<string, StackkitPreset>(builtinPresets.map((preset) => [preset.id, preset]));
const goldenPreset = "next-fastapi-postgres-auth0";

export function createInitialCustomizerState(): CustomizerState {
  return applyPresetBaseline(
    {
      projectName: "my-stack",
      packageManager: "pnpm",
      preset: "custom",
      web: "none",
      ui: "none",
      api: "none",
      database: "none",
      dbProvider: "byo",
      dbRuntime: "node",
      auth: "none",
      deploy: [],
      tsQuality: "eslint-prettier",
      pyTypecheck: "mypy",
      aiSkillMode: "install",
      claudeCode: false,
      linkMode: "copy",
      includePreview: false
    },
    goldenPreset
  );
}

/** Presets the customizer can offer: every registry preset that is not planned. */
export function customizerPresets(includePreview: boolean): StackkitPreset[] {
  return builtinPresets.filter(
    (preset) => preset.support.level === "supported" || (includePreview && preset.support.level === "preview")
  );
}

/** Support level of a UI choice, read from the registry module it maps to. */
export function choiceSupportLevel(axis: ChoiceAxis, value: string): SupportLevel {
  const moduleId = (choiceModules[axis] as Record<string, string>)[value];

  return (moduleId && moduleById.get(moduleId)?.support.level) || "supported";
}

export function applyPresetBaseline(state: CustomizerState, preset: string): CustomizerState {
  const modules = presetById.get(preset)?.modules;

  if (!modules) {
    return normalizeCustomizerState({ ...state, preset: "custom" });
  }

  const ids = new Set(modules);
  const pick = <T extends string>(axis: ChoiceAxis, fallback: T): T =>
    (Object.entries(choiceModules[axis]).find(([, moduleId]) => ids.has(moduleId))?.[0] as T | undefined) ?? fallback;

  return normalizeCustomizerState({
    ...state,
    preset,
    web: pick("web", "none"),
    ui: pick("ui", "none"),
    api: pick("api", "none"),
    database: ids.has("db/postgres") ? "postgres" : "none",
    dbProvider: pick("dbProvider", "byo"),
    dbRuntime: "node",
    auth: pick("auth", "none"),
    deploy: Object.entries(choiceModules.deploy)
      .filter(([, moduleId]) => ids.has(moduleId))
      .map(([deploy]) => deploy as DeployChoice),
    tsQuality: pick("tsQuality", "eslint-prettier"),
    pyTypecheck: pick("pyTypecheck", "mypy")
  });
}

/**
 * Rebuilds the stack one axis at a time and keeps each choice only if core still resolves and
 * allows it at the current preview level. Choices that no longer fit (an auth provider without a
 * matching framework, a preview tool after preview mode is turned off, Neon's edge runtime after
 * switching providers) fall back to their neutral value.
 */
export function normalizeCustomizerState(state: CustomizerState): CustomizerState {
  return normalizeWithErrors(state).state;
}

/**
 * Why `patch` cannot be applied: the core error for a patched value that normalization would drop,
 * or undefined when the choice sticks (other axes may still be reset to fit it).
 */
export function choiceError(state: CustomizerState, patch: Partial<CustomizerState>): string | undefined {
  const { state: normalized, errors } = normalizeWithErrors({ ...state, ...patch });

  for (const [key, value] of Object.entries(patch) as [keyof CustomizerState, unknown][]) {
    if (key === "deploy") {
      const missing = (value as DeployChoice[]).find((deploy) => !normalized.deploy.includes(deploy));
      if (missing) {
        return errors.get(`deploy:${missing}`) ?? "Unavailable for this stack";
      }
    } else if (normalized[key] !== value) {
      return errors.get(key === "dbProvider" || key === "dbRuntime" ? "database" : key) ?? "Unavailable for this stack";
    }
  }

  return undefined;
}

export function projectNameError(projectName: string): string | undefined {
  return errorOf(() => validateProjectSlug(projectName.trim()));
}

function normalizeWithErrors(state: CustomizerState): { state: CustomizerState; errors: Map<string, string> } {
  const errors = new Map<string, string>();
  const packageManager = errorOf(() =>
    assertCreateSupport({ modules: [], packageManager: state.packageManager, includePreview: state.includePreview })
  )
    ? "pnpm"
    : state.packageManager;
  let current: CustomizerState = {
    ...state,
    packageManager,
    web: "none",
    ui: "none",
    api: "none",
    database: "none",
    dbProvider: "byo",
    dbRuntime: "node",
    auth: "none",
    deploy: [],
    tsQuality: "eslint-prettier",
    pyTypecheck: "mypy"
  };
  // Each step lists alternatives in preference order; the first one that still resolves wins.
  const steps: [string, Partial<CustomizerState>[]][] = [
    ["web", [{ web: state.web }]],
    ["ui", [{ ui: state.ui }]],
    ["api", [{ api: state.api }]],
    [
      "database",
      [
        {
          database: state.database,
          dbProvider: state.dbProvider,
          dbRuntime: state.dbProvider === "neon" ? state.dbRuntime : "node"
        },
        { database: state.database }
      ]
    ],
    ["auth", [{ auth: state.auth }]],
    ...state.deploy.map((deploy): [string, Partial<CustomizerState>[]] => [`deploy:${deploy}`, [{ deploy: [deploy] }]]),
    ["tsQuality", [{ tsQuality: state.tsQuality }]],
    ["pyTypecheck", [{ pyTypecheck: state.pyTypecheck }]]
  ];

  for (const [name, alternatives] of steps) {
    for (const step of alternatives) {
      const candidate = { ...current, ...step, deploy: [...current.deploy, ...(step.deploy ?? [])] };
      const error = stackError(candidate);

      if (!error) {
        current = candidate;
        break;
      }
      if (!errors.has(name)) {
        errors.set(name, error);
      }
    }
  }

  return { state: current, errors };
}

export function hasLanguage(state: CustomizerState, language: ToolingLanguage): boolean {
  try {
    return resolveStateModules(state).some((module) => module.provides?.includes(languageCapability[language]));
  } catch {
    return false;
  }
}

export function buildCustomizerState(state: CustomizerState): CustomizerResult {
  try {
    const normalizedState = normalizeCustomizerState(state);
    const projectName = validateProjectSlug(normalizedState.projectName.trim());
    const preset = presetById.get(normalizedState.preset);
    // A selected preset resolves exactly like `stackkit create --preset <id>`; custom stacks resolve the axes.
    const modules = preset
      ? resolveModuleGraph([], { presets: builtinPresets, selectedPresets: [preset.id], availableModules: builtinModules })
      : resolveStateModules(normalizedState);
    assertCreateSupport({
      modules,
      presets: preset ? [preset] : [],
      packageManager: normalizedState.packageManager,
      includePreview: normalizedState.includePreview
    });
    const usesEdgeDrizzle =
      !preset &&
      normalizedState.dbProvider === "neon" &&
      normalizedState.dbRuntime === "edge" &&
      modules.some((module) => module.id === "db/drizzle");
    const recipe: StackkitRecipe = {
      schemaVersion: 1,
      preset: preset?.id,
      packageManager: normalizedState.packageManager,
      modules: modules.map((module) => module.id),
      options: usesEdgeDrizzle ? { "db/drizzle": { runtime: "edge" } } : {},
      ai: {
        skillTargets: normalizedState.claudeCode ? ["codex", "claude-code"] : ["codex"],
        skillMode: normalizedState.aiSkillMode,
        linkMode: normalizedState.linkMode
      }
    };
    const recipeCode = encodeRecipe(recipe);

    return {
      ok: true,
      recipe,
      recipeCode,
      command: toCreateCommand(projectName, recipeCode, normalizedState.includePreview),
      decoded: decodeRecipe(recipeCode),
      modules
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to build Stackkit recipe"
    };
  }
}

/** `projectName` must already be a validated slug, so it needs no shell quoting. */
export function toCreateCommand(projectName: string, recipeCode: string, includePreview = false): string {
  const previewFlag = includePreview ? " --include-preview" : "";
  return `npx @berkayorhan/stackkit@${stackkitVersion} create ${projectName} --recipe ${recipeCode}${previewFlag}`;
}

function stackError(state: CustomizerState): string | undefined {
  return errorOf(() =>
    assertCreateSupport({
      modules: resolveStateModules(state),
      packageManager: state.packageManager,
      includePreview: state.includePreview
    })
  );
}

function resolveStateModules(state: CustomizerState): StackkitModule[] {
  const moduleIds = resolveStackAxes(
    {
      web: state.web === "none" ? undefined : choiceModules.web[state.web],
      ui: state.ui,
      api: state.api === "none" ? undefined : choiceModules.api[state.api],
      db: state.database === "postgres" ? "db/postgres" : undefined,
      dbProvider:
        state.database === "postgres" && state.dbProvider !== "byo" ? choiceModules.dbProvider[state.dbProvider] : undefined,
      auth: state.auth === "none" ? undefined : state.auth,
      deploy: state.deploy.map((deploy) => choiceModules.deploy[deploy]),
      tsQuality: state.tsQuality,
      pyTypecheck: state.pyTypecheck
    },
    builtinModules
  );

  return resolveModuleGraph(
    moduleIds.map((id) => {
      const module = moduleById.get(id);

      if (!module) {
        throw new Error(`Unknown Stackkit module: ${id}`);
      }

      return module;
    }),
    { availableModules: builtinModules, availablePresets: builtinPresets }
  );
}

function errorOf(run: () => void): string | undefined {
  try {
    run();
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
