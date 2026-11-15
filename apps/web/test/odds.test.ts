import { describe, expect, it } from "vitest";

import {
  CHIP_VALUES,
  computePool,
  HOUSE_SEED_TOTAL,
  houseSplit,
  isValidStake,
  settleBets,
  STARTING_WALLET,
  weighInPrior,
} from "../src/bets/odds.js";

describe("weighInPrior", () => {
  it("is a coin flip on equal weigh-ins", () => {
    expect(weighInPrior(70, 70)).toBeCloseTo(0.5, 10);
  });

  it("favors the heavier side", () => {
    expect(weighInPrior(78.5, 44)).toBeGreaterThan(0.9);
    expect(weighInPrior(44, 78.5)).toBeLessThan(0.1);
  });
});

describe("houseSplit", () => {
  it("seeds exactly S$500 split by the prior", () => {
    const split = houseSplit(78.5, 44);
    expect(split.a + split.b).toBe(HOUSE_SEED_TOTAL);
    expect(split.a).toBeGreaterThan(split.b);
    const even = houseSplit(70, 70);
    expect(even.a + even.b).toBe(HOUSE_SEED_TOTAL);
    expect(even.a).toBe(250);
  });

  it("clamps the prior so a heavy favorite still pays on a win", () => {
    expect(houseSplit(78.5, 44)).toEqual({ a: 425, b: 75 });
    expect(houseSplit(44, 78.5)).toEqual({ a: 75, b: 425 });
    const pool = computePool(100, 0, 78.5, 44);
    expect(pool.oddsA).toBeGreaterThan(1.1);
    expect(pool.oddsB).toBeLessThan(10);
  });
});

describe("computePool", () => {
  it("adds crowd stakes on top of the house seed", () => {
    const house = houseSplit(78.5, 44);
    const pool = computePool(100, 50, 78.5, 44);
    expect(pool.poolA).toBe(house.a + 100);
    expect(pool.poolB).toBe(house.b + 50);
    expect(pool.poolTotal).toBe(HOUSE_SEED_TOTAL + 150);
    expect(pool.oddsA).toBeCloseTo(pool.poolTotal / pool.poolA, 10);
    expect(pool.oddsB).toBeCloseTo(pool.poolTotal / pool.poolB, 10);
  });
});

describe("settleBets", () => {
  it("pays winners pro-rata with floor, losers nothing", () => {
    const bets = [
      { entrantId: "a", stake: 100 },
      { entrantId: "a", stake: 50 },
      { entrantId: "b", stake: 200 },
    ];
    const payouts = settleBets(bets, "a", "a", "b", 78.5, 44);
    const pool = computePool(150, 200, 78.5, 44);
    expect(payouts[0]).toBe(Math.floor((100 * pool.poolTotal) / pool.poolA));
    expect(payouts[1]).toBe(Math.floor((50 * pool.poolTotal) / pool.poolA));
    expect(payouts[2]).toBe(0);
    expect(payouts[0]).toBeGreaterThan(100);
  });

  it("refunds every bet when nobody backed the winner", () => {
    const bets = [
      { entrantId: "b", stake: 100 },
      { entrantId: "b", stake: 40 },
    ];
    expect(settleBets(bets, "a", "a", "b", 78.5, 44)).toEqual([100, 40]);
  });

  it("refunds nothing staked when no bets exist", () => {
    expect(settleBets([], "a", "a", "b", 78.5, 44)).toEqual([]);
  });
});

describe("isValidStake", () => {
  it("accepts positive integers the wallet covers", () => {
    expect(isValidStake(10, STARTING_WALLET)).toBe(true);
    expect(isValidStake(1000, 1000)).toBe(true);
  });

  it("rejects zero, fractions, negatives, and over-wallet stakes", () => {
    expect(isValidStake(0, 1000)).toBe(false);
    expect(isValidStake(-10, 1000)).toBe(false);
    expect(isValidStake(10.5, 1000)).toBe(false);
    expect(isValidStake(1001, 1000)).toBe(false);
  });
});

describe("chips", () => {
  it("offers the documented denominations", () => {
    expect([...CHIP_VALUES]).toEqual([10, 50, 100, 500]);
  });
});
