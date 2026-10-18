import {
  projectSlugSchema,
  type StackkitConfig,
  type StackkitModule,
  type StackkitPreset
} from "@berkayorhan/stackkit-schemas";

import { applyDefaultTooling } from "./tooling.js";

export type ResolveModuleGraphOptions = {
  presets?: readonly StackkitPreset[];
  availablePresets?: readonly StackkitPreset[];
  selectedPresets?: readonly string[];
  availableModules?: readonly StackkitModule[];
};

export const tsQualityChoices = ["eslint-prettier", "biome"] as const;
export const pyTypecheckChoices = ["mypy", "pyright"] as const;

export type StackAxes = {
  web?: string;
  api?: string;
  db?: string;
  dbClient?: string;
  dbProvider?: string;
  ui?: string;
  auth?: string | readonly string[];
  with?: readonly string[];
  deploy?: readonly string[];
  /** TypeScript lint+format toolchain. Default `eslint-prettier` is gap-filled; `biome` suppresses it. */
  tsQuality?: (typeof tsQualityChoices)[number];
  /** Python type checker. Default `mypy` is gap-filled; `pyright` suppresses it. */
  pyTypecheck?: (typeof pyTypecheckChoices)[number];
};

export type ValidateConfigResult = {
  ok: boolean;
  errors: string[];
};

export function validateProjectSlug(name: string): string {
  const parsed = projectSlugSchema.safeParse(name);

  if (!parsed.success) {
    throw new Error(`Invalid project name: "${name}". Use a lowercase slug such as acme-dashboard.`);
  }

  return parsed.data;
}

export function resolveModuleAlias(input: string, modules: readonly StackkitModule[]): string {
  if (modules.some((module) => module.id === input)) {
    return input;
  }

  const matches = modules.filter((module) => module.aliases.includes(input));

  if (matches.length === 0) {
    throw new Error(`Unknown Stackkit module or alias: ${input}`);
  }

  if (matches.length > 1) {
    throw new Error(`Ambiguous Stackkit alias: ${input}`);
  }

  return matches[0].id;
}

/**
 * Resolve stack-axis choices to module ids. `selected` holds module ids already chosen by a preset or
 * config, so axes compose with them: framework context (Next.js, FastAPI, Axum) and an existing
 * Postgres database or database client come from the selection instead of being re-defaulted.
 */
export function resolveStackAxes(
  axes: StackAxes,
  modules: readonly StackkitModule[],
  selected: readonly string[] = []
): string[] {
  const resolved: string[] = [];
  const api = axes.api ? resolveModuleAlias(axes.api, modules) : undefined;
  const web = axes.web ? resolveModuleAlias(axes.web, modules) : undefined;
  const webModuleDef = web ? modules.find((m) => m.id === web) : undefined;
  const webProvidesReact = webModuleDef?.provides?.includes("react") ?? false;
  const wantsProvider = Boolean(axes.dbProvider && axes.dbProvider !== "byo");
  const db = axes.db
    ? resolveModuleAlias(axes.db, modules)
    : wantsProvider && selected.includes("db/postgres")
      ? "db/postgres"
      : undefined;
  const auth = normalizeSingleAuth(axes.auth);
  const hasNext = web === "web/nextjs" || (!web && selected.includes("web/nextjs"));
  const hasFastApi = api === "api/fastapi" || (!api && selected.includes("api/fastapi"));
  const hasAxum = api === "rust/axum" || (!api && selected.includes("rust/axum"));

  if (wantsProvider && db !== "db/postgres") {
    throw new Error("--db-provider requires a Postgres database. Add --db postgres.");
  }

  if (web) {
    if (webProvidesReact) {
      appendExistingModules(resolved, modules, ["workspace/pnpm-turbo", "workspace/typescript", web]);
      appendUiModule(resolved, modules, axes.ui);
    } else {
      appendModule(resolved, web);
    }
  }

  if (api === "api/fastapi") {
    appendExistingModules(resolved, modules, ["api/fastapi"]);
  } else if (api === "rust/axum") {
    appendExistingModules(resolved, modules, ["rust/tokio", "rust/axum"]);
  } else if (api) {
    appendModule(resolved, api);
  }

  if (db === "db/postgres") {
    appendExistingModules(resolved, modules, ["db/postgres"]);
    if (axes.dbClient || !hasDatabaseClient(selected, modules)) {
      appendDatabaseClient(resolved, modules, axes.dbClient, { hasFastApi, hasAxum });
    }
    appendDatabaseProvider(resolved, modules, axes.dbProvider);
  } else if (db) {
    appendModule(resolved, db);
  } else if (axes.dbClient) {
    appendModule(resolved, resolveDatabaseClientAlias(axes.dbClient, modules, { hasFastApi, hasAxum }));
  }

  if (auth) {
    appendAuthProvider(resolved, modules, auth, { hasNext, hasFastApi, hasAxum });
  }

  for (const moduleId of resolveDeploymentModules(axes.with ?? [], modules, { includeKubernetesBase: false })) {
    appendModule(resolved, moduleId);
  }

  for (const moduleId of resolveDeploymentModules(axes.deploy ?? [], modules, { includeKubernetesBase: true })) {
    appendModule(resolved, moduleId);
  }

  // Non-default tooling choices append their alternative Quality Module; gap-filling
  // (applyDefaultTooling in resolveModuleGraph) then supplies the remaining defaults and the
  // alternative's slot capabilities suppress the defaults it replaces. Default values add nothing.
  if (axes.tsQuality === "biome") {
    appendExistingModules(resolved, modules, ["quality/biome"]);
  }
  if (axes.pyTypecheck === "pyright") {
    appendExistingModules(resolved, modules, ["quality/pyright"]);
  }

  return resolved;
}

