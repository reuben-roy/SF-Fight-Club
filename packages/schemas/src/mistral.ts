import * as z from "zod";

import { dossierSchema, standardBriefSchema } from "./submission.js";
import { factCheckResultSchema, fightReportSchema, roundJudgmentSchema, suddenDeathVoteSchema, weighinJudgmentSchema } from "./judging.js";
import { volleyModelOutputSchema } from "./volley.js";

export interface JsonSchema {
  [key: string]: unknown;
}

export interface MistralResponseFormat {
  type: "json_schema";
  json_schema: {
    name: string;
    schema_definition: JsonSchema;
    strict: true;
  };
}

interface LlmOutput {
  name: string;
  file: string;
  schema: z.ZodType;
}

/**
 * Schemas sent to Mistral as structured outputs. Volley is the model shape
 * (shots without ids). FactCheck is the per-volley object, not a bare array.
 */
export const LLM_OUTPUTS = [
  { name: "StandardBrief", file: "standard-brief.json", schema: standardBriefSchema },
  { name: "Dossier", file: "dossier.json", schema: dossierSchema },
  { name: "Volley", file: "volley.json", schema: volleyModelOutputSchema },
  { name: "FactCheck", file: "fact-check.json", schema: factCheckResultSchema },
  { name: "RoundJudgment", file: "round-judgment.json", schema: roundJudgmentSchema },
  { name: "WeighinJudgment", file: "weighin-judgment.json", schema: weighinJudgmentSchema },
  { name: "SuddenDeathVote", file: "sudden-death-vote.json", schema: suddenDeathVoteSchema },
  { name: "FightReport", file: "fight-report.json", schema: fightReportSchema },
] as const satisfies readonly LlmOutput[];

export const llmSchemas = {
  standardBrief: standardBriefSchema,
  dossier: dossierSchema,
  volley: volleyModelOutputSchema,
  factCheck: factCheckResultSchema,
  roundJudgment: roundJudgmentSchema,
  weighinJudgment: weighinJudgmentSchema,
  suddenDeathVote: suddenDeathVoteSchema,
  fightReport: fightReportSchema,
} as const;

function isJson(value: unknown): value is JsonSchema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Optional fields become required and nullable so Mistral strict mode accepts
 * the schema. Enum and const schemas use anyOf with null, because
 * `type: ["string", "null"]` plus an enum that omits null rejects null.
 */
function nullable(schema: JsonSchema): JsonSchema {
  if (Array.isArray(schema.anyOf)) {
    const branches = schema.anyOf.filter(isJson);
    if (branches.some((branch) => branch.type === "null")) return schema;
    return { ...schema, anyOf: [...branches, { type: "null" }] };
  }
  if (Array.isArray(schema.oneOf)) {
    const branches = schema.oneOf.filter(isJson);
    if (branches.some((branch) => branch.type === "null")) return schema;
    return { ...schema, oneOf: [...branches, { type: "null" }] };
  }
  if (Array.isArray(schema.enum) || Object.prototype.hasOwnProperty.call(schema, "const")) {
    return { anyOf: [schema, { type: "null" }] };
  }
  if (Array.isArray(schema.type)) {
    const types = schema.type.filter((item): item is string => typeof item === "string");
    if (types.includes("null")) return schema;
    return { ...schema, type: [...types, "null"] };
  }
  if (typeof schema.type === "string") {
    return { ...schema, type: [schema.type, "null"] };
  }
  return { anyOf: [schema, { type: "null" }] };
}

function makeStrict(node: unknown): unknown {
  if (Array.isArray(node)) return node.map((item) => makeStrict(item));
  if (!isJson(node)) return node;

  const result: JsonSchema = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "$schema" || key === "unevaluatedProperties") continue;
    result[key] = value;
  }

  if (isJson(result.properties)) {
    const properties: JsonSchema = {};
    for (const [key, value] of Object.entries(result.properties)) {
      properties[key] = makeStrict(value);
    }
    result.properties = properties;
  }
  if ("items" in result) result.items = makeStrict(result.items);
  if (Array.isArray(result.prefixItems)) {
    result.prefixItems = result.prefixItems.map((item) => makeStrict(item));
  }
  for (const key of ["anyOf", "oneOf", "allOf"] as const) {
    if (Array.isArray(result[key])) {
      result[key] = (result[key] as unknown[]).map((item) => makeStrict(item));
    }
  }
  if (isJson(result.$defs)) {
    const defs: JsonSchema = {};
    for (const [key, value] of Object.entries(result.$defs)) defs[key] = makeStrict(value);
    result.$defs = defs;
  }

  if (isJson(result.properties)) {
    const properties = result.properties;
    const originallyRequired = new Set<string>(
      Array.isArray(result.required) ? result.required.filter((item): item is string => typeof item === "string") : [],
    );
    for (const [key, value] of Object.entries(properties)) {
      if (!originallyRequired.has(key) && isJson(value)) {
        properties[key] = nullable(value);
      }
    }
    result.required = Object.keys(properties);
    result.additionalProperties = false;
  } else if (result.type === "object") {
    result.additionalProperties = false;
  }

  return result;
}

/** JSON Schema for Mistral strict structured outputs. `$schema` is omitted, matching the Mistral TS SDK. */
export function toMistralJsonSchema(schema: z.ZodType): JsonSchema {
  const generated = z.toJSONSchema(schema, {
    target: "draft-2020-12",
    unrepresentable: "throw",
    reused: "inline",
    cycles: "throw",
  });
  const strict = makeStrict(generated);
  if (!isJson(strict)) {
    throw new Error("Mistral JSON Schema root must be an object");
  }
  return strict;
}

export function mistralResponseFormat(name: string, schema: JsonSchema): MistralResponseFormat {
  return {
    type: "json_schema",
    json_schema: {
      name,
      schema_definition: schema,
      strict: true,
    },
  };
}

export function formatJsonSchema(schema: JsonSchema): string {
  return `${JSON.stringify(schema, null, 2)}\n`;
}

export function buildLlmJsonSchemas(): Record<(typeof LLM_OUTPUTS)[number]["file"], JsonSchema> {
  const built = {} as Record<(typeof LLM_OUTPUTS)[number]["file"], JsonSchema>;
  for (const output of LLM_OUTPUTS) {
    const schema = toMistralJsonSchema(output.schema);
    if (schema.type !== "object") {
      throw new Error(`${output.name} JSON Schema root must be type object`);
    }
    built[output.file] = schema;
  }
  return built;
}

/** Replace JSON nulls with omitted fields so optional contract fields parse. */
export function nullsToUndefined(value: unknown): unknown {
  if (value === null) return undefined;
  if (Array.isArray(value)) return value.map((item) => nullsToUndefined(item));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      const next = nullsToUndefined(inner);
      if (next !== undefined) out[key] = next;
    }
    return out;
  }
  return value;
}

export function parseMistralOutput<T>(schema: z.ZodType<T>, data: unknown): T {
  return schema.parse(nullsToUndefined(data));
}

export function safeParseMistralOutput<T extends z.ZodType>(schema: T, data: unknown) {
  return schema.safeParse(nullsToUndefined(data));
}
