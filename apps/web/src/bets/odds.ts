/**
 * Play-money parimutuel betting, per docs/06-betting.md.
 *
 * Pure functions only: no I/O, no clock, no randomness. The deterministic
 * house seed (S$500 split by the weigh-in prior) plus crowd stakes form the
 * pool; odds and payouts derive from the pool alone.
 */

export const STARTING_WALLET = 1000;
export const HOUSE_SEED_TOTAL = 500;
export const CHIP_VALUES = [10, 50, 100, 500] as const;

/**
 * Weigh-in prior: the probability side A beats side B implied by the
 * weigh-in gap alone. p_A = 1 / (1 + 10^(-(W_A - W_B) / 15)).
 */
export function weighInPrior(wA: number, wB: number): number {
  return 1 / (1 + 10 ** (-(wA - wB) / 15));
}

export interface HouseSplit {
  a: number;
  b: number;
}

export const HOUSE_PRIOR_MIN = 0.15;
export const HOUSE_PRIOR_MAX = 0.85;

/**
 * Deterministic house seed of S$500, split by the weigh-in prior. The prior is
 * clamped so a heavy favorite still opens near 1.18x. Unclamped, a 1 v 8 seed
 * gap opens at 1.00x and a winning bet pays nothing.
 */
export function houseSplit(wA: number, wB: number, total: number = HOUSE_SEED_TOTAL): HouseSplit {
  const prior = Math.min(HOUSE_PRIOR_MAX, Math.max(HOUSE_PRIOR_MIN, weighInPrior(wA, wB)));
  const a = Math.round(total * prior);
  return { a, b: total - a };
}

export interface Pool {
  poolA: number;
  poolB: number;
  poolTotal: number;
  /** P / P_A, the payout multiplier per S$1 on A. The house seed keeps pools nonzero. */
  oddsA: number;
  oddsB: number;
}

/** Full pool for a match: house seed plus crowd stakes on each side. */
export function computePool(stakesA: number, stakesB: number, wA: number, wB: number): Pool {
  const house = houseSplit(wA, wB);
  const poolA = house.a + stakesA;
  const poolB = house.b + stakesB;
  const poolTotal = poolA + poolB;
  return {
    poolA,
    poolB,
    poolTotal,
    oddsA: poolTotal / poolA,
    oddsB: poolTotal / poolB,
  };
}

export interface PlacedBet {
  entrantId: string;
  stake: number;
}

/**
 * Settle crowd bets on a decided match. Winners split the pool pro-rata:
 * payout = floor(stake * P / P_winner). Losers get nothing.
 *
 * Nobody-backed-winner rule: when the crowd staked nothing on the winner,
 * the market is void and every bet is refunded in full.
 *
 * Returns the payout per bet, aligned with the input order.
 */
export function settleBets(
  bets: readonly PlacedBet[],
  winnerId: string,
  aId: string,
  bId: string,
  wA: number,
  wB: number,
): number[] {
  let stakesA = 0;
  let stakesB = 0;
  for (const bet of bets) {
    if (bet.entrantId === aId) stakesA += bet.stake;
    else if (bet.entrantId === bId) stakesB += bet.stake;
  }
  const pool = computePool(stakesA, stakesB, wA, wB);
  const crowdOnWinner =
    winnerId === aId ? stakesA : winnerId === bId ? stakesB : 0;
  if (crowdOnWinner === 0) {
    return bets.map((bet) => bet.stake);
  }
  const winnerPool = winnerId === aId ? pool.poolA : pool.poolB;
  return bets.map((bet) =>
    bet.entrantId === winnerId ? Math.floor((bet.stake * pool.poolTotal) / winnerPool) : 0,
  );
}

/** A stake is valid when it is a positive integer the wallet can cover. */
export function isValidStake(stake: number, wallet: number): boolean {
  return Number.isInteger(stake) && stake > 0 && stake <= wallet;
}
