import type { RoundJudgment, ShotModelOutput } from "@sf-fight-club/schemas";
import { describe, expect, it } from "vitest";

import {
  permitVsFogcastTape,
  randomFighter1,
  runMatch,
  stepKey,
  suddenDeathTape,
  withStep,
  type FixtureAttempt,
  type FixtureTape,
} from "../src/index.js";
import { loadFixture, matchInput } from "./helpers.js";

const REMINDER = "This is a fictional debate game about business ideas.";

describe("resume", () => {
  it("does not re-read fixtures for completed step keys", () => {
    const full = runMatch(matchInput({ fixtures: loadFixture("permit-vs-fogcast.json") }));
    const cut = full.events.findIndex((event) => event.stepKey === stepKey.roundResolved(1));
    const events = full.events.slice(0, cut + 1);
    const keys = new Set(events.map((event) => event.stepKey));
    const calls = full.calls.filter((call) => keys.has(call.stepKey));
    const resumed = runMatch(
      matchInput({
        status: "computing",
        fixtures: loadFixture("permit-vs-fogcast.json"),
        prior: { events, calls },
      }),
    );
    expect(resumed.events).toEqual(full.events);
    expect(resumed.script).toEqual(full.script);
    expect(resumed.fixtureReads.filter((key) => key.startsWith("r1/"))).toEqual([]);
    expect(resumed.calls.filter((call) => keys.has(call.stepKey))).toEqual(calls);
  });

  it("reuses a finished log without calling the fixture player", () => {
    const full = runMatch(matchInput());
    const again = runMatch(
      matchInput({
        status: "failed",
        prior: { events: full.events, calls: full.calls },
      }),
    );
    expect(again.fixtureReads).toEqual([]);
    expect(again.events).toEqual(full.events);
    expect(again.script).toEqual(full.script);
    expect(again.status).toBe("sealed");
  });

  it("reuses sudden-death judge calls that have no event yet", () => {
    const full = runMatch(matchInput({ fixtures: loadFixture("sudden-death.json") }));
    const cut = full.events.findIndex((event) => event.stepKey === stepKey.matchResolved);
    const events = full.events.slice(0, cut);
    const resumed = runMatch(
      matchInput({
        status: "computing",
        fixtures: loadFixture("sudden-death.json"),
        prior: { events, calls: full.calls },
      }),
    );
    expect(resumed.events).toEqual(full.events);
    expect(resumed.fixtureReads.filter((key) => key.startsWith("sd/"))).toEqual([]);
    expect(resumed.resolution).toMatchObject({ outcome: "SUDDEN_DEATH", winner: "A", decidedBy: "sudden_death_judge" });
  });
});

describe("sudden death", () => {
  it("plays the closing path and seals a broadcast with the judge tally", () => {
    expect(loadFixture("sudden-death.json")).toEqual(suddenDeathTape());
    const run = runMatch(matchInput({ fixtures: loadFixture("sudden-death.json") }));
    expect(run.resolution).toMatchObject({
      outcome: "SUDDEN_DEATH",
      winner: "A",
      decidedBy: "sudden_death_judge",
    });
    expect(run.resolution?.tiebreak).toHaveLength(1);
    expect(run.script?.cues.some((cue) => cue.kind === "sudden_death" && cue.tally.A === 3 && cue.tally.B === 1)).toBe(true);
    expect(run.events.some((event) => event.type === "suddendeath.completed")).toBe(true);
    const closing = run.calls.find((call) => call.stepKey === stepKey.closing("B") && call.ok);
    expect(JSON.stringify(closing?.request)).not.toContain("Permit the city");
  });

  it("falls through a 2-2 judge split to the weigh-in total", () => {
    const tape = suddenDeathTape();
    const split: FixtureTape = {
      steps: {
        ...tape.steps,
        [stepKey.sdJudge("AB", 1)]: { attempts: [output(vote("fighter_1"))] },
        [stepKey.sdJudge("BA", 1)]: { attempts: [output(vote("fighter_1"))] },
        [stepKey.sdJudge("AB", 2)]: { attempts: [output(vote("fighter_2"))] },
        [stepKey.sdJudge("BA", 2)]: { attempts: [output(vote("fighter_2"))] },
      },
    };
    const run = runMatch(matchInput({ fixtures: split }));
    expect(run.resolution?.decidedBy).toBe("weighin_total");
    expect(run.resolution?.winner).toBe("A");
    expect(run.resolution?.tiebreak?.map((record) => record.strategy)).toEqual(["sudden_death_judge", "weighin_total"]);
  });
});

