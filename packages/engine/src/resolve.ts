import {
  CRITERIA_BY_ROUND,
  type CriterionId,
  type CriterionResult,
  type DecidedBy,
  type JudgeOrder,
  type MatchResolution,
  type RoundJudgment,
  type RoundNumber,
  type RoundResolution,
  type Rubric,
  type Shot,
  type ShotFactCheck,
  type ShotVerdict,
  type ShotVerdictKind,
  type Slot,
  type Stability,
} from "@sf-fight-club/schemas";

import { EngineError } from "./errors.js";
import { displayHpPath, forcedFinalHp, scaleHp, type ScoredOutcome } from "./hp.js";
import { criterionDamage, isPyrrhicVictory, planBackfires, rubricWeight, signedGap, type BackfirePlan } from "./scoring.js";
import { fighter1Slot, runTiebreak, type TiebreakInput } from "./tiebreak.js";

const VERDICT_RANK: Record<ShotVerdictKind, number> = {
  whiff: 0,
  glancing: 1,
  parried: 2,
  partial: 3,
  landed: 4,
};

export interface JudgeCallInput {
  order: JudgeOrder;
  callId: string;
  judgment: RoundJudgment;
  /** Required when `order` is `random`: the slot presented as fighter 1. */
  fighter1?: Slot;
}

export interface ResolveRoundInput {
  round: RoundNumber;
  rubric: Rubric;
  ab: JudgeCallInput;
  ba: JudgeCallInput;
  /** Required when any score moves by more than `instabilityGap` between AB and BA. */
  extra?: JudgeCallInput;
  /** Cleaned shots for this round. Fabrications are attributed from these ids. */
  shots: { A: readonly Shot[]; B: readonly Shot[] };
  factChecks: readonly ShotFactCheck[];
}

export interface ResolvedMatch {
  resolution: MatchResolution;
  /** Debiased weighted totals, before backfire. */
  weightedTotals: { A: number; B: number };
  pyrrhic: boolean;
  /** Exact HP after each round, before display rounding and before the sudden-death blow. */
  hpExact: { A: [number, number, number]; B: [number, number, number] };
  backfire: Pick<BackfirePlan, "applied" | "suppressed" | "points" | "hits">;
}

export interface ResolveMatchInput {
  rubric: Rubric;
  rounds: readonly RoundResolution[];
  /** Required when the scoreline is a draw or a split. Ignored otherwise. */
  tiebreak?: TiebreakInput;
}

/**
 * Debias one round. Means of AB and BA, or the median of three when any score
 * on the round moves by more than the instability gap. Shot verdicts take the
 * call that deals less damage, and the lower impact.
 */
export function resolveRound(input: ResolveRoundInput): RoundResolution {
  if (input.ab.order !== "AB") throw new EngineError("bad_order", "the AB call must use order AB");
  if (input.ba.order !== "BA") throw new EngineError("bad_order", "the BA call must use order BA");

  const ids = CRITERIA_BY_ROUND[input.round];
  const abScores = scoresByCriterion(input.ab, ids);
  const baScores = scoresByCriterion(input.ba, ids);
  const gap = input.rubric.thresholds.instabilityGap;
  const unstableById = new Map<CriterionId, boolean>();
  let unstableRound = false;
  for (const id of ids) {
    const ab = abScores.get(id);
    const ba = baScores.get(id);
    if (!ab || !ba) throw new EngineError("missing_score", `round ${input.round} is missing ${id}`);
    const unstable = Math.abs(ab.A - ba.A) > gap || Math.abs(ab.B - ba.B) > gap;
    unstableById.set(id, unstable);
    if (unstable) unstableRound = true;
  }

  let extraScores: Map<CriterionId, { A: number; B: number }> | null = null;
  if (unstableRound) {
    if (!input.extra) {
      throw new EngineError("unstable_needs_extra", `round ${input.round} needs a third judge call`);
    }
    extraScores = scoresByCriterion(input.extra, ids);
  }

  const criteria: CriterionResult[] = ids.map((id) => {
    const ab = requiredScore(abScores, id);
    const ba = requiredScore(baScores, id);
    const extra = extraScores ? requiredScore(extraScores, id) : null;
    const finalA = extra ? median([ab.A, ba.A, extra.A]) : (ab.A + ba.A) / 2;
    const finalB = extra ? median([ab.B, ba.B, extra.B]) : (ab.B + ba.B) / 2;
    const weight = rubricWeight(input.rubric, id);
    return {
      criterion: id,
      weight,
      scores: {
        A: { AB: ab.A, BA: ba.A, ...(extra ? { extra: extra.A } : {}), final: finalA },
        B: { AB: ab.B, BA: ba.B, ...(extra ? { extra: extra.B } : {}), final: finalB },
      },
      damageTo: criterionDamage(weight, finalA, finalB),
      unstable: unstableById.get(id) ?? false,
    };
  });

  const calls = extraScores && input.extra ? [input.ab, input.ba, input.extra] : [input.ab, input.ba];
  return {
    round: input.round,
    criteria,
    shotVerdicts: mergeVerdicts(calls, input.shots),
    fabrications: fabricationIds(input.shots, input.factChecks),
    judgeCallIds: calls.map((call) => call.callId),
  };
}

