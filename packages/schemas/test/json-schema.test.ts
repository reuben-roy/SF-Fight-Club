import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import Ajv2020 from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

import {
  LLM_OUTPUTS,
  buildLlmJsonSchemas,
  formatJsonSchema,
  generatedSchemaDir,
  loadLlmJsonSchemas,
  mistralResponseFormat,
  type JsonSchema,
} from "../src/index.js";
import { brief, dossier, factCheck, fightReport, roundJudgment, suddenDeath, volleyModel, weighin } from "./fixtures.js";

const ajv = new Ajv2020({ allErrors: true, strict: false });

function isObject(value: unknown): value is JsonSchema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertStrictObjects(node: unknown): void {
  if (Array.isArray(node)) {
    for (const item of node) assertStrictObjects(item);
    return;
  }
  if (!isObject(node)) return;
  if (isObject(node.properties)) {
    expect(node.additionalProperties).toBe(false);
    expect(node.required).toEqual(Object.keys(node.properties));
  }
  for (const value of Object.values(node)) assertStrictObjects(value);
}

const fixtures: Record<(typeof LLM_OUTPUTS)[number]["file"], unknown> = {
  "standard-brief.json": brief,
  "dossier.json": dossier,
  "volley.json": volleyModel,
  "fact-check.json": factCheck,
  "round-judgment.json": roundJudgment,
  "weighin-judgment.json": weighin,
  "sudden-death-vote.json": suddenDeath,
  "fight-report.json": {
    ...fightReport,
    turningPoint: { ...fightReport.turningPoint, criterion: null },
  },
};

describe("Mistral JSON Schema", () => {
  const committed = loadLlmJsonSchemas();
  const built = buildLlmJsonSchemas();

  it("matches the committed files", () => {
    for (const output of LLM_OUTPUTS) {
      const onDisk = readFileSync(resolve(generatedSchemaDir(), output.file), "utf8");
      expect(formatJsonSchema(built[output.file])).toBe(onDisk);
      expect(committed[output.file]).toEqual(built[output.file]);
    }
  });

  it("is a strict object schema with rationale before score", () => {
    for (const output of LLM_OUTPUTS) {
      const schema = built[output.file];
      expect(schema.type).toBe("object");
      expect(schema.$schema).toBeUndefined();
      assertStrictObjects(schema);
      expect(mistralResponseFormat(output.name, schema).json_schema.strict).toBe(true);
    }

    const round = built["round-judgment.json"];
    const criteria = round.properties;
    expect(isObject(criteria)).toBe(true);
    if (!isObject(criteria) || !isObject(criteria.criteria) || !isObject(criteria.criteria.items)) {
      throw new Error("round judgment criteria schema missing");
    }
    const item = criteria.criteria.items;
    if (!isObject(item.properties) || !isObject(item.properties.fighter_1) || !isObject(item.properties.fighter_1.properties)) {
      throw new Error("fighter_1 schema missing");
    }
    expect(Object.keys(item.properties.fighter_1.properties)).toEqual(["rationale", "capsApplied", "score"]);
  });

  it("accepts valid fixtures and rejects a bad score, a missing criterion, and a defense without respondsTo", () => {
    for (const output of LLM_OUTPUTS) {
      const validate = ajv.compile(built[output.file]);
      expect(validate(fixtures[output.file]), JSON.stringify(validate.errors)).toBe(true);
    }

    const round = structuredClone(roundJudgment);
    round.criteria[0]!.fighter_1.score = 11;
    const validateRound = ajv.compile(built["round-judgment.json"]!);
    expect(validateRound(round)).toBe(false);

    const missing = structuredClone(roundJudgment) as unknown as { criteria: Record<string, unknown>[] };
    delete missing.criteria[0]!.criterion;
    expect(validateRound(missing)).toBe(false);

    const defense = {
      shots: [
        {
          type: "defense",
          criterion: "problem",
          headline: "Not their buyer",
          claim: "The city pays.",
          evidence: ["E1"],
          estimate: false,
        },
      ],
    };
    const validateVolley = ajv.compile(built["volley.json"]!);
    expect(validateVolley(defense)).toBe(false);
    expect(
      validateVolley({
        shots: [{ ...defense.shots[0], respondsTo: "r1.v1.B.s1" }],
      }),
    ).toBe(true);
  });

  it("accepts null for optional fight-report fields", () => {
    const validate = ajv.compile(built["fight-report.json"]!);
    expect(
      validate({
        ...fightReport,
        turningPoint: { shotId: null, criterion: null, text: "Market size." },
      }),
    ).toBe(true);
  });
});
