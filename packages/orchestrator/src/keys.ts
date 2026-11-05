import type { JudgeOrder, RoundNumber, Slot, TiebreakStrategy } from "@sf-fight-club/schemas";

/**
 * Step keys are unique within a match. The contract examples are
 * `r2/v1/A` and `r2/judge/BA` (no match id prefix).
 */
export const stepKey = {
  lock: "lock",
  scout: (slot: Slot) => `scout/${slot}`,
  volley: (round: RoundNumber, volley: 1 | 2, slot: Slot) => `r${round}/v${volley}/${slot}`,
  closing: (slot: Slot) => `sd/closing/${slot}`,
  factcheck: (round: RoundNumber, volley: 1 | 2, slot: Slot) => `r${round}/fc/v${volley}/${slot}`,
  judge: (round: RoundNumber, order: JudgeOrder) => `r${round}/judge/${order}`,
  roundResolved: (round: RoundNumber) => `r${round}/resolved`,
  matchResolved: "resolve",
  suddenDeath: "sd/completed",
  sdJudge: (order: "AB" | "BA", sample: 1 | 2) => `sd/judge/${order}/${sample}`,
  tiebreak: (strategy: TiebreakStrategy) => `tiebreak/${strategy}`,
  report: "report",
  seal: "seal",
  failed: (n: number) => `failed/${n}`,
} as const;

/** Shot ids are assigned here, never by the model. `r1.v1.A.s2`, `sd.A.s1`. */
export function shotId(scope: string, index: number): string {
  return `${scope}.s${index}`;
}

export function volleyScope(round: RoundNumber, volley: 1 | 2, slot: Slot): string {
  return `r${round}.v${volley}.${slot}`;
}

export function closingScope(slot: Slot): string {
  return `sd.${slot}`;
}
