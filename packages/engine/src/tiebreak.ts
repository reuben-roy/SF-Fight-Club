import type { JudgeLabel, JudgeOrder, Slot, TiebreakRecord, TiebreakStrategy } from "@sf-fight-club/schemas";

import { EngineError } from "./errors.js";
import { otherSlot } from "./hp.js";

export interface SuddenDeathVoteInput {
  order: JudgeOrder;
  winner: Slot;
  callId: string;
}

export interface VcVoteInput {
  vcUserId: string;
  pick: Slot;
  reason: string;
}

export interface TiebreakInput {
  strategies: readonly TiebreakStrategy[];
  disabled?: readonly TiebreakStrategy[];
  suddenDeathVotes?: readonly SuddenDeathVoteInput[];
  vcVotes?: readonly VcVoteInput[];
  weighinTotals?: { A: number; B: number };
  seeds?: { A: number; B: number };
  /** Rubric `weighinTiebreakGap`. A gap at least this large decides. */
  weighinGap: number;
}

export interface TiebreakResult {
  winner: Slot;
  decidedBy: TiebreakStrategy;
  records: TiebreakRecord[];
}

export function fighter1Slot(order: JudgeOrder, fighter1?: Slot): Slot {
  if (order === "AB") return "A";
  if (order === "BA") return "B";
  if (fighter1 === undefined) {
    throw new EngineError("random_order", "a random judge order needs fighter1");
  }
  return fighter1;
}

/** Map a judge label back to a slot. AB presents A as fighter 1. BA presents B as fighter 1. */
export function mapJudgeLabel(label: JudgeLabel, order: JudgeOrder, fighter1?: Slot): Slot {
  const first = fighter1Slot(order, fighter1);
  return label === "fighter_1" ? first : otherSlot(first);
}

/**
 * Ordered cascade. Disabled strategies are skipped and not recorded.
 * A step that does not decide is recorded, then the next step runs.
 * Seed numbers are unique, so a reached seed step always decides.
 * Three or more sudden-death votes for one side wins (3-1, 4-0, 3-0).
 */
export function runTiebreak(input: TiebreakInput): TiebreakResult {
  const disabled = new Set(input.disabled ?? []);
  const records: TiebreakRecord[] = [];

  for (const strategy of input.strategies) {
    if (disabled.has(strategy)) continue;

    if (strategy === "sudden_death_judge") {
      const votes = [...(input.suddenDeathVotes ?? [])];
      const tally = countVotes(votes.map((vote) => vote.winner));
      const result = suddenDeathWinner(tally);
      records.push({ strategy, votes, result });
      if (result !== "split") return { winner: result, decidedBy: strategy, records };
      continue;
    }

    if (strategy === "vc_panel") {
      const votes = [...(input.vcVotes ?? [])];
      const tally = countVotes(votes.map((vote) => vote.pick));
      const cast = tally.A + tally.B;
      const result = cast >= 2 && tally.A !== tally.B ? (tally.A > tally.B ? "A" : "B") : "abstain";
      records.push({ strategy, votes, result });
      if (result !== "abstain") return { winner: result, decidedBy: strategy, records };
      continue;
    }

    if (strategy === "weighin_total") {
      if (!input.weighinTotals) {
        throw new EngineError("missing_weighin", "weigh-in tiebreak needs both totals");
      }
      const totals = { A: input.weighinTotals.A, B: input.weighinTotals.B };
      const gap = Math.abs(totals.A - totals.B);
      const result = gap + 1e-9 >= input.weighinGap && totals.A !== totals.B ? (totals.A > totals.B ? "A" : "B") : "too_close";
      records.push({ strategy, totals, result });
      if (result !== "too_close") return { winner: result, decidedBy: strategy, records };
      continue;
    }

    const seeds = input.seeds;
    if (!seeds) {
      throw new EngineError("missing_seeds", "seed tiebreak needs both seeds");
    }
    if (seeds.A === seeds.B) {
      throw new EngineError("seeds_not_unique", "seeds must be unique, so the seed step can always resolve");
    }
    const result: Slot = seeds.A < seeds.B ? "A" : "B";
    records.push({ strategy: "seed", seeds: { A: seeds.A, B: seeds.B }, result });
    return { winner: result, decidedBy: "seed", records };
  }

  throw new EngineError("tiebreak_unresolved", "the tiebreak cascade did not pick a winner");
}

function countVotes(winners: readonly Slot[]): { A: number; B: number } {
  const tally = { A: 0, B: 0 };
  for (const winner of winners) tally[winner] += 1;
  return tally;
}

function suddenDeathWinner(tally: { A: number; B: number }): Slot | "split" {
  if (tally.A >= 3 && tally.A > tally.B) return "A";
  if (tally.B >= 3 && tally.B > tally.A) return "B";
  return "split";
}
