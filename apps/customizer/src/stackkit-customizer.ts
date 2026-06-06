import {
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
    preset: "custom",
    web: "nextjs",
    ui: "shadcn",
    api: "none",
    database: "none",
    dbProvider: "byo",
    dbRuntime: "node",
    auth: "none",
    deploy: ["vercel"],
    tsQuality: "eslint-prettier",
    pyTypecheck: "mypy",
    aiSkillMode: "install",
    claudeCode: false,
    linkMode: "copy"
  };
}

export function normalizeCustomizerState(state: CustomizerState): CustomizerState {
  return {
    ...state,
    deploy: state.deploy.filter((deploy) => isDeployChoiceSupported(state, deploy))
  };
}

export function isDeployChoiceSupported(state: Pick<CustomizerState, "web">, deploy: DeployChoice): boolean {
  if (deploy === "vercel") {
    return state.web !== "none";
  }

  return state.web === "nextjs";
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
      catalog: buildCustomizerCatalog({ modules: builtinModules, presets: builtinPresets }),
      recipe,
      recipeCode,
      command: toCreateCommand(state.projectName, recipeCode),
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

export function toCreateCommand(projectName: string, recipeCode: string): string {
  return `npx @berkayorhan/stackkit@latest create ${quoteShellArg(projectName.trim() || "my-stack")} --recipe ${recipeCode}`;
}

function resolveStateModuleIds(state: CustomizerState): string[] {
  if (state.preset !== "custom") {
    const preset = builtinPresets.find((item) => item.id === state.preset);

    if (!preset) {
      throw new Error(`Unknown Stackkit preset: ${state.preset}`);
    }

    return preset.modules;
  }

  return resolveStackAxes(
    {
      web: webModule(state.web),
      ui: uiModule(state.ui),
      api: apiModule(state.api),
      db: state.database === "postgres" ? "postgres" : undefined,
      dbProvider: state.database === "postgres" ? providerModule(state.dbProvider) : undefined,
      auth: authModule(state.auth),
      deploy: state.deploy,
      tsQuality: state.tsQuality,
      pyTypecheck: state.pyTypecheck
    },
    builtinModules
  );
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
