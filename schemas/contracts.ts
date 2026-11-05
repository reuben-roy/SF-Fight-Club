// SF Fight Club contracts.
// Source of truth for data shapes. Plain TypeScript with no dependencies so it can be read as a spec.
// packages/schemas should mirror these as zod schemas and generate JSON Schema for Mistral structured outputs.

// ---------------------------------------------------------------------------
// Rubric
// ---------------------------------------------------------------------------

export type CriterionId =
  | "problem"
  | "market"
  | "wtp"
  | "differentiation"
  | "moat"
  | "timing"
  | "gtm"
  | "feasibility"
  | "scale";

export type RoundNumber = 1 | 2 | 3;
export type RoundName = "MARKET" | "MOAT" | "EXECUTION";

export interface Criterion {
  id: CriterionId;
  round: RoundNumber;
  name: string;
  weight: number; // all weights in a rubric sum to 100
  question: string;
  lookFor: string[];
  anchors: { range: [number, number]; text: string }[]; // 0-2, 3-4, 5-6, 7-8, 9-10
  caps: { id: string; when: string; maxScore: number }[];
}

export interface Rubric {
  id: string; // "vc-default"
  version: string;
  criteria: Criterion[];
  thresholds: {
    drawMargin: number; // 1.5
    koMargin: number; // 10
    decisionFloorHp: number; // 12
    suddenDeathFloorHp: number; // 6
    backfirePenalty: number; // 1.5 rubric points
    backfireCap: number; // 3 per fighter per match
    instabilityGap: number; // 3: AB vs BA gap on one score that triggers a third judge call
    weighinTiebreakGap: number; // 0.5
  };
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export type TiebreakStrategy = "sudden_death_judge" | "vc_panel" | "weighin_total" | "seed";

export interface FighterBuild {
  models: { fighter: string; judge: string; utility: string; moderation: string; embed: string };
  params: {
    fighterTemperature: number;
    judgeTemperature: number;
    weighinSamples: number;
    weighinTemperature: number;
    suddenDeathSamplesPerOrder: number;
    suddenDeathTemperature: number;
  };
  budgets: {
    researchSearches: number; // 8
    researchEvidenceKept: number; // 12
    scoutingSearches: number; // 3
    scoutingEvidenceKept: number; // 4
    volleyMaxWords: number; // 180
    shotMaxWords: number; // 60
    shotsPerVolley: [number, number]; // [2, 4]
    headlineMaxWords: number; // 12
    closingMaxWords: number; // 120
  };
  promptHashes: Record<string, string>; // prompt file name -> sha256
  rubricHash: string;
  engineVersion: string;
  tiebreakers: TiebreakStrategy[];
  disabledTiebreakers: TiebreakStrategy[]; // "vc_panel" until v2
}

// ---------------------------------------------------------------------------
// Ideas, briefs, research
// ---------------------------------------------------------------------------

export interface IdeaSubmission {
  title: string; // <= 60 chars
  oneLiner: string; // <= 140 chars
  description: string; // <= 1500 chars
  customer?: string;
  businessModel?: string;
  links?: string[];
}

/** Output of prompts/brief.md. Same template and length for every idea. */
export interface StandardBrief {
  title: string;
  oneLiner: string;
  problem: string; // <= 60 words
  customer: string; // <= 40 words
  solution: string; // <= 60 words
  businessModel: string; // <= 40 words
  whyNow: string; // <= 40 words
  category: string; // e.g. "proptech", "climate", "devtools"
  strippedContent: string[]; // things removed: instructions, private names
}

export interface EvidenceItem {
  id: string; // "E12", unique within a match locker
  url: string;
  title: string;
  snippet: string; // <= 500 chars, never the full page
  retrievedAt: string; // ISO
  foundBy: { kind: "dossier"; ideaId: string } | { kind: "scouting"; fighter: Slot };
}

/** Output of prompts/researcher.md. A research timeout retries up to 3 times, then this is built from what finished and the weigh-in log marks it partial. */
export interface Dossier {
  ideaId: string;
  sections: {
    problemEvidence: Claim[];
    marketSizing: Claim[]; // bottom-up preferred
    competitors: { name: string; kind: "direct" | "indirect" | "status_quo"; note: string; evidence: string[] }[];
    pricingAnalogs: Claim[];
    whyNowSignals: Claim[];
    risks: Claim[];
  };
  summary: string; // <= 150 words, shown to the opponent and judges
  gaps: string[]; // sections where nothing useful was found
}

export interface Claim {
  text: string;
  evidence: string[]; // evidence IDs
  estimate: boolean; // true when no source backs it
}

// ---------------------------------------------------------------------------
// Fighters and volleys
// ---------------------------------------------------------------------------

export type Slot = "A" | "B";
export type VolleyKind = "pitch_strike" | "counter" | "closing";
export type ShotType = "pitch" | "attack" | "defense";

/** One argument. What the arena animates. */
export interface Shot {
  id: string; // "r1.v1.A.s2", assigned by the orchestrator, not the model
  type: ShotType;
  criterion: CriterionId; // must belong to the current round; another round's criterion is dropped and logged
  headline: string; // <= 12 words, shown as the caption
  claim: string; // <= 60 words, shown in receipts
  evidence: string[]; // evidence IDs from the match locker
  estimate: boolean;
  respondsTo?: string; // required when type === "defense"; a missing shot is treated as a pitch on this criterion
}

/** Output of prompts/fighter.md for one volley. The model returns shots without ids. */
export interface Volley {
  matchId: string;
  round: RoundNumber | "sudden_death";
  kind: VolleyKind;
  fighter: Slot;
  shots: Shot[];
  wordCount: number;
  truncated: boolean;
  refused: boolean;
}

// ---------------------------------------------------------------------------
// Fact-check
// ---------------------------------------------------------------------------

export type Entailment = "supported" | "partial" | "unsupported" | "contradicted";

export interface ShotFactCheck {
  shotId: string;
  missingIds: string[]; // cited IDs not in the locker -> fabrication
  perEvidence: { evidenceId: string; verdict: Entailment; note: string }[];
  numberContradicted: boolean; // a specific number in the claim conflicts with a snippet
  fabricated: boolean; // missingIds.length > 0 || numberContradicted
}

// ---------------------------------------------------------------------------
// Judging (LLM outputs, labeled fighter_1 / fighter_2)
// ---------------------------------------------------------------------------

export type JudgeLabel = "fighter_1" | "fighter_2";
export type JudgeOrder = "AB" | "BA" | "random";

export interface ScoredSide {
  rationale: string; // written before the score
  capsApplied: string[];
  score: number; // integer 0-10
}

export interface CriterionJudgment {
  criterion: CriterionId;
  comparison: string;
  fighter_1: ScoredSide;
  fighter_2: ScoredSide;
}

export type ShotVerdictKind = "landed" | "partial" | "glancing" | "parried" | "whiff";

export interface ShotVerdict {
  shotId: string;
  verdict: ShotVerdictKind; // for defense shots: "landed" means the defense worked
  impact: 0 | 1 | 2 | 3;
  note: string;
}

/** Output of prompts/round_judge.md for one call. */
export interface RoundJudgment {
  criteria: CriterionJudgment[]; // exactly the round's three criteria
  shots: ShotVerdict[]; // one per shot in the round
  injectionSuspected: boolean;
  roundSummary: string;
}

/** Output of prompts/weighin_judge.md for one sample. */
export interface WeighinJudgment {
  criteria: { criterion: CriterionId; rationale: string; capsApplied: string[]; score: number }[];
  redFlags: string[];
  injectionSuspected: boolean;
}

/** Output of prompts/sudden_death_judge.md for one call. */
export interface SuddenDeathVote {
  analysis: string;
  winner: JudgeLabel;
  confidence: number; // 0-1
  decidingFactor: string;
}

// ---------------------------------------------------------------------------
// Engine outputs (deterministic code, labeled A / B)
// ---------------------------------------------------------------------------

export interface CriterionResult {
  criterion: CriterionId;
  weight: number;
  scores: {
    A: { AB: number; BA: number; extra?: number; final: number };
    B: { AB: number; BA: number; extra?: number; final: number };
  };
  damageTo: { A: number; B: number }; // rubric points: weight * max(0, margin) / 10
  unstable: boolean; // AB vs BA gap > instabilityGap on either side
}

export interface RoundResolution {
  round: RoundNumber;
  criteria: CriterionResult[];
  shotVerdicts: ShotVerdict[]; // merged across calls, conservative on disagreement
  fabrications: { A: string[]; B: string[] }; // shot ids
  judgeCallIds: string[];
}

export type OutcomeKind = "KO" | "DECISION" | "SUDDEN_DEATH" | "BYE" | "WALKOVER";
export type Stability = "stable" | "wobbly" | "split";

export interface MatchResolution {
  rawDamage: { A: number; B: number }; // D_A, D_B incl. capped backfire
  delta: number; // D_B - D_A. Positive favors A.
  deltaByOrder: { AB: number; BA: number };
  stability: Stability;
  outcome: OutcomeKind;
  decisionType?: "unanimous" | "majority";
  perfect: boolean;
  winner: Slot;
  decidedBy: "scores" | TiebreakStrategy;
  tiebreak?: TiebreakRecord[];
  lambda: number; // HP per rubric point
  hpAfterRound: { A: [number, number, number]; B: [number, number, number] }; // before sudden death
}

export type TiebreakRecord =
  | { strategy: "sudden_death_judge"; votes: { order: JudgeOrder; winner: Slot; callId: string }[]; result: Slot | "split" }
  | { strategy: "vc_panel"; votes: { vcUserId: string; pick: Slot; reason: string }[]; result: Slot | "abstain" }
  | { strategy: "weighin_total"; totals: { A: number; B: number }; result: Slot | "too_close" }
  | { strategy: "seed"; seeds: { A: number; B: number }; result: Slot };

// ---------------------------------------------------------------------------
// Match lifecycle and compute log
// ---------------------------------------------------------------------------

export type MatchStatus =
  | "scheduled"
  | "betting_open"
  | "locked"
  | "computing"
  | "awaiting_vc" // reserved for v2
  | "sealed"
  | "airing"
  | "complete"
  | "failed"
  | "void";

interface EventBase {
  matchId: string;
  seq: number;
  stepKey: string; // unique per match, e.g. "r2/v1/A", "r2/judge/BA"
  at: string; // ISO
}

export type MatchEvent =
  | (EventBase & { type: "match.locked"; matchSeed: string; buildHash: string; corners: { left: Slot; right: Slot } }) // corners drawn from matchSeed, not seed number
  | (EventBase & { type: "scouting.completed"; fighter: Slot; evidence: EvidenceItem[]; callIds: string[] })
  | (EventBase & { type: "volley.submitted"; volley: Volley; callId: string })
  | (EventBase & { type: "factcheck.completed"; fighter: Slot; round: RoundNumber | "sudden_death"; checks: ShotFactCheck[]; callIds: string[] })
  | (EventBase & { type: "judge.completed"; round: RoundNumber; order: JudgeOrder; judgment: RoundJudgment; callId: string })
  | (EventBase & { type: "round.resolved"; resolution: RoundResolution })
  | (EventBase & { type: "match.resolved"; resolution: MatchResolution })
  | (EventBase & { type: "suddendeath.completed"; closings: { A: Volley; B: Volley }; votes: SuddenDeathVote[]; callIds: string[] })
  | (EventBase & { type: "tiebreak.applied"; record: TiebreakRecord })
  | (EventBase & { type: "report.completed"; report: FightReport; callId: string })
  | (EventBase & { type: "match.sealed"; directorVersion: string })
  | (EventBase & { type: "match.failed"; failedStepKey: string; error: string; attempts: number });

/** Output of prompts/fight_report.md. */
export interface FightReport {
  headline: string; // "PermitPilot K.O.s Fogcast in round 3"
  whyTheyWon: string[]; // exactly 3 bullets, each tied to criteria
  turningPoint: { shotId?: string; criterion?: CriterionId; text: string };
  loserTakeaways: string[]; // feedback for the losing founder, 2-4 items
  announcerLines: { cueRef: string; text: string }[]; // short, punchy, for TTS
}

// ---------------------------------------------------------------------------
// Broadcast script (director output, consumed by the arena)
// ---------------------------------------------------------------------------

export type Weapon =
  | "flame_lance"
  | "ballista"
  | "coin_cannon"
  | "laser_rifle"
  | "trebuchet"
  | "clockwork_railgun"
  | "gatling"
  | "rocket"
  | "orbital_beam";

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

interface CueBase {
  t: number; // ms from air start
  id: string;
}

export type Cue =
  | (CueBase & { kind: "intro"; fighters: Record<Slot, { name: string; seed: number; tier: string; spriteSeed: string; corner: "left" | "right" }> })
  | (CueBase & { kind: "round_title"; round: RoundNumber; name: RoundName; criteria: { id: CriterionId; weight: number }[] })
  | (CueBase & {
      kind: "shot";
      shooter: Slot;
      shotId: string;
      criterion: CriterionId;
      weapon: Weapon;
      impact: 0 | 1 | 2 | 3;
      outcome: "hit" | "crit" | "partial" | "parried" | "glancing" | "whiff" | "backfire";
      headline: string;
      evidence: { id: string; status: "supported" | "partial" | "estimate" | "fabricated" }[];
      parry?: { defenseShotId: string; headline: string };
      damage: number; // displayed integer HP to the target (or to the shooter on backfire)
      hpAfter: Record<Slot, number>;
    })
  | (CueBase & { kind: "hammer"; target: Slot; criterion: CriterionId; reason: string; damage: number; hpAfter: Record<Slot, number> })
  | (CueBase & { kind: "scorecard"; round: RoundNumber; rows: { criterion: CriterionId; A: number; B: number; points: number; hp: number; to: Slot | null }[]; agreement: number })
  | (CueBase & { kind: "outcome"; outcome: OutcomeKind; decisionType?: "unanimous" | "majority"; perfect: boolean })
  | (CueBase & { kind: "sudden_death"; closings: Record<Slot, string>; tally: Record<Slot, number> })
  | (CueBase & { kind: "finisher"; winner: Slot; loser: Slot; style: "ko" | "decision" })
  | (CueBase & { kind: "winner"; winner: Slot; decidedBy: MatchResolution["decidedBy"] });

export interface BroadcastScript {
  matchId: string;
  directorVersion: string;
  durationMs: number;
  cues: Cue[]; // sorted by t
}
