import { describe, expect, it } from "vitest";

import {
  DEMO_AT_DEFAULT,
  DEMO_ENTRANTS,
  dermaVsCurbTape,
  dermaVsLoopTape,
  finalTape,
  flakeVsCurbTape,
  markComplete,
  permitVsTabTape,
  runDemoTournament,
  tabVsPaperTape,
  toPublicMatch,
  type DemoTournament,
} from "../src/index.js";
import { build, loadFixture, rubric } from "./helpers.js";

const EXPECTED = [
  { matchId: "demo-r0s0", winner: "permitpilot", outcome: "KO", decisionType: undefined, perfect: false, decidedBy: "scores" },
  { matchId: "demo-r0s1", winner: "tabclear", outcome: "DECISION", decisionType: "unanimous", perfect: false, decidedBy: "scores" },
  { matchId: "demo-r0s2", winner: "dermalens", outcome: "KO", decisionType: undefined, perfect: true, decidedBy: "scores" },
  { matchId: "demo-r0s3", winner: "curbbot", outcome: "DECISION", decisionType: "majority", perfect: false, decidedBy: "scores" },
  { matchId: "demo-r1s0", winner: "permitpilot", outcome: "KO", decisionType: undefined, perfect: false, decidedBy: "scores" },
  { matchId: "demo-r1s1", winner: "curbbot", outcome: "DECISION", decisionType: "unanimous", perfect: false, decidedBy: "scores" },
  { matchId: "demo-r2s0", winner: "permitpilot", outcome: "SUDDEN_DEATH", decisionType: undefined, perfect: false, decidedBy: "sudden_death_judge" },
] as const;

const KNOWN_EVIDENCE = [
  "E1", "E2", "E3", "E4", "E5", "E6", "E7", "E8",
  "E11", "E12", "E13", "E14", "E15", "E16", "E17", "E18",
  "E19", "E20", "E21", "E22", "E23", "E24", "E25", "E26",
];

function tournament(): DemoTournament {
  return runDemoTournament({ at: DEMO_AT_DEFAULT, build: build(), rubric: rubric() });
}

function entrantById(id: string): (typeof DEMO_ENTRANTS)[number] {
  const found = DEMO_ENTRANTS.find((entrant) => entrant.id === id);
  if (!found) throw new Error(`unknown demo entrant ${id}`);
  return found;
}

