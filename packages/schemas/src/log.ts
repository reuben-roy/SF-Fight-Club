import * as z from "zod";

import {
  criterionIdSchema,
  decidedBySchema,
  isoDateTimeSchema,
  judgeOrderSchema,
  outcomeKindSchema,
  roundNameSchema,
  roundNumberSchema,
  ROUND_NAME_BY_NUMBER,
  roundOrSuddenDeathSchema,
  slotSchema,
  stabilitySchema,
  tiebreakStrategySchema,
  weaponSchema,
  impactSchema,
} from "./common.js";
import {
  fightReportSchema,
  roundJudgmentSchema,
  shotFactCheckSchema,
  shotVerdictSchema,
  suddenDeathVoteSchema,
} from "./judging.js";
import { evidenceItemSchema } from "./submission.js";
import { volleySchema } from "./volley.js";

const countSchema = z.number().int().nonnegative();

export const fighterBuildSchema = z.strictObject({
  models: z.strictObject({
    fighter: z.string().min(1),
    judge: z.string().min(1),
    utility: z.string().min(1),
    moderation: z.string().min(1),
    embed: z.string().min(1),
  }),
  params: z.strictObject({
    fighterTemperature: z.number(),
    judgeTemperature: z.number(),
    weighinSamples: countSchema,
    weighinTemperature: z.number(),
    suddenDeathSamplesPerOrder: countSchema,
    suddenDeathTemperature: z.number(),
  }),
  budgets: z.strictObject({
    researchSearches: countSchema,
    researchEvidenceKept: countSchema,
    scoutingSearches: countSchema,
    scoutingEvidenceKept: countSchema,
    volleyMaxWords: countSchema,
    shotMaxWords: countSchema,
    shotsPerVolley: z.tuple([countSchema, countSchema]),
    headlineMaxWords: countSchema,
    closingMaxWords: countSchema,
  }),
  promptHashes: z.record(z.string(), z.string()),
  rubricHash: z.string().min(1),
  engineVersion: z.string().min(1),
  tiebreakers: z.array(tiebreakStrategySchema),
  disabledTiebreakers: z.array(tiebreakStrategySchema),
});

const sideScoreSchema = z.strictObject({
  AB: z.number(),
  BA: z.number(),
  extra: z.number().optional(),
  final: z.number(),
});

export const criterionResultSchema = z.strictObject({
  criterion: criterionIdSchema,
  weight: z.number(),
  scores: z.strictObject({
    A: sideScoreSchema,
    B: sideScoreSchema,
  }),
  damageTo: z.strictObject({
    A: z.number(),
    B: z.number(),
  }),
  unstable: z.boolean(),
});

export const roundResolutionSchema = z.strictObject({
  round: roundNumberSchema,
  criteria: z.array(criterionResultSchema),
  shotVerdicts: z.array(shotVerdictSchema),
  fabrications: z.strictObject({
    A: z.array(z.string()),
    B: z.array(z.string()),
  }),
  judgeCallIds: z.array(z.string()),
});

export const tiebreakRecordSchema = z.discriminatedUnion("strategy", [
  z.strictObject({
    strategy: z.literal("sudden_death_judge"),
    votes: z.array(
      z.strictObject({
        order: judgeOrderSchema,
        winner: slotSchema,
        callId: z.string().min(1),
      }),
    ),
    result: z.union([slotSchema, z.literal("split")]),
  }),
  z.strictObject({
    strategy: z.literal("vc_panel"),
    votes: z.array(
      z.strictObject({
        vcUserId: z.string().min(1),
        pick: slotSchema,
        reason: z.string(),
      }),
    ),
    result: z.union([slotSchema, z.literal("abstain")]),
  }),
  z.strictObject({
    strategy: z.literal("weighin_total"),
    totals: z.strictObject({ A: z.number(), B: z.number() }),
    result: z.union([slotSchema, z.literal("too_close")]),
  }),
  z.strictObject({
    strategy: z.literal("seed"),
    seeds: z.strictObject({ A: z.number(), B: z.number() }),
    result: slotSchema,
  }),
]);

const hpTripleSchema = z.tuple([z.number(), z.number(), z.number()]);

export const matchResolutionSchema = z.strictObject({
  rawDamage: z.strictObject({ A: z.number(), B: z.number() }),
  delta: z.number(),
  deltaByOrder: z.strictObject({ AB: z.number(), BA: z.number() }),
  stability: stabilitySchema,
  outcome: outcomeKindSchema,
  decisionType: z.enum(["unanimous", "majority"]).optional(),
  perfect: z.boolean(),
  winner: slotSchema,
  decidedBy: decidedBySchema,
  tiebreak: z.array(tiebreakRecordSchema).optional(),
  lambda: z.number(),
  hpAfterRound: z.strictObject({
    A: hpTripleSchema,
    B: hpTripleSchema,
  }),
});

const eventBase = {
  matchId: z.string().min(1),
  seq: countSchema,
  stepKey: z.string().min(1),
  at: isoDateTimeSchema,
};

function event<const T extends string, const S extends z.ZodRawShape>(type: T, shape: S) {
  return z.strictObject({
    ...eventBase,
    type: z.literal(type),
    ...shape,
  });
}

