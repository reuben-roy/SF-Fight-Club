import { describe, expect, it } from "vitest";

import type { Slot } from "@sf-fight-club/schemas";
import { DEMO_MATCHES } from "../src/arena/fixtures/index.js";
import {
  TURN_PHASES,
  advancePlayback,
  buildTimeline,
  impactTimeOf,
  phaseKey,
  stateAt,
  stateAtTurn,
  timeOfDayFor,
  turnStartMs,
  type ArenaState,
  type ArenaTimeline,
} from "../src/arena/timeline.js";

function expectedHp(timeline: ArenaTimeline, timeMs: number): Record<Slot, number> {
  const hp: Record<Slot, number> = { A: 100, B: 100 };
  for (const cue of timeline.cues) {
    if (cue.kind !== "shot" && cue.kind !== "hammer") continue;
    if (impactTimeOf(cue, timeline) > timeMs) break;
    hp.A = cue.hpAfter.A;
    hp.B = cue.hpAfter.B;
  }
  return hp;
}

function expectedStatuses(timeline: ArenaTimeline, timeMs: number): Record<Slot, string[]> {
  const live: Record<Slot, Set<string>> = { A: new Set(), B: new Set() };
  for (const cue of timeline.cues) {
    if (cue.kind !== "status" || cue.t > timeMs) continue;
    if (cue.on) live[cue.target].add(cue.status);
    else live[cue.target].delete(cue.status);
  }
  return {
    A: [...live.A].sort(),
    B: [...live.B].sort(),
  };
}

function sampleTimes(timeline: ArenaTimeline): number[] {
  const times = new Set<number>([0, timeline.durationMs]);
  for (const cue of timeline.cues) {
    times.add(Math.max(0, cue.t - 1));
    times.add(cue.t);
    times.add(Math.min(timeline.durationMs, cue.t + 1));
  }
  for (const turn of timeline.turns) {
    for (const offset of [-1, 0, 1, 400]) {
      times.add(Math.min(timeline.durationMs, Math.max(0, turn.impactAt + offset)));
    }
  }
  for (let time = 0; time <= timeline.durationMs; time += 431) times.add(time);
  return [...times].sort((left, right) => left - right);
}

function fingerprint(state: ArenaState): string {
  const statuses = `${state.statuses.A.join("+")}/${state.statuses.B.join("+")}`;
  return [
    state.hp.A,
    state.hp.B,
    statuses,
    state.airedTurns.join(","),
    state.round,
    state.timeOfDay,
    state.turnNumber,
    state.turn?.phase ?? "none",
    phaseKey(state),
  ].join("|");
}

function playThrough(timeline: ArenaTimeline, targetMs: number): ArenaState {
  let position = 0;
  while (position < targetMs) {
    position = advancePlayback({
      positionMs: position,
      dtMs: Math.min(250, targetMs - position),
      speed: 1,
      durationMs: timeline.durationMs,
    });
  }
  return stateAt(timeline, position);
}

function phaseSequence(timeline: ArenaTimeline, speed: 1 | 2 | 4): string[] {
  const sequence: string[] = [];
  let position = 0;
  while (position < timeline.durationMs) {
    position = advancePlayback({
      positionMs: position,
      dtMs: 16,
      speed,
      durationMs: timeline.durationMs,
    });
    const key = phaseKey(stateAt(timeline, position));
    if (sequence[sequence.length - 1] !== key) sequence.push(key);
  }
  return sequence;
}

describe.each(DEMO_MATCHES.map((match) => [match.matchId, match] as const))("%s", (_matchId, match) => {
  const timeline = buildTimeline(match.script);

  it("should end on the last cue's hpAfter", () => {
    const finalCue = [...timeline.cues].reverse().find((cue) => cue.kind === "shot" || cue.kind === "hammer");
    expect(finalCue).toBeDefined();
    if (!finalCue || (finalCue.kind !== "shot" && finalCue.kind !== "hammer")) throw new Error("no damage cue");
    const state = stateAt(timeline, timeline.durationMs);
    expect(state.hp).toEqual(finalCue.hpAfter);
  });

  it("should take every hp reading from the last aired damage cue", () => {
    for (const time of sampleTimes(timeline)) {
      expect({ time, hp: stateAt(timeline, time).hp }).toEqual({ time, hp: expectedHp(timeline, time) });
    }
  });

  it("should apply statuses exactly as the status cues say", () => {
    for (const time of sampleTimes(timeline)) {
      const state = stateAt(timeline, time);
      expect({
        time,
        A: [...state.statuses.A].sort(),
        B: [...state.statuses.B].sort(),
      }).toEqual({ time, ...expectedStatuses(timeline, time) });
    }
  });

  it("should reach the same state by jumping to a turn as by playing to it", () => {
    for (const turn of timeline.turns) {
      const jumped = stateAtTurn(timeline, turn.turn);
      const played = playThrough(timeline, turnStartMs(timeline, turn.turn));
      expect(fingerprint(jumped)).toBe(fingerprint(played));
      expect(jumped.turnNumber).toBe(turn.turn);
      expect(jumped.turn?.phase).toBe("turn_start");
    }
  });

  it("should keep every turn sub-step inside its slot", () => {
    for (const turn of timeline.turns) {
      expect(turn.phases.map((phase) => phase.phase)).toEqual([...TURN_PHASES]);
      expect(turn.phases[0]?.startMs).toBe(turn.startMs);
      expect(turn.phases[turn.phases.length - 1]?.endMs).toBe(turn.endMs);
      for (const [index, phase] of turn.phases.entries()) {
        expect(phase.endMs).toBeGreaterThan(phase.startMs);
        if (index > 0) expect(phase.startMs).toBe(turn.phases[index - 1]?.endMs);
      }
      const attack = turn.phases.find((phase) => phase.phase === "attack");
      const impact = turn.phases.find((phase) => phase.phase === "impact");
      expect(attack?.startMs).toBe(turn.attackAt);
      expect(impact?.startMs).toBe(turn.impactAt);
      expect(turn.attackAt).toBeGreaterThanOrEqual(turn.startMs);
      expect(turn.impactAt).toBeLessThan(turn.endMs);
    }
  });

  it("should set the time of day by round and by sudden death", () => {
    const titles = timeline.cues.filter((cue) => cue.kind === "round_title");
    for (const title of titles) {
      if (title.kind !== "round_title") continue;
      const state = stateAt(timeline, title.t + 1);
      expect(state.round).toBe(title.round);
      expect(state.timeOfDay).toBe(timeOfDayFor(title.round, timeline.suddenDeathAt !== null && title.t + 1 >= timeline.suddenDeathAt));
    }
    if (timeline.suddenDeathAt !== null) {
      const state = stateAt(timeline, timeline.suddenDeathAt);
      expect(state.suddenDeath).toBe(true);
      expect(state.timeOfDay).toBe("night");
    }
  });

  it("should visit the same phase sequence at every speed", () => {
    const slow = phaseSequence(timeline, 1);
    expect(phaseSequence(timeline, 2)).toEqual(slow);
    expect(phaseSequence(timeline, 4)).toEqual(slow);
    expect(slow[slow.length - 1]).toBe(phaseKey(stateAt(timeline, timeline.durationMs)));
  });
});
