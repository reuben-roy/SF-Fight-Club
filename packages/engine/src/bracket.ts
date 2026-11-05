import { EngineError } from "./errors.js";
import { rngFromSeed, shuffle } from "./rng.js";

export const MIN_FIELD_SIZE = 2;
export const MAX_FIELD_SIZE = 64;

export interface BracketEntrant {
  id: string;
  weighinTotal: number;
}

export interface SeededEntrant extends BracketEntrant {
  /** 1 is the top seed. */
  seed: number;
}

export type BracketSide =
  | { kind: "fighter"; id: string; seed: number }
  | { kind: "bye" }
  | { kind: "winner_of"; roundIndex: number; slotIndex: number };

export interface BracketMatch {
  roundIndex: number;
  slotIndex: number;
  a: BracketSide;
  b: BracketSide;
  bye: boolean;
  /** Set when this first-round slot is a bye. */
  winnerId?: string;
  winnerSeed?: number;
}

export interface Bracket {
  fieldSize: number;
  bracketSize: number;
  seedingMode: "weighin" | "random";
  /** Set when every weigh-in total was equal and weigh-in mode fell back to a logged draw. */
  seedingFallback: "random" | null;
  /** The logged seed. Re-running with it reproduces the bracket. */
  seed: string;
  entrants: SeededEntrant[];
  matches: BracketMatch[];
}

export interface SeedBracketOptions {
  mode: "weighin" | "random";
  seed: string;
}

export type SlotBets = "none" | "void" | "settled" | "locked" | "pending";

export type WalkoverReason = "withdrawal" | "disqualification" | "sealed_withdrawal" | "sealed_disqualification";

export type SlotResolution =
  | {
      kind: "BYE";
      roundIndex: number;
      slotIndex: number;
      winnerId: string;
      bets: "none";
      air: false;
    }
  | {
      kind: "WALKOVER";
      roundIndex: number;
      slotIndex: number;
      winnerId: string;
      absentId: string;
      bets: "void";
      air: false;
      reason: WalkoverReason;
      /** BR-5. A sealed result is discarded and not aired. */
      pastSealedDiscarded: boolean;
    }
  | {
      kind: "VOID";
      roundIndex: number;
      slotIndex: number;
      bets: "void" | "none";
      air: false;
      reason: string;
    }
  | {
      kind: "COMPLETE";
      roundIndex: number;
      slotIndex: number;
      winnerId: string;
      bets: "settled";
      pastResultStands: true;
    }
  | {
      kind: "SEALED";
      roundIndex: number;
      slotIndex: number;
      winnerId: string;
      bets: "locked";
      air: false;
    }
  | {
      kind: "PENDING";
      roundIndex: number;
      slotIndex: number;
      bets: "pending";
    };

export interface BracketProjectionInput {
  bracket: Bracket;
  results?: readonly {
    roundIndex: number;
    slotIndex: number;
    winnerId: string;
    status: "sealed" | "complete";
  }[];
  withdrawn?: readonly string[];
  disqualified?: readonly string[];
}

/**
 * Standard 1-vs-N placement. Index i holds the seed number in that slot.
 * Seeds 1 and 2 land in opposite halves, so they can meet only in the final.
 */
export function seedPositions(bracketSize: number): number[] {
  if (bracketSize < 2 || (bracketSize & (bracketSize - 1)) !== 0) {
    throw new EngineError("bad_bracket_size", "bracket size must be a power of two");
  }
  let positions = [1];
  while (positions.length < bracketSize) {
    const next: number[] = [];
    const sum = positions.length * 2 + 1;
    for (const seed of positions) next.push(seed, sum - seed);
    positions = next;
  }
  return positions;
}

export function nextPowerOfTwo(size: number): number {
  let power = 1;
  while (power < size) power *= 2;
  return power;
}

/**
 * Sizes 2 to 64. A field of 2 is one final. Larger fields round up to the next
 * power of two and give byes to the top seeds. No re-seeding between rounds:
 * later matches point at earlier slots.
 */
