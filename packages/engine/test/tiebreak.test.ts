import { describe, expect, it } from "vitest";

import { mapJudgeLabel, runTiebreak } from "../src/index.js";
import { tiebreak } from "./helpers.js";

describe("runTiebreak", () => {
  it("gives sudden death to a side with three or more votes", () => {
    const decided = runTiebreak(tiebreak());
    expect(decided.winner).toBe("A");
    expect(decided.decidedBy).toBe("sudden_death_judge");
    expect(decided.records).toHaveLength(1);
  });

  it("falls through a 2-2, a weigh-in inside 0.5, and lands on seed", () => {
    const splitVotes = [
      { order: "AB" as const, winner: "A" as const, callId: "1" },
      { order: "BA" as const, winner: "B" as const, callId: "2" },
      { order: "AB" as const, winner: "A" as const, callId: "3" },
      { order: "BA" as const, winner: "B" as const, callId: "4" },
    ];
    const byWeighin = runTiebreak(
      tiebreak({
        suddenDeathVotes: splitVotes,
        weighinTotals: { A: 61, B: 60.5 },
      }),
    );
    expect(byWeighin.winner).toBe("A");
    expect(byWeighin.decidedBy).toBe("weighin_total");
    expect(byWeighin.records.map((record) => record.result)).toEqual(["split", "A"]);

    const tooClose = runTiebreak(
      tiebreak({
        suddenDeathVotes: splitVotes,
        weighinTotals: { A: 60, B: 60.49 },
        seeds: { A: 4, B: 2 },
      }),
    );
    expect(tooClose.winner).toBe("B");
    expect(tooClose.decidedBy).toBe("seed");
    expect(tooClose.records.map((record) => record.strategy)).toEqual(["sudden_death_judge", "weighin_total", "seed"]);
  });

  it("skips a disabled VC panel and uses it when the build enables it", () => {
    const votes = [
      { order: "AB" as const, winner: "A" as const, callId: "1" },
      { order: "BA" as const, winner: "B" as const, callId: "2" },
      { order: "AB" as const, winner: "B" as const, callId: "3" },
      { order: "BA" as const, winner: "A" as const, callId: "4" },
    ];
    const vcVotes = [
      { vcUserId: "vc1", pick: "B" as const, reason: "Distribution." },
      { vcUserId: "vc2", pick: "B" as const, reason: "Moat." },
    ];
    const skipped = runTiebreak(tiebreak({ suddenDeathVotes: votes, vcVotes, weighinTotals: { A: 80, B: 70 } }));
    expect(skipped.records.some((record) => record.strategy === "vc_panel")).toBe(false);
    expect(skipped.decidedBy).toBe("weighin_total");

    const enabled = runTiebreak(tiebreak({ suddenDeathVotes: votes, vcVotes, disabled: [] }));
    expect(enabled.winner).toBe("B");
    expect(enabled.decidedBy).toBe("vc_panel");

    const abstain = runTiebreak(
      tiebreak({
        suddenDeathVotes: votes,
        disabled: [],
        vcVotes: [{ vcUserId: "vc1", pick: "A", reason: "Only one vote." }],
        weighinTotals: { A: 10, B: 80 },
      }),
    );
    expect(abstain.decidedBy).toBe("weighin_total");
    expect(abstain.winner).toBe("B");
  });

  it("maps judge labels using the presentation order", () => {
    expect(mapJudgeLabel("fighter_1", "AB")).toBe("A");
    expect(mapJudgeLabel("fighter_2", "AB")).toBe("B");
    expect(mapJudgeLabel("fighter_1", "BA")).toBe("B");
    expect(mapJudgeLabel("fighter_2", "BA")).toBe("A");
    expect(mapJudgeLabel("fighter_1", "random", "B")).toBe("B");
    expect(mapJudgeLabel("fighter_2", "random", "B")).toBe("A");
  });
});
