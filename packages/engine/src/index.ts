/**
 * Pure fight engine. No I/O, no clock, no LLM calls.
 * Randomness comes only from a seed the caller passes in.
 */

export { EngineError } from "./errors.js";

export { hash32, mulberry32, rngFromSeed, shuffle } from "./rng.js";

export { assignCorners } from "./corners.js";

export { completedStepKeys, computeAllowed, resultsPublic, stepDisposition } from "./steps.js";

export { outcomeBanner } from "./banner.js";
export type { OutcomeBanner } from "./banner.js";

export {
  BACKFIRE_CAP,
  HP_MAX,
  PYRRHIC_TOTAL,
  criterionDamage,
  isPyrrhicVictory,
  planBackfires,
  rubricWeight,
  signedGap,
} from "./scoring.js";
export type { BackfireHit, BackfirePlan } from "./scoring.js";

export { displayHp, displayHpPath, forcedFinalHp, largestRemainder, scaleHp } from "./hp.js";
export type { HpThresholds, ScoredOutcome } from "./hp.js";

export {
  cleanRoundShots,
  criteriaForRound,
  distributeDamage,
  mechanicalMissingIds,
  shotTarget,
} from "./shots.js";
export type { CarrierShot, CleanLogEntry, CleanRoundResult, DamageShare } from "./shots.js";

export { fighter1Slot, mapJudgeLabel, runTiebreak } from "./tiebreak.js";
export type { SuddenDeathVoteInput, TiebreakInput, TiebreakResult, VcVoteInput } from "./tiebreak.js";

export {
  MAX_FIELD_SIZE,
  MIN_FIELD_SIZE,
  nextPowerOfTwo,
  resolveBracket,
  seedBracket,
  seedPositions,
} from "./bracket.js";
export type {
  Bracket,
  BracketEntrant,
  BracketMatch,
  BracketProjectionInput,
  BracketSide,
  SeedBracketOptions,
  SeededEntrant,
  SlotBets,
  SlotResolution,
  WalkoverReason,
} from "./bracket.js";

export { outcomeFromDelta, resolveMatch, resolveRound, stabilityOf } from "./resolve.js";
export type { JudgeCallInput, ResolveMatchInput, ResolveRoundInput, ResolvedMatch } from "./resolve.js";

export { DIRECTOR_VERSION, direct } from "./director.js";
export type { ComputeLog, DirectorFighter } from "./director.js";

export const ENGINE_VERSION = "1";
