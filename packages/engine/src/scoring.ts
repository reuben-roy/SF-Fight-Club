import type { CriterionId, RoundNumber, RoundResolution, Rubric, Slot } from "@sf-fight-club/schemas";

import { EngineError } from "./errors.js";

/** VC Default cap. Hosts can freeze a different cap in the rubric; that value wins. */
export const BACKFIRE_CAP = 3;

/** Weighted totals strictly under this raise the PYRRHIC VICTORY banner. */
export const PYRRHIC_TOTAL = 30;

export const HP_MAX = 100;

export function criterionDamage(weight: number, scoreA: number, scoreB: number): { A: number; B: number } {
  const gap = scoreA - scoreB;
  return {
    A: (weight * Math.max(0, -gap)) / 10,
    B: (weight * Math.max(0, gap)) / 10,
  };
}

/**
 * Signed rubric points, A minus B. Damage uses max(0, gap), but the difference
 * of the two damage terms is this signed gap, which is what makes Delta an identity.
 */
export function signedGap(weight: number, scoreA: number, scoreB: number): number {
  return (weight * (scoreA - scoreB)) / 10;
}

export function isPyrrhicVictory(totals: { A: number; B: number }, ceiling = PYRRHIC_TOTAL): boolean {
  return totals.A < ceiling && totals.B < ceiling;
}

export interface BackfireHit {
  round: RoundNumber;
  fighter: Slot;
  shotId: string;
  /** Rubric points charged. Zero after the cap; the cue still plays. */
  points: number;
  /** 0-based index among this fighter's fabrications in round order. */
  index: number;
}

export interface BackfirePlan {
  hits: BackfireHit[];
  points: { A: number; B: number };
  applied: { A: string[]; B: string[] };
  suppressed: { A: string[]; B: string[] };
}

/**
 * FE-9. Fabrications count in round order, then in the order stored on the
 * round resolution. Penalties stop at `cap`. Later hits stay visible at 0 points.
 */
export function planBackfires(rounds: readonly RoundResolution[], penalty: number, cap: number): BackfirePlan {
  const ordered = rounds.slice().sort((left, right) => left.round - right.round);
  const counts = { A: 0, B: 0 };
  const hits: BackfireHit[] = [];
  const points = { A: 0, B: 0 };
  const applied = { A: [] as string[], B: [] as string[] };
  const suppressed = { A: [] as string[], B: [] as string[] };

  for (const round of ordered) {
    for (const fighter of ["A", "B"] as const) {
      for (const shotId of round.fabrications[fighter]) {
        const index = counts[fighter];
        counts[fighter] += 1;
        const counted = index < cap;
        const charged = counted ? penalty : 0;
        points[fighter] += charged;
        (counted ? applied : suppressed)[fighter].push(shotId);
        hits.push({ round: round.round, fighter, shotId, points: charged, index });
      }
    }
  }

  return { hits, points, applied, suppressed };
}

export function rubricWeight(rubric: Rubric, id: CriterionId): number {
  const criterion = rubric.criteria.find((item) => item.id === id);
  if (!criterion) {
    throw new EngineError("unknown_criterion", `rubric has no criterion ${id}`);
  }
  return criterion.weight;
}
