import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildLlmJsonSchemas, formatJsonSchema } from "../src/mistral.js";
import { generatedSchemaDir } from "../src/paths.js";

const directory = generatedSchemaDir();
mkdirSync(directory, { recursive: true });

const built = buildLlmJsonSchemas();
for (const [file, schema] of Object.entries(built)) {
  writeFileSync(resolve(directory, file), formatJsonSchema(schema));
}

process.stdout.write(`wrote ${Object.keys(built).length} schemas to ${directory}\n`);