/**
 * Turn three round resolutions into a match. Delta is D_B - D_A, which equals
 * the weighted rubric gap after capped backfire penalties. HP is one lambda.
 */
export function resolveMatch(input: ResolveMatchInput): ResolvedMatch {
  const rounds = orderRounds(input.rounds);
  const thresholds = input.rubric.thresholds;
  const backfire = planBackfires(rounds, thresholds.backfirePenalty, thresholds.backfireCap);
  const damage = { A: backfire.points.A, B: backfire.points.B };
  for (const round of rounds) {
    for (const criterion of round.criteria) {
      damage.A += criterion.damageTo.A;
      damage.B += criterion.damageTo.B;
    }
  }

  const weightedTotals = weightedFromRounds(rounds);
  const delta = damage.B - damage.A;
  const identity = weightedTotals.A - backfire.points.A - (weightedTotals.B - backfire.points.B);
  if (Math.abs(identity - delta) > 1e-6) {
    throw new EngineError("delta_identity", `delta ${delta} broke the rubric identity ${identity}`);
  }

  const deltaByOrder = {
    AB: orderDelta(rounds, "AB", backfire.points),
    BA: orderDelta(rounds, "BA", backfire.points),
  };
  const stability = stabilityOf(deltaByOrder, thresholds.drawMargin);
  const outcome = outcomeFromDelta(delta, stability, thresholds);
  const scaled = scaleHp(damage, outcome, thresholds);
  const cumulative = cumulativeDamage(rounds, backfire);
  const hpExact = {
    A: exactPath(cumulative.A, scaled.lambda),
    B: exactPath(cumulative.B, scaled.lambda),
  };
  assertSameHp(hpExact.A[2], scaled.hp.A);
  assertSameHp(hpExact.B[2], scaled.hp.B);

  const forces = forcedFinalHp(outcome, damage, thresholds);
  const hpAfterRound = {
    A: displayHpPath(hpExact.A, forces.A),
    B: displayHpPath(hpExact.B, forces.B),
  };

  let winner: Slot;
  let decidedBy: DecidedBy;
  let tiebreak: MatchResolution["tiebreak"];
  if (outcome === "SUDDEN_DEATH") {
    if (!input.tiebreak) {
      throw new EngineError("tiebreak_required", "a draw or a split needs the tiebreak cascade");
    }
    const decided = runTiebreak(input.tiebreak);
    winner = decided.winner;
    decidedBy = decided.decidedBy;
    tiebreak = decided.records;
  } else {
    if (!(Math.abs(delta) > 1e-9)) {
      throw new EngineError("no_winner", "a scored outcome needs a non-zero delta");
    }
    winner = delta > 0 ? "A" : "B";
    decidedBy = "scores";
  }

  const winnerDamage = damage[winner];
  const perfect = winnerDamage <= 1e-9;
  const pyrrhic = isPyrrhicVictory(weightedTotals);
  const resolution: MatchResolution = {
    rawDamage: { A: damage.A, B: damage.B },
    delta,
    deltaByOrder,
    stability,
    outcome,
    ...(outcome === "DECISION" ? { decisionType: decisionAgreement(deltaByOrder, thresholds.drawMargin, delta > 0 ? 1 : -1) } : {}),
    perfect,
    winner,
    decidedBy,
    ...(tiebreak ? { tiebreak } : {}),
    lambda: scaled.lambda,
    hpAfterRound,
    pyrrhic,
  };

  return {
    resolution,
    weightedTotals,
    pyrrhic,
    hpExact,
    backfire,
  };
}