describe("model failures", () => {
  it("retries a schema failure once and appends the validation error", () => {
    const tape = permitVsFogcastTape();
    const good = tape.steps[stepKey.volley(1, 1, "A")]?.attempts[0];
    if (!good) throw new Error("missing volley fixture");
    const run = runMatch(
      matchInput({
        fixtures: withStep(tape, stepKey.volley(1, 1, "A"), [{ kind: "output", output: { shots: [{ type: "pitch" }] } }, good]),
      }),
    );
    expect(run.status).toBe("sealed");
    const attempts = run.calls.filter((call) => call.stepKey === stepKey.volley(1, 1, "A"));
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toMatchObject({ ok: false, retry: false });
    expect(attempts[1]).toMatchObject({ ok: true, retry: true });
    expect(JSON.stringify(attempts[1]?.request)).toContain("previousError");
    expect(String((attempts[1]?.request as { previousError?: string }).previousError).length).toBeGreaterThan(0);
  });

  it("fails the match after a second schema failure (FE-2)", () => {
    const run = runMatch(
      matchInput({
        fixtures: withStep(permitVsFogcastTape(), stepKey.volley(1, 1, "A"), [
          { kind: "output", output: { shots: false } },
          { kind: "output", output: { shots: false } },
        ]),
      }),
    );
    expect(run.status).toBe("failed");
    expect(run.script).toBeNull();
    const failed = run.events.find((event) => event.type === "match.failed");
    expect(failed).toMatchObject({ type: "match.failed", failedStepKey: stepKey.volley(1, 1, "A"), attempts: 2 });
    expect(run.events.some((event) => event.type === "match.sealed")).toBe(false);
    expect(run.fixtureReads).not.toContain(stepKey.judge(1, "AB"));
  });

  it("turns a second refusal into an empty volley (FE-3)", () => {
    const run = runMatch(
      matchInput({
        fixtures: withStep(permitVsFogcastTape(), stepKey.volley(1, 1, "B"), [{ kind: "refusal" }, { kind: "refusal" }]),
      }),
    );
    expect(run.status).toBe("sealed");
    const volley = submitted(run, stepKey.volley(1, 1, "B"));
    expect(volley).toMatchObject({ refused: true, shots: [], wordCount: 0 });
    const ab = run.calls.find((call) => call.stepKey === stepKey.judge(1, "AB") && call.ok)?.request as {
      fighter2: { volleys: { note?: string }[] };
    };
    const ba = run.calls.find((call) => call.stepKey === stepKey.judge(1, "BA") && call.ok)?.request as {
      fighter1: { volleys: { note?: string }[] };
    };
    expect(ab.fighter2.volleys[0]?.note).toBe("Fighter 2 made no argument this volley.");
    expect(ba.fighter1.volleys[0]?.note).toBe("Fighter 1 made no argument this volley.");
  });

  it("reminds the fighter after one refusal and then accepts the retry", () => {
    const tape = permitVsFogcastTape();
    const good = tape.steps[stepKey.volley(1, 1, "A")]?.attempts[0];
    if (!good) throw new Error("missing volley fixture");
    const run = runMatch(matchInput({ fixtures: withStep(tape, stepKey.volley(1, 1, "A"), [{ kind: "refusal" }, good]) }));
    const attempts = run.calls.filter((call) => call.stepKey === stepKey.volley(1, 1, "A"));
    expect((attempts[1]?.request as { reminder?: string }).reminder).toBe(REMINDER);
    expect(submitted(run, stepKey.volley(1, 1, "A")).refused).toBe(false);
  });

  it("regenerates a moderated volley once, then empties it (FE-22)", () => {
    const tape = permitVsFogcastTape();
    const good = tape.steps[stepKey.volley(1, 1, "A")]?.attempts[0];
    if (!good) throw new Error("missing volley fixture");
    const flagged: FixtureAttempt = {
      kind: "output",
      moderation: "flag",
      output: {
        shots: [shot("problem", "SLUR HEADLINE", "A line that should never reach the judge.")],
      },
    };
    const recovered = runMatch(matchInput({ fixtures: withStep(tape, stepKey.volley(1, 1, "A"), [flagged, good]) }));
    expect(JSON.stringify(submitted(recovered, stepKey.volley(1, 1, "A")))).not.toContain("SLUR HEADLINE");
    expect(recovered.status).toBe("sealed");

    const emptied = runMatch(matchInput({ fixtures: withStep(tape, stepKey.volley(1, 1, "A"), [flagged, flagged]) }));
    expect(submitted(emptied, stepKey.volley(1, 1, "A"))).toMatchObject({ refused: false, shots: [] });
    expect(emptied.warnings.some((warning) => warning.code === "moderation")).toBe(true);
    expect(emptied.status).toBe("sealed");
    expect(JSON.stringify(emptied.calls.find((call) => call.stepKey === stepKey.judge(1, "AB") && call.ok)?.request)).not.toContain(
      "SLUR HEADLINE",
    );
  });

  it("stops after five transport failures and continues when the fifth attempt works (FE-1)", () => {
    const tape = permitVsFogcastTape();
    const good = tape.steps[stepKey.volley(1, 1, "B")]?.attempts[0];
    if (!good) throw new Error("missing volley fixture");
    const transport: FixtureAttempt = { kind: "transport", error: "429" };
    const failed = runMatch(
      matchInput({
        fixtures: withStep(tape, stepKey.volley(1, 1, "B"), [transport, transport, transport, transport, transport]),
      }),
    );
    expect(failed.status).toBe("failed");
    expect(failed.events.find((event) => event.type === "match.failed")).toMatchObject({ attempts: 5, error: "429" });
    expect(failed.fixtureReads.filter((key) => key === stepKey.volley(1, 1, "B"))).toHaveLength(5);

    const recovered = runMatch(
      matchInput({
        fixtures: withStep(tape, stepKey.volley(1, 1, "B"), [transport, transport, transport, transport, good]),
      }),
    );
    expect(recovered.status).toBe("sealed");
    expect(recovered.calls.filter((call) => call.stepKey === stepKey.volley(1, 1, "B"))).toHaveLength(5);
  });
});