function hasDatabaseClient(selected: readonly string[], modules: readonly StackkitModule[]): boolean {
  // Every database client provides a `<language>-db` capability (typescript-db, python-db, rust-db, ...).
  return modules.some(
    (module) => selected.includes(module.id) && (module.provides ?? []).some((capability) => capability.endsWith("-db"))
  );
}

function normalizeSingleAuth(auth: StackAxes["auth"]): string | undefined {
  if (!auth) {
    return undefined;
  }

  const selected = Array.isArray(auth) ? auth : [auth];
  const unique = [...new Set(selected)];

  if (unique.length > 1) {
    throw new Error("Select only one auth provider");
  }

  return unique[0];
}

function appendDatabaseClient(
  resolved: string[],
  modules: readonly StackkitModule[],
  dbClient: string | undefined,
  context: { hasFastApi: boolean; hasAxum: boolean }
): void {
  if (dbClient) {
    appendModule(resolved, resolveDatabaseClientAlias(dbClient, modules, context));
    return;
  }

  if (context.hasFastApi) {
    appendExistingModules(resolved, modules, ["db/sqlalchemy"]);
    return;
  }

  if (context.hasAxum) {
    appendExistingModules(resolved, modules, ["rust/sqlx"]);
    return;
  }

  appendExistingModules(resolved, modules, ["db/drizzle"]);
}

function appendDatabaseProvider(
  resolved: string[],
  modules: readonly StackkitModule[],
  dbProvider: string | undefined
): void {
  if (!dbProvider || dbProvider === "byo") {
    return;
  }

  appendModule(resolved, resolveModuleAlias(dbProvider, modules));
}

function resolveDatabaseClientAlias(
  input: string,
  modules: readonly StackkitModule[],
  context: { hasFastApi: boolean; hasAxum: boolean }
): string {
  if (input === "sqlx" && context.hasAxum && hasModule(modules, "rust/sqlx")) {
    return "rust/sqlx";
  }

  return resolveModuleAlias(input, modules);
}

function appendAuthProvider(
  resolved: string[],
  modules: readonly StackkitModule[],
  auth: string,
  context: { hasNext: boolean; hasFastApi: boolean; hasAxum: boolean }
): void {
  if (auth === "auth0") {
    const initialCount = resolved.length;

    if (context.hasNext) {
      appendExistingModules(resolved, modules, ["auth/auth0-nextjs"]);
    }
    if (context.hasFastApi) {
      appendExistingModules(resolved, modules, ["auth/auth0-fastapi"]);
    }
    if (context.hasAxum) {
      appendExistingModules(resolved, modules, ["auth/auth0-axum"]);
    }
    if (resolved.length === initialCount) {
      throw new Error("Auth0 requires a supported framework context. Select --web next or --api fastapi with --auth auth0.");
    }
    return;
  }

  appendModule(resolved, resolveModuleAlias(auth, modules));
}

function resolveDeploymentModules(
  inputs: readonly string[],
  modules: readonly StackkitModule[],
  options: { includeKubernetesBase: boolean }
): string[] {
  const resolved: string[] = [];

  for (const input of inputs) {
    const moduleId = resolveModuleAlias(input, modules);

    if (moduleId === "deploy/kubernetes" && options.includeKubernetesBase) {
      appendExistingModules(resolved, modules, ["deploy/docker", "deploy/kubernetes"]);
      continue;
    }

    appendModule(resolved, moduleId);
  }

  return resolved;
}

function appendUiModule(resolved: string[], modules: readonly StackkitModule[], ui: string | undefined): void {
  if (ui === "none") {
    return;
  }

  if (ui) {
    appendModule(resolved, resolveModuleAlias(ui, modules));
    return;
  }

  appendExistingModules(resolved, modules, ["ui/shadcn"]);
}

function appendExistingModules(target: string[], modules: readonly StackkitModule[], moduleIds: readonly string[]): void {
  for (const moduleId of moduleIds) {
    if (hasModule(modules, moduleId)) {
      appendModule(target, moduleId);
    }
  }
}

function hasModule(modules: readonly StackkitModule[], moduleId: string): boolean {
  return modules.some((module) => module.id === moduleId);
}

function appendModule(target: string[], moduleId: string): void {
  if (!target.includes(moduleId)) {
    target.push(moduleId);
  }
}