describe("demo tournament", () => {
  it("lands every match on the spec table", () => {
    const bracket = tournament();
    expect(bracket.matches.map((match) => match.matchId)).toEqual(EXPECTED.map((row) => row.matchId));
    for (const row of EXPECTED) {
      const match = bracket.matches.find((item) => item.matchId === row.matchId);
      expect(match, row.matchId).toBeDefined();
      if (!match) continue;
      const winner = match.run.resolution?.winner === "A" ? match.entrantA : match.entrantB;
      expect(winner, row.matchId).toBe(row.winner);
      expect(match.run.resolution?.outcome, row.matchId).toBe(row.outcome);
      expect(match.run.resolution?.perfect, row.matchId).toBe(row.perfect);
      expect(match.run.resolution?.decidedBy, row.matchId).toBe(row.decidedBy);
      const resolution = match.run.resolution as unknown as { decisionType?: string };
      expect(resolution.decisionType, row.matchId).toBe(row.decisionType);
      expect(match.run.status, row.matchId).toBe("complete");
    }
  });

  it("keeps the opener consistent with the worked example", () => {
    const opener = tournament().matches.find((match) => match.matchId === "demo-r0s0");
    expect(opener?.entrantA).toBe("permitpilot");
    expect(opener?.entrantB).toBe("fogcast");
    expect(opener?.run.resolution?.delta).toBeCloseTo(13.3, 5);
  });

  it("seeds 1 to 8 in table order from strictly decreasing weigh-in totals", () => {
    const bracket = tournament();
    const totals = DEMO_ENTRANTS.map((entrant) => entrant.weighinTotal);
    for (let index = 1; index < totals.length; index += 1) {
      expect(totals[index]).toBeLessThan(totals[index - 1] ?? Number.POSITIVE_INFINITY);
    }
    expect(bracket.bracket.seedingMode).toBe("weighin");
    expect(bracket.bracket.seedingFallback).toBeNull();
    expect(bracket.bracket.entrants.map((entrant) => entrant.seed)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(bracket.bracket.entrants.map((entrant) => entrant.id)).toEqual([
      "permitpilot",
      "dermalens",
      "flakehunter",
      "tabclear",
      "paperroute",
      "curbbot",
      "looproom",
      "fogcast",
    ]);
    for (const entrant of DEMO_ENTRANTS) {
      expect(entrant.category.length, entrant.id).toBeGreaterThan(0);
      for (const item of entrant.dossierEvidence) {
        expect(KNOWN_EVIDENCE, item.id).toContain(item.id);
        expect(item.foundBy).toEqual({ kind: "dossier", ideaId: entrant.id });
      }
    }
  });

  it("holds the delta identity on every match", () => {
    for (const match of tournament().matches) {
      const run = match.run;
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
      expect(resolution, match.matchId).not.toBeNull();
      if (!resolution) continue;
      expect(resolution.rawDamage.B - resolution.rawDamage.A).toBeCloseTo(resolution.delta, 5);
      const backfireA = resolution.rawDamage.A - damageA;
      const backfireB = resolution.rawDamage.B - damageB;
      expect(weightedA - backfireA - (weightedB - backfireB), match.matchId).toBeCloseTo(resolution.delta, 5);
    }
  });

  it("has PermitPilot behind after round 1 and ahead at the end of the first semi", () => {
    const semi = tournament().matches.find((match) => match.matchId === "demo-r1s0");
    const hp = semi?.run.resolution?.hpAfterRound;
    expect(hp).toBeDefined();
    if (!hp) return;
    expect(hp.A[0]).toBeLessThan(hp.B[0]);
    expect(hp.A[2]).toBeGreaterThan(hp.B[2]);
    expect(hp.B[2]).toBe(0);
  });

  it("decides the final 3 to 1 in sudden death", () => {
    const final = tournament().matches.find((match) => match.matchId === "demo-r2s0");
    const resolution = final?.run.resolution;
    expect(resolution?.outcome).toBe("SUDDEN_DEATH");
    expect(resolution?.decidedBy).toBe("sudden_death_judge");
    expect(resolution?.tiebreak).toHaveLength(1);
    const record = resolution?.tiebreak?.[0];
    expect(record?.strategy).toBe("sudden_death_judge");
    if (record?.strategy !== "sudden_death_judge") return;
    const tally = { A: 0, B: 0 };
    for (const vote of record.votes) tally[vote.winner] += 1;
    expect(tally).toEqual({ A: 3, B: 1 });
    const cue = final?.run.script?.cues.find((item) => item.kind === "sudden_death");
    expect(cue).toMatchObject({ kind: "sudden_death", tally: { A: 3, B: 1 } });
  });

  it("cites only locker evidence except deliberate fabrications, which backfire", () => {
    const expectedFabrications: Record<string, { slot: "A" | "B"; count: number }> = {
      "demo-r0s0": { slot: "B", count: 1 },
      "demo-r1s1": { slot: "A", count: 1 },
    };
    for (const match of tournament().matches) {
      const locker = new Set<string>();
      for (const id of entrantById(match.entrantA).dossierEvidence.map((item) => item.id)) locker.add(id);
      for (const id of entrantById(match.entrantB).dossierEvidence.map((item) => item.id)) locker.add(id);
      for (const event of match.run.events) {
        if (event.type === "scouting.completed") {
          for (const item of event.evidence) locker.add(item.id);
        }
      }
      const fabricatedBySlot = { A: 0, B: 0 };
      for (const event of match.run.events) {
        if (event.type === "volley.submitted") {
          for (const shot of event.volley.shots) {
            for (const id of shot.evidence) {
              const flagged = match.run.events.some(
                (other) =>
                  other.type === "factcheck.completed" &&
                  other.checks.some((check) => check.shotId === shot.id && check.fabricated && check.missingIds.includes(id)),
              );
              if (!flagged) expect(locker.has(id), `${match.matchId} ${shot.id} cites ${id}`).toBe(true);
            }
            if (shot.type === "defense") {
              expect(shot.respondsTo?.length ?? 0, `${match.matchId} ${shot.id}`).toBeGreaterThan(0);
            }
          }
        }
        if (event.type !== "factcheck.completed") continue;
        for (const check of event.checks) {
          if (!check.fabricated) continue;
          expect(check.missingIds.length, `${match.matchId} ${check.shotId}`).toBeGreaterThan(0);
          for (const id of check.missingIds) {
            expect(locker.has(id), `${match.matchId} ${check.shotId} fabricates ${id}`).toBe(false);
          }
          const slot = event.fighter;
          fabricatedBySlot[slot] += 1;
        }
      }
      const expected = expectedFabrications[match.matchId];
      if (expected) {
        expect(fabricatedBySlot[expected.slot], match.matchId).toBe(expected.count);
        expect(fabricatedBySlot[expected.slot === "A" ? "B" : "A"], match.matchId).toBe(0);
      } else {
        expect(fabricatedBySlot, match.matchId).toEqual({ A: 0, B: 0 });
      }
      let criterionDamageA = 0;
      let criterionDamageB = 0;
      for (const event of match.run.events) {
        if (event.type !== "round.resolved") continue;
        for (const criterion of event.resolution.criteria) {
          criterionDamageA += criterion.damageTo.A;
          criterionDamageB += criterion.damageTo.B;
        }
      }
      const raw = match.run.resolution?.rawDamage;
      expect(raw?.A ?? Number.NaN, match.matchId).toBeCloseTo(criterionDamageA + 1.5 * fabricatedBySlot.A, 5);
      expect(raw?.B ?? Number.NaN, match.matchId).toBeCloseTo(criterionDamageB + 1.5 * fabricatedBySlot.B, 5);
    }
  });

  it("keeps every volley shaped and every headline short", () => {
    const headlines = new Map<string, string>();
    for (const match of tournament().matches) {
      expect(match.run.warnings, match.matchId).toEqual([]);
      const v1Ids = new Set<string>();
      for (const event of match.run.events) {
        if (event.type !== "volley.submitted") continue;
        const shots = event.volley.shots;
        if (!event.stepKey.startsWith("sd/")) {
          expect(shots.length, `${match.matchId} ${event.stepKey}`).toBeGreaterThanOrEqual(2);
          expect(shots.length, `${match.matchId} ${event.stepKey}`).toBeLessThanOrEqual(4);
        }
        for (const shot of shots) {
          expect(shot.headline.split(/\s+/).filter((word) => word.length > 0).length, `${match.matchId} ${shot.id}`).toBeLessThanOrEqual(12);
          const previous = headlines.get(shot.headline);
          expect(previous, `${match.matchId} repeats "${shot.headline}" from ${previous}`).toBeUndefined();
          headlines.set(shot.headline, match.matchId);
        }
        if (event.stepKey.includes("/v1/")) {
          for (const shot of shots) v1Ids.add(shot.id);
        }
      }
      for (const event of match.run.events) {
        if (event.type !== "volley.submitted" || !event.stepKey.includes("/v2/")) continue;
        for (const shot of event.volley.shots) {
          if (shot.type !== "defense") continue;
          expect(v1Ids.has(shot.respondsTo ?? ""), `${match.matchId} ${shot.id}`).toBe(true);
        }
      }
    }
  });

  it("is deterministic across runs", () => {
    const first = tournament();
    const second = tournament();
    expect(second).toEqual(first);
  });

  it("seals every match until it is complete", () => {
    const sealed = runDemoTournament({ at: DEMO_AT_DEFAULT, build: build(), rubric: rubric(), publish: false });
    expect(sealed.matches).toHaveLength(7);
    for (const match of sealed.matches) {
      expect(match.run.status).toBe("sealed");
      const hidden = toPublicMatch(match.run);
      expect(hidden.winner, match.matchId).toBeNull();
      expect(hidden.outcome, match.matchId).toBeNull();
      expect(hidden.decidedBy, match.matchId).toBeNull();
      expect(hidden.script, match.matchId).toBeNull();
      expect(hidden.events, match.matchId).toBeNull();
      expect(hidden.calls, match.matchId).toBeNull();
      const revealed = toPublicMatch(markComplete(match.run));
      expect(revealed.status).toBe("complete");
      expect(revealed.winner, match.matchId).not.toBeNull();
      expect(revealed.script, match.matchId).toEqual(match.run.script);
    }
  });

  it("has exactly two upsets in seven matches", () => {
    const bracket = tournament();
    const seedById = new Map(bracket.bracket.entrants.map((entrant) => [entrant.id, entrant.seed]));
    let upsets = 0;
    for (const match of bracket.matches) {
      const winnerId = match.run.resolution?.winner === "A" ? match.entrantA : match.entrantB;
      const loserId = winnerId === match.entrantA ? match.entrantB : match.entrantA;
      const winnerSeed = seedById.get(winnerId);
      const loserSeed = seedById.get(loserId);
      expect(winnerSeed).toBeDefined();
      expect(loserSeed).toBeDefined();
      if ((winnerSeed ?? 0) > (loserSeed ?? 0)) upsets += 1;
    }
    expect(upsets).toBe(2);
  });

  it("resolves every slot complete with the bracket winners", () => {
    const bracket = tournament();
    expect(bracket.resolutions.filter((resolution) => resolution.kind === "COMPLETE")).toHaveLength(7);
    const champion = bracket.matches.find((match) => match.matchId === "demo-r2s0");
    const winnerId = champion?.run.resolution?.winner === "A" ? champion?.entrantA : champion?.entrantB;
    expect(winnerId).toBe("permitpilot");
  });

  it("matches the committed fixture tapes", () => {
    expect(loadFixture("demo-qf2-tab-paper.json")).toEqual(tabVsPaperTape());
    expect(loadFixture("demo-qf3-derma-loop.json")).toEqual(dermaVsLoopTape());
    expect(loadFixture("demo-qf4-flake-curb.json")).toEqual(flakeVsCurbTape());
    expect(loadFixture("demo-sf1-permit-tab.json")).toEqual(permitVsTabTape());
    expect(loadFixture("demo-sf2-derma-curb.json")).toEqual(dermaVsCurbTape());
    expect(loadFixture("demo-final-permit-curb.json")).toEqual(finalTape());
  });
});
