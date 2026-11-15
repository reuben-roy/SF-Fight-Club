import type { Slot } from "@sf-fight-club/schemas";

import { FxSystem } from "../art/fx.js";
import type { SoundName } from "../art/sound.js";
import { damageTarget, WEAPON_FOR, type ArenaTimeline, type ShotCue, type TurnWindow } from "./timeline.js";

export interface StagePoint {
  x: number;
  y: number;
}

/** Where each mascot stands on the 480x270 stage. Feet on the pier deck. */
export const FIGHTER_SPOT: Record<Slot, StagePoint & { facing: 1 | -1 }> = {
  A: { x: 132, y: 214, facing: 1 },
  B: { x: 348, y: 214, facing: -1 },
};

export function chestOf(slot: Slot): StagePoint {
  const spot = FIGHTER_SPOT[slot];
  return { x: spot.x + spot.facing * 10, y: spot.y - 66 };
}

interface EffectEvent {
  id: string;
  at: number;
  run: () => void;
}

const STEP_MS = 40;

/**
 * One cue slot is one vignette. The system replays the slot from its first
 * millisecond whenever playback seeks, so a paused frame shows the same effects
 * as watching live.
 */
export class ArenaEffects {
  private readonly fx = new FxSystem("arena-screen");
  private sources: SoundName[] = [];
  private fired = new Set<string>();
  private events: EffectEvent[] = [];
  private windowStart = -1;
  private clock = -1;
  private reduced = false;

  setReducedMotion(value: boolean): void {
    this.reduced = value;
    this.fx.setReducedMotion(value);
  }

  drainSounds(): SoundName[] {
    const sounds = this.sources;
    this.sources = [];
    return sounds;
  }

  sync(input: { timeline: ArenaTimeline; timeMs: number }): void {
    const target = Math.max(0, input.timeMs);
    const window = this.windowAt(input.timeline, target);
    if (window.startMs !== this.windowStart || this.clock < 0 || target < this.clock - 2) this.resetTo(window);

    while (this.clock < target) {
      const step = Math.min(STEP_MS, target - this.clock);
      this.fx.update(step);
      this.clock += step;
      for (const event of this.events) {
        if (this.fired.has(event.id) || event.at > this.clock) continue;
        this.fired.add(event.id);
        event.run();
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    this.fx.draw(ctx);
  }

  shake(): StagePoint {
    return this.fx.shakeOffset();
  }

  get hitStop(): number {
    return this.fx.hitStopRemaining();
  }

  private resetTo(window: { startMs: number; events: EffectEvent[] }): void {
    this.fx.reset();
    this.fx.setReducedMotion(this.reduced);
    this.fired = new Set();
    this.events = window.events;
    this.windowStart = window.startMs;
    this.clock = window.startMs;
  }

  private windowAt(timeline: ArenaTimeline, timeMs: number): { startMs: number; events: EffectEvent[] } {
    const beats = timeline.cues.filter((cue) => cue.kind !== "status");
    let index = 0;
    for (let cursor = 0; cursor < beats.length; cursor += 1) {
      const beat = beats[cursor];
      if (beat && beat.t <= timeMs) index = cursor;
    }
    const beat = beats[index];
    if (!beat) return { startMs: 0, events: [] };
    const endMs = beats[index + 1]?.t ?? timeline.durationMs;
    return { startMs: beat.t, events: this.eventsFor(timeline, beat, beat.t, endMs) };
  }

  private eventsFor(timeline: ArenaTimeline, beat: ArenaTimeline["cues"][number], startMs: number, endMs: number): EffectEvent[] {
    switch (beat.kind) {
      case "shot": {
        const turn = timeline.turnByNumber.get(beat.turn);
        return turn ? this.shotEvents(turn) : [];
      }
      case "hammer": {
        const spot = FIGHTER_SPOT[beat.target];
        return [
          {
            id: "hammer",
            at: startMs + (endMs - startMs) * 0.45,
            run: () => {
              this.fx.gavel({ at: { x: spot.x + spot.facing * 4, y: spot.y - 6 } });
              this.sources.push("hit");
            },
          },
        ];
      }
      case "finisher": {
        if (beat.style !== "ko") return [];
        return [this.knockOutEvent("finisher", beat.loser, startMs + (endMs - startMs) * 0.2)];
      }
      case "winner": {
        return [
          {
            id: "confetti",
            at: startMs + 240,
            run: () => {
              this.fx.confetti({ at: { x: 240, y: 30 } });
              this.sources.push("promotion");
            },
          },
        ];
      }
      case "intro":
      case "round_title":
      case "status":
      case "scorecard":
      case "outcome":
      case "sudden_death":
        return [];
      default: {
        const _exhaustive: never = beat;
        return _exhaustive;
      }
    }
  }

  private knockOutEvent(id: string, loser: Slot, at: number): EffectEvent {
    return {
      id,
      at,
      run: () => {
        this.fx.knockOut({ at: chestOf(loser), direction: FIGHTER_SPOT[loser].facing === 1 ? -1 : 1 });
        this.sources.push("ko");
      },
    };
  }

  private shotEvents(turn: TurnWindow): EffectEvent[] {
    const cue = turn.cue;
    const shooter = cue.shooter;
    const target = damageTarget(cue);
    const weapon = WEAPON_FOR[cue.weapon];
    const from = chestOf(shooter);
    const targetChest = chestOf(target);
    const to =
      cue.outcome === "whiff"
        ? { x: targetChest.x + FIGHTER_SPOT[target].facing * 110, y: targetChest.y - 10 }
        : targetChest;

    return [
      {
        id: "attack",
        at: turn.attackAt + 30,
        run: () => {
          this.sources.push(weapon);
          if (cue.outcome === "backfire") {
            this.fx.jam({ at: from });
            return;
          }
          this.fx.fireWeapon({ weapon, from, to, impact: cue.impact === 0 ? 1 : cue.impact });
        },
      },
      {
        id: "impact",
        at: turn.impactAt,
        run: () => this.impact(cue, target, targetChest),
      },
    ];
  }

  private impact(cue: ShotCue, target: Slot, at: StagePoint): void {
    switch (cue.outcome) {
      case "hit":
        this.fx.requestShake(2);
        this.sources.push("hit");
        return;
      case "crit":
        this.fx.impactBurst({ at, impact: 3 });
        this.fx.requestShake(6);
        this.fx.requestHitStop(80);
        this.fx.requestFlash(0.35);
        this.sources.push("crit");
        return;
      case "partial":
        this.fx.requestShake(1);
        this.sources.push("hit");
        return;
      case "parried":
        this.fx.parry({ at, kind: cue.criterion === "moat" ? "wall" : "shield" });
        this.sources.push("parry");
        return;
      case "glancing":
        this.fx.impactBurst({ at: { x: at.x - FIGHTER_SPOT[target].facing * 10, y: at.y - 12 }, impact: 1 });
        this.sources.push("hit");
        return;
      case "whiff":
        return;
      case "backfire":
        this.fx.backfire({ at: chestOf(cue.shooter) });
        this.sources.push("crit");
        return;
      default: {
        const _exhaustive: never = cue.outcome;
        return _exhaustive;
      }
    }
  }
}
