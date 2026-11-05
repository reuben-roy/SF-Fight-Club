import { describe, expect, it } from "vitest";

import {
  MAX_FIELD_SIZE,
  nextPowerOfTwo,
  resolveBracket,
  seedBracket,
  seedPositions,
  type Bracket,
  type BracketEntrant,
  type BracketSide,
} from "../src/index.js";

function entrants(count: number, totals?: number[]): BracketEntrant[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `f${index + 1}`,
    weighinTotal: totals?.[index] ?? count - index,
  }));
}

function collect(bracket: Bracket, side: BracketSide): number[] {
  if (side.kind === "bye") return [];
  if (side.kind === "fighter") return [side.seed];
  const match = bracket.matches.find((item) => item.roundIndex === side.roundIndex && item.slotIndex === side.slotIndex);
  if (!match) throw new Error("missing feeder");
  return [...collect(bracket, match.a), ...collect(bracket, match.b)];
}

describe("seedBracket", () => {
  it("refuses a field over 64 (BR-3)", () => {
    expect(() => seedBracket(entrants(MAX_FIELD_SIZE + 1), { mode: "weighin", seed: "qualifiers" })).toThrow(/64/);
    expect(() => seedBracket(entrants(1), { mode: "weighin", seed: "qualifiers" })).toThrow(/2/);
  });

  it("makes a field of 2 one final (BR-2)", () => {
    const bracket = seedBracket(entrants(2), { mode: "weighin", seed: "final" });
    expect(bracket.bracketSize).toBe(2);
    expect(bracket.matches).toHaveLength(1);
    expect(bracket.matches[0]?.bye).toBe(false);
    expect(bracket.matches[0]?.roundIndex).toBe(0);
    const seeds = [bracket.matches[0]?.a, bracket.matches[0]?.b].flatMap((side) => (side ? collect(bracket, side) : []));
    expect(seeds.sort()).toEqual([1, 2]);
  });

  it("gives byes to the top seeds when the field is not a power of two (BR-1)", () => {
    for (const size of [3, 5, 6, 7, 12, 24]) {
      const bracket = seedBracket(entrants(size), { mode: "weighin", seed: `bye-${size}` });
      const byeCount = bracket.bracketSize - size;
      expect(nextPowerOfTwo(size)).toBe(bracket.bracketSize);
      const byeSeeds = bracket.matches
        .filter((match) => match.bye)
        .map((match) => match.winnerSeed)
        .sort((left, right) => (left ?? 0) - (right ?? 0));
      expect(byeSeeds).toEqual(Array.from({ length: byeCount }, (_, index) => index + 1));
      expect(bracket.matches.filter((match) => !match.bye).length).toBe(size - 1);
    }
  });

  it("keeps seeds 1 and 2 in opposite halves through 64", () => {
    expect(seedPositions(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    for (const size of [2, 3, 4, 5, 6, 7, 8, 16, 24, 32, 64]) {
      const bracket = seedBracket(entrants(size), { mode: "weighin", seed: `half-${size}` });
      const final = bracket.matches.reduce((best, match) => (match.roundIndex > best.roundIndex ? match : best));
      const left = collect(bracket, final.a);
      const right = collect(bracket, final.b);
      expect(left.includes(1)).not.toBe(right.includes(1));
      expect(left.includes(2)).not.toBe(right.includes(2));
      expect(left.includes(1)).not.toBe(left.includes(2));
      expect(bracket.matches).toHaveLength(bracket.bracketSize - 1);
      const later = bracket.matches.filter((match) => match.roundIndex > 0);
      expect(later.every((match) => match.a.kind === "winner_of" && match.b.kind === "winner_of")).toBe(true);
    }
  });

  it("ranks weigh-in totals and falls back to a logged draw when they all tie (RW-6)", () => {
    const field = entrants(4, [10, 40, 25, 70]);
    const ranked = seedBracket(field, { mode: "weighin", seed: "rank" });
    expect(ranked.entrants.map((entrant) => entrant.id)).toEqual(["f4", "f2", "f3", "f1"]);
    expect(ranked.entrants.map((entrant) => entrant.seed)).toEqual([1, 2, 3, 4]);
    expect(ranked.seedingFallback).toBeNull();
    expect(seedBracket(field, { mode: "weighin", seed: "other" }).entrants.map((entrant) => entrant.id)).toEqual([
      "f4",
      "f2",
      "f3",
      "f1",
    ]);

    const tied = entrants(4, [50, 50, 50, 50]);
    const first = seedBracket(tied, { mode: "weighin", seed: "alpha" });
    const again = seedBracket(tied, { mode: "weighin", seed: "alpha" });
    expect(first.seedingFallback).toBe("random");
    expect(again.entrants.map((entrant) => entrant.id)).toEqual(first.entrants.map((entrant) => entrant.id));
    const orders = new Set(
      ["alpha", "beta", "gamma", "delta", "epsilon"].map((seed) =>
        seedBracket(tied, { mode: "weighin", seed }).entrants.map((entrant) => entrant.id).join(","),
      ),
    );
    expect(orders.size).toBeGreaterThan(1);

    const random = seedBracket(field, { mode: "random", seed: "shuffle" });
    expect(seedBracket(field, { mode: "random", seed: "shuffle" }).entrants.map((entrant) => entrant.id)).toEqual(
      random.entrants.map((entrant) => entrant.id),
    );
  });
});

describe("walkover, bye, and void bets", () => {
  const field = [
    { id: "s1", weighinTotal: 90 },
    { id: "s2", weighinTotal: 80 },
    { id: "s3", weighinTotal: 70 },
    { id: "s4", weighinTotal: 60 },
  ];

  it("offers no bets on a bye (BR-1)", () => {
    const bracket = seedBracket(
      [
        { id: "s1", weighinTotal: 90 },
        { id: "s2", weighinTotal: 70 },
        { id: "s3", weighinTotal: 50 },
      ],
      { mode: "weighin", seed: "three" },
    );
    const slots = resolveBracket({ bracket });
    const bye = slots.find((slot) => slot.kind === "BYE");
    expect(bye).toMatchObject({ kind: "BYE", winnerId: "s1", bets: "none", air: false });
  });

  it("voids bets and gives a walkover when a fighter withdraws before the match (BR-4)", () => {
    const bracket = seedBracket(field, { mode: "weighin", seed: "draw" });
    const slots = resolveBracket({ bracket, withdrawn: ["s4"] });
    const opening = slots.find((slot) => slot.roundIndex === 0 && slot.slotIndex === 0);
    expect(opening).toMatchObject({
      kind: "WALKOVER",
      winnerId: "s1",
      absentId: "s4",
      bets: "void",
      air: false,
      reason: "withdrawal",
      pastSealedDiscarded: false,
    });
  });

  it("discards a sealed result when a fighter withdraws before air (BR-5)", () => {
    const bracket = seedBracket(field, { mode: "weighin", seed: "draw" });
    const slots = resolveBracket({
      bracket,
      withdrawn: ["s1"],
      results: [{ roundIndex: 0, slotIndex: 0, winnerId: "s1", status: "sealed" }],
    });
    expect(slots.find((slot) => slot.roundIndex === 0 && slot.slotIndex === 0)).toMatchObject({
      kind: "WALKOVER",
      winnerId: "s4",
      absentId: "s1",
      bets: "void",
      air: false,
      reason: "sealed_withdrawal",
      pastSealedDiscarded: true,
    });
  });

  it("gives the next opponent a walkover and leaves settled matches alone (BR-6)", () => {
    const bracket = seedBracket(field, { mode: "weighin", seed: "draw" });
    const slots = resolveBracket({
      bracket,
      disqualified: ["s1"],
      results: [
        { roundIndex: 0, slotIndex: 0, winnerId: "s1", status: "complete" },
        { roundIndex: 0, slotIndex: 1, winnerId: "s2", status: "complete" },
      ],
    });
    expect(slots.find((slot) => slot.roundIndex === 0 && slot.slotIndex === 0)).toMatchObject({
      kind: "COMPLETE",
      winnerId: "s1",
      bets: "settled",
      pastResultStands: true,
    });
    expect(slots.find((slot) => slot.roundIndex === 1 && slot.slotIndex === 0)).toMatchObject({
      kind: "WALKOVER",
      winnerId: "s2",
      absentId: "s1",
      bets: "void",
      air: false,
      reason: "disqualification",
    });
  });
});