export function resolveModuleGraph(
  modules: readonly StackkitModule[],
  options: ResolveModuleGraphOptions = {}
): StackkitModule[] {
  const expanded = [...expandPresetModules(options), ...modules];
  const unique = dedupeModules(expanded);
  const withTooling = applyDefaultTooling(unique);
  const ordered = orderModulesByRequirements(withTooling);

  validateModuleRequirements(ordered);
  validateModuleConflicts(ordered);
  validateAuthProviderConflicts(ordered);

  return ordered;
}

export function validateStackkitConfig(
  config: StackkitConfig,
  availableModules: readonly StackkitModule[],
  availablePresets: readonly StackkitPreset[] = []
): ValidateConfigResult {
  const errors: string[] = [];
  const moduleById = new Map<string, StackkitModule>(availableModules.map((module) => [module.id, module]));
  const presetById = new Map<string, StackkitPreset>(availablePresets.map((preset) => [preset.id, preset]));
  const selectedModules: StackkitModule[] = [];

  try {
    validateProjectSlug(config.projectName);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  for (const moduleId of config.modules) {
    const module = moduleById.get(moduleId);

    if (!module) {
      errors.push(`Unknown Stackkit module: ${moduleId}`);
      continue;
    }

    selectedModules.push(module);
  }

  if (config.preset && !presetById.has(config.preset)) {
    errors.push(`Unknown Stackkit preset: ${config.preset}`);
  }

  if (errors.length === 0) {
    try {
      resolveModuleGraph(selectedModules, {
        presets: availablePresets,
        selectedPresets: config.preset ? [config.preset] : [],
        availableModules
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

function expandPresetModules(options: ResolveModuleGraphOptions): StackkitModule[] {
  const selectedPresets = options.selectedPresets ?? [];

  if (selectedPresets.length === 0) {
    return [];
  }

  const presets = options.presets ?? options.availablePresets ?? [];
  const presetById = new Map<string, StackkitPreset>(presets.map((preset) => [preset.id, preset]));
  const moduleById = new Map<string, StackkitModule>((options.availableModules ?? []).map((module) => [module.id, module]));
  const expanded: StackkitModule[] = [];

  for (const presetId of selectedPresets) {
    const preset = presetById.get(presetId);

    if (!preset) {
      throw new Error(`Unknown Stackkit preset: ${presetId}`);
    }

    for (const moduleId of preset.modules) {
      const module = moduleById.get(moduleId);

      if (!module) {
        throw new Error(`Preset ${presetId} references unknown module: ${moduleId}`);
      }

      expanded.push(module);
    }
  }

  return expanded;
}

function dedupeModules(modules: readonly StackkitModule[]): StackkitModule[] {
  const moduleById = new Map<string, StackkitModule>();

  for (const module of modules) {
    moduleById.set(module.id, module);
  }

  return [...moduleById.values()];
}

function orderModulesByRequirements(modules: readonly StackkitModule[]): StackkitModule[] {
  const pending = [...modules];
  const ordered: StackkitModule[] = [];
  const provided = new Set<string>();

  while (pending.length > 0) {
    const index = pending.findIndex((module) =>
      (module.requires ?? []).every((capability: string) => provided.has(capability))
    );

    if (index === -1) {
      ordered.push(...pending);
      break;
    }

    const [module] = pending.splice(index, 1);
    ordered.push(module);

    for (const capability of module.provides ?? []) {
      provided.add(capability);
    }
  }

  return ordered;
}

function validateModuleRequirements(modules: readonly StackkitModule[]): void {
  const provided = new Set<string>();

  for (const module of modules) {
    for (const required of module.requires ?? []) {
      if (!provided.has(required)) {
        throw new Error(`Module ${module.id} requires capability ${required}`);
      }
    }

    for (const capability of module.provides ?? []) {
      provided.add(capability);
    }
  }
}

function validateModuleConflicts(modules: readonly StackkitModule[]): void {
  const selected = new Set(modules.map((module) => module.id));

  for (const module of modules) {
    for (const conflict of module.conflicts ?? []) {
      if (selected.has(conflict)) {
        throw new Error(`Module ${module.id} conflicts with ${conflict}`);
      }
    }
  }
}

function validateAuthProviderConflicts(modules: readonly StackkitModule[]): void {
  const providers: string[] = [];

  for (const module of modules) {
    const provider = authProviderKey(module);

    if (provider && !providers.includes(provider)) {
      providers.push(provider);
    }
  }

  if (providers.length > 1) {
    throw new Error(`Conflicting auth providers: ${providers.join(", ")}. Select only one auth provider.`);
  }
}

function authProviderKey(module: StackkitModule): string | undefined {
  if (module.category !== "auth" && !module.id.startsWith("auth/")) {
    return undefined;
  }

  const authModule = module.id.slice("auth/".length);

  if (authModule.startsWith("auth0-")) {
    return "auth0";
  }

  return authModule;
}

export function resolveConfiguredModules(config: StackkitConfig, availableModules: readonly StackkitModule[]): StackkitModule[] {
  const moduleById = new Map<string, StackkitModule>(availableModules.map((module) => [module.id, module]));

  return config.modules.map((moduleId: string) => {
    const module = moduleById.get(moduleId);

    if (!module) {
      throw new Error(`Unknown Stackkit module: ${moduleId}`);
    }

    return module;
  });
}
