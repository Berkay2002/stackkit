import {
  assertCreateSupport,
  buildCustomizerCatalog,
  decodeRecipe,
  encodeRecipe,
  resolveModuleGraph,
  resolveStackAxes,
  type CustomizerCatalog
} from "@berkayorhan/stackkit-core/customizer";
import { builtinModules, builtinPresets } from "@berkayorhan/stackkit-registry";
import type { PackageManager, StackkitModule, StackkitRecipe } from "@berkayorhan/stackkit-schemas";

export type WebChoice = "nextjs" | "vite" | "tanstack" | "django" | "none";
export type UiChoice = "shadcn" | "tailwind" | "none";
export type ApiChoice = "none" | "fastapi" | "axum";
export type DatabaseChoice = "none" | "postgres";
export type DatabaseProviderChoice = "byo" | "neon" | "supabase" | "supabase-local" | "postgres-local";
export type DatabaseRuntimeChoice = "node" | "edge";
export type AuthChoice = "none" | "auth0" | "clerk" | "better-auth";
export type DeployChoice = "vercel" | "docker" | "kubernetes";
export type AiSkillModeChoice = "install" | "plan" | "skip";
export type TsQualityChoice = "eslint-prettier" | "biome";
export type PyTypecheckChoice = "mypy" | "pyright";

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
  catalog: CustomizerCatalog;
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

const moduleById = new Map<string, StackkitModule>(builtinModules.map((module) => [module.id, module]));

export function createInitialCustomizerState(): CustomizerState {
  return {
    projectName: "my-stack",
    packageManager: "pnpm",
    preset: "next-fastapi-postgres-auth0",
    web: "nextjs",
    ui: "shadcn",
    api: "fastapi",
    database: "postgres",
    dbProvider: "postgres-local",
    dbRuntime: "node",
    auth: "auth0",
    deploy: ["docker"],
    tsQuality: "eslint-prettier",
    pyTypecheck: "mypy",
    aiSkillMode: "install",
    claudeCode: false,
    linkMode: "copy",
    includePreview: false
  };
}

export function applyPresetBaseline(state: CustomizerState, preset: string): CustomizerState {
  if (preset === "custom") {
    return normalizeCustomizerState({ ...state, preset });
  }

  const baseline = presetBaseline(preset);

  if (!baseline) {
    return normalizeCustomizerState({ ...state, preset });
  }

  return normalizeCustomizerState({
    ...state,
    ...baseline,
    preset
  });
}

export function normalizeCustomizerState(state: CustomizerState): CustomizerState {
  const normalized = {
    ...state,
    deploy: state.deploy.filter((deploy) => isDeployChoiceSupported(state, deploy))
  };

  if (!isDatabaseChoiceSupported(normalized, normalized.database)) {
    normalized.database = "none";
    normalized.dbProvider = "byo";
    normalized.dbRuntime = "node";
  }

  if (!isAuthChoiceSupported(normalized, normalized.auth)) {
    normalized.auth = "none";
  }

  if (!hasTypeScriptApplicationShape(normalized)) {
    normalized.tsQuality = "eslint-prettier";
  }

  if (!hasPythonApplicationShape(normalized)) {
    normalized.pyTypecheck = "mypy";
  }

  return normalized;
}

export function isDeployChoiceSupported(state: Pick<CustomizerState, "api" | "web">, deploy: DeployChoice): boolean {
  if (deploy === "vercel") {
    return state.web !== "none";
  }

  return state.web === "nextjs" || state.api === "fastapi";
}

export function hasPythonApplicationShape(state: Pick<CustomizerState, "api" | "web">): boolean {
  return state.api === "fastapi" || state.web === "django";
}

export function hasTypeScriptApplicationShape(state: Pick<CustomizerState, "web">): boolean {
  return state.web === "nextjs" || state.web === "vite" || state.web === "tanstack";
}

export function hasApplicationShape(state: Pick<CustomizerState, "api" | "web">): boolean {
  return state.web !== "none" || state.api !== "none";
}

export function isDatabaseChoiceSupported(
  state: Pick<CustomizerState, "api" | "web">,
  database: DatabaseChoice
): boolean {
  return database === "none" || hasApplicationShape(state);
}

export function isAuthChoiceSupported(state: Pick<CustomizerState, "api" | "web">, auth: AuthChoice): boolean {
  if (auth === "none") {
    return true;
  }

  if (auth === "auth0") {
    return state.web === "nextjs" || state.api === "fastapi";
  }

  return hasTypeScriptApplicationShape(state);
}

