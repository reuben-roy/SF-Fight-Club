import { describe, expect, it } from "vitest";

import { assignCorners, completedStepKeys, computeAllowed, resultsPublic, stepDisposition } from "../src/index.js";

describe("assignCorners", () => {
  it("draws the left corner from the match seed, not the seed number (FA-3)", () => {
    expect(assignCorners("permit-vs-fog")).toEqual(assignCorners("permit-vs-fog"));
    const left = new Set<"A" | "B">();
    for (let index = 0; index < 40; index += 1) left.add(assignCorners(`match-${index}`).left);
    expect([...left].sort()).toEqual(["A", "B"]);
    // The higher tournament seed can stand on the right. Corners take only the match seed.
    const corners = assignCorners("higher-seed-on-the-right");
    const higherSeedSlot = "A" as const;
    expect(corners.left === higherSeedSlot || corners.right === higherSeedSlot).toBe(true);
    expect(corners.left).not.toBe(corners.right);
  });
});

describe("compute log invariants", () => {
  it("reuses a completed step key and refuses to compute while bets are open", () => {
    const events = [{ stepKey: "r1/v1/A" }, { stepKey: "r1/judge/AB" }];
    expect(stepDisposition(events, "r1/v1/A")).toBe("reuse");
    expect(stepDisposition(events, "r1/v1/B")).toBe("run");
    expect(completedStepKeys(events).has("r1/judge/AB")).toBe(true);

    expect(computeAllowed("betting_open")).toBe(false);
    expect(computeAllowed("scheduled")).toBe(false);
    expect(computeAllowed("locked")).toBe(true);
    expect(computeAllowed("computing")).toBe(true);
    expect(computeAllowed("failed")).toBe(true);

    expect(resultsPublic("sealed")).toBe(false);
    expect(resultsPublic("airing")).toBe(false);
    expect(resultsPublic("complete")).toBe(true);
  });
});