export function stabilityOf(deltaByOrder: { AB: number; BA: number }, drawMargin: number): Stability {
  const signAB = signOf(deltaByOrder.AB);
  const signBA = signOf(deltaByOrder.BA);
  if (signAB * signBA >= 0) return "stable";
  const bothMeaningful = Math.abs(deltaByOrder.AB) + 1e-9 >= drawMargin && Math.abs(deltaByOrder.BA) + 1e-9 >= drawMargin;
  return bothMeaningful ? "split" : "wobbly";
}

export function outcomeFromDelta(
  delta: number,
  stability: Stability,
  thresholds: { drawMargin: number; koMargin: number },
): ScoredOutcome {
  if (stability === "split") return "SUDDEN_DEATH";
  const magnitude = Math.abs(delta);
  if (magnitude < thresholds.drawMargin - 1e-9) return "SUDDEN_DEATH";
  if (magnitude + 1e-9 >= thresholds.koMargin) return "KO";
  return "DECISION";
}

function decisionAgreement(
  deltaByOrder: { AB: number; BA: number },
  drawMargin: number,
  winnerSign: 1 | -1,
): "unanimous" | "majority" {
  const agrees = (value: number) => signOf(value) === winnerSign && Math.abs(value) + 1e-9 >= drawMargin;
  return agrees(deltaByOrder.AB) && agrees(deltaByOrder.BA) ? "unanimous" : "majority";
}

function orderDelta(rounds: readonly RoundResolution[], order: "AB" | "BA", penalties: { A: number; B: number }): number {
  let gap = 0;
  for (const round of rounds) {
    for (const criterion of round.criteria) {
      gap += signedGap(criterion.weight, criterion.scores.A[order], criterion.scores.B[order]);
    }
  }
  return gap - penalties.A + penalties.B;
}

function weightedFromRounds(rounds: readonly RoundResolution[]): { A: number; B: number } {
  const totals = { A: 0, B: 0 };
  for (const round of rounds) {
    for (const criterion of round.criteria) {
      totals.A += (criterion.weight * criterion.scores.A.final) / 10;
      totals.B += (criterion.weight * criterion.scores.B.final) / 10;
    }
  }
  return totals;
}

function cumulativeDamage(rounds: readonly RoundResolution[], backfire: BackfirePlan): { A: [number, number, number]; B: [number, number, number] } {
  const totals = { A: [0, 0, 0] as [number, number, number], B: [0, 0, 0] as [number, number, number] };
  let runA = 0;
  let runB = 0;
  rounds.forEach((round, index) => {
    for (const criterion of round.criteria) {
      runA += criterion.damageTo.A;
      runB += criterion.damageTo.B;
    }
    for (const hit of backfire.hits) {
      if (hit.round !== round.round) continue;
      if (hit.fighter === "A") runA += hit.points;
      else runB += hit.points;
    }
    totals.A[index] = runA;
    totals.B[index] = runB;
  });
  return totals;
}

function exactPath(cumulative: readonly [number, number, number], lambda: number): [number, number, number] {
  return [hpAt(cumulative[0], lambda), hpAt(cumulative[1], lambda), hpAt(cumulative[2], lambda)];
}

function hpAt(damage: number, lambda: number): number {
  const hp = 100 - lambda * damage;
  if (hp < 0 && hp > -1e-6) return 0;
  if (hp > 100 && hp < 100 + 1e-6) return 100;
  return hp;
}

