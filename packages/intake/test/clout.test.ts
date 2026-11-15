import { describe, expect, it } from "vitest";

import { scoreClout, tierFor } from "../src/clout.js";

describe("tierFor", () => {
  it("tiers S from 80, A from 60, B from 40, else C", () => {
    expect(tierFor(100)).toBe("S");
    expect(tierFor(80)).toBe("S");
    expect(tierFor(79)).toBe("A");
    expect(tierFor(60)).toBe("A");
    expect(tierFor(59)).toBe("B");
    expect(tierFor(40)).toBe("B");
    expect(tierFor(39)).toBe("C");
    expect(tierFor(0)).toBe("C");
  });
});

describe("scoreClout", () => {
  it("scores zero signal as zero", () => {
    expect(scoreClout({ followers: 0, hnKarma: 0, engagement: 0, hnPoints: 0 })).toEqual({
      score: 0,
      tier: "C",
      x: 0,
      hn: 0,
    });
  });

  it("blends x at 60 and hn at 40", () => {
    const score = scoreClout({ followers: 100000, hnKarma: 5000, engagement: 0, hnPoints: 0 });
    expect(score.x).toBe(100);
    expect(score.hn).toBe(100);
    expect(score.score).toBe(100);
  });

  it("treats ten times the audience as a fixed step, not a multiple", () => {
    const small = scoreClout({ followers: 100, hnKarma: 0, engagement: 0, hnPoints: 0 });
    const big = scoreClout({ followers: 1000, hnKarma: 0, engagement: 0, hnPoints: 0 });
    const bigger = scoreClout({ followers: 10000, hnKarma: 0, engagement: 0, hnPoints: 0 });
    expect(big.x - small.x).toBe(bigger.x - big.x);
  });

  it("clamps negative signals to zero", () => {
    expect(scoreClout({ followers: -5, hnKarma: -5, engagement: -5, hnPoints: -5 }).score).toBe(0);
  });
});
