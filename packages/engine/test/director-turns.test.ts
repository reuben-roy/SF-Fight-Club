import {
  type BroadcastScript,
  type CriterionId,
  type Cue,
  type MatchEvent,
  type RoundNumber,
  type RoundResolution,
  type Shot,
  type ShotFactCheck,
  type ShotVerdict,
  type Slot,
  type Volley,
} from "@sf-fight-club/schemas";
import { describe, expect, it } from "vitest";

import {
  DIRECTOR_VERSION,
  assignCorners,
  direct,
  resolveMatch,
  resolveRound,
  type ComputeLog,
  type ResolvedMatch,
} from "../src/index.js";
import { fabrication, judgeCall, makeShot, rubric, scorecard, withScore } from "./helpers.js";

const at = "2026-11-05T20:00:00.000Z";

interface RoundSpec {
  a1: Shot[];
  b1: Shot[];
  a2: Shot[];
  b2: Shot[];
  scores: Record<CriterionId, { A: number; B: number }>;
  verdicts: ShotVerdict[];
  checksA?: ShotFactCheck[];
  checksB?: ShotFactCheck[];
  /** Shot ids kept in scoring but left out of the volley events. */
  hidden?: string[];
}

function tied(): Record<CriterionId, { A: number; B: number }> {
  return scorecard(5);
}

function directed(specs: readonly RoundSpec[]): BroadcastScript {
  const preset = rubric();
  const rounds = specs.map((spec, index) => {
    const round = (index + 1) as RoundNumber;
    return resolveRound({
      round,
      rubric: preset,
      ab: judgeCall("AB", round, spec.scores, { shots: spec.verdicts, callId: `t${round}-AB` }),
      ba: judgeCall("BA", round, spec.scores, { shots: spec.verdicts, callId: `t${round}-BA` }),
      shots: { A: [...spec.a1, ...spec.a2], B: [...spec.b1, ...spec.b2] },
      factChecks: [...(spec.checksA ?? []), ...(spec.checksB ?? [])],
    });
  });
  const result = resolveMatch({ rubric: preset, rounds });
  return direct(logFrom(rounds, result, eventsFor(specs)), DIRECTOR_VERSION, "presentation");
}

function logFrom(rounds: readonly RoundResolution[], result: ResolvedMatch, extra: ComputeLog["events"]): ComputeLog {
  const corners = assignCorners("turns-seed");
  let seq = 1;
  const events: MatchEvent[] = [
    { type: "match.locked", matchId: "m1", seq: seq++, stepKey: "lock", at, matchSeed: "turns-seed", buildHash: "abc123", corners },
  ];
  for (const resolution of rounds) {
    events.push({ type: "round.resolved", matchId: "m1", seq: seq++, stepKey: `r${resolution.round}/resolved`, at, resolution });
  }
  events.push({ type: "match.resolved", matchId: "m1", seq: seq++, stepKey: "resolve", at, resolution: result.resolution });
  for (const event of extra) events.push({ ...event, seq: seq++ });
  return {
    matchId: "m1",
    events,
    rubric: rubric(),
    fighters: {
      A: { name: "PermitPilot", seed: 8, tier: "B", spriteSeed: "pp", category: "proptech" },
      B: { name: "Fogcast", seed: 1, tier: "A", spriteSeed: "fg", category: "climate" },
    },
  };
}

function eventsFor(specs: readonly RoundSpec[]): MatchEvent[] {
  const events: MatchEvent[] = [];
  const visible = (shots: Shot[], hidden: readonly string[] | undefined): Shot[] =>
    hidden ? shots.filter((shot) => !hidden.includes(shot.id)) : shots;
  specs.forEach((spec, index) => {
    const round = (index + 1) as RoundNumber;
    events.push(volleyEvent(round, "pitch_strike", "A", visible(spec.a1, spec.hidden)));
    events.push(volleyEvent(round, "pitch_strike", "B", visible(spec.b1, spec.hidden)));
    events.push(volleyEvent(round, "counter", "A", visible(spec.a2, spec.hidden)));
    events.push(volleyEvent(round, "counter", "B", visible(spec.b2, spec.hidden)));
    if (spec.checksA && spec.checksA.length > 0) {
      events.push({ type: "factcheck.completed", matchId: "m1", seq: 1, stepKey: `r${round}/fc/A`, at, fighter: "A", round, checks: spec.checksA, callIds: [] });
    }
    if (spec.checksB && spec.checksB.length > 0) {
      events.push({ type: "factcheck.completed", matchId: "m1", seq: 1, stepKey: `r${round}/fc/B`, at, fighter: "B", round, checks: spec.checksB, callIds: [] });
    }
  });
  return events;
}

