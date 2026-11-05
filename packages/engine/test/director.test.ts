import type { MatchEvent, RoundNumber, RoundResolution, ShotVerdict, Slot, Volley } from "@sf-fight-club/schemas";
import { describe, expect, it } from "vitest";

import {
  DIRECTOR_VERSION,
  EngineError,
  assignCorners,
  direct,
  resolveMatch,
  resolveRound,
  type ComputeLog,
  type ResolvedMatch,
} from "../src/index.js";
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
const at = "2026-11-05T20:00:00.000Z";

function fight(scores: Parameters<typeof judgeCall>[2], options?: { tiebreak?: ReturnType<typeof tiebreak> }) {
  const rounds = ([1, 2, 3] as const).map((round) =>
    resolveRound({
      round,
      rubric: preset,
      ab: judgeCall("AB", round, scores, { callId: `r${round}-AB` }),
      ba: judgeCall("BA", round, scores, { callId: `r${round}-BA` }),
      shots: { A: [], B: [] },
      factChecks: [],
    }),
  );
  return { rounds, result: resolveMatch({ rubric: preset, rounds, ...(options?.tiebreak ? { tiebreak: options.tiebreak } : {}) }) };
}

function logFrom(rounds: readonly RoundResolution[], result: ResolvedMatch, extra: MatchEvent[] = [], matchSeed = "permit-vs-fog"): ComputeLog {
  const corners = assignCorners(matchSeed);
  let seq = 1;
  const events: MatchEvent[] = [
    {
      type: "match.locked",
      matchId: "m1",
      seq: seq++,
      stepKey: "lock",
      at,
      matchSeed,
      buildHash: "abc123",
      corners,
    },
  ];
  for (const resolution of rounds) {
    events.push({
      type: "round.resolved",
      matchId: "m1",
      seq: seq++,
      stepKey: `r${resolution.round}/resolved`,
      at,
      resolution,
    });
  }
  events.push({
    type: "match.resolved",
    matchId: "m1",
    seq: seq++,
    stepKey: "resolve",
    at,
    resolution: result.resolution,
  });
  for (const event of extra) events.push({ ...event, seq: seq++ });
  return {
    matchId: "m1",
    events,
    rubric: preset,
    fighters: {
      A: { name: "PermitPilot", seed: 8, tier: "B", spriteSeed: "pp" },
      B: { name: "Fogcast", seed: 1, tier: "A", spriteSeed: "fg" },
    },
  };
}

