import { CRITERION_IDS, type CriterionId, type RoundNumber } from "@sf-fight-club/schemas";
import { describe, expect, it } from "vitest";

import { resolveMatch, resolveRound, rngFromSeed } from "../src/index.js";
import { judgeCall, makeShot, rubric, tiebreak } from "./helpers.js";

/**
 * Delta identity: D_B - D_A equals the weighted rubric gap after backfire
 * penalties. HP is a single per-match lambda on top of that damage.
 */
describe("delta identity", () => {
  it("holds for random scorecards, capped fabrications, and both debiasing paths", () => {
    const preset = rubric();
    const rng = rngFromSeed("delta-identity");
    const rounds: RoundNumber[] = [1, 2, 3];

    for (let trial = 0; trial < 80; trial += 1) {
      const useMedian = trial >= 60;
      const resolvedRounds = rounds.map((round) => {
        const ab = randomCard(rng);
        const ba = useMedian ? flipOne(ab, rng) : ab;
        const extra = useMedian ? randomCard(rng) : undefined;
        const fabricated = Math.floor(rng() * 5);
        const shots = Array.from({ length: fabricated }, (_, index) =>
          makeShot({
            id: `t${trial}.r${round}.B.${index}`,
            type: "attack",
            criterion: CRITERION_IDS[Math.floor(rng() * CRITERION_IDS.length)] ?? "problem",
          }),
        );
        return resolveRound({
          round,
          rubric: preset,
          ab: judgeCall("AB", round, ab, { callId: `${trial}-${round}-AB` }),
          ba: judgeCall("BA", round, ba, { callId: `${trial}-${round}-BA` }),
          ...(extra ? { extra: judgeCall("random", round, extra, { callId: `${trial}-${round}-X`, fighter1: "A" }) } : {}),
          shots: { A: [], B: shots },
          factChecks: shots.map((shot) => ({
            shotId: shot.id,
            missingIds: ["E404"],
            perEvidence: [],
            numberContradicted: false,
            fabricated: true,
          })),
        });
      });

      const result = resolveMatch({
        rubric: preset,
        rounds: resolvedRounds,
        tiebreak: tiebreak(),
      });
      const penalties = result.backfire.points;
      const gap = result.weightedTotals.A - penalties.A - (result.weightedTotals.B - penalties.B);
      expect(result.resolution.delta).toBeCloseTo(gap, 8);
      expect(result.resolution.rawDamage.B - result.resolution.rawDamage.A).toBeCloseTo(result.resolution.delta, 8);

      const { lambda, rawDamage: damage } = result.resolution;
      expect(result.hpExact.A[2]).toBeCloseTo(100 - lambda * damage.A, 6);
      expect(result.hpExact.B[2]).toBeCloseTo(100 - lambda * damage.B, 6);
      if (damage.A > 0 && damage.B > 0) {
        expect((100 - result.hpExact.A[2]) / damage.A).toBeCloseTo(lambda, 6);
        expect((100 - result.hpExact.B[2]) / damage.B).toBeCloseTo(lambda, 6);
      }

      if (!useMedian) {
        const mean = (result.resolution.deltaByOrder.AB + result.resolution.deltaByOrder.BA) / 2;
        expect(result.resolution.delta).toBeCloseTo(mean, 8);
      }

      if (result.resolution.outcome === "KO") {
        const loser = damage.A > damage.B ? "A" : "B";
        expect(result.hpExact[loser][2]).toBeCloseTo(0, 6);
      }
      if (result.resolution.outcome === "DECISION") {
        const loser = damage.A > damage.B ? "A" : "B";
        expect(result.hpExact[loser][2]).toBeCloseTo(preset.thresholds.decisionFloorHp, 6);
      }
      if (result.resolution.outcome === "SUDDEN_DEATH") {
        expect(result.hpExact.A[2]).toBeGreaterThanOrEqual(preset.thresholds.suddenDeathFloorHp - 1e-6);
        expect(result.hpExact.B[2]).toBeGreaterThanOrEqual(preset.thresholds.suddenDeathFloorHp - 1e-6);
      }
    }
  });
});

function randomCard(rng: () => number): Record<CriterionId, { A: number; B: number }> {
  const scores = {} as Record<CriterionId, { A: number; B: number }>;
  for (const id of CRITERION_IDS) {
    scores[id] = { A: Math.floor(rng() * 11), B: Math.floor(rng() * 11) };
  }
  return scores;
}

/** Force a gap above 3 on one criterion so the third judge call is required. */
function flipOne(
  scores: Record<CriterionId, { A: number; B: number }>,
  rng: () => number,
): Record<CriterionId, { A: number; B: number }> {
  const id = CRITERION_IDS[Math.floor(rng() * CRITERION_IDS.length)] ?? "problem";
  const current = scores[id];
  const flipped = current.A >= 4 ? current.A - 4 : current.A + 4;
  return { ...scores, [id]: { A: flipped, B: current.B } };
}
