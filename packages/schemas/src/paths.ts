import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Directory of this file's module: `src/` in tests, `dist/` after build. */
function moduleDir(): string {
  return dirname(fileURLToPath(import.meta.url));
}

/** `packages/schemas`, whether this module is loaded from src or dist. */
export function packageRoot(): string {
  return resolve(moduleDir(), "..");
}

export function repoRoot(): string {
  return resolve(packageRoot(), "../..");
}

export function vcDefaultRubricPath(): string {
  return resolve(repoRoot(), "schemas/rubric.vc-default.json");
}

export function generatedSchemaDir(): string {
  return resolve(packageRoot(), "generated");
}
