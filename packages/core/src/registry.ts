import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  stackkitRegistrySchema,
  type StackkitRegistry
} from "@berkayorhan/stackkit-schemas";

import { normalizeProjectPath } from "./fs-utils.js";

// Canonical home is `@berkayorhan/stackkit-schemas`; re-exported here for back-compat so the many
// `from "./registry.js"` / `./index.js` consumers keep working.
export { defineModule, definePreset } from "@berkayorhan/stackkit-schemas";

export async function loadProjectRegistries(
  projectDirectory: string,
  registries: Record<string, string>
): Promise<StackkitRegistry[]> {
  const loaded: StackkitRegistry[] = [];

  for (const [namespace, location] of Object.entries(registries)) {
    if (/^https?:\/\//i.test(location)) {
      throw new Error(`Remote registries are not supported yet: ${namespace}`);
    }

    const fullPath = join(projectDirectory, normalizeProjectPath(location));
    const parsed = stackkitRegistrySchema.parse(JSON.parse(await readFile(fullPath, "utf8")));

    if (parsed.namespace !== namespace) {
      throw new Error(`Registry namespace mismatch: expected ${namespace}, got ${parsed.namespace}`);
    }

    loaded.push(parsed);
  }

  return loaded;
}
