import type * as Contracts from "../../../schemas/contracts.js";
import type * as Schemas from "../src/index.js";

/** Mutual assignability. Intersections in contracts.ts and flat zod objects are the same values. */
type Assignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type Expect<T extends true> = T;

/**
 * Compile-time check that every zod output matches schemas/contracts.ts.
 * A failure here means a parser drifted from the source of truth.
 */
export type FidelityChecks = [
  Expect<Assignable<Schemas.CriterionId, Contracts.CriterionId>>,
  Expect<Assignable<Schemas.RoundNumber, Contracts.RoundNumber>>,
  Expect<Assignable<Schemas.RoundName, Contracts.RoundName>>,
  Expect<Assignable<Schemas.Criterion, Contracts.Criterion>>,
  Expect<Assignable<Schemas.Rubric, Contracts.Rubric>>,
  Expect<Assignable<Schemas.TiebreakStrategy, Contracts.TiebreakStrategy>>,
  Expect<Assignable<Schemas.FighterBuild, Contracts.FighterBuild>>,
  Expect<Assignable<Schemas.IdeaSubmission, Contracts.IdeaSubmission>>,
  Expect<Assignable<Schemas.StandardBrief, Contracts.StandardBrief>>,
  Expect<Assignable<Schemas.EvidenceItem, Contracts.EvidenceItem>>,
  Expect<Assignable<Schemas.Dossier, Contracts.Dossier>>,
  Expect<Assignable<Schemas.Claim, Contracts.Claim>>,
  Expect<Assignable<Schemas.Slot, Contracts.Slot>>,
  Expect<Assignable<Schemas.VolleyKind, Contracts.VolleyKind>>,
  Expect<Assignable<Schemas.ShotType, Contracts.ShotType>>,
  Expect<Assignable<Schemas.Shot, Contracts.Shot>>,
  Expect<Assignable<Schemas.Volley, Contracts.Volley>>,
  Expect<Assignable<Schemas.Entailment, Contracts.Entailment>>,
  Expect<Assignable<Schemas.ShotFactCheck, Contracts.ShotFactCheck>>,
  Expect<Assignable<Schemas.JudgeLabel, Contracts.JudgeLabel>>,
  Expect<Assignable<Schemas.JudgeOrder, Contracts.JudgeOrder>>,
  Expect<Assignable<Schemas.ScoredSide, Contracts.ScoredSide>>,
  Expect<Assignable<Schemas.CriterionJudgment, Contracts.CriterionJudgment>>,
  Expect<Assignable<Schemas.ShotVerdictKind, Contracts.ShotVerdictKind>>,
  Expect<Assignable<Schemas.ShotVerdict, Contracts.ShotVerdict>>,
  Expect<Assignable<Schemas.RoundJudgment, Contracts.RoundJudgment>>,
  Expect<Assignable<Schemas.WeighinJudgment, Contracts.WeighinJudgment>>,
  Expect<Assignable<Schemas.SuddenDeathVote, Contracts.SuddenDeathVote>>,
  Expect<Assignable<Schemas.CriterionResult, Contracts.CriterionResult>>,
  Expect<Assignable<Schemas.RoundResolution, Contracts.RoundResolution>>,
  Expect<Assignable<Schemas.OutcomeKind, Contracts.OutcomeKind>>,
  Expect<Assignable<Schemas.Stability, Contracts.Stability>>,
  Expect<Assignable<Schemas.MatchResolution, Contracts.MatchResolution>>,
  Expect<Assignable<Schemas.TiebreakRecord, Contracts.TiebreakRecord>>,
  Expect<Assignable<Schemas.MatchStatus, Contracts.MatchStatus>>,
  Expect<Assignable<Schemas.MatchEvent, Contracts.MatchEvent>>,
  Expect<Assignable<Schemas.FightReport, Contracts.FightReport>>,
  Expect<Assignable<Schemas.Weapon, Contracts.Weapon>>,
  Expect<Assignable<Schemas.Cue, Contracts.Cue>>,
  Expect<Assignable<Schemas.BroadcastScript, Contracts.BroadcastScript>>,
  Expect<Assignable<typeof Schemas.WEAPON_BY_CRITERION, typeof Contracts.WEAPON_BY_CRITERION>>,
];