describe("direct", () => {
  it("turns the worked example into a script whose HP and winner come from the log", () => {
    const fake = makeShot({ id: "r3.v1.B.s1", type: "attack", criterion: "gtm", evidence: ["E404"], estimate: false });
    const rounds = ([1, 2, 3] as const).map((round) =>
      resolveRound({
        round,
        rubric: preset,
        ab: judgeCall("AB", round, ordersFromFinals(PERMIT_FINALS, "AB"), { callId: `p${round}-AB` }),
        ba: judgeCall("BA", round, ordersFromFinals(PERMIT_FINALS, "BA"), { callId: `p${round}-BA` }),
        shots: round === 3 ? { A: [], B: [fake] } : { A: [], B: [] },
        factChecks: round === 3 ? [fabrication(fake.id)] : [],
      }),
    );
    const result = resolveMatch({ rubric: preset, rounds });
    const volley: Volley = {
      matchId: "m1",
      round: 3,
      kind: "pitch_strike",
      fighter: "B",
      shots: [fake],
      wordCount: 12,
      truncated: false,
      refused: false,
    };
    const script = direct(
      logFrom(rounds, result, [
        {
          type: "volley.submitted",
          matchId: "m1",
          seq: 1,
          stepKey: "r3/v1/B",
          at,
          volley,
          callId: "v",
        },
        {
          type: "factcheck.completed",
          matchId: "m1",
          seq: 2,
          stepKey: "r3/fc/B",
          at,
          fighter: "B",
          round: 3,
          checks: [fabrication(fake.id)],
          callIds: ["fc"],
        },
      ]),
      DIRECTOR_VERSION,
      "presentation-1",
    );

    expect(script.directorVersion).toBe(DIRECTOR_VERSION);
    expect(script.cues.map((cue) => cue.kind)[0]).toBe("intro");
    expect(script.cues.at(-1)).toMatchObject({ kind: "winner", winner: "A", decidedBy: "scores" });
    expect(script.cues.find((cue) => cue.kind === "outcome")).toMatchObject({
      outcome: "KO",
      perfect: false,
      pyrrhic: false,
    });
    const backfire = script.cues.find((cue) => cue.kind === "shot" && cue.outcome === "backfire");
    expect(backfire?.kind).toBe("shot");
    if (backfire?.kind === "shot") expect(backfire.damage).toBeGreaterThan(0);
    expect(damageTaken(script, "B")).toBe(100);
    expect(damageTaken(script, "A")).toBe(23);
    expect(script.cues.some((cue) => cue.kind === "hammer")).toBe(true);
    expect(direct(logFrom(rounds, result), DIRECTOR_VERSION, "presentation-2")).toEqual(
      direct(logFrom(rounds, result), DIRECTOR_VERSION, "presentation-1"),
    );
  });

  it("renders a landed shot for the losing side as glancing (FE-16) and a missing carrier as a hammer (FE-17)", () => {
    const attack = makeShot({ id: "r1.v1.B.s1", type: "attack", criterion: "problem" });
    const pitch = makeShot({ id: "r1.v1.A.s1", type: "pitch", criterion: "problem", evidence: ["E1"], estimate: false });
    const scores = withScore(withScore(scorecard(5), "problem", { A: 8, B: 4 }), "market", { A: 8, B: 4 });
    const verdicts: ShotVerdict[] = [
      { shotId: attack.id, verdict: "landed", impact: 3, note: "Sharp, but the criterion still went the other way." },
      { shotId: pitch.id, verdict: "landed", impact: 2, note: "Supported." },
    ];
    const rounds = ([1, 2, 3] as const).map((round) =>
      resolveRound({
        round,
        rubric: preset,
        ab: judgeCall("AB", round, scores, { shots: round === 1 ? verdicts : [], callId: `g${round}-AB` }),
        ba: judgeCall("BA", round, scores, { shots: round === 1 ? verdicts : [], callId: `g${round}-BA` }),
        shots: round === 1 ? { A: [pitch], B: [attack] } : { A: [], B: [] },
        factChecks: [],
      }),
    );
    const result = resolveMatch({ rubric: preset, rounds });
    const script = direct(
      logFrom(rounds, result, [
        volleyEvent(1, "pitch_strike", "A", [pitch]),
        volleyEvent(1, "pitch_strike", "B", [attack]),
        {
          type: "factcheck.completed",
          matchId: "m1",
          seq: 1,
          stepKey: "r1/fc/A",
          at,
          fighter: "A",
          round: 1,
          checks: [
            {
              shotId: pitch.id,
              missingIds: [],
              perEvidence: [{ evidenceId: "E1", verdict: "supported", note: "Matches." }],
              numberContradicted: false,
              fabricated: false,
            },
          ],
          callIds: [],
        },
      ]),
      DIRECTOR_VERSION,
      "presentation",
    );
    const glancing = script.cues.find((cue) => cue.kind === "shot" && cue.shotId === attack.id);
    expect(glancing).toMatchObject({ kind: "shot", outcome: "glancing", damage: 0 });
    const hit = script.cues.find((cue) => cue.kind === "shot" && cue.shotId === pitch.id);
    expect(hit?.kind).toBe("shot");
    if (hit?.kind === "shot") expect(hit.damage).toBeGreaterThan(0);
    expect(script.cues.filter((cue) => cue.kind === "hammer").length).toBeGreaterThan(0);
    expect(script.cues.find((cue) => cue.kind === "winner")).toMatchObject({ winner: "A", decidedBy: "scores" });
  });

  it("shows later backfires at zero damage (FE-9)", () => {
    const shots = [1, 2, 3, 4].map((index) =>
      makeShot({ id: `r1.v1.B.s${index}`, type: "attack", criterion: "problem", evidence: ["E404"], estimate: false }),
    );
    const rounds = ([1, 2, 3] as const).map((round) =>
      resolveRound({
        round,
        rubric: preset,
        ab: judgeCall("AB", round, scorecard(5), { callId: `b${round}-AB` }),
        ba: judgeCall("BA", round, scorecard(5), { callId: `b${round}-BA` }),
        shots: round === 1 ? { A: [], B: shots } : { A: [], B: [] },
        factChecks: round === 1 ? shots.map((shot) => fabrication(shot.id)) : [],
      }),
    );
    const result = resolveMatch({ rubric: preset, rounds });
    const script = direct(
      logFrom(rounds, result, [volleyEvent(1, "pitch_strike", "B", shots)]),
      DIRECTOR_VERSION,
      "presentation",
    );
    const backfires = script.cues.filter((cue) => cue.kind === "shot" && cue.outcome === "backfire");
    expect(backfires).toHaveLength(4);
    const damages = backfires.map((cue) => (cue.kind === "shot" ? cue.damage : 0));
    expect(damages.filter((damage) => damage > 0)).toHaveLength(3);
    expect(damages.filter((damage) => damage === 0)).toHaveLength(1);
    expect(damages.reduce((sum, damage) => sum + damage, 0)).toBe(88);
  });

  it("lets the tiebreak name the winner when both fighters are still at 100 (FE-13)", () => {
    const { rounds, result } = fight(scorecard(5), {
      tiebreak: tiebreak({ suddenDeathVotes: [], seeds: { A: 4, B: 1 }, weighinTotals: { A: 50, B: 50 } }),
    });
    const script = direct(logFrom(rounds, result), DIRECTOR_VERSION, "presentation");
    expect(result.resolution.lambda).toBe(0);
    expect(script.cues.find((cue) => cue.kind === "winner")).toMatchObject({ winner: "B", decidedBy: "seed" });
    expect(script.cues.find((cue) => cue.kind === "finisher")).toMatchObject({ winner: "B", style: "ko" });
    expect(script.cues.find((cue) => cue.kind === "sudden_death")).toBeDefined();
    const intro = script.cues.find((cue) => cue.kind === "intro");
    expect(intro?.kind).toBe("intro");
    if (intro?.kind === "intro") {
      expect(intro.fighters.A.seed).toBe(8);
      expect(intro.fighters.B.seed).toBe(1);
      const corners = assignCorners("permit-vs-fog");
      expect(intro.fighters.A.corner).toBe(corners.left === "A" ? "left" : "right");
      expect(intro.fighters.B.corner).toBe(corners.left === "B" ? "left" : "right");
    }
  });

  it("picks the tiebreak winner even when that fighter has less HP", () => {
    const scores = withScore(scorecard(5), "moat", { A: 6, B: 5 });
    const { rounds, result } = fight(scores, {
      tiebreak: tiebreak({ suddenDeathVotes: [], seeds: { A: 4, B: 1 }, weighinTotals: { A: 50, B: 50 } }),
    });
    expect(result.resolution.outcome).toBe("SUDDEN_DEATH");
    expect(result.hpExact.B[2]).toBeLessThan(result.hpExact.A[2]);
    const script = direct(logFrom(rounds, result), DIRECTOR_VERSION, "presentation");
    expect(script.cues.find((cue) => cue.kind === "winner")).toMatchObject({ winner: "B", decidedBy: "seed" });
    expect(script.cues.find((cue) => cue.kind === "outcome")).toMatchObject({ outcome: "SUDDEN_DEATH" });
  });

  it("plays a defense as a parry on the shot it answers", () => {
    const attack = makeShot({ id: "r2.v1.A.s1", type: "attack", criterion: "moat" });
    const defense = makeShot({
      id: "r2.v2.B.s1",
      type: "defense",
      criterion: "moat",
      respondsTo: attack.id,
      headline: "The moat is the workflow",
    });
    const scores = withScore(scorecard(5), "moat", { A: 8, B: 4 });
    const verdicts: ShotVerdict[] = [
      { shotId: attack.id, verdict: "parried", impact: 2, note: "Blocked." },
      { shotId: defense.id, verdict: "landed", impact: 2, note: "The defense worked." },
    ];
    const rounds = ([1, 2, 3] as const).map((round) =>
      resolveRound({
        round,
        rubric: preset,
        ab: judgeCall("AB", round, round === 2 ? scores : scorecard(5), { shots: round === 2 ? verdicts : [], callId: `d${round}a` }),
        ba: judgeCall("BA", round, round === 2 ? scores : scorecard(5), { shots: round === 2 ? verdicts : [], callId: `d${round}b` }),
        shots: round === 2 ? { A: [attack], B: [defense] } : { A: [], B: [] },
        factChecks: [],
      }),
    );
    const result = resolveMatch({ rubric: preset, rounds });
    const script = direct(
      logFrom(rounds, result, [volleyEvent(2, "pitch_strike", "A", [attack]), volleyEvent(2, "counter", "B", [defense])]),
      DIRECTOR_VERSION,
      "presentation",
    );
    const cue = script.cues.find((item) => item.kind === "shot" && item.shotId === attack.id);
    expect(cue).toMatchObject({
      kind: "shot",
      outcome: "parried",
      damage: 0,
      parry: { defenseShotId: defense.id, headline: "The moat is the workflow" },
    });
    expect(script.cues.some((item) => item.kind === "shot" && item.shotId === defense.id)).toBe(false);
  });

  it("rejects an unknown director version", () => {
    const { rounds, result } = fight(withScore(scorecard(5), "moat", { A: 10, B: 0 }));
    expect(() => direct(logFrom(rounds, result), "9", "presentation")).toThrow(EngineError);
    expect(() => direct(logFrom(rounds, result), DIRECTOR_VERSION, "")).toThrow(EngineError);
  });
});

function volleyEvent(round: RoundNumber, kind: Volley["kind"], fighter: Slot, shots: Volley["shots"]): MatchEvent {
  return {
    type: "volley.submitted",
    matchId: "m1",
    seq: 1,
    stepKey: `r${round}/${kind}/${fighter}`,
    at,
    callId: "call",
    volley: {
      matchId: "m1",
      round,
      kind,
      fighter,
      shots,
      wordCount: 20,
      truncated: false,
      refused: false,
    },
  };
}

function damageTaken(script: { cues: { kind: string; damage?: number; outcome?: string; shooter?: Slot; target?: Slot }[] }, slot: Slot): number {
  return script.cues.reduce((sum, cue) => {
    if (cue.kind === "hammer" && cue.target === slot) return sum + (cue.damage ?? 0);
    if (cue.kind === "shot" && cue.outcome === "backfire" && cue.shooter === slot) return sum + (cue.damage ?? 0);
    if (cue.kind === "shot" && cue.outcome !== "backfire" && cue.shooter && cue.shooter !== slot) return sum + (cue.damage ?? 0);
    return sum;
  }, 0);
}

