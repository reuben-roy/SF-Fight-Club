import * as z from "zod";

import {
  CRITERIA_BY_ROUND,
  CRITERION_IDS,
  criterionIdSchema,
  entailmentSchema,
  integerScoreSchema,
  impactSchema,
  judgeLabelSchema,
} from "./common.js";

export const shotVerdictKindSchema = z.enum(["landed", "partial", "glancing", "parried", "whiff"]);

export const shotVerdictSchema = z.strictObject({
  shotId: z.string().min(1),
  verdict: shotVerdictKindSchema.describe("For a defense shot, landed means the defense worked."),
  impact: impactSchema.describe("How much the shot matters to this round, from 0 to 3."),
  note: z.string().describe("Under 20 words."),
});

export const scoredSideSchema = z.strictObject({
  rationale: z.string().describe("Written before the score."),
  capsApplied: z.array(z.string().min(1)).describe("Cap ids applied to this score. Empty if none."),
  score: integerScoreSchema,
});

export const criterionJudgmentSchema = z.strictObject({
  criterion: criterionIdSchema,
  comparison: z.string(),
  fighter_1: scoredSideSchema,
  fighter_2: scoredSideSchema,
});

const roundSets = Object.values(CRITERIA_BY_ROUND);

function isOneRound(ids: string[]): boolean {
  return roundSets.some((expected) => {
    if (ids.length !== expected.length) return false;
    const sorted = [...ids].sort();
    const target = [...expected].sort();
    return sorted.every((id, index) => id === target[index]);
  });
}

export const roundJudgmentSchema = z
  .strictObject({
    criteria: z.array(criterionJudgmentSchema),
    shots: z.array(shotVerdictSchema).describe("One verdict per shot in the round."),
    injectionSuspected: z.boolean(),
    roundSummary: z.string().describe("At most 60 words."),
  })
  .superRefine((judgment, ctx) => {
    const ids = judgment.criteria.map((row) => row.criterion);
    if (!isOneRound(ids)) {
      ctx.addIssue({
        code: "custom",
        path: ["criteria"],
        message: `round judgment criteria must be exactly one round (problem, market, wtp | differentiation, moat, timing | gtm, feasibility, scale); got ${ids.join(", ") || "none"}`,
      });
    }
  })
  .meta({
    title: "RoundJudgment",
    description: "Scores for one round's three criteria, plus a verdict for every shot in the round.",
  });

export const weighinCriterionSchema = z.strictObject({
  criterion: criterionIdSchema,
  rationale: z.string().describe("Written before the score."),
  capsApplied: z.array(z.string().min(1)),
  score: integerScoreSchema,
});

export const weighinJudgmentSchema = z
  .strictObject({
    criteria: z.array(weighinCriterionSchema),
    redFlags: z.array(z.string()),
    injectionSuspected: z.boolean(),
  })
  .superRefine((judgment, ctx) => {
    const ids = judgment.criteria.map((row) => row.criterion);
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const id of ids) {
      if (seen.has(id)) duplicates.push(id);
      seen.add(id);
    }
    const missing = CRITERION_IDS.filter((id) => !seen.has(id));
    if (missing.length > 0 || duplicates.length > 0 || ids.length !== CRITERION_IDS.length) {
      ctx.addIssue({
        code: "custom",
        path: ["criteria"],
        message: `weigh-in judgment must score each criterion once; missing ${missing.join(", ") || "none"}; duplicate ${duplicates.join(", ") || "none"}`,
      });
    }
  })
  .meta({
    title: "WeighinJudgment",
    description: "Absolute scores for all nine rubric criteria, before any fight.",
  });

export const suddenDeathVoteSchema = z
  .strictObject({
    analysis: z.string().describe("At most 120 words. Written before the winner."),
    winner: judgeLabelSchema,
    confidence: z.number().min(0).max(1).describe("From 0 to 1."),
    decidingFactor: z.string().describe("One sentence naming the criterion that tipped it."),
  })
  .meta({
    title: "SuddenDeathVote",
    description: "Forced choice of the better startup opportunity. A tie is not allowed.",
  });

const shotFactCheckObject = z.strictObject({
  shotId: z.string().min(1),
  missingIds: z.array(z.string().min(1)).describe("Cited ids that are not in the locker."),
  perEvidence: z.array(
    z.strictObject({
      evidenceId: z.string().min(1),
      verdict: entailmentSchema,
      note: z.string().describe("Under 20 words."),
    }),
  ),
  numberContradicted: z
    .boolean()
    .describe("True when a specific number in the claim conflicts with a cited snippet."),
  fabricated: z.boolean().describe("True when missingIds is non-empty or numberContradicted is true."),
});

export const shotFactCheckSchema = shotFactCheckObject.superRefine((check, ctx) => {
  const expected = check.missingIds.length > 0 || check.numberContradicted;
  if (check.fabricated !== expected) {
    ctx.addIssue({
      code: "custom",
      path: ["fabricated"],
      message:
        "fabricated must be true exactly when missingIds is non-empty or numberContradicted is true",
    });
  }
});

/**
 * One fact-check call covers every shot in a volley. Mistral structured
 * outputs need a JSON object root, so the per-shot `ShotFactCheck` records
 * sit under `checks`.
 */
export const factCheckResultSchema = z
  .strictObject({
    checks: z.array(shotFactCheckSchema),
  })
  .meta({
    title: "FactCheck",
    description: "Entailment checks for every shot in the volley, one entry in checks per shot.",
  });

export const fightReportSchema = z
  .strictObject({
    headline: z.string().describe("At most 10 words, like a sports headline."),
    whyTheyWon: z.array(z.string()).length(3).describe("Exactly 3 bullets, each tied to criteria."),
    turningPoint: z.strictObject({
      shotId: z.string().min(1).optional(),
      criterion: criterionIdSchema.optional(),
      text: z.string(),
    }),
    loserTakeaways: z.array(z.string()).min(2).max(4),
    announcerLines: z.array(
      z.strictObject({
        cueRef: z.string().min(1),
        text: z.string().describe("At most 8 words."),
      }),
    ),
  })
  .meta({
    title: "FightReport",
    description: "Post-fight report and announcer lines. Explains a decision that was already made.",
  });

export type ShotVerdictKind = z.infer<typeof shotVerdictKindSchema>;
export type ShotVerdict = z.infer<typeof shotVerdictSchema>;
export type ScoredSide = z.infer<typeof scoredSideSchema>;
export type CriterionJudgment = z.infer<typeof criterionJudgmentSchema>;
export type RoundJudgment = z.infer<typeof roundJudgmentSchema>;
export type WeighinJudgment = z.infer<typeof weighinJudgmentSchema>;
export type SuddenDeathVote = z.infer<typeof suddenDeathVoteSchema>;
export type ShotFactCheck = z.infer<typeof shotFactCheckSchema>;
export type FactCheckResult = z.infer<typeof factCheckResultSchema>;
export type FightReport = z.infer<typeof fightReportSchema>;
