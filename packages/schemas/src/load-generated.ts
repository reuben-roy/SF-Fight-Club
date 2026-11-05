import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { LLM_OUTPUTS, type JsonSchema } from "./mistral.js";
import { generatedSchemaDir } from "./paths.js";

function readGenerated(file: string): JsonSchema {
  const raw: unknown = JSON.parse(readFileSync(resolve(generatedSchemaDir(), file), "utf8"));
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`${file} is not a JSON Schema object`);
  }
  return raw as JsonSchema;
}

/** Committed Mistral JSON Schemas. Regenerate with `pnpm --filter @sf-fight-club/schemas generate`. */
export function loadLlmJsonSchemas(): Record<(typeof LLM_OUTPUTS)[number]["file"], JsonSchema> {
  const loaded = {} as Record<(typeof LLM_OUTPUTS)[number]["file"], JsonSchema>;
  for (const output of LLM_OUTPUTS) {
    loaded[output.file] = readGenerated(output.file);
  }
  return loaded;
}
