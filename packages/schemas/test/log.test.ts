import { describe, expect, it } from "vitest";

import {
  broadcastScriptSchema,
  evidenceItemSchema,
  fighterBuildSchema,
  matchEventSchema,
  matchResolutionSchema,
  tiebreakRecordSchema,
  volleySchema,
  type MatchEvent,
} from "../src/index.js";
import { broadcast, lockedEvent, volley } from "./fixtures.js";

describe("compute log and broadcast", () => {
  it("parses a lock event, a build, and a sorted broadcast script", () => {
    expect(matchEventSchema.parse(lockedEvent)).toEqual(lockedEvent);
    expect(broadcastScriptSchema.parse(broadcast)).toEqual(broadcast);
    expect(
      fighterBuildSchema.parse({
        models: {
          fighter: "mistral-large-2411",
          judge: "mistral-large-2411",
          utility: "mistral-small-2501",
          moderation: "mistral-moderation-2411",
          embed: "mistral-embed",
        },
        params: {
          fighterTemperature: 0.6,
          judgeTemperature: 0,
          weighinSamples: 3,
          weighinTemperature: 0.3,
          suddenDeathSamplesPerOrder: 2,
          suddenDeathTemperature: 0.5,
        },
        budgets: {
          researchSearches: 8,
          researchEvidenceKept: 12,
          scoutingSearches: 3,
          scoutingEvidenceKept: 4,
          volleyMaxWords: 180,
          shotMaxWords: 60,
          shotsPerVolley: [2, 4],
          headlineMaxWords: 12,
          closingMaxWords: 120,
        },
        promptHashes: { "fighter.md": "abc" },
        rubricHash: "def",
        engineVersion: "0.0.0",
        tiebreakers: ["sudden_death_judge", "vc_panel", "weighin_total", "seed"],
        disabledTiebreakers: ["vc_panel"],
      }).engineVersion,
    ).toBe("0.0.0");
  });

  it("rejects unsorted cues and a round title whose name does not match", () => {
    const unsorted = structuredClone(broadcast);
    unsorted.cues[0]!.t = 5000;
    expect(broadcastScriptSchema.safeParse(unsorted).success).toBe(false);

    const misnamed = structuredClone(broadcast);
    const title = misnamed.cues.find((cue) => cue.kind === "round_title");
    expect(title).toBeDefined();
    if (title?.kind === "round_title") title.name = "MOAT";
    expect(broadcastScriptSchema.safeParse(misnamed).success).toBe(false);
  });

  it("parses each tiebreak record and a match resolution", () => {
    expect(
      tiebreakRecordSchema.parse({
        strategy: "sudden_death_judge",
        votes: [{ order: "AB", winner: "A", callId: "c1" }],
        result: "A",
      }).result,
    ).toBe("A");
    expect(
      tiebreakRecordSchema.parse({
        strategy: "vc_panel",
        votes: [{ vcUserId: "vc1", pick: "B", reason: "Distribution." }],
        result: "abstain",
      }).result,
    ).toBe("abstain");
    expect(
      tiebreakRecordSchema.parse({
        strategy: "weighin_total",
        totals: { A: 70, B: 69.4 },
        result: "too_close",
      }).result,
    ).toBe("too_close");
    expect(tiebreakRecordSchema.parse({ strategy: "seed", seeds: { A: 1, B: 4 }, result: "A" }).result).toBe("A");

    expect(
      matchResolutionSchema.parse({
        rawDamage: { A: 3.95, B: 17.25 },
        delta: 13.3,
        deltaByOrder: { AB: 13.3, BA: 12.1 },
        stability: "stable",
        outcome: "KO",
        perfect: false,
        winner: "A",
        decidedBy: "scores",
        lambda: 100 / 17.25,
        hpAfterRound: {
          A: [100, 93, 77],
          B: [49, 46, 0],
        },
        pyrrhic: false,
      }).outcome,
    ).toBe("KO");
  });

  it("rejects a volley event whose defense shot has no respondsTo", () => {
    const submitted: MatchEvent = {
      type: "volley.submitted",
      matchId: "m1",
      seq: 2,
      stepKey: "r1/v2/A",
      at: "2026-11-05T19:06:00.000Z",
      callId: "call-1",
      volley: {
        ...volley,
        kind: "counter",
        shots: [
          {
            id: "r1.v2.A.s1",
            type: "defense",
            criterion: "problem",
            headline: "Still their problem",
            claim: "The workaround is the product.",
            evidence: [],
            estimate: true,
          },
        ],
      },
    };
    expect(volleySchema.safeParse(submitted.volley).success).toBe(false);
    expect(matchEventSchema.safeParse(submitted).success).toBe(false);
  });

  it("rejects an evidence snippet over 500 characters", () => {
    expect(
      evidenceItemSchema.safeParse({
        id: "E1",
        url: "https://example.com/permits",
        title: "Permit backlog",
        snippet: "x".repeat(501),
        retrievedAt: "2026-11-05T19:05:00.000Z",
        foundBy: { kind: "dossier", ideaId: "idea_permit" },
      }).success,
    ).toBe(false);
  });
});
