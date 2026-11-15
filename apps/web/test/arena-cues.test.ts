import { describe, expect, it } from "vitest";

import type { Cue } from "@sf-fight-club/schemas";
import { DEMO_MATCHES } from "../src/arena/fixtures/index.js";
import {
  PLAYBACK_START,
  jumpToTurn,
  nextTurn,
  pause,
  play,
  seek,
  tick,
} from "../src/arena/playback.js";
import { buildTimeline, cueTreatment, receiptFor, receiptsAt, stateAt } from "../src/arena/timeline.js";

function describeCue(cue: Cue): string {
  switch (cue.kind) {
    case "intro":
      return `tale of the tape, ${Object.keys(cue.fighters).length} corners`;
    case "round_title":
      return `round ${cue.round} ${cue.name}, ${cue.criteria.length} criteria`;
    case "shot":
      return `turn ${cue.turn} ${cue.shooter} ${cue.move.name} ${cue.outcome}`;
    case "hammer":
      return `hammer on ${cue.target} over ${cue.criterion}`;
    case "status":
      return `${cue.status} ${cue.on ? "on" : "off"} ${cue.target}`;
    case "scorecard":
      return `scorecard round ${cue.round}, ${cue.rows.length} rows`;
    case "outcome":
      return `outcome ${cue.outcome}`;
    case "sudden_death":
      return `sudden death, tally ${cue.tally.A}-${cue.tally.B}`;
    case "finisher":
      return `finisher ${cue.style}, ${cue.winner} wins`;
    case "winner":
      return `winner ${cue.winner} by ${cue.decidedBy}`;
    default: {
      const _exhaustive: never = cue;
      return _exhaustive;
    }
  }
}

describe("cue coverage", () => {
  it("should handle every cue kind in every demo script without throwing", () => {
    const seen = new Set<string>();
    for (const match of DEMO_MATCHES) {
      for (const cue of match.script.cues) {
        seen.add(cue.kind);
        expect(describeCue(cue).length).toBeGreaterThan(0);
        expect(cueTreatment(cue).length).toBeGreaterThan(0);
      }
      const timeline = buildTimeline(match.script);
      for (let time = 0; time <= timeline.durationMs; time += 50) {
        expect(() => stateAt(timeline, time)).not.toThrow();
      }
    }
    expect([...seen].sort()).toEqual([
      "finisher",
      "hammer",
      "intro",
      "outcome",
      "round_title",
      "scorecard",
      "shot",
      "status",
      "sudden_death",
      "winner",
    ]);
  });
});

describe.each(DEMO_MATCHES.map((match) => [match.matchId, match] as const))("%s receipts", (_matchId, match) => {
  const timeline = buildTimeline(match.script);

  it("should only render rows for turns that have aired", () => {
    for (let time = 0; time <= timeline.durationMs; time += 97) {
      const aired = timeline.turns.filter((turn) => turn.impactAt <= time).map((turn) => turn.turn);
      const rows = receiptsAt(timeline, time);
      expect(rows.map((row) => row.turn)).toEqual(aired);
      for (const row of rows) {
        expect(row.turn).toBeLessThanOrEqual(aired.length);
      }
    }
  });

  it("should describe each aired row from its own cue", () => {
    for (const turn of timeline.turns) {
      const before = receiptsAt(timeline, turn.impactAt - 1).map((row) => row.turn);
      expect(before).not.toContain(turn.turn);
      const after = receiptsAt(timeline, turn.impactAt);
      expect(after[after.length - 1]).toEqual(receiptFor(turn));
      expect(after[after.length - 1]?.headline).toBe(turn.cue.headline);
      expect(after[after.length - 1]?.damage).toBe(turn.cue.damage);
    }
  });

  it("should not spill rows past the winner", () => {
    const rows = receiptsAt(timeline, timeline.durationMs);
    expect(rows.length).toBe(timeline.turns.length);
    expect(rows.every((row) => row.turn >= 1 && row.turn <= timeline.turns.length)).toBe(true);
    expect(new Set(rows.map((row) => row.turn)).size).toBe(rows.length);
  });
});

describe("playback", () => {
  const timeline = buildTimeline(DEMO_MATCHES[0]?.script ?? { matchId: "empty", directorVersion: "2", durationMs: 1, cues: [] });

  it("should advance by the speed multiplier and stop at the end", () => {
    const once = tick(PLAYBACK_START, { dtMs: 100, durationMs: timeline.durationMs, speed: 1 });
    const fast = tick(PLAYBACK_START, { dtMs: 100, durationMs: timeline.durationMs, speed: 4 });
    expect(once.positionMs).toBe(100);
    expect(fast.positionMs).toBe(400);
    const end = tick({ positionMs: timeline.durationMs - 50, playing: true, completed: false }, {
      dtMs: 100,
      durationMs: timeline.durationMs,
      speed: 2,
    });
    expect(end.positionMs).toBe(timeline.durationMs);
    expect(end.playing).toBe(false);
    expect(end.completed).toBe(true);
  });

  it("should not move while paused", () => {
    const paused = pause({ positionMs: 1200, playing: true, completed: false });
    expect(tick(paused, { dtMs: 500, durationMs: timeline.durationMs, speed: 4 }).positionMs).toBe(1200);
    expect(play(paused).playing).toBe(true);
  });

  it("should jump to the first frame of a turn", () => {
    for (const turn of timeline.turns) {
      const jumped = jumpToTurn({ positionMs: 0, playing: false, completed: false }, { timeline, turn: turn.turn });
      expect(jumped.positionMs).toBe(turn.startMs);
      expect(stateAt(timeline, jumped.positionMs).turnNumber).toBe(turn.turn);
    }
  });

  it("should step to the following turn and never past the end", () => {
    const first = nextTurn({ positionMs: 0, playing: false, completed: false }, { timeline });
    expect(first.positionMs).toBe(timeline.turns[0]?.startMs);
    const second = nextTurn(first, { timeline });
    expect(second.positionMs).toBe(timeline.turns[1]?.startMs);
    const end = seek({ positionMs: 0, playing: false, completed: false }, {
      positionMs: timeline.durationMs + 5000,
      durationMs: timeline.durationMs,
    });
    expect(end.positionMs).toBe(timeline.durationMs);
    expect(end.completed).toBe(true);
  });
});
