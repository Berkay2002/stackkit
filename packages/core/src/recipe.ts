import { Buffer } from "node:buffer";

import {
  stackkitRecipeSchema,
  type StackkitRecipe,
  type StackkitRecipeInput
} from "@berkayorhan/stackkit-schemas";

export function encodeRecipe(recipe: StackkitRecipeInput): string {
  const json = JSON.stringify(stackkitRecipeSchema.parse(recipe));

  return `sk_${Buffer.from(json, "utf8").toString("base64url")}`;
}

export function decodeRecipe(code: string): StackkitRecipe {
  if (!code.startsWith("sk_")) {
    throw new Error("Invalid Stackkit recipe code");
  }

  try {
    const json = Buffer.from(code.slice(3), "base64url").toString("utf8");

    return stackkitRecipeSchema.parse(JSON.parse(json));
  } catch {
    throw new Error("Invalid Stackkit recipe code");
  }
}
