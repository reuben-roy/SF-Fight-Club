import { createHash } from "node:crypto";

import type { FighterBuild } from "@sf-fight-club/schemas";

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => sortValue(item));
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      out[key] = sortValue(source[key]);
    }
    return out;
  }
  return value;
}

/** Stable JSON: object keys sorted at every level, arrays left in order. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

/**
 * `build_hash` from the fight-system doc. Tiebreak lists are config around
 * the build, not part of this hash. One hash is shared by every fighter.
 */
export function buildHash(build: FighterBuild): string {
  const payload = {
    models: build.models,
    params: build.params,
    budgets: build.budgets,
    prompt_hashes: build.promptHashes,
    rubric_hash: build.rubricHash,
    engine_version: build.engineVersion,
  };
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}
