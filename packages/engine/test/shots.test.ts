import { describe, expect, it } from "vitest";

import { cleanRoundShots, distributeDamage, largestRemainder, mechanicalMissingIds, shotTarget } from "../src/index.js";
import { makeShot } from "./helpers.js";

describe("cleanRoundShots", () => {
  it("drops a shot that names another round's criterion (FE-6)", () => {
    const kept = makeShot({ id: "r1.v1.A.s1", type: "pitch", criterion: "problem" });
    const dropped = makeShot({ id: "r1.v1.A.s2", type: "attack", criterion: "moat" });
    const cleaned = cleanRoundShots({
      round: 1,
      volley1: { A: [kept, dropped], B: [] },
      volley2: { A: [], B: [] },
    });
    expect(cleaned.volley1.A.map((shot) => shot.id)).toEqual(["r1.v1.A.s1"]);
    expect(cleaned.log).toContainEqual({
      fighter: "A",
      volley: 1,
      shotId: "r1.v1.A.s2",
      action: "drop",
      reason: "out_of_round",
    });
  });

  it("rewrites a defense whose respondsTo is missing or unknown into a pitch (FE-10)", () => {
    const attack = makeShot({ id: "r1.v1.B.s1", type: "attack", criterion: "market" });
    const answered = makeShot({
      id: "r1.v2.A.s1",
      type: "defense",
      criterion: "market",
      respondsTo: "r1.v1.B.s1",
      headline: "Their market is sourced",
    });
    const missing = makeShot({
      id: "r1.v2.A.s2",
      type: "defense",
      criterion: "problem",
      respondsTo: "r1.v1.B.missing",
    });
    const blank = makeShot({ id: "r1.v2.B.s1", type: "defense", criterion: "wtp" });
    const cleaned = cleanRoundShots({
      round: 1,
      volley1: { A: [], B: [attack] },
      volley2: { A: [answered, missing], B: [blank] },
    });
    expect(cleaned.volley2.A[0]).toMatchObject({ id: "r1.v2.A.s1", type: "defense", respondsTo: "r1.v1.B.s1" });
    expect(cleaned.volley2.A[1]).toMatchObject({ id: "r1.v2.A.s2", type: "pitch" });
    expect(cleaned.volley2.A[1]?.respondsTo).toBeUndefined();
    expect(cleaned.volley2.B[0]).toMatchObject({ type: "pitch" });
    expect(cleaned.log.filter((entry) => entry.reason === "missing_responds_to")).toHaveLength(2);
    expect(shotTarget(cleaned.volley2.A[1]!).kind).toBe("self");
  });
});

describe("distributeDamage", () => {
  const base = {
    points: 10,
    lambda: 2,
    criterion: "market" as const,
    target: "B" as const,
  };

  it("splits HP across landed and partial carriers and sends the rest to the hammer (FE-17)", () => {
    const spread = distributeDamage({
      ...base,
      shots: [
        { id: "landed", type: "attack", shooter: "A", criterion: "market", verdict: "landed", impact: 2, fabricated: false },
        { id: "partial", type: "pitch", shooter: "A", criterion: "market", verdict: "partial", impact: 2, fabricated: false },
        { id: "defense", type: "defense", shooter: "A", criterion: "market", verdict: "landed", impact: 3, fabricated: false },
        { id: "fake", type: "attack", shooter: "A", criterion: "market", verdict: "landed", impact: 3, fabricated: true },
        { id: "wrong-side", type: "attack", shooter: "B", criterion: "market", verdict: "landed", impact: 3, fabricated: false },
      ],
    });
    expect(spread.hammer).toBeNull();
    expect(spread.carriers.map((share) => share.shotId)).toEqual(["landed", "partial"]);
    expect(spread.carriers[0]?.hp).toBeCloseTo(20 * (2 / 3), 8);
    expect(spread.carriers[1]?.hp).toBeCloseTo(20 * (1 / 3), 8);

    const hammer = distributeDamage({ ...base, shots: [] });
    expect(hammer.carriers).toEqual([]);
    expect(hammer.hammer).toBe(20);
  });

  it("assigns integer HP with the largest remainder", () => {
    expect(largestRemainder([0.9, 0.9, 0.2], 2)).toEqual([1, 1, 0]);
    expect(largestRemainder([1.2, 1.2, 1.2], 4).reduce((sum, value) => sum + value, 0)).toBe(4);
  });
});

describe("mechanical fabrications", () => {
  it("flags cited ids that are not in the locker (FE-7)", () => {
    const shot = makeShot({ id: "s", type: "attack", criterion: "market", evidence: ["E1", "E404"] });
    expect(mechanicalMissingIds(shot, new Set(["E1"]))).toEqual(["E404"]);
    expect(mechanicalMissingIds(shot, new Set(["E1", "E404"]))).toEqual([]);
  });
});
