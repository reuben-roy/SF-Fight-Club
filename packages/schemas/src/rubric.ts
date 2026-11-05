import { readFileSync } from "node:fs";
import * as z from "zod";

import {
  CRITERION_IDS,
  type CriterionId,
  criterionIdSchema,
  ROUND_OF_CRITERION,
  roundNumberSchema,
} from "./common.js";
import { vcDefaultRubricPath } from "./paths.js";

const anchorSchema = z.strictObject({
  range: z.tuple([z.number(), z.number()]),
  text: z.string(),
});

const capSchema = z.strictObject({
  id: z.string().min(1),
  when: z.string(),
  maxScore: z.number().min(0).max(10),
});

export const criterionSchema = z.strictObject({
  id: criterionIdSchema,
  round: roundNumberSchema,
  name: z.string().min(1),
  weight: z.number(),
  question: z.string(),
  lookFor: z.array(z.string()),
  anchors: z.array(anchorSchema).min(1),
  caps: z.array(capSchema),
});

export const rubricThresholdsSchema = z.strictObject({
  drawMargin: z.number(),
  koMargin: z.number(),
  decisionFloorHp: z.number(),
  suddenDeathFloorHp: z.number(),
  backfirePenalty: z.number(),
  backfireCap: z.number(),
  instabilityGap: z.number(),
  weighinTiebreakGap: z.number(),
});

const rubricFields = {
  id: z.string().min(1),
  version: z.string().min(1),
  criteria: z.array(criterionSchema).min(1),
  thresholds: rubricThresholdsSchema,
};

function rubricIssues(value: {
  criteria: z.infer<typeof criterionSchema>[];
}): { path: (string | number)[]; message: string }[] {
  const issues: { path: (string | number)[]; message: string }[] = [];
  const ids = value.criteria.map((criterion) => criterion.id);
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) duplicates.push(id);
    seen.add(id);
  }
  const missing = CRITERION_IDS.filter((id) => !seen.has(id));
  if (missing.length > 0 || duplicates.length > 0 || ids.length !== CRITERION_IDS.length) {
    issues.push({
      path: ["criteria"],
      message: `rubric must include each criterion once; missing ${missing.join(", ") || "none"}; duplicate ${duplicates.join(", ") || "none"}`,
    });
  }

  value.criteria.forEach((criterion, index) => {
    const expectedRound = ROUND_OF_CRITERION[criterion.id];
    if (criterion.round !== expectedRound) {
      issues.push({
        path: ["criteria", index, "round"],
        message: `${criterion.id} belongs to round ${expectedRound}, got ${criterion.round}`,
      });
    }
    if (!Number.isFinite(criterion.weight) || criterion.weight < 0) {
      issues.push({
        path: ["criteria", index, "weight"],
        message: `${criterion.id} weight must be a non-negative finite number`,
      });
    }
    criterion.anchors.forEach((anchor, anchorIndex) => {
      const [low, high] = anchor.range;
      if (low === undefined || high === undefined || low > high || low < 0 || high > 10) {
        issues.push({
          path: ["criteria", index, "anchors", anchorIndex, "range"],
          message: "anchor range must be a low-to-high pair inside 0 to 10",
        });
      }
    });
  });

  const weightSum = value.criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
  if (!Number.isFinite(weightSum) || Math.abs(weightSum - 100) > 1e-6) {
    issues.push({
      path: ["criteria"],
      message: `criterion weights must sum to 100, got ${weightSum}`,
    });
  }
  return issues;
}

function withRubricRules<T extends z.ZodType<{ criteria: z.infer<typeof criterionSchema>[] }>>(schema: T) {
  return schema.superRefine((value, ctx) => {
    for (const issue of rubricIssues(value)) {
      ctx.addIssue({ code: "custom", message: issue.message, path: issue.path });
    }
  });
}

export const rubricSchema = withRubricRules(z.strictObject(rubricFields));

/**
 * The on-disk rubric includes `calibration` lines that prompts interpolate.
 * `Rubric` in contracts.ts does not. Loaders keep both shapes.
 */
export const rubricDocumentSchema = withRubricRules(
  z.strictObject({
    ...rubricFields,
    calibration: z.array(z.string()).optional(),
  }),
);

export type Criterion = z.infer<typeof criterionSchema>;
export type RubricThresholds = z.infer<typeof rubricThresholdsSchema>;
export type Rubric = z.infer<typeof rubricSchema>;
export type RubricDocument = z.infer<typeof rubricDocumentSchema>;

export function parseRubricDocument(input: unknown): RubricDocument {
  return rubricDocumentSchema.parse(input);
}

/** Parse a rubric file or object into the contract `Rubric`, dropping `calibration`. */
export function parseRubric(input: unknown): Rubric {
  const document = parseRubricDocument(input);
  const { calibration: _calibration, ...rubric } = document;
  return rubricSchema.parse(rubric);
}

export function loadVcDefaultRubricDocument(): RubricDocument {
  const raw: unknown = JSON.parse(readFileSync(vcDefaultRubricPath(), "utf8"));
  return parseRubricDocument(raw);
}

export function loadVcDefaultRubric(): Rubric {
  return parseRubric(loadVcDefaultRubricDocument());
}

export function criterionRound(id: CriterionId): z.infer<typeof roundNumberSchema> {
  return ROUND_OF_CRITERION[id];
}
