import type { BroadcastScript, Cue, Move, Slot } from "@sf-fight-club/schemas";

import { DEMO_MATCHES, type DemoMatch } from "./fixtures/index.js";

/**
 * The demo tournament never booked a critical hit or a parry, so the crit and
 * parry treatments would be unreachable in the harness and unusable for
 * screenshots. This reel is a dev fixture only: it replays the opener with two
 * of its turns re-statted, and keeps HP cumulative so the timeline stays honest.
 */

const DEFENSE_MOVE: Move = {
  name: "Switching Cost",
  element: "moat",
  criterion: "moat",
  type: "defense",
};

function clampHp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function targetOf(cue: Extract<Cue, { kind: "shot" }>): Slot {
  return cue.outcome === "backfire" ? cue.shooter : cue.shooter === "A" ? "B" : "A";
}

function restat(script: BroadcastScript): BroadcastScript {
  let hp: Record<Slot, number> = { A: 100, B: 100 };
  const cues: Cue[] = script.cues.map((cue) => {
    if (cue.kind === "shot" && cue.turn === 3) {
      const next: Cue = {
        ...cue,
        outcome: "crit",
        impact: 3,
        damage: 26,
        evidence: [
          { id: "E1", status: "supported" },
          { id: "E2", status: "supported" },
        ],
        verdictLine: "DIRECT HIT. The judges bought all of it.",
      };
      hp = spend(hp, targetOf(next), next.damage);
      return { ...next, hpAfter: hp };
    }
    if (cue.kind === "shot" && cue.turn === 5) {
      const next: Cue = {
        ...cue,
        outcome: "parried",
        impact: 2,
        damage: 0,
        evidence: [
          { id: "E3", status: "partial" },
          { id: "E4", status: "estimate" },
        ],
        parry: {
          defenseShotId: `${cue.shotId}-defense`,
          headline: "The judge asked for the retention curve. The pitch had a slide.",
          move: DEFENSE_MOVE,
        },
        verdictLine: "Fogcast answered with Switching Cost.",
      };
      return { ...next, hpAfter: hp };
    }
    if (cue.kind === "shot" || cue.kind === "hammer") {
      hp = spend(hp, cue.kind === "hammer" ? cue.target : targetOf(cue), cue.damage);
      return { ...cue, hpAfter: hp };
    }
    return cue;
  });

  return {
    ...script,
    matchId: `${script.matchId}-reel`,
    cues: cues.map((cue) => ({ ...cue, id: `${cue.id}-reel` })),
  };
}

function spend(hp: Record<Slot, number>, target: Slot, damage: number): Record<Slot, number> {
  if (target === "A") return { A: clampHp(hp.A - damage), B: hp.B };
  return { A: hp.A, B: clampHp(hp.B - damage) };
}

export const REEL_MATCH: DemoMatch = (() => {
  const source = DEMO_MATCHES[0];
  if (!source) throw new Error("demo fixtures are empty");
  return {
    matchId: "reel-crit-parry",
    roundIndex: 0,
    slotIndex: 0,
    label: "REEL · CRIT AND PARRY",
    winner: source.winner,
    outcome: source.outcome,
    fighters: source.fighters,
    script: restat(source.script),
  };
})();

export const HARNESS_MATCHES: readonly DemoMatch[] = [...DEMO_MATCHES, REEL_MATCH];