function volleyEvent(round: RoundNumber, kind: Volley["kind"], fighter: Slot, shots: Shot[]): MatchEvent {
  return {
    type: "volley.submitted",
    matchId: "m1",
    seq: 1,
    stepKey: `r${round}/${kind}/${fighter}`,
    at,
    callId: "call",
    volley: { matchId: "m1", round, kind, fighter, shots, wordCount: 20, truncated: false, refused: false },
  };
}

function shotCues(script: BroadcastScript): Extract<Cue, { kind: "shot" }>[] {
  return script.cues.filter((cue): cue is Extract<Cue, { kind: "shot" }> => cue.kind === "shot");
}

function statusCues(script: BroadcastScript): Extract<Cue, { kind: "status" }>[] {
  return script.cues.filter((cue): cue is Extract<Cue, { kind: "status" }> => cue.kind === "status");
}

describe("director turns, moves and verdicts", () => {
  it("numbers turns 1..N across the whole match and spaces shots one turn apart", () => {
    const script = directed([
      {
        a1: [makeShot({ id: "r1.v1.A.s1", type: "pitch", criterion: "problem" })],
        b1: [makeShot({ id: "r1.v1.B.s1", type: "pitch", criterion: "problem" })],
        a2: [],
        b2: [],
        scores: withScore(tied(), "problem", { A: 8, B: 4 }),
        verdicts: [
          { shotId: "r1.v1.A.s1", verdict: "landed", impact: 2, note: "Supported." },
          { shotId: "r1.v1.B.s1", verdict: "whiff", impact: 0, note: "Missed." },
        ],
      },
      { a1: [], b1: [], a2: [], b2: [], scores: tied(), verdicts: [] },
      { a1: [], b1: [], a2: [], b2: [], scores: tied(), verdicts: [] },
    ]);
    const shots = shotCues(script);
    expect(shots.map((cue) => cue.turn)).toEqual([1, 2]);
    for (let index = 1; index < shots.length; index += 1) {
      expect(shots[index]!.t - shots[index - 1]!.t).toBe(3600);
    }
    expect(script.directorVersion).toBe("2");
  });

  it("fills the menu from the shooter's volley and the verdict line from the outcome table", () => {
    const script = directed([
      {
        a1: [
          makeShot({ id: "r1.v1.A.s1", type: "pitch", criterion: "problem", evidence: ["E1"], estimate: false }),
          makeShot({ id: "r1.v1.A.s2", type: "pitch", criterion: "problem" }),
        ],
        b1: [
          makeShot({ id: "r1.v1.B.s1", type: "pitch", criterion: "problem" }),
          makeShot({ id: "r1.v1.B.s2", type: "attack", criterion: "market" }),
        ],
        a2: [],
        b2: [],
        scores: withScore(tied(), "problem", { A: 8, B: 4 }),
        verdicts: [
          { shotId: "r1.v1.A.s1", verdict: "landed", impact: 2, note: "Supported by E1." },
          { shotId: "r1.v1.A.s2", verdict: "landed", impact: 1, note: "Landed." },
          { shotId: "r1.v1.B.s1", verdict: "whiff", impact: 0, note: "Missed." },
          { shotId: "r1.v1.B.s2", verdict: "whiff", impact: 0, note: "Missed." },
        ],
      },
      { a1: [], b1: [], a2: [], b2: [], scores: tied(), verdicts: [] },
      { a1: [], b1: [], a2: [], b2: [], scores: tied(), verdicts: [] },
    ]);
    const shots = shotCues(script);
    const first = shots.find((cue) => cue.shotId === "r1.v1.A.s1")!;
    expect(first.move).toEqual({ name: "Hair on Fire", element: "market", criterion: "problem", type: "pitch" });
    expect(first.menu.map((move) => move.name)).toEqual(["Hair on Fire", "Hair on Fire"]);
    expect(first.menu).toContainEqual(first.move);
    expect(first.volley).toBe(1);
    expect(first.verdictLine).toBe("It landed.");
    const miss = shots.find((cue) => cue.shotId === "r1.v1.B.s1")!;
    expect(miss.menu.map((move) => move.name)).toEqual(["Hair on Fire", "Niche Trap"]);
    expect(miss.verdictLine).toBe("The judges did not move.");
  });

  it("plays a defense as a parry and keeps it on the volley 2 menu", () => {
    const attack = makeShot({ id: "r2.v1.A.s1", type: "attack", criterion: "moat" });
    const defense = makeShot({ id: "r2.v2.B.s1", type: "defense", criterion: "moat", respondsTo: attack.id, headline: "The moat is the workflow" });
    const followUp = makeShot({ id: "r2.v2.B.s2", type: "pitch", criterion: "moat" });
    const script = directed([
      { a1: [], b1: [], a2: [], b2: [], scores: tied(), verdicts: [] },
      {
        a1: [attack],
        b1: [],
        a2: [],
        b2: [defense, followUp],
        scores: withScore(tied(), "moat", { A: 8, B: 4 }),
        verdicts: [
          { shotId: attack.id, verdict: "parried", impact: 2, note: "Blocked." },
          { shotId: defense.id, verdict: "landed", impact: 2, note: "The defense worked." },
          { shotId: followUp.id, verdict: "landed", impact: 2, note: "Supported." },
        ],
      },
      { a1: [], b1: [], a2: [], b2: [], scores: tied(), verdicts: [] },
    ]);
    const shots = shotCues(script);
    const answered = shots.find((cue) => cue.shotId === attack.id)!;
    expect(answered.outcome).toBe("parried");
    expect(answered.parry?.move).toEqual({ name: "Switching Cost", element: "moat", criterion: "moat", type: "defense" });
    expect(answered.volley).toBe(1);
    expect(answered.verdictLine).toBe("Fogcast answered with SWITCHING COST.");
    const pressed = shots.find((cue) => cue.shotId === followUp.id)!;
    expect(pressed.volley).toBe(2);
    expect(pressed.menu.map((move) => move.name)).toEqual(["Switching Cost", "Compounding Data"]);
    expect(pressed.menu).toContainEqual(pressed.move);
  });

describe("director statuses", () => {
  it("gives momentum on a second dealing turn and takes it at the round end", () => {
    const script = directed([
      {
        a1: [
          makeShot({ id: "r1.v1.A.s1", type: "pitch", criterion: "problem" }),
          makeShot({ id: "r1.v1.A.s2", type: "pitch", criterion: "problem" }),
        ],
        b1: [
          makeShot({ id: "r1.v1.B.s1", type: "pitch", criterion: "problem" }),
          makeShot({ id: "r1.v1.B.s2", type: "attack", criterion: "market" }),
        ],
        a2: [],
        b2: [],
        scores: withScore(tied(), "problem", { A: 8, B: 4 }),
        verdicts: [
          { shotId: "r1.v1.A.s1", verdict: "landed", impact: 2, note: "Landed." },
          { shotId: "r1.v1.A.s2", verdict: "landed", impact: 1, note: "Landed." },
          { shotId: "r1.v1.B.s1", verdict: "whiff", impact: 0, note: "Missed." },
          { shotId: "r1.v1.B.s2", verdict: "whiff", impact: 0, note: "Missed." },
        ],
      },
      { a1: [], b1: [], a2: [], b2: [], scores: tied(), verdicts: [] },
      { a1: [], b1: [], a2: [], b2: [], scores: tied(), verdicts: [] },
    ]);
    const shots = shotCues(script);
    expect(shots.map((cue) => cue.turn)).toEqual([1, 2, 3, 4]);
    const statuses = statusCues(script);
    expect(statuses.map((cue) => ({ target: cue.target, status: cue.status, on: cue.on }))).toEqual([
      { target: "A", status: "momentum", on: true },
      { target: "B", status: "last_stand", on: true },
      { target: "A", status: "momentum", on: false },
    ]);
    const third = shots[2]!;
    expect(third.shotId).toBe("r1.v1.A.s2");
    const on = statuses[0]!;
    expect(script.cues.indexOf(on)).toBeGreaterThan(script.cues.indexOf(third));
    const off = statuses[2]!;
    const fourth = shots[3]!;
    expect(script.cues.indexOf(off)).toBeGreaterThan(script.cues.indexOf(fourth));
    const scorecard = script.cues.find((cue) => cue.kind === "scorecard" && cue.round === 1);
    expect(scorecard).toBeDefined();
    expect(script.cues.indexOf(off)).toBeLessThan(script.cues.indexOf(scorecard!));
  });

  it("ends momentum when the fighter takes damage", () => {
    const script = directed([
      {
        a1: [makeShot({ id: "r1.v1.A.s1", type: "pitch", criterion: "problem" })],
        b1: [makeShot({ id: "r1.v1.B.s1", type: "pitch", criterion: "problem" })],
        a2: [makeShot({ id: "r1.v2.A.s1", type: "attack", criterion: "problem" })],
        b2: [makeShot({ id: "r1.v2.B.s1", type: "attack", criterion: "market" })],
        scores: withScore(withScore(tied(), "problem", { A: 9, B: 3 }), "market", { A: 4, B: 8 }),
        verdicts: [
          { shotId: "r1.v1.A.s1", verdict: "landed", impact: 2, note: "Landed." },
          { shotId: "r1.v1.B.s1", verdict: "whiff", impact: 0, note: "Missed." },
          { shotId: "r1.v2.A.s1", verdict: "landed", impact: 1, note: "Landed." },
          { shotId: "r1.v2.B.s1", verdict: "landed", impact: 2, note: "Landed." },
        ],
      },
      { a1: [], b1: [], a2: [], b2: [], scores: tied(), verdicts: [] },
      { a1: [], b1: [], a2: [], b2: [], scores: tied(), verdicts: [] },
    ]);
    const shots = shotCues(script);
    expect(shots.map((cue) => cue.turn)).toEqual([1, 2, 3, 4]);
    const answer = shots.find((cue) => cue.shotId === "r1.v2.B.s1")!;
    expect(answer.damage).toBeGreaterThan(0);
    const statuses = statusCues(script);
    const momentum = statuses.filter((cue) => cue.status === "momentum");
    expect(momentum.map((cue) => ({ target: cue.target, on: cue.on }))).toEqual([
      { target: "A", on: true },
      { target: "A", on: false },
    ]);
    expect(script.cues.indexOf(momentum[0]!)).toBeGreaterThan(script.cues.indexOf(shots[2]!));
    expect(script.cues.indexOf(momentum[1]!)).toBeGreaterThan(script.cues.indexOf(answer));
  });

  it("marks exposed on a fact-check and keeps it on", () => {
    const attack = makeShot({ id: "r1.v1.B.s1", type: "attack", criterion: "problem", evidence: ["E404"], estimate: false });
    const defense = makeShot({ id: "r1.v2.B.s1", type: "defense", criterion: "problem", respondsTo: "r1.v1.A.s9", headline: "We have receipts" });
    const script = directed([
      {
        a1: [],
        b1: [attack],
        a2: [],
        b2: [defense],
        scores: tied(),
        verdicts: [],
        checksB: [fabrication(attack.id), fabrication(defense.id)],
      },
      { a1: [], b1: [], a2: [], b2: [], scores: tied(), verdicts: [] },
      { a1: [], b1: [], a2: [], b2: [], scores: tied(), verdicts: [] },
    ]);
    const shots = shotCues(script);
    const statuses = statusCues(script);
    expect(statuses.map((cue) => ({ target: cue.target, status: cue.status, on: cue.on }))).toEqual([
      { target: "B", status: "exposed", on: true },
      { target: "B", status: "last_stand", on: true },
    ]);
    expect(script.cues.indexOf(statuses[0]!)).toBeGreaterThan(script.cues.indexOf(shots[0]!));
    expect(script.cues.indexOf(statuses[1]!)).toBeGreaterThan(script.cues.indexOf(shots[1]!));
  });

  it("leaves every hpAfter value untouched when status cues are removed", () => {
    const script = directed([
      {
        a1: [
          makeShot({ id: "r1.v1.A.s1", type: "pitch", criterion: "problem" }),
          makeShot({ id: "r1.v1.A.s2", type: "pitch", criterion: "problem" }),
        ],
        b1: [makeShot({ id: "r1.v1.B.s1", type: "pitch", criterion: "problem" })],
        a2: [],
        b2: [],
        scores: withScore(tied(), "problem", { A: 8, B: 4 }),
        verdicts: [
          { shotId: "r1.v1.A.s1", verdict: "landed", impact: 2, note: "Landed." },
          { shotId: "r1.v1.A.s2", verdict: "landed", impact: 1, note: "Landed." },
          { shotId: "r1.v1.B.s1", verdict: "whiff", impact: 0, note: "Missed." },
        ],
      },
      { a1: [], b1: [], a2: [], b2: [], scores: tied(), verdicts: [] },
      { a1: [], b1: [], a2: [], b2: [], scores: tied(), verdicts: [] },
    ]);
    expect(statusCues(script).length).toBeGreaterThan(0);
    const hp = { A: 100, B: 100 };
    for (const cue of script.cues) {
      if (cue.kind === "shot") {
        if (cue.outcome === "backfire") hp[cue.shooter] -= cue.damage;
        else if (cue.damage > 0) hp[cue.shooter === "A" ? "B" : "A"] -= cue.damage;
      } else if (cue.kind === "hammer") {
        hp[cue.target] -= cue.damage;
      } else continue;
      expect(cue.hpAfter).toEqual({ ...hp });
    }
  });
});
  it("names the real move on a backfire for a fabricated defense", () => {
    const attack = makeShot({ id: "r1.v1.B.s1", type: "attack", criterion: "problem", evidence: ["E404"], estimate: false });
    const defense = makeShot({ id: "r1.v2.B.s1", type: "defense", criterion: "problem", respondsTo: "r1.v1.A.s9", headline: "We have receipts" });
    const script = directed([
      {
        a1: [],
        b1: [attack],
        a2: [],
        b2: [defense],
        scores: tied(),
        verdicts: [],
        checksB: [fabrication(attack.id), fabrication(defense.id)],
      },
      { a1: [], b1: [], a2: [], b2: [], scores: tied(), verdicts: [] },
      { a1: [], b1: [], a2: [], b2: [], scores: tied(), verdicts: [] },
    ]);
    const shots = shotCues(script);
    expect(shots.map((cue) => cue.turn)).toEqual([1, 2]);
    const first = shots[0]!;
    expect(first.outcome).toBe("backfire");
    expect(first.verdictLine).toBe("FACT-CHECKED. It blew up in Fogcast's hands.");
    const second = shots.find((cue) => cue.shotId === defense.id)!;
    expect(second.move).toEqual({ name: "Pain Receipt", element: "market", criterion: "problem", type: "defense" });
    expect(second.menu).toEqual([second.move]);
    expect(second.volley).toBe(2);
  });

  it("falls back to a plain backfire when the shot is in no volley", () => {
    const hidden = makeShot({ id: "r1.v2.B.s1", type: "attack", criterion: "market" });
    const script = directed([
      {
        a1: [],
        b1: [],
        a2: [],
        b2: [hidden],
        scores: tied(),
        verdicts: [],
        checksB: [fabrication(hidden.id)],
        hidden: [hidden.id],
      },
      { a1: [], b1: [], a2: [], b2: [], scores: tied(), verdicts: [] },
      { a1: [], b1: [], a2: [], b2: [], scores: tied(), verdicts: [] },
    ]);
    const shots = shotCues(script);
    expect(shots.map((cue) => cue.turn)).toEqual([1]);
    expect(shots[0]).toMatchObject({
      shotId: hidden.id,
      outcome: "backfire",
      volley: 1,
      move: { name: "Nice to Have", element: "market", criterion: "problem", type: "attack" },
    });
    expect(shots[0]!.menu).toEqual([shots[0]!.move]);
  });
});
