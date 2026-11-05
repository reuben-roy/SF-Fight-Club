import { describe, expect, it } from "vitest";

import type { CriterionId, RoundNumber, ShotVerdict } from "@sf-fight-club/schemas";

import { BACKFIRE_CAP, EngineError, outcomeFromDelta, resolveMatch, resolveRound } from "../src/index.js";
import {
  PERMIT_FINALS,
  fabrication,
  judgeCall,
  makeShot,
  ordersFromFinals,
  rubric,
  scorecard,
  tiebreak,
  withScore,
} from "./helpers.js";

const preset = rubric();

function roundScores(
  round: RoundNumber,
  scores: Record<CriterionId, { A: number; B: number }>,
  options?: {
    ba?: Record<CriterionId, { A: number; B: number }>;
    extra?: Record<CriterionId, { A: number; B: number }>;
    shots?: { A: ReturnType<typeof makeShot>[]; B: ReturnType<typeof makeShot>[] };
    checks?: ReturnType<typeof fabrication>[];
    verdicts?: { ab?: ShotVerdict[]; ba?: ShotVerdict[] };
  },
) {
  const ab = judgeCall("AB", round, scores, { shots: options?.verdicts?.ab, callId: `r${round}-AB` });
  const ba = judgeCall("BA", round, options?.ba ?? scores, { shots: options?.verdicts?.ba, callId: `r${round}-BA` });
  const extra = options?.extra
    ? judgeCall("random", round, options.extra, { callId: `r${round}-X`, fighter1: "B" })
    : undefined;
  return resolveRound({
    round,
    rubric: preset,
    ab,
    ba,
    ...(extra ? { extra } : {}),
    shots: options?.shots ?? { A: [], B: [] },
    factChecks: options?.checks ?? [],
  });
}

function matchFrom(
  perRound: Record<CriterionId, { A: number; B: number }> | ((round: RoundNumber) => Record<CriterionId, { A: number; B: number }>),
  options?: Parameters<typeof resolveMatch>[0]["tiebreak"] extends infer _T
    ? {
        tiebreak?: Parameters<typeof resolveMatch>[0]["tiebreak"];
        mutate?: (round: RoundNumber, call: { shots: { A: ReturnType<typeof makeShot>[]; B: ReturnType<typeof makeShot>[] }; checks: ReturnType<typeof fabrication>[] }) => void;
      }
    : never,
) {
  const rounds = ([1, 2, 3] as const).map((round) => {
    const scores = typeof perRound === "function" ? perRound(round) : perRound;
    const shots = { A: [] as ReturnType<typeof makeShot>[], B: [] as ReturnType<typeof makeShot>[] };
    const checks: ReturnType<typeof fabrication>[] = [];
    options?.mutate?.(round, { shots, checks });
    return roundScores(round, scores, { shots, checks });
  });
  return resolveMatch({ rubric: preset, rounds, ...(options?.tiebreak ? { tiebreak: options.tiebreak } : {}) });
}

describe("resolveRound", () => {
  it("averages AB and BA and flags only gaps above the instability threshold", () => {
    const close = roundScores(1, withScore(scorecard(5), "problem", { A: 10, B: 7 }));
    const problem = close.criteria.find((row) => row.criterion === "problem");
    expect(problem?.unstable).toBe(false);
    expect(problem?.scores.A.final).toBe(10);
    expect(problem?.scores.B.final).toBe(7);

    expect(() => roundScores(1, withScore(scorecard(5), "problem", { A: 10, B: 5 }), { ba: withScore(scorecard(5), "problem", { A: 6, B: 5 }) })).toThrow(
      EngineError,
    );

    const debiased = roundScores(
      1,
      withScore(scorecard(5), "problem", { A: 10, B: 5 }),
      { ba: withScore(scorecard(5), "problem", { A: 6, B: 5 }), extra: withScore(scorecard(5), "problem", { A: 7, B: 5 }) },
    );
    const row = debiased.criteria.find((item) => item.criterion === "problem");
    expect(row?.unstable).toBe(true);
    expect(row?.scores.A).toMatchObject({ AB: 10, BA: 6, extra: 7, final: 7 });
    expect(debiased.judgeCallIds).toEqual(["r1-AB", "r1-BA", "r1-X"]);
  });

  it("merges shot verdicts toward the call that deals less damage", () => {
    const attack = makeShot({ id: "r1.v1.A.s1", type: "attack", criterion: "problem" });
    const landed: ShotVerdict = { shotId: attack.id, verdict: "landed", impact: 3, note: "AB" };
    const whiff: ShotVerdict = { shotId: attack.id, verdict: "whiff", impact: 1, note: "BA" };
    const resolved = roundScores(1, scorecard(5), {
      shots: { A: [attack], B: [] },
      verdicts: { ab: [landed], ba: [whiff] },
    });
    expect(resolved.shotVerdicts).toEqual([{ shotId: attack.id, verdict: "whiff", impact: 1, note: "BA" }]);
  });
});

