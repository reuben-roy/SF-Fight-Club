import {
  CRITERIA_BY_ROUND,
  CRITERION_IDS,
  loadVcDefaultRubric,
  type CriterionId,
  type JudgeOrder,
  type RoundJudgment,
  type RoundNumber,
  type Rubric,
  type Shot,
  type ShotFactCheck,
  type ShotVerdict,
  type Slot,
} from "@sf-fight-club/schemas";

import type { JudgeCallInput, TiebreakInput } from "../src/index.js";

export function rubric(): Rubric {
  return loadVcDefaultRubric();
}

export function side(score: number) {
  return { rationale: "Anchored against the rubric.", capsApplied: [] as string[], score };
}

export function scorecard(
  fill: number | ((id: CriterionId) => { A: number; B: number }),
): Record<CriterionId, { A: number; B: number }> {
  const scores = {} as Record<CriterionId, { A: number; B: number }>;
  for (const id of CRITERION_IDS) {
    scores[id] = typeof fill === "number" ? { A: fill, B: fill } : fill(id);
  }
  return scores;
}

export function withScore(
  base: Record<CriterionId, { A: number; B: number }>,
  id: CriterionId,
  scores: { A: number; B: number },
): Record<CriterionId, { A: number; B: number }> {
  return { ...base, [id]: scores };
}

/** Build a judge call. `scores` are slot scores. AB presents A as fighter 1. */
export function judgeCall(
  order: JudgeOrder,
  round: RoundNumber,
  scores: Record<CriterionId, { A: number; B: number }>,
  options?: { shots?: ShotVerdict[]; callId?: string; fighter1?: Slot },
): JudgeCallInput {
  const first: Slot = order === "BA" ? "B" : order === "AB" ? "A" : (options?.fighter1 ?? "A");
  const second: Slot = first === "A" ? "B" : "A";
  const judgment: RoundJudgment = {
    criteria: CRITERIA_BY_ROUND[round].map((id) => ({
      criterion: id,
      comparison: `${id} compared against the anchors.`,
      fighter_1: side(scores[id][first]),
      fighter_2: side(scores[id][second]),
    })),
    shots: options?.shots ?? [],
    injectionSuspected: false,
    roundSummary: "Scored from the anchors.",
  };
  return {
    order,
    callId: options?.callId ?? `${round}-${order}`,
    judgment,
    ...(order === "random" ? { fighter1: first } : {}),
  };
}

/** Integer orders whose means are the worked-example finals. */
export function ordersFromFinals(
  finals: Record<CriterionId, { A: number; B: number }>,
  order: "AB" | "BA",
): Record<CriterionId, { A: number; B: number }> {
  const scores = {} as Record<CriterionId, { A: number; B: number }>;
  for (const id of CRITERION_IDS) {
    const cell = finals[id];
    scores[id] = {
      A: integerOrder(cell.A, order),
      B: integerOrder(cell.B, order),
    };
  }
  return scores;
}

function integerOrder(score: number, order: "AB" | "BA"): number {
  if (Number.isInteger(score)) return score;
  return order === "AB" ? Math.floor(score) : Math.ceil(score);
}

export function makeShot(overrides: Partial<Shot> & Pick<Shot, "id" | "type" | "criterion">): Shot {
  return {
    headline: "A short headline",
    claim: "A short claim.",
    evidence: [],
    estimate: true,
    ...overrides,
  };
}

export function fabrication(shotId: string): ShotFactCheck {
  return {
    shotId,
    missingIds: ["E999"],
    perEvidence: [],
    numberContradicted: false,
    fabricated: true,
  };
}

export function tiebreak(overrides: Partial<TiebreakInput> = {}): TiebreakInput {
  return {
    strategies: ["sudden_death_judge", "vc_panel", "weighin_total", "seed"],
    disabled: ["vc_panel"],
    suddenDeathVotes: [
      { order: "AB", winner: "A", callId: "sd1" },
      { order: "BA", winner: "A", callId: "sd2" },
      { order: "AB", winner: "A", callId: "sd3" },
      { order: "BA", winner: "B", callId: "sd4" },
    ],
    weighinTotals: { A: 70, B: 60 },
    seeds: { A: 2, B: 5 },
    weighinGap: 0.5,
    ...overrides,
  };
}

export const PERMIT_FINALS: Record<CriterionId, { A: number; B: number }> = {
  problem: { A: 8.5, B: 6 },
  market: { A: 7, B: 4.5 },
  wtp: { A: 7.5, B: 5 },
  differentiation: { A: 6, B: 7 },
  moat: { A: 6, B: 6 },
  timing: { A: 7, B: 6.5 },
  gtm: { A: 6.5, B: 4 },
  feasibility: { A: 5, B: 7.5 },
  scale: { A: 7, B: 3.5 },
};