function orderRounds(rounds: readonly RoundResolution[]): [RoundResolution, RoundResolution, RoundResolution] {
  const byRound = new Map<RoundNumber, RoundResolution>();
  for (const round of rounds) {
    if (byRound.has(round.round)) throw new EngineError("duplicate_round", `round ${round.round} was resolved twice`);
    byRound.set(round.round, round);
  }
  const first = byRound.get(1);
  const second = byRound.get(2);
  const third = byRound.get(3);
  if (!first || !second || !third) {
    throw new EngineError("missing_round", "resolveMatch needs rounds 1, 2, and 3");
  }
  return [first, second, third];
}

function scoresByCriterion(call: JudgeCallInput, ids: readonly CriterionId[]): Map<CriterionId, { A: number; B: number }> {
  const first = fighter1Slot(call.order, call.fighter1);
  const scores = new Map<CriterionId, { A: number; B: number }>();
  for (const row of call.judgment.criteria) {
    if (!ids.includes(row.criterion)) {
      throw new EngineError("wrong_round", `${row.criterion} is not in this round`);
    }
    if (scores.has(row.criterion)) {
      throw new EngineError("duplicate_criterion", `${row.criterion} was scored twice in one call`);
    }
    const left = row.fighter_1.score;
    const right = row.fighter_2.score;
    scores.set(row.criterion, first === "A" ? { A: left, B: right } : { A: right, B: left });
  }
  for (const id of ids) {
    if (!scores.has(id)) throw new EngineError("missing_score", `${call.order} is missing ${id}`);
  }
  return scores;
}

function requiredScore(scores: Map<CriterionId, { A: number; B: number }>, id: CriterionId): { A: number; B: number } {
  const score = scores.get(id);
  if (!score) throw new EngineError("missing_score", `missing ${id}`);
  return score;
}

function fabricationIds(
  shots: { A: readonly Shot[]; B: readonly Shot[] },
  checks: readonly ShotFactCheck[],
): { A: string[]; B: string[] } {
  const fabricated = new Set(checks.filter((check) => check.fabricated).map((check) => check.shotId));
  const known = new Set<string>();
  const out = { A: [] as string[], B: [] as string[] };
  for (const slot of ["A", "B"] as const) {
    for (const shot of shots[slot]) {
      known.add(shot.id);
      if (fabricated.has(shot.id)) out[slot].push(shot.id);
    }
  }
  for (const id of fabricated) {
    if (!known.has(id)) throw new EngineError("unknown_shot", `fact-check ${id} is not in this round's shots`);
  }
  return out;
}

function mergeVerdicts(calls: readonly JudgeCallInput[], shots: { A: readonly Shot[]; B: readonly Shot[] }): ShotVerdict[] {
  const byId = new Map<string, ShotVerdict[]>();
  for (const call of calls) {
    for (const verdict of call.judgment.shots) {
      const list = byId.get(verdict.shotId) ?? [];
      list.push(verdict);
      byId.set(verdict.shotId, list);
    }
  }
  const order: string[] = [];
  for (const slot of ["A", "B"] as const) {
    for (const shot of shots[slot]) order.push(shot.id);
  }
  for (const id of byId.keys()) {
    if (!order.includes(id)) order.push(id);
  }
  return order.filter((id) => byId.has(id)).map((id) => conservative(byId.get(id) ?? []));
}

function conservative(verdicts: readonly ShotVerdict[]): ShotVerdict {
  const first = verdicts[0];
  if (!first) throw new EngineError("empty_verdicts", "cannot merge an empty verdict list");
  return verdicts.reduce((best, next) => {
    const nextWins = VERDICT_RANK[next.verdict] < VERDICT_RANK[best.verdict];
    const impact = Math.min(best.impact, next.impact) as 0 | 1 | 2 | 3;
    return {
      shotId: best.shotId,
      verdict: nextWins ? next.verdict : best.verdict,
      impact,
      note: nextWins ? next.note : best.note,
    };
  });
}

function median(values: readonly number[]): number {
  const sorted = values.slice().sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function signOf(value: number): -1 | 0 | 1 {
  if (value > 1e-9) return 1;
  if (value < -1e-9) return -1;
  return 0;
}

function assertSameHp(left: number, right: number): void {
  if (Math.abs(left - right) > 1e-6) {
    throw new EngineError("hp_drift", `round-3 HP ${left} does not match scaled HP ${right}`);
  }
}