export function seedBracket(entrants: readonly BracketEntrant[], options: SeedBracketOptions): Bracket {
  if (options.seed.length === 0) {
    throw new EngineError("missing_seed", "bracket seeding needs a logged seed");
  }
  if (entrants.length > MAX_FIELD_SIZE) {
    throw new EngineError(
      "field_too_large",
      `field size ${entrants.length} exceeds ${MAX_FIELD_SIZE}; run qualifiers as separate tournaments`,
    );
  }
  if (entrants.length < MIN_FIELD_SIZE) {
    throw new EngineError("field_too_small", `field size ${entrants.length} is below ${MIN_FIELD_SIZE}`);
  }

  const ids = new Set<string>();
  for (const entrant of entrants) {
    if (entrant.id.length === 0) throw new EngineError("bad_entrant", "entrant id is empty");
    if (ids.has(entrant.id)) throw new EngineError("duplicate_entrant", `duplicate entrant ${entrant.id}`);
    ids.add(entrant.id);
    if (!Number.isFinite(entrant.weighinTotal)) {
      throw new EngineError("bad_weighin", `weigh-in for ${entrant.id} is not finite`);
    }
  }

  const ordered = orderEntrants(entrants, options);
  const seeded: SeededEntrant[] = ordered.entrants.map((entrant, index) => ({ ...entrant, seed: index + 1 }));
  const bracketSize = nextPowerOfTwo(seeded.length);
  const positions = seedPositions(bracketSize);
  const bySeed = new Map(seeded.map((entrant) => [entrant.seed, entrant]));
  const matches: BracketMatch[] = [];

  const firstRoundSlots = bracketSize / 2;
  for (let slotIndex = 0; slotIndex < firstRoundSlots; slotIndex += 1) {
    const seedA = positions[slotIndex * 2];
    const seedB = positions[slotIndex * 2 + 1];
    if (seedA === undefined || seedB === undefined) {
      throw new EngineError("bad_placement", "seed placement did not fill the first round");
    }
    const a = sideForSeed(seedA, seeded.length, bySeed);
    const b = sideForSeed(seedB, seeded.length, bySeed);
    const bye = a.kind === "bye" || b.kind === "bye";
    const winner = a.kind === "fighter" && b.kind === "bye" ? a : b.kind === "fighter" && a.kind === "bye" ? b : null;
    matches.push({
      roundIndex: 0,
      slotIndex,
      a,
      b,
      bye,
      ...(winner ? { winnerId: winner.id, winnerSeed: winner.seed } : {}),
    });
  }

  let previousCount = firstRoundSlots;
  for (let roundIndex = 1; previousCount > 1; roundIndex += 1) {
    const count = previousCount / 2;
    for (let slotIndex = 0; slotIndex < count; slotIndex += 1) {
      matches.push({
        roundIndex,
        slotIndex,
        a: { kind: "winner_of", roundIndex: roundIndex - 1, slotIndex: slotIndex * 2 },
        b: { kind: "winner_of", roundIndex: roundIndex - 1, slotIndex: slotIndex * 2 + 1 },
        bye: false,
      });
    }
    previousCount = count;
  }

  return {
    fieldSize: seeded.length,
    bracketSize,
    seedingMode: options.mode,
    seedingFallback: ordered.fallback,
    seed: options.seed,
    entrants: seeded,
    matches,
  };
}

type Advance = { kind: "advanced"; id: string } | { kind: "open" } | { kind: "vacant"; id: string | null };

type SideState = { kind: "bye" } | { kind: "fighter"; id: string } | { kind: "open" } | { kind: "vacant"; id: string | null };

/**
 * Project byes, walkovers, and void-bet markers from withdrawals and
 * disqualifications. Completed matches stand (BR-6). A sealed match whose
 * fighter withdraws is not aired (BR-5). A published bracket match that has
 * not been played becomes a walkover (BR-4).
 */
export function resolveBracket(input: BracketProjectionInput): SlotResolution[] {
  const withdrawn = new Set(input.withdrawn ?? []);
  const disqualified = new Set(input.disqualified ?? []);
  const recorded = new Map<string, { winnerId: string; status: "sealed" | "complete" }>();
  for (const result of input.results ?? []) {
    recorded.set(slotKey(result.roundIndex, result.slotIndex), result);
  }

  const advance = new Map<string, Advance>();
  const resolutions: SlotResolution[] = [];
  const maxRound = input.bracket.matches.reduce((max, match) => Math.max(max, match.roundIndex), 0);

  for (let roundIndex = 0; roundIndex <= maxRound; roundIndex += 1) {
    const roundMatches = input.bracket.matches
      .filter((match) => match.roundIndex === roundIndex)
      .sort((left, right) => left.slotIndex - right.slotIndex);
    for (const match of roundMatches) {
      const resolution = resolveSlot(match, advance, recorded, withdrawn, disqualified);
      resolutions.push(resolution);
      advance.set(slotKey(match.roundIndex, match.slotIndex), advanceOf(resolution, withdrawn, disqualified));
    }
  }

  return resolutions;
}

function orderEntrants(
  entrants: readonly BracketEntrant[],
  options: SeedBracketOptions,
): { entrants: BracketEntrant[]; fallback: "random" | null } {
  if (options.mode === "random") {
    return { entrants: shuffle(entrants, rngFromSeed(options.seed)), fallback: null };
  }
  const first = entrants[0]?.weighinTotal;
  const allEqual = entrants.every((entrant) => entrant.weighinTotal === first);
  if (allEqual) {
    return { entrants: shuffle(entrants, rngFromSeed(options.seed)), fallback: "random" };
  }
  const tiebreak = rngFromSeed(`${options.seed}:tiebreak`);
  const noise = new Map(entrants.map((entrant) => [entrant.id, tiebreak()]));
  const ranked = entrants.slice().sort((left, right) => {
    if (left.weighinTotal !== right.weighinTotal) return right.weighinTotal - left.weighinTotal;
    return (noise.get(left.id) ?? 0) - (noise.get(right.id) ?? 0);
  });
  return { entrants: ranked, fallback: null };
}