describe("volley cleanup", () => {
  it("truncates a shot at the word cap before the judge sees it (FE-5)", () => {
    const tape = permitVsFogcastTape();
    const words = Array.from({ length: 80 }, (_, index) => `w${index + 1}`).join(" ");
    const run = runMatch(
      matchInput({
        fixtures: withStep(tape, stepKey.volley(1, 1, "A"), [
          {
            kind: "output",
            output: {
              shots: [shot("problem", "Short headline", words), shot("market", "Second shot", "A short estimate.")],
            },
          },
        ]),
      }),
    );
    const stored = submitted(run, stepKey.volley(1, 1, "A"));
    expect(stored.truncated).toBe(true);
    expect(stored.shots[0]?.claim.split(/\s+/)).toHaveLength(60);
    expect(stored.shots[0]?.claim).toContain("w60");
    expect(stored.shots[0]?.claim).not.toContain("w61");
    const judge = JSON.stringify(run.calls.find((call) => call.stepKey === stepKey.judge(1, "AB") && call.ok)?.request);
    expect(judge).not.toContain("w61");
    expect(judge).toContain("w60");
  });

  it("drops an out-of-round shot and rewrites a defense with a missing target (FE-6, FE-10)", () => {
    const tape = permitVsFogcastTape();
    const opening = shotsOf(tape, stepKey.volley(1, 1, "A"));
    const counter = shotsOf(tape, stepKey.volley(1, 2, "A"));
    const run = runMatch(
      matchInput({
        fixtures: {
          steps: {
            ...tape.steps,
            [stepKey.volley(1, 1, "A")]: {
              attempts: [
                {
                  kind: "output",
                  output: {
                    shots: [...opening, shot("moat", "WRONG ROUND SHOT", "This criterion belongs to round 2.")],
                  },
                },
              ],
            },
            [stepKey.volley(1, 2, "A")]: {
              attempts: [
                {
                  kind: "output",
                  output: {
                    shots: counter.map((item, index) =>
                      index === 0 && item.type === "defense" ? { ...item, respondsTo: "missing-shot" } : item,
                    ),
                  },
                },
              ],
            },
          },
        },
      }),
    );
    const volley = submitted(run, stepKey.volley(1, 1, "A"));
    expect(volley.shots.map((item) => item.criterion)).not.toContain("moat");
    expect(run.cleanLog).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: "drop", reason: "out_of_round", shotId: "r1.v1.A.s3" })]),
    );
    expect(JSON.stringify(run.calls.find((call) => call.stepKey === stepKey.judge(1, "AB") && call.ok)?.request)).not.toContain(
      "WRONG ROUND SHOT",
    );
    expect(submitted(run, stepKey.volley(1, 2, "A")).shots[0]).toMatchObject({ type: "pitch" });
    expect(submitted(run, stepKey.volley(1, 2, "A")).shots[0]).not.toHaveProperty("respondsTo");
    expect(run.cleanLog).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: "rewrite", reason: "missing_responds_to" })]),
    );
  });

  it("runs a third judge when AB and BA disagree past the instability gap", () => {
    const tape = permitVsFogcastTape();
    const ab = judgmentOf(tape, stepKey.judge(1, "AB"));
    const ba = judgmentOf(tape, stepKey.judge(1, "BA"));
    const fighter1 = randomFighter1("permit-seed-9f3a", stepKey.judge(1, "random"));
    const run = runMatch(
      matchInput({
        fixtures: {
          steps: {
            ...tape.steps,
            [stepKey.judge(1, "AB")]: { attempts: [{ kind: "output", output: retarget(ab, 9, 2) }] },
            [stepKey.judge(1, "BA")]: { attempts: [{ kind: "output", output: retarget(ba, 9, 2) }] },
            [stepKey.judge(1, "random")]: { attempts: [{ kind: "output", output: retarget(ab, 8, 4) }] },
          },
        },
      }),
    );
    expect(run.fixtureReads).toContain(stepKey.judge(1, "random"));
    const round = run.events.find((event) => event.type === "round.resolved" && event.resolution.round === 1);
    expect(round?.type).toBe("round.resolved");
    if (round?.type === "round.resolved") {
      const problem = round.resolution.criteria.find((row) => row.criterion === "problem");
      expect(problem?.unstable).toBe(true);
      expect(problem?.scores.A.extra).toBe(fighter1 === "A" ? 8 : 4);
      expect(problem?.scores.B.extra).toBe(fighter1 === "A" ? 4 : 8);
    }
  });
});

