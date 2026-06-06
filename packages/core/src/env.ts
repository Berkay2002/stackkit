import { envVarDefinitionSchema, type EnvVarDefinition } from "@berkayorhan/stackkit-schemas";

export type NormalizedEnvVar = {
  name: string;
  description: string;
  required: boolean;
  example?: string;
  target: "root" | "web" | "api" | "db";
};

export const envTargets = ["root", "web", "api", "db"] as const;

export function normalizeEnvVars(envVars: readonly EnvVarDefinition[]): NormalizedEnvVar[] {
  const byName = new Map<string, NormalizedEnvVar>();

  for (const envVar of envVars) {
    const normalized = envVarDefinitionSchema.parse(envVar) as NormalizedEnvVar;
    const existing = byName.get(normalized.name);

    if (!existing) {
      byName.set(normalized.name, normalized);
      continue;
    }

    if (!isCompatibleEnvVar(existing, normalized)) {
      throw new Error(`Incompatible environment variable metadata for ${normalized.name}`);
    }
  }

  return [...byName.values()].sort((left, right) => {
    const targetOrder = envTargetOrder(left.target) - envTargetOrder(right.target);

    return targetOrder === 0 ? left.name.localeCompare(right.name) : targetOrder;
  });
}

export function isCompatibleEnvVar(left: NormalizedEnvVar, right: NormalizedEnvVar): boolean {
  return (
    left.description === right.description &&
    left.required === right.required &&
    (left.example ?? "") === (right.example ?? "") &&
    left.target === right.target
  );
}

export function envTargetOrder(target: NormalizedEnvVar["target"]): number {
  return { root: 0, web: 1, api: 2, db: 3 }[target];
}

export function envTargetLabel(target: NormalizedEnvVar["target"]): string {
  return { root: "Root", web: "Web", api: "API", db: "Database" }[target];
}

export function renderEnvExampleContent(envVars: readonly NormalizedEnvVar[]): string {
  const sections = envTargets.flatMap((target) => {
    const targetVars = envVars.filter((envVar) => envVar.target === target);

    if (targetVars.length === 0) {
      return [];
    }

    return [
      [
        `# ${envTargetLabel(target)}`,
        ...targetVars.flatMap((envVar) => [`# ${envVar.description}`, `${envVar.name}=${envVar.example ?? ""}`, ""])
      ].join("\n")
    ];
  });

  return sections.length > 0 ? `${sections.join("\n")}\n` : "";
}