function sideForSeed(seed: number, fieldSize: number, bySeed: ReadonlyMap<number, SeededEntrant>): BracketSide {
  if (seed > fieldSize) return { kind: "bye" };
  const entrant = bySeed.get(seed);
  if (!entrant) throw new EngineError("missing_seed_slot", `no entrant for seed ${seed}`);
  return { kind: "fighter", id: entrant.id, seed: entrant.seed };
}

function resolveSlot(
  match: BracketMatch,
  advance: ReadonlyMap<string, Advance>,
  recorded: ReadonlyMap<string, { winnerId: string; status: "sealed" | "complete" }>,
  withdrawn: ReadonlySet<string>,
  disqualified: ReadonlySet<string>,
): SlotResolution {
  const left = nominal(match.a, advance);
  const right = nominal(match.b, advance);
  const where = { roundIndex: match.roundIndex, slotIndex: match.slotIndex };
  const result = recorded.get(slotKey(match.roundIndex, match.slotIndex));

  if (isByePair(left, right)) {
    const winner = left.kind === "fighter" ? left : right.kind === "fighter" ? right : null;
    if (!winner || !eligible(winner.id, withdrawn, disqualified)) {
      return { kind: "VOID", ...where, bets: "none", air: false, reason: "bye_fighter_absent" };
    }
    return { kind: "BYE", ...where, winnerId: winner.id, bets: "none", air: false };
  }

  if (left.kind === "open" || right.kind === "open") {
    return { kind: "PENDING", ...where, bets: "pending" };
  }

  if (result?.status === "complete" && left.kind === "fighter" && right.kind === "fighter") {
    return {
      kind: "COMPLETE",
      ...where,
      winnerId: result.winnerId,
      bets: "settled",
      pastResultStands: true,
    };
  }

  const leftId = left.kind === "fighter" || left.kind === "vacant" ? left.id : null;
  const rightId = right.kind === "fighter" || right.kind === "vacant" ? right.id : null;
  const leftIn = leftId !== null && eligible(leftId, withdrawn, disqualified);
  const rightIn = rightId !== null && eligible(rightId, withdrawn, disqualified);

  if (leftIn && rightIn && leftId && rightId) {
    if (result?.status === "sealed") {
      return { kind: "SEALED", ...where, winnerId: result.winnerId, bets: "locked", air: false };
    }
    return { kind: "PENDING", ...where, bets: "pending" };
  }

  if (leftIn !== rightIn) {
    const winnerId = leftIn ? leftId : rightId;
    const absentId = leftIn ? rightId : leftId;
    if (winnerId && absentId) {
      return walkover(where, winnerId, absentId, result?.status === "sealed", withdrawn);
    }
  }

  if (!leftIn && !rightIn && (leftId || rightId || left.kind === "vacant" || right.kind === "vacant")) {
    const bets = result?.status === "sealed" ? "void" : left.kind === "bye" || right.kind === "bye" ? "none" : "void";
    return { kind: "VOID", ...where, bets, air: false, reason: "both_absent" };
  }

  return { kind: "PENDING", ...where, bets: "pending" };
}

function walkover(
  where: { roundIndex: number; slotIndex: number },
  winnerId: string,
  absentId: string,
  sealed: boolean,
  withdrawn: ReadonlySet<string>,
): SlotResolution {
  const withdrew = withdrawn.has(absentId);
  const reason: WalkoverReason = sealed
    ? withdrew
      ? "sealed_withdrawal"
      : "sealed_disqualification"
    : withdrew
      ? "withdrawal"
      : "disqualification";
  return {
    kind: "WALKOVER",
    ...where,
    winnerId,
    absentId,
    bets: "void",
    air: false,
    reason,
    pastSealedDiscarded: sealed,
  };
}

function isByePair(left: SideState, right: SideState): boolean {
  return (left.kind === "bye" && right.kind === "fighter") || (right.kind === "bye" && left.kind === "fighter");
}

function nominal(side: BracketSide, advance: ReadonlyMap<string, Advance>): SideState {
  if (side.kind === "bye") return { kind: "bye" };
  if (side.kind === "fighter") return { kind: "fighter", id: side.id };
  const prior = advance.get(slotKey(side.roundIndex, side.slotIndex));
  if (!prior || prior.kind === "open") return { kind: "open" };
  if (prior.kind === "vacant") return { kind: "vacant", id: prior.id };
  return { kind: "fighter", id: prior.id };
}

function advanceOf(resolution: SlotResolution, withdrawn: ReadonlySet<string>, disqualified: ReadonlySet<string>): Advance {
  if (resolution.kind === "PENDING") return { kind: "open" };
  if (resolution.kind === "VOID") return { kind: "vacant", id: null };
  const winnerId = resolution.winnerId;
  if (eligible(winnerId, withdrawn, disqualified)) return { kind: "advanced", id: winnerId };
  return { kind: "vacant", id: winnerId };
}

function eligible(id: string, withdrawn: ReadonlySet<string>, disqualified: ReadonlySet<string>): boolean {
  return !withdrawn.has(id) && !disqualified.has(id);
}

function slotKey(roundIndex: number, slotIndex: number): string {
  return `${roundIndex}:${slotIndex}`;
}
