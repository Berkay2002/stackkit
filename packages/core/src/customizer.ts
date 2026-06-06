import {
  stackkitModuleSchema,
  stackkitPresetSchema,
  stackkitRecipeSchema,
  type ModuleId,
  type StackkitModule,
  type StackkitModuleInput,
  type StackkitPreset,
  type StackkitPresetInput,
  type StackkitRecipe,
  type StackkitRecipeInput
} from "@berkayorhan/stackkit-schemas";

export type CustomizerCatalogChoice = {
  id: string;
  alias: string;
  title: string;
  description: string;
  icon?: string;
};

export type CustomizerCatalog = {
  presets: {
    id: string;
    title: string;
    description: string;
    modules: string[];
  }[];
  categories: Record<string, CustomizerCatalogChoice[]>;
};

export type ResolveModuleGraphOptions = {
  presets?: readonly StackkitPreset[];
  availablePresets?: readonly StackkitPreset[];
  selectedPresets?: readonly string[];
  availableModules?: readonly StackkitModule[];
};

export type StackAxes = {
  web?: string;
  api?: string;
  db?: string;
  dbClient?: string;
  dbProvider?: string;
  auth?: string | readonly string[];
  with?: readonly string[];
  deploy?: readonly string[];
};

export function defineModule(module: StackkitModuleInput): StackkitModule {
  return stackkitModuleSchema.parse(module);
}

export function definePreset(preset: StackkitPresetInput): StackkitPreset {
  return stackkitPresetSchema.parse(preset);
}

export function buildCustomizerCatalog(input: {
  modules: readonly StackkitModule[];
  presets: readonly StackkitPreset[];
}): CustomizerCatalog {
  const categories: Record<string, CustomizerCatalogChoice[]> = {};

  for (const module of input.modules) {
    const category = module.category ?? "other";
    const choice: CustomizerCatalogChoice = {
      id: module.id,
      alias: module.aliases[0] ?? module.id,
      title: module.title,
      description: module.description
    };

    if (module.icon) {
      choice.icon = module.icon;
    }

    categories[category] ??= [];
    categories[category].push(choice);
  }

  for (const choices of Object.values(categories)) {
    choices.sort(compareCatalogChoices);
  }

  return {
    presets: input.presets
      .map((preset) => ({
        id: preset.id,
        title: preset.title,
        description: preset.description,
        modules: [...preset.modules]
      }))
      .sort((left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id)),
    categories: Object.fromEntries(Object.entries(categories).sort(([left], [right]) => left.localeCompare(right)))
  };
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

export function resolveStackAxes(axes: StackAxes, modules: readonly StackkitModule[]): string[] {
  const resolved: string[] = [];
  const api = axes.api ? resolveModuleAlias(axes.api, modules) : undefined;
  const web = axes.web ? resolveModuleAlias(axes.web, modules) : undefined;
  const db = axes.db ? resolveModuleAlias(axes.db, modules) : undefined;
  const auth = normalizeSingleAuth(axes.auth);
  const hasNext = web === "web/nextjs";
  const hasFastApi = api === "api/fastapi";
  const hasAxum = api === "rust/axum";

  if (hasNext) {
    appendExistingModules(resolved, modules, [
      "workspace/pnpm-turbo",
      "workspace/typescript",
      "web/nextjs",
      "ui/shadcn",
      "quality/eslint"
    ]);
  } else if (web) {
    appendModule(resolved, web);
  }

  if (hasFastApi) {
    appendExistingModules(resolved, modules, ["api/fastapi"]);
  } else if (hasAxum) {
    appendExistingModules(resolved, modules, ["rust/tokio", "rust/axum"]);
  } else if (api) {
    appendModule(resolved, api);
  }

  if (db === "db/postgres") {
    appendExistingModules(resolved, modules, ["db/postgres"]);
    appendDatabaseClient(resolved, modules, axes.dbClient, { hasFastApi, hasAxum });
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

  return resolved;
}

export function resolveModuleGraph(
  modules: readonly StackkitModule[],
  options: ResolveModuleGraphOptions = {}
): StackkitModule[] {
  const expanded = [...expandPresetModules(options), ...modules];
  const unique = dedupeModules(expanded);
  const ordered = orderModulesByRequirements(unique);

  validateModuleRequirements(ordered);
  validateModuleConflicts(ordered);
  validateAuthProviderConflicts(ordered);

  return ordered;
}

export function encodeRecipe(recipe: StackkitRecipeInput): string {
  const json = JSON.stringify(stackkitRecipeSchema.parse(recipe));

  return `sk_${toBase64Url(json)}`;
}

export function decodeRecipe(code: string): StackkitRecipe {
  if (!code.startsWith("sk_")) {
    throw new Error("Invalid Stackkit recipe code");
  }

  try {
    return stackkitRecipeSchema.parse(JSON.parse(fromBase64Url(code.slice(3))));
  } catch {
    throw new Error("Invalid Stackkit recipe code");
  }
}

function compareCatalogChoices(left: CustomizerCatalogChoice, right: CustomizerCatalogChoice): number {
  return left.title.localeCompare(right.title) || left.id.localeCompare(right.id);
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

function toBase64Url(value: string): string {
  const binary = String.fromCodePoint(...new TextEncoder().encode(value));

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}
