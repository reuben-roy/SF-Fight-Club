import { describe, expect, it } from "vitest";

import {
  permitVsFogcastTape,
  runMatch,
  stepKey,
  type LlmCall,
  type MatchRun,
} from "../src/index.js";
import { loadFixture, matchInput, WEIGH_A } from "./helpers.js";

describe("permit vs fogcast replay", () => {
  const fixtures = loadFixture("permit-vs-fogcast.json");

  it("matches the committed fixture tape", () => {
    expect(fixtures).toEqual(permitVsFogcastTape());
  });

  it("seals a deterministic K.O. whose delta is the rubric gap", () => {
    const first = runMatch(matchInput({ fixtures }));
    const second = runMatch(matchInput({ fixtures }));

    expect(first.status).toBe("sealed");
    expect(first.resolution?.outcome).toBe("KO");
    expect(first.resolution?.winner).toBe("A");
    expect(first.resolution?.decidedBy).toBe("scores");
    expect(first.resolution?.delta).toBeCloseTo(13.3, 5);
    expect(first.resolution?.rawDamage.A).toBeCloseTo(3.95, 5);
    expect(first.resolution?.rawDamage.B).toBeCloseTo(17.25, 5);
    expect(identity(first)).toBeCloseTo(first.resolution?.delta ?? 0, 5);

    expect(first.script?.cues[0]).toMatchObject({ kind: "intro" });
    expect(first.script?.cues.at(-1)).toMatchObject({ kind: "winner", winner: "A", decidedBy: "scores" });
    expect(first.script?.cues.some((cue) => cue.kind === "shot" && cue.outcome === "backfire")).toBe(true);
    expect(first.events.map((event) => event.type)).toContain("match.sealed");
    expect(first.events.map((event) => event.stepKey)).not.toContain(stepKey.judge(1, "random"));
    expect(first.fixtureReads).not.toContain(stepKey.judge(1, "random"));

    expect(second.events).toEqual(first.events);
    expect(second.calls).toEqual(first.calls);
    expect(second.script).toEqual(first.script);
    expect(second.fixtureReads).toEqual(first.fixtureReads);
    expect(new Set(first.events.map((event) => event.stepKey)).size).toBe(first.events.length);
  });

  it("keeps volley 1 blind and keeps judge packets free of seeds, odds, and sprites", () => {
    const run = runMatch(matchInput({ fixtures }));
    const opening = request(run, stepKey.volley(1, 1, "A"));
    expect(JSON.stringify(opening)).not.toContain("Fog empties patios");
    expect(opening).not.toHaveProperty("opponentVolley1");

    const counter = request(run, stepKey.volley(1, 2, "A"));
    expect(JSON.stringify(counter)).toContain("Fog empties patios");

    const judge = request(run, stepKey.judge(2, "AB"));
    expect(judge).toMatchObject({
      criteria: [
        { id: "differentiation" },
        { id: "moat" },
        { id: "timing" },
      ],
    });
    const packed = JSON.stringify(run.calls.filter((call) => call.role === "judge"));
    expect(packed).not.toContain("permit-seed-9f3a");
    expect(packed).not.toContain("sprite-permit-9f3a");
    expect(packed).not.toContain("sprite-fog-9f3a");
    expect(packed).not.toContain(String(WEIGH_A));
    expect(packed).not.toContain("odds");
    expect(packed).not.toContain("corner");
    expect(packed).not.toContain("archetype");
    expect(packed).not.toContain("submitter");

    const fabricated = run.events.find(
      (event) => event.type === "factcheck.completed" && event.stepKey === stepKey.factcheck(3, 1, "B"),
    );
    expect(fabricated?.type).toBe("factcheck.completed");
    if (fabricated?.type === "factcheck.completed") {
      expect(fabricated.checks.find((check) => check.shotId === "r3.v1.B.s1")).toMatchObject({
        missingIds: ["E404"],
        fabricated: true,
      });
    }
  });
});

function request(run: MatchRun, key: string): Record<string, unknown> {
  const call = run.calls.find((item) => item.stepKey === key && item.ok);
  expect(call, key).toBeDefined();
  return (call as LlmCall).request as Record<string, unknown>;
}

function identity(run: MatchRun): number {
  let weightedA = 0;
  let weightedB = 0;
  let damageA = 0;
  let damageB = 0;
  for (const event of run.events) {
    if (event.type !== "round.resolved") continue;
    for (const criterion of event.resolution.criteria) {
      weightedA += (criterion.weight * criterion.scores.A.final) / 10;
      weightedB += (criterion.weight * criterion.scores.B.final) / 10;
      damageA += criterion.damageTo.A;
      damageB += criterion.damageTo.B;
    }
  }
  const resolution = run.resolution;
  if (!resolution) return Number.NaN;
  const backfireA = resolution.rawDamage.A - damageA;
  const backfireB = resolution.rawDamage.B - damageB;
  expect(resolution.rawDamage.B - resolution.rawDamage.A).toBeCloseTo(resolution.delta, 5);
  return weightedA - backfireA - (weightedB - backfireB);
}
