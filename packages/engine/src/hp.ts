import type { Slot } from "@sf-fight-club/schemas";

import { EngineError } from "./errors.js";
import { HP_MAX } from "./scoring.js";

export type ScoredOutcome = "KO" | "DECISION" | "SUDDEN_DEATH";

export interface HpThresholds {
  decisionFloorHp: number;
  suddenDeathFloorHp: number;
}

/**
 * One lambda per match. The loser lands on the outcome floor; both fighters
 * share that same scale factor.
 */
export function scaleHp(
  damage: { A: number; B: number },
  outcome: ScoredOutcome,
  thresholds: HpThresholds,
): { lambda: number; hp: { A: number; B: number } } {
  const apply = (lambda: number) => ({
    lambda,
    hp: {
      A: clampHp(HP_MAX - lambda * damage.A),
      B: clampHp(HP_MAX - lambda * damage.B),
    },
  });

  if (outcome === "SUDDEN_DEATH") {
    const maxDamage = Math.max(damage.A, damage.B);
    if (maxDamage === 0) return apply(0);
    return apply((HP_MAX - thresholds.suddenDeathFloorHp) / maxDamage);
  }

  const loserDamage = Math.max(damage.A, damage.B);
  if (!(loserDamage > 0)) {
    throw new EngineError("no_loser_damage", `${outcome} needs a fighter who took damage`);
  }
  const floor = outcome === "KO" ? 0 : thresholds.decisionFloorHp;
  return apply((HP_MAX - floor) / loserDamage);
}

export function displayHp(value: number): number {
  return Math.round(value);
}

/**
 * Display integers for the three round-end HP values. The final round can be
 * forced onto the outcome floor so the loser never shows 1 or -1.
 * Paths stay non-increasing.
 */
export function displayHpPath(exact: readonly [number, number, number], forceFinal: number | null): [number, number, number] {
  let round1 = displayHp(exact[0]);
  let round2 = displayHp(exact[1]);
  let round3 = displayHp(exact[2]);
  if (forceFinal !== null) round3 = forceFinal;
  if (round1 > HP_MAX) round1 = HP_MAX;
  if (round2 > round1) round2 = round1;
  if (round3 > round2) round3 = round2;
  if (forceFinal !== null) {
    round3 = forceFinal;
    if (round2 < round3) round2 = round3;
    if (round1 < round2) round1 = round2;
  }
  return [round1, round2, round3];
}

export function forcedFinalHp(
  outcome: ScoredOutcome,
  damage: { A: number; B: number },
  thresholds: HpThresholds,
): { A: number | null; B: number | null } {
  if (outcome === "KO" || outcome === "DECISION") {
    const floor = outcome === "KO" ? 0 : thresholds.decisionFloorHp;
    if (damage.A > damage.B) return { A: floor, B: null };
    if (damage.B > damage.A) return { A: null, B: floor };
    return { A: null, B: null };
  }
  if (damage.A === 0 && damage.B === 0) return { A: HP_MAX, B: HP_MAX };
  const floor = thresholds.suddenDeathFloorHp;
  if (damage.A === damage.B) return { A: floor, B: floor };
  if (damage.A > damage.B) return { A: floor, B: null };
  return { A: null, B: floor };
}

/**
 * Largest-remainder (Hamilton) split. `total` is the integer HP the shares must
 * sum to. Ties break toward the earlier index.
 */
export function largestRemainder(values: readonly number[], total: number): number[] {
  if (!Number.isInteger(total)) {
    throw new EngineError("bad_total", "displayed damage must sum to an integer");
  }
  if (values.length === 0) {
    if (total === 0) return [];
    throw new EngineError("empty_allocation", "no damage buckets for a non-zero HP loss");
  }

  const floors = values.map((value) => Math.floor(value + 1e-9));
  const out = floors.slice();
  const remain = total - floors.reduce((sum, value) => sum + value, 0);
  const ranked = values
    .map((value, index) => ({ index, frac: value - Math.floor(value + 1e-9) }))
    .sort((left, right) => right.frac - left.frac || left.index - right.index);

  if (remain > 0) {
    for (let step = 0; step < remain; step += 1) {
      const pick = ranked[step % ranked.length];
      if (!pick) break;
      out[pick.index] = (out[pick.index] ?? 0) + 1;
    }
  } else if (remain < 0) {
    const ascending = ranked.slice().reverse();
    for (let step = 0; step < -remain; step += 1) {
      const pick = ascending[step % ascending.length];
      if (!pick) break;
      out[pick.index] = (out[pick.index] ?? 0) - 1;
    }
  }
  return out;
}

export function otherSlot(slot: Slot): Slot {
  return slot === "A" ? "B" : "A";
}

function clampHp(value: number): number {
  if (!Number.isFinite(value)) {
    throw new EngineError("bad_hp", "HP is not finite");
  }
  if (value < 0 && value > -1e-6) return 0;
  if (value > HP_MAX && value < HP_MAX + 1e-6) return HP_MAX;
  return value;
}