export const matchEventSchema = z.discriminatedUnion("type", [
  event("match.locked", {
    matchSeed: z.string().min(1),
    buildHash: z.string().min(1),
    corners: z.strictObject({ left: slotSchema, right: slotSchema }),
  }),
  event("scouting.completed", {
    fighter: slotSchema,
    evidence: z.array(evidenceItemSchema),
    callIds: z.array(z.string()),
  }),
  event("volley.submitted", {
    volley: volleySchema,
    callId: z.string().min(1),
  }),
  event("factcheck.completed", {
    fighter: slotSchema,
    round: roundOrSuddenDeathSchema,
    checks: z.array(shotFactCheckSchema),
    callIds: z.array(z.string()),
  }),
  event("judge.completed", {
    round: roundNumberSchema,
    order: judgeOrderSchema,
    judgment: roundJudgmentSchema,
    callId: z.string().min(1),
  }),
  event("round.resolved", {
    resolution: roundResolutionSchema,
  }),
  event("match.resolved", {
    resolution: matchResolutionSchema,
  }),
  event("suddendeath.completed", {
    closings: z.strictObject({ A: volleySchema, B: volleySchema }),
    votes: z.array(suddenDeathVoteSchema),
    callIds: z.array(z.string()),
  }),
  event("tiebreak.applied", {
    record: tiebreakRecordSchema,
  }),
  event("report.completed", {
    report: fightReportSchema,
    callId: z.string().min(1),
  }),
  event("match.sealed", {
    directorVersion: z.string().min(1),
  }),
  event("match.failed", {
    failedStepKey: z.string().min(1),
    error: z.string(),
    attempts: countSchema,
  }),
]);

const fighterIntroSchema = z.strictObject({
  name: z.string(),
  seed: z.number(),
  tier: z.string(),
  spriteSeed: z.string(),
  corner: z.enum(["left", "right"]),
});

const hpAfterSchema = z.strictObject({ A: z.number(), B: z.number() });

function cue<const K extends string, const S extends z.ZodRawShape>(kind: K, shape: S) {
  return z.strictObject({
    t: z.number(),
    id: z.string().min(1),
    kind: z.literal(kind),
    ...shape,
  });
}

export const cueSchema = z.discriminatedUnion("kind", [
  cue("intro", {
    fighters: z.strictObject({
      A: fighterIntroSchema,
      B: fighterIntroSchema,
    }),
  }),
  cue("round_title", {
    round: roundNumberSchema,
    name: roundNameSchema,
    criteria: z.array(z.strictObject({ id: criterionIdSchema, weight: z.number() })),
  }).superRefine((value, ctx) => {
    if (value.name !== ROUND_NAME_BY_NUMBER[value.round]) {
      ctx.addIssue({
        code: "custom",
        path: ["name"],
        message: `round ${value.round} is named ${ROUND_NAME_BY_NUMBER[value.round]}, got ${value.name}`,
      });
    }
  }),
  cue("shot", {
    shooter: slotSchema,
    shotId: z.string().min(1),
    criterion: criterionIdSchema,
    weapon: weaponSchema,
    impact: impactSchema,
    outcome: z.enum(["hit", "crit", "partial", "parried", "glancing", "whiff", "backfire"]),
    headline: z.string(),
    evidence: z.array(
      z.strictObject({
        id: z.string().min(1),
        status: z.enum(["supported", "partial", "estimate", "fabricated"]),
      }),
    ),
    parry: z
      .strictObject({
        defenseShotId: z.string().min(1),
        headline: z.string(),
      })
      .optional(),
    damage: z.number(),
    hpAfter: hpAfterSchema,
  }),
  cue("hammer", {
    target: slotSchema,
    criterion: criterionIdSchema,
    reason: z.string(),
    damage: z.number(),
    hpAfter: hpAfterSchema,
  }),
  cue("scorecard", {
    round: roundNumberSchema,
    rows: z.array(
      z.strictObject({
        criterion: criterionIdSchema,
        A: z.number(),
        B: z.number(),
        points: z.number(),
        hp: z.number(),
        to: slotSchema.nullable(),
      }),
    ),
    agreement: z.number(),
  }),
  cue("outcome", {
    outcome: outcomeKindSchema,
    decisionType: z.enum(["unanimous", "majority"]).optional(),
    perfect: z.boolean(),
  }),
  cue("sudden_death", {
    closings: z.strictObject({ A: z.string(), B: z.string() }),
    tally: z.strictObject({ A: z.number(), B: z.number() }),
  }),
  cue("finisher", {
    winner: slotSchema,
    loser: slotSchema,
    style: z.enum(["ko", "decision"]),
  }),
  cue("winner", {
    winner: slotSchema,
    decidedBy: decidedBySchema,
  }),
]);

export const broadcastScriptSchema = z
  .strictObject({
    matchId: z.string().min(1),
    directorVersion: z.string().min(1),
    durationMs: z.number(),
    cues: z.array(cueSchema),
  })
  .superRefine((script, ctx) => {
    for (let index = 1; index < script.cues.length; index += 1) {
      const previous = script.cues[index - 1];
      const current = script.cues[index];
      if (previous === undefined || current === undefined) continue;
      if (current.t < previous.t) {
        ctx.addIssue({
          code: "custom",
          path: ["cues", index, "t"],
          message: `cues must be sorted by t; ${current.id} at ${current.t} follows ${previous.id} at ${previous.t}`,
        });
      }
    }
  });

export type FighterBuild = z.infer<typeof fighterBuildSchema>;
export type CriterionResult = z.infer<typeof criterionResultSchema>;
export type RoundResolution = z.infer<typeof roundResolutionSchema>;
export type TiebreakRecord = z.infer<typeof tiebreakRecordSchema>;
export type MatchResolution = z.infer<typeof matchResolutionSchema>;
export type MatchEvent = z.infer<typeof matchEventSchema>;
export type Cue = z.infer<typeof cueSchema>;
export type BroadcastScript = z.infer<typeof broadcastScriptSchema>;