export function buildCustomizerState(state: CustomizerState): CustomizerResult {
  try {
    const normalizedState = normalizeCustomizerState(state);
    const moduleIds = resolveStateModuleIds(normalizedState);
    const modules = resolveModuleGraph(
      moduleIds.map((id) => {
        const module = moduleById.get(id);

        if (!module) {
          throw new Error(`Unknown Stackkit module: ${id}`);
        }

        return module;
      }),
      { availableModules: builtinModules, availablePresets: builtinPresets }
    );
    const selectedPreset = state.preset === "custom"
      ? []
      : builtinPresets.filter((preset) => preset.id === state.preset);
    assertCreateSupport({
      modules,
      presets: selectedPreset,
      packageManager: state.packageManager,
      includePreview: state.includePreview
    });
    const usesEdgeDrizzle = state.dbRuntime === "edge" && modules.some((module) => module.id === "db/drizzle");
    const recipe: StackkitRecipe = {
      schemaVersion: 1,
      preset: state.preset === "custom" ? undefined : state.preset,
      packageManager: state.packageManager,
      modules: modules.map((module) => module.id),
      options: usesEdgeDrizzle ? { "db/drizzle": { runtime: "edge" } } : {},
      ai: {
        skillTargets: state.claudeCode ? ["codex", "claude-code"] : ["codex"],
        skillMode: state.aiSkillMode,
        linkMode: state.linkMode
      }
    };
    const recipeCode = encodeRecipe(recipe);

    return {
      ok: true,
      catalog: buildCustomizerCatalog({
        modules: builtinModules,
        presets: builtinPresets,
        includePreview: state.includePreview
      }),
      recipe,
      recipeCode,
      command: toCreateCommand(state.projectName, recipeCode, state.includePreview),
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

export function toCreateCommand(projectName: string, recipeCode: string, includePreview = false): string {
  const previewFlag = includePreview ? " --include-preview" : "";
  return `npx @berkayorhan/stackkit@0.3.0 create ${quoteShellArg(projectName.trim() || "my-stack")} --recipe ${recipeCode}${previewFlag}`;
}

function resolveStateModuleIds(state: CustomizerState): string[] {
  return resolveStackAxes(
    {
      web: webModule(state.web),
      ui: uiModule(state.ui),
      api: apiModule(state.api),
      db: state.database === "postgres" ? "postgres" : undefined,
      dbProvider: state.database === "postgres" ? providerModule(state.dbProvider) : undefined,
      auth: authModule(state.auth),
      deploy: state.deploy,
      tsQuality: hasTypeScriptApplicationShape(state) ? state.tsQuality : undefined,
      pyTypecheck: hasPythonApplicationShape(state) ? state.pyTypecheck : undefined
    },
    builtinModules
  );
}

function presetBaseline(preset: string): Partial<CustomizerState> | undefined {
  const baseline: Record<string, Partial<CustomizerState>> = {
    next: {
      web: "nextjs",
      ui: "shadcn",
      api: "none",
      database: "none",
      dbProvider: "byo",
      dbRuntime: "node",
      auth: "none",
      deploy: []
    },
    "next-postgres-clerk": {
      web: "nextjs",
      ui: "shadcn",
      api: "none",
      database: "postgres",
      dbProvider: "byo",
      dbRuntime: "node",
      auth: "clerk",
      deploy: ["vercel"]
    },
    "next-fastapi-postgres-auth0": {
      web: "nextjs",
      ui: "shadcn",
      api: "fastapi",
      database: "postgres",
      dbProvider: "postgres-local",
      dbRuntime: "node",
      auth: "auth0",
      deploy: ["docker"]
    }
  };

  return baseline[preset];
}

function providerModule(provider: DatabaseProviderChoice): string | undefined {
  return provider === "byo" ? undefined : provider;
}

function webModule(web: WebChoice): string | undefined {
  return {
    nextjs: "next",
    vite: "vite",
    tanstack: "tanstack",
    django: "django",
    none: undefined
  }[web];
}

function uiModule(ui: UiChoice): string {
  return ui;
}

function apiModule(api: ApiChoice): string | undefined {
  return {
    fastapi: "fastapi",
    axum: "axum",
    none: undefined
  }[api];
}

function authModule(auth: AuthChoice): string | undefined {
  return {
    auth0: "auth0",
    clerk: "clerk",
    "better-auth": "better-auth",
    none: undefined
  }[auth];
}

function quoteShellArg(value: string): string {
  if (/^[a-zA-Z0-9._/-]+$/.test(value)) {
    return value;
  }

  return `"${value.replaceAll('"', '\\"')}"`;
}