describe("resolveMatch outcomes", () => {
  it("reproduces the PermitPilot worked example", () => {
    const fake = makeShot({ id: "r3.v1.B.s9", type: "attack", criterion: "gtm", evidence: ["E404"], estimate: false });
    const rounds = ([1, 2, 3] as const).map((round) =>
      roundScores(round, ordersFromFinals(PERMIT_FINALS, "AB"), {
        ba: ordersFromFinals(PERMIT_FINALS, "BA"),
        ...(round === 3 ? { shots: { A: [], B: [fake] }, checks: [fabrication(fake.id)] } : {}),
      }),
    );
    const result = resolveMatch({ rubric: preset, rounds, tiebreak: tiebreak() });

    expect(result.weightedTotals.A).toBeCloseTo(67.65, 8);
    expect(result.weightedTotals.B).toBeCloseTo(55.85, 8);
    expect(result.resolution.rawDamage).toEqual({ A: expect.closeTo(3.95, 8), B: expect.closeTo(17.25, 8) });
    expect(result.resolution.delta).toBeCloseTo(13.3, 8);
    expect(result.resolution.delta).toBeCloseTo(result.weightedTotals.A - (result.weightedTotals.B - 1.5), 8);
    expect(result.resolution.outcome).toBe("KO");
    expect(result.resolution.winner).toBe("A");
    expect(result.resolution.decidedBy).toBe("scores");
    expect(result.resolution.perfect).toBe(false);
    expect(result.resolution.lambda).toBeCloseTo(100 / 17.25, 8);
    expect(result.resolution.hpAfterRound).toEqual({ A: [100, 93, 77], B: [49, 46, 0] });
    expect(result.hpExact.B[2]).toBeCloseTo(0, 8);
    expect(result.hpExact.A[2]).toBeCloseTo(100 - result.resolution.lambda * 3.95, 8);
    expect(result.pyrrhic).toBe(false);
    expect(result.resolution.stability).toBe("stable");
  });

  it("separates KO, decision, and sudden death on the rubric thresholds", () => {
    const ko = matchFrom(withScore(scorecard(5), "moat", { A: 10, B: 0 }));
    expect(ko.resolution.outcome).toBe("KO");
    expect(ko.resolution.delta).toBeCloseTo(10, 8);
    expect(ko.resolution.perfect).toBe(true);
    expect(ko.hpExact.B[2]).toBeCloseTo(0, 8);
    expect(ko.hpExact.A[2]).toBeCloseTo(100, 8);
    expect(ko.resolution.decisionType).toBeUndefined();

    const decision = matchFrom(withScore(scorecard(5), "moat", { A: 8, B: 3 }));
    expect(decision.resolution.outcome).toBe("DECISION");
    expect(decision.resolution.decisionType).toBe("unanimous");
    expect(decision.resolution.delta).toBeCloseTo(5, 8);
    expect(decision.hpExact.B[2]).toBeCloseTo(12, 8);
    expect(decision.resolution.hpAfterRound.B[2]).toBe(12);
    expect(decision.resolution.perfect).toBe(true);

    const draw = matchFrom(withScore(scorecard(5), "moat", { A: 6, B: 5 }), { tiebreak: tiebreak() });
    expect(draw.resolution.outcome).toBe("SUDDEN_DEATH");
    expect(draw.resolution.delta).toBeCloseTo(1, 8);
    expect(draw.resolution.winner).toBe("A");
    expect(draw.resolution.decidedBy).toBe("sudden_death_judge");
  });

  it("calls a decision a majority when one order is inside the draw margin", () => {
    const base = scorecard(5);
    const result = resolveMatch({
      rubric: preset,
      rounds: ([1, 2, 3] as const).map((round) =>
        roundScores(round, withScore(base, "moat", { A: 8, B: 4 }), {
          ba: withScore(base, "moat", { A: 6, B: 5 }),
        }),
      ),
    });
    expect(result.resolution.stability).toBe("stable");
    expect(result.resolution.outcome).toBe("DECISION");
    expect(result.resolution.decisionType).toBe("majority");
    expect(result.resolution.delta).toBeCloseTo(2.5, 8);
  });

  it("treats a noisy flip as wobbly and a real flip as sudden death (FE-12)", () => {
    const base = scorecard(5);
    const wobbly = resolveMatch({
      rubric: preset,
      rounds: ([1, 2, 3] as const).map((round) =>
        roundScores(round, withScore(base, "moat", { A: 8, B: 4 }), {
          ba: withScore(base, "moat", { A: 5, B: 6 }),
        }),
      ),
    });
    expect(wobbly.resolution.stability).toBe("wobbly");
    expect(wobbly.resolution.outcome).toBe("DECISION");
    expect(wobbly.resolution.delta).toBeCloseTo(1.5, 8);

    const split = resolveMatch({
      rubric: preset,
      tiebreak: tiebreak(),
      rounds: ([1, 2, 3] as const).map((round) =>
        roundScores(round, withScore(base, "problem", { A: 10, B: 5 }), {
          ba: withScore(base, "problem", { A: 7, B: 8 }),
        }),
      ),
    });
    expect(split.resolution.stability).toBe("split");
    expect(split.resolution.delta).toBeCloseTo(3, 8);
    expect(split.resolution.outcome).toBe("SUDDEN_DEATH");
    expect(split.resolution.decidedBy).toBe("sudden_death_judge");
  });

  it("sends an all-tie card to sudden death at full HP (FE-13)", () => {
    const result = matchFrom(scorecard(5), {
      tiebreak: tiebreak({ seeds: { A: 4, B: 1 }, suddenDeathVotes: [], weighinTotals: { A: 50, B: 50 } }),
    });
    expect(result.resolution.delta).toBe(0);
    expect(result.resolution.outcome).toBe("SUDDEN_DEATH");
    expect(result.resolution.lambda).toBe(0);
    expect(result.hpExact).toEqual({ A: [100, 100, 100], B: [100, 100, 100] });
    expect(result.resolution.hpAfterRound).toEqual({ A: [100, 100, 100], B: [100, 100, 100] });
    expect(result.resolution.winner).toBe("B");
    expect(result.resolution.decidedBy).toBe("seed");
  });

  it("resolves two identical ideas through the cascade (FE-14)", () => {
    const identical = matchFrom(scorecard(6), {
      tiebreak: tiebreak({
        suddenDeathVotes: [
          { order: "AB", winner: "A", callId: "1" },
          { order: "BA", winner: "B", callId: "2" },
          { order: "AB", winner: "A", callId: "3" },
          { order: "BA", winner: "B", callId: "4" },
        ],
        weighinTotals: { A: 40, B: 40.4 },
        seeds: { A: 3, B: 1 },
      }),
    });
    expect(identical.resolution.outcome).toBe("SUDDEN_DEATH");
    expect(identical.resolution.tiebreak?.map((record) => record.strategy)).toEqual([
      "sudden_death_judge",
      "weighin_total",
      "seed",
    ]);
    expect(identical.resolution.winner).toBe("B");
    expect(identical.resolution.decidedBy).toBe("seed");
  });

  it("caps backfire at three penalties and still records the rest (FE-9)", () => {
    expect(preset.thresholds.backfireCap).toBe(BACKFIRE_CAP);
    const shots = [1, 2, 3, 4].map((index) =>
      makeShot({ id: `r1.v1.B.s${index}`, type: "attack", criterion: "problem", evidence: ["E404"], estimate: false }),
    );
    const result = resolveMatch({
      rubric: preset,
      rounds: ([1, 2, 3] as const).map((round) =>
        roundScores(round, scorecard(5), {
          ...(round === 1 ? { shots: { A: [], B: shots }, checks: shots.map((shot) => fabrication(shot.id)) } : {}),
        }),
      ),
    });
    expect(result.backfire.points.B).toBe(4.5);
    expect(result.backfire.applied.B).toHaveLength(3);
    expect(result.backfire.suppressed.B).toEqual(["r1.v1.B.s4"]);
    expect(result.resolution.delta).toBeCloseTo(4.5, 8);
    expect(result.resolution.outcome).toBe("DECISION");
    expect(result.resolution.winner).toBe("A");
  });

  it("raises PYRRHIC VICTORY only when both weighted totals are under 30 (FE-15)", () => {
    const grim = matchFrom(scorecard(2), { tiebreak: tiebreak() });
    expect(grim.weightedTotals).toEqual({ A: 20, B: 20 });
    expect(grim.pyrrhic).toBe(true);
    expect(grim.resolution.pyrrhic).toBe(true);
    expect(grim.resolution.winner).toBe("A");

    const atCeiling = matchFrom(scorecard(3), { tiebreak: tiebreak() });
    expect(atCeiling.weightedTotals.A).toBeCloseTo(30, 8);
    expect(atCeiling.pyrrhic).toBe(false);

    const blowout = matchFrom(withScore(scorecard(2), "problem", { A: 10, B: 2 }));
    expect(blowout.pyrrhic).toBe(false);
    expect(blowout.resolution.outcome).toBe("KO");
  });

  it("reads KO and draw margins from the rubric", () => {
    expect(outcomeFromDelta(10, "stable", preset.thresholds)).toBe("KO");
    expect(outcomeFromDelta(9.999, "stable", preset.thresholds)).toBe("DECISION");
    expect(outcomeFromDelta(1.5, "stable", preset.thresholds)).toBe("DECISION");
    expect(outcomeFromDelta(1.499, "stable", preset.thresholds)).toBe("SUDDEN_DEATH");
    expect(outcomeFromDelta(20, "split", preset.thresholds)).toBe("SUDDEN_DEATH");

    const tuned = structuredClone(preset);
    tuned.thresholds = { ...tuned.thresholds, koMargin: 20 };
    const rounds = ([1, 2, 3] as const).map((round) => roundScores(round, withScore(scorecard(5), "problem", { A: 10, B: 0 })));
    const result = resolveMatch({ rubric: tuned, rounds });
    expect(result.resolution.delta).toBeCloseTo(15, 8);
    expect(result.resolution.outcome).toBe("DECISION");
  });
});
