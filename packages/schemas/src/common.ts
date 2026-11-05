import * as z from "zod";

export const CRITERION_IDS = [
  "problem",
  "market",
  "wtp",
  "differentiation",
  "moat",
  "timing",
  "gtm",
  "feasibility",
  "scale",
] as const;

export const criterionIdSchema = z.enum(CRITERION_IDS);
export type CriterionId = z.infer<typeof criterionIdSchema>;

export const roundNumberSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type RoundNumber = z.infer<typeof roundNumberSchema>;

export const ROUND_NAMES = ["MARKET", "MOAT", "EXECUTION"] as const;
export const roundNameSchema = z.enum(ROUND_NAMES);
export type RoundName = z.infer<typeof roundNameSchema>;

/** Criteria judged in each round. Round totals for the VC Default weights are 35, 32, 33. */
export const CRITERIA_BY_ROUND: Record<RoundNumber, readonly CriterionId[]> = {
  1: ["problem", "market", "wtp"],
  2: ["differentiation", "moat", "timing"],
  3: ["gtm", "feasibility", "scale"],
};

export const ROUND_NAME_BY_NUMBER: Record<RoundNumber, RoundName> = {
  1: "MARKET",
  2: "MOAT",
  3: "EXECUTION",
};

export const ROUND_OF_CRITERION: Record<CriterionId, RoundNumber> = {
  problem: 1,
  market: 1,
  wtp: 1,
  differentiation: 2,
  moat: 2,
  timing: 2,
  gtm: 3,
  feasibility: 3,
  scale: 3,
};

export const slotSchema = z.enum(["A", "B"]);
export type Slot = z.infer<typeof slotSchema>;

export const WEAPONS = [
  "flame_lance",
  "ballista",
  "coin_cannon",
  "laser_rifle",
  "trebuchet",
  "clockwork_railgun",
  "gatling",
  "rocket",
  "orbital_beam",
] as const;

export const weaponSchema = z.enum(WEAPONS);
export type Weapon = z.infer<typeof weaponSchema>;

export const WEAPON_BY_CRITERION: Record<CriterionId, Weapon> = {
  problem: "flame_lance",
  market: "ballista",
  wtp: "coin_cannon",
  differentiation: "laser_rifle",
  moat: "trebuchet",
  timing: "clockwork_railgun",
  gtm: "gatling",
  feasibility: "rocket",
  scale: "orbital_beam",
};

export const TIEBREAK_STRATEGIES = [
  "sudden_death_judge",
  "vc_panel",
  "weighin_total",
  "seed",
] as const;

export const tiebreakStrategySchema = z.enum(TIEBREAK_STRATEGIES);
export type TiebreakStrategy = z.infer<typeof tiebreakStrategySchema>;

export const decidedBySchema = z.enum(["scores", ...TIEBREAK_STRATEGIES]);
export type DecidedBy = z.infer<typeof decidedBySchema>;

export const outcomeKindSchema = z.enum(["KO", "DECISION", "SUDDEN_DEATH", "BYE", "WALKOVER"]);
export type OutcomeKind = z.infer<typeof outcomeKindSchema>;

export const stabilitySchema = z.enum(["stable", "wobbly", "split"]);
export type Stability = z.infer<typeof stabilitySchema>;

export const judgeLabelSchema = z.enum(["fighter_1", "fighter_2"]);
export type JudgeLabel = z.infer<typeof judgeLabelSchema>;

export const judgeOrderSchema = z.enum(["AB", "BA", "random"]);
export type JudgeOrder = z.infer<typeof judgeOrderSchema>;

export const entailmentSchema = z.enum(["supported", "partial", "unsupported", "contradicted"]);
export type Entailment = z.infer<typeof entailmentSchema>;

export const matchStatusSchema = z.enum([
  "scheduled",
  "betting_open",
  "locked",
  "computing",
  "awaiting_vc",
  "sealed",
  "airing",
  "complete",
  "failed",
  "void",
]);
export type MatchStatus = z.infer<typeof matchStatusSchema>;

/** ISO-8601 timestamp. Accepts `Z` and numeric offsets. */
export const isoDateTimeSchema = z.iso.datetime({ offset: true });

/** Integer rubric score. The comment on ScoredSide requires 0 through 10. */
export const integerScoreSchema = z
  .number()
  .int()
  .min(0)
  .max(10)
  .describe("Integer from 0 to 10. Write the rationale before choosing this.");

export const impactSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

export const roundOrSuddenDeathSchema = z.union([roundNumberSchema, z.literal("sudden_death")]);