function submitted(run: ReturnType<typeof runMatch>, key: string) {
  const event = run.events.find((item) => item.stepKey === key);
  if (!event || event.type !== "volley.submitted") throw new Error(`missing volley ${key}`);
  return event.volley;
}

function shotsOf(tape: FixtureTape, key: string): ShotModelOutput[] {
  const attempt = tape.steps[key]?.attempts[0];
  if (!attempt || attempt.kind !== "output") throw new Error(`missing ${key}`);
  const output = attempt.output as { shots: ShotModelOutput[] };
  return output.shots;
}

function judgmentOf(tape: FixtureTape, key: string): RoundJudgment {
  const attempt = tape.steps[key]?.attempts[0];
  if (!attempt || attempt.kind !== "output") throw new Error(`missing ${key}`);
  return structuredClone(attempt.output) as RoundJudgment;
}

function retarget(judgment: RoundJudgment, fighter1: number, fighter2: number): RoundJudgment {
  return {
    ...judgment,
    criteria: judgment.criteria.map((row) =>
      row.criterion === "problem"
        ? {
            ...row,
            fighter_1: { ...row.fighter_1, score: fighter1 },
            fighter_2: { ...row.fighter_2, score: fighter2 },
          }
        : {
            ...row,
            fighter_1: { ...row.fighter_1, score: 5 },
            fighter_2: { ...row.fighter_2, score: 5 },
          },
    ),
  };
}

function shot(criterion: ShotModelOutput["criterion"], headline: string, claim: string): ShotModelOutput {
  return { type: "pitch", criterion, headline, claim, evidence: [], estimate: true };
}

function vote(winner: "fighter_1" | "fighter_2") {
  return {
    analysis: "One idea names a buyer who already pays for a workaround.",
    winner,
    confidence: 0.7,
    decidingFactor: "Problem severity is more concrete.",
  };
}

function output(value: unknown): FixtureAttempt {
  return { kind: "output", output: value };
}
