import type { Slot } from "@sf-fight-club/schemas";

import { buildCrew, drawCrew, type CrewMember } from "../art/crew.js";
import { buildMascot, drawMascot, type Mascot, type MascotState } from "../art/mascot.js";
import { drawStage, GROUND, STAGE_HEIGHT, STAGE_WIDTH, type TimeOfDay } from "../art/stage.js";
import type { ArenaEffects } from "./effects.js";
import { chestOf, FIGHTER_SPOT } from "./effects.js";
import type { ArenaState, ArenaTimeline } from "./timeline.js";
import { other } from "./timeline.js";
import type { ArenaFighter, CrewMember as CrewInfo } from "./types.js";

export interface PlacedCrew {
  info: CrewInfo;
  member: CrewMember;
  acquired: boolean;
  x: number;
  y: number;
  scale: number;
}

export interface ArenaAssets {
  mascots: Record<Slot, Mascot>;
  crew: Record<Slot, readonly PlacedCrew[]>;
  crowd: Record<Slot, readonly CrowdFigure[]>;
}

export interface CrowdFigure {
  member: CrewMember;
  x: number;
  y: number;
  phase: number;
}

const MASCOT_SCALE = 3;

export function buildArenaAssets(fighters: Record<Slot, ArenaFighter>): ArenaAssets {
  return {
    mascots: {
      A: buildMascot({ spriteSeed: fighters.A.spriteSeed, category: fighters.A.category }),
      B: buildMascot({ spriteSeed: fighters.B.spriteSeed, category: fighters.B.category }),
    },
    crew: { A: placeCrew("A", fighters.A), B: placeCrew("B", fighters.B) },
    crowd: { A: buildCrowd("A", fighters.A.clout), B: buildCrowd("B", fighters.B.clout) },
  };
}

/** Own founders stand closest; people won from earlier matches stand further back. */
const CREW_BASE: Record<Slot, number> = { A: 100, B: 380 };

function placeCrew(slot: Slot, fighter: ArenaFighter): PlacedCrew[] {
  const direction = slot === "A" ? -1 : 1;
  const base = CREW_BASE[slot];
  const own = fighter.crew.filter((member) => member.from === fighter.entrantId);
  const acquired = fighter.crew.filter((member) => member.from !== fighter.entrantId);
  const placed: PlacedCrew[] = [];
  own.forEach((info, index) => {
    placed.push({
      info,
      member: buildCrew(info.handle),
      acquired: false,
      x: base + direction * index * 16,
      y: 202,
      scale: 1.5 - index * 0.08,
    });
  });
  acquired.forEach((info, index) => {
    placed.push({
      info,
      member: buildCrew(info.handle),
      acquired: true,
      x: base + direction * (own.length * 15 + 8 + index * 13),
      y: 194,
      scale: 1.15,
    });
  });
  return placed;
}

/** Clout sets crowd size and nothing else. */
function buildCrowd(slot: Slot, clout: number): CrowdFigure[] {
  const count = Math.max(6, Math.min(12, 5 + Math.round((clout / 100) * 7)));
  const figures: CrowdFigure[] = [];
  for (let index = 0; index < count; index += 1) {
    const offset = 12 + index * 17;
    figures.push({
      member: buildCrew(`crowd-${slot}-${index}`),
      x: slot === "A" ? 232 - offset : 248 + offset,
      y: 266 + (index % 2) * 2,
      phase: index * 0.9 + (slot === "A" ? 0 : 1.7),
    });
  }
  return figures;
}

interface Camera {
  focusX: number;
  focusY: number;
  zoom: number;
}

interface TurnPose {
  actor: Slot;
  target: Slot;
  phase: ArenaState["turn"] extends null ? never : NonNullable<ArenaState["turn"]>["phase"];
  progress: number;
}

export interface ArenaFrameInput {
  ctx: CanvasRenderingContext2D;
  timeline: ArenaTimeline;
  state: ArenaState;
  assets: ArenaAssets;
  effects: ArenaEffects;
  nowMs: number;
  reducedMotion: boolean;
}

export function drawArenaFrame(input: ArenaFrameInput): void {
  const { ctx, state, assets, effects } = input;
  const timeOfDay: TimeOfDay = state.timeOfDay;
  const pose = turnPose(state);

  ctx.save();
  const shake = input.reducedMotion ? { x: 0, y: 0 } : effects.shake();
  ctx.translate(shake.x, shake.y);
  const camera = cameraFor(state, input.nowMs, input.reducedMotion);
  ctx.translate(camera.focusX, camera.focusY);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.focusX, -camera.focusY);

  drawStage(ctx, {
    timeOfDay,
    cameraX: 0,
    cameraZoom: 1,
    fog: state.fog,
    timeMs: input.nowMs,
    spotlight: false,
    reducedMotion: input.reducedMotion,
  });

  if (pose) drawSpotlight(ctx, pose.actor, timeOfDay);

  drawCrowd(ctx, input);
  drawCrews(ctx, input, pose, "behind");

  for (const slot of ["A", "B"] as const) {
    const dim = pose !== null && pose.actor !== slot && !input.reducedMotion;
    ctx.save();
    if (dim) ctx.globalAlpha = 0.45;
    drawMascot(ctx, assets.mascots[slot], {
      x: FIGHTER_SPOT[slot].x,
      y: FIGHTER_SPOT[slot].y,
      facing: FIGHTER_SPOT[slot].facing,
      state: mascotStateAt({ slot, state: input.state, timeline: input.timeline, timeMs: input.state.timeMs }),
      timeMs: mascotClock({ slot, state: input.state }),
      corner: slot === "A" ? "left" : "right",
      scale: MASCOT_SCALE,
      reducedMotion: input.reducedMotion,
    });
    ctx.restore();
  }

  if (pose && !input.reducedMotion) drawDim(ctx, pose.actor);

  drawCrews(ctx, input, pose, "front");

  effects.draw(ctx);
  ctx.restore();

  if (state.suddenDeath) drawFogEdge(ctx, input.nowMs, input.reducedMotion);
}

function turnPose(state: ArenaState): TurnPose | null {
  if (!state.turn) return null;
  const actor = state.turn.window.cue.shooter;
  return {
    actor,
    target: other(actor),
    phase: state.turn.phase,
    progress: state.turn.phaseProgress,
  };
}

function cameraFor(state: ArenaState, nowMs: number, reducedMotion: boolean): Camera {
  const rest: Camera = { focusX: 240, focusY: 150, zoom: 1 };
  if (reducedMotion) return rest;
  if (state.turn) {
    const actor = state.turn.window.cue.shooter;
    const target = other(actor);
    const actorSpot = FIGHTER_SPOT[actor];
    const targetSpot = FIGHTER_SPOT[target];
    switch (state.turn.phase) {
      case "turn_start":
      case "menu":
        return rest;
      case "callout":
        return {
          focusX: lerp(240, actorSpot.x, Math.min(1, state.turn.phaseProgress * 2)),
          focusY: 160,
          zoom: lerp(1, 1.06, Math.min(1, state.turn.phaseProgress * 2)),
        };
      case "attack": {
        const ease = state.turn.phaseProgress * state.turn.phaseProgress;
        return {
          focusX: lerp(actorSpot.x, targetSpot.x, ease),
          focusY: 158,
          zoom: 1.08,
        };
      }
      case "impact":
        return { focusX: targetSpot.x, focusY: 159, zoom: 1.13 };
      case "verdict":
        return { focusX: lerp(targetSpot.x, 240, state.turn.phaseProgress * 0.8), focusY: 158, zoom: 1.05 };
      default: {
        const _exhaustive: never = state.turn.phase;
        return _exhaustive;
      }
    }
  }
  if (state.finisherCue) {
    const spot = FIGHTER_SPOT[state.finisherCue.loser];
    return { focusX: spot.x, focusY: 156, zoom: 1.14 };
  }
  if (state.winnerCue) {
    return { focusX: FIGHTER_SPOT[state.winnerCue.winner].x, focusY: 152, zoom: 1.06 };
  }
  if (state.suddenDeath) return { focusX: 240, focusY: 148, zoom: 1.04 };
  void nowMs;
  return rest;
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

/** Warm cone on the actor, so the dimmed side reads as shadow rather than haze. */
function drawSpotlight(ctx: CanvasRenderingContext2D, actor: Slot, timeOfDay: TimeOfDay): void {
  const x = FIGHTER_SPOT[actor].x;
  const night = timeOfDay === "night";
  const edge = "rgba(255, 246, 214, 0)";
  const rim = night ? "rgba(255, 219, 110, 0.10)" : "rgba(255, 246, 214, 0.12)";
  const core = night ? "rgba(255, 219, 110, 0.26)" : "rgba(255, 246, 214, 0.3)";
  const cone = ctx.createLinearGradient(x - 84, 0, x + 84, 0);
  cone.addColorStop(0, edge);
  cone.addColorStop(0.28, rim);
  cone.addColorStop(0.5, core);
  cone.addColorStop(0.72, rim);
  cone.addColorStop(1, edge);
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x - 24, 0);
  ctx.lineTo(x + 24, 0);
  ctx.lineTo(x + 84, GROUND);
  ctx.lineTo(x - 84, GROUND);
  ctx.closePath();
  ctx.fillStyle = cone;
  ctx.fill();
  const pool = ctx.createRadialGradient(x, GROUND, 2, x, GROUND, 96);
  pool.addColorStop(0, night ? "rgba(255, 226, 150, 0.34)" : "rgba(255, 240, 196, 0.36)");
  pool.addColorStop(1, "rgba(255, 240, 196, 0)");
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.ellipse(x, GROUND, 96, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCrowd(ctx: CanvasRenderingContext2D, input: ArenaFrameInput): void {
  const { state } = input;
  const jumping = state.turn && state.turn.phase === "impact" && state.turn.window.cue.outcome === "crit";
  ctx.save();
  ctx.globalAlpha = state.timeOfDay === "night" ? 1 : 0.9;
  for (const slot of ["A", "B"] as const) {
    for (const figure of input.assets.crowd[slot]) {
      const bob = Math.sin(input.nowMs / 240 + figure.phase) > 0.55 ? -1 : 0;
      const jump = jumping ? -6 : 0;
      drawCrew(ctx, figure.member, {
        x: figure.x,
        y: figure.y + bob + jump,
        facing: slot === "A" ? 1 : -1,
        state: jumping ? "cheer" : "idle",
        timeMs: input.nowMs + figure.phase * 300,
        scale: 1.9,
        silhouette: true,
      });
    }
  }
  ctx.restore();
}

type CrewPass = "behind" | "front";

function drawCrews(
  ctx: CanvasRenderingContext2D,
  input: ArenaFrameInput,
  pose: TurnPose | null,
  pass: CrewPass,
): void {
  const { state } = input;
  for (const slot of ["A", "B"] as const) {
    const crewState = crewStateFor(slot, state, pose);
    input.assets.crew[slot].forEach((entry, index) => {
      const walk = acquisitionWalk({ slot, entry, index, state, timeline: input.timeline, assets: input.assets });
      if (pass === "behind" ? walk !== null : walk === null) return;
      drawCrew(ctx, entry.member, {
        x: walk?.x ?? entry.x,
        y: walk?.y ?? entry.y,
        facing: slot === "A" ? 1 : -1,
        state: walk ? "walk" : crewState,
        timeMs: input.nowMs,
        scale: walk ? 1 : entry.scale,
      });
    });
  }
}

function crewStateFor(slot: Slot, state: ArenaState, pose: TurnPose | null): "idle" | "cheer" | "flinch" {
  if (!pose) return "idle";
  if (pose.phase !== "impact" && pose.phase !== "verdict") return "idle";
  if (!state.turn) return "idle";
  const outcome = state.turn.window.cue.outcome;
  if (pose.actor === slot) {
    if (outcome === "backfire") return "flinch";
    if (outcome === "hit" || outcome === "crit" || outcome === "partial" || outcome === "parried") return "cheer";
    return "idle";
  }
  if (outcome === "crit" || outcome === "hit") return "flinch";
  return "idle";
}

/**
 * After the winner cue the losing corner's crew crosses the stage and joins the
 * winner's line, in the same formation the winner's own recruits already hold.
 */
function acquisitionWalk(input: {
  slot: Slot;
  entry: PlacedCrew;
  index: number;
  state: ArenaState;
  timeline: ArenaTimeline;
  assets: ArenaAssets;
}): { x: number; y: number } | null {
  const winner = input.state.winnerCue;
  if (!winner || winner.winner === input.slot) return null;
  const elapsed = input.state.timeMs - winner.t;
  const span = Math.max(1, input.timeline.durationMs - winner.t);
  const progress = Math.max(0, Math.min(1, (elapsed - 600) / (span * 0.55)));
  if (progress <= 0) return null;
  const winnerSlot = winner.winner;
  const direction = winnerSlot === "A" ? -1 : 1;
  const base = CREW_BASE[winnerSlot];
  const ownCount = input.assets.crew[winnerSlot].filter((member) => !member.acquired).length;
  const targetX = base + direction * (ownCount * 15 + 8 + input.index * 13);
  const eased = progress * progress * (3 - 2 * progress);
  return {
    x: lerp(input.entry.x, targetX, eased),
    y: lerp(input.entry.y, 194, eased),
  };
}

function mascotClock(input: { slot: Slot; state: ArenaState }): number {
  const finisher = input.state.finisherCue;
  if (finisher && finisher.loser === input.slot) return Math.max(0, input.state.timeMs - finisher.t);
  return input.state.timeMs;
}

function mascotStateAt(input: {
  slot: Slot;
  state: ArenaState;
  timeline: ArenaTimeline;
  timeMs: number;
}): MascotState {
  const { slot, state } = input;
  const hp = state.hp[slot];
  const base = hp <= 0 ? "ko" : hp <= 25 ? "critical" : hp <= 50 ? "staggered" : "idle";

  const winner = state.winnerCue;
  if (winner) {
    if (winner.winner === slot) return "victory";
    const finisher = state.finisherCue;
    if (finisher && finisher.loser === slot) return finisher.style === "ko" ? "ko" : "staggered";
    return base;
  }

  const finisher = state.finisherCue;
  if (finisher) {
    if (finisher.loser === slot) return finisher.style === "ko" ? "ko" : "staggered";
    return "victory";
  }

  const outcome = state.outcomeCue;
  if (outcome) {
    if (outcome.outcome === "KO" && slot === loserOf(state)) return "hurt";
    if (outcome.outcome === "DECISION") return base;
  }

  const beat = state.beat;
  if (beat?.kind === "hammer" && beat.target === slot && state.timeMs - beat.t > 700) return "hurt";

  const turn = state.turn;
  if (turn) {
    const cue = turn.window.cue;
    const isActor = cue.shooter === slot;
    if (isActor) {
      switch (turn.phase) {
        case "turn_start":
        case "menu":
          return base;
        case "callout":
          return turn.phaseProgress > 0.35 ? "windup" : base;
        case "attack":
          return cue.outcome === "whiff" ? "lunge" : "lunge";
        case "impact":
          return cue.outcome === "backfire" ? "hurt" : base;
        case "verdict":
          return base;
        default: {
          const _exhaustive: never = turn.phase;
          return _exhaustive;
        }
      }
    }
    if (turn.phase === "impact" || turn.phase === "verdict") {
      switch (cue.outcome) {
        case "parried":
        case "glancing":
          return "guard";
        case "hit":
        case "crit":
        case "partial":
          return turn.phase === "impact" ? "hurt" : base;
        case "whiff":
        case "backfire":
          return base;
        default: {
          const _exhaustive: never = cue.outcome;
          return _exhaustive;
        }
      }
    }
    return base;
  }

  return base;
}

function loserOf(state: ArenaState): Slot {
  const winner = state.winnerCue;
  if (winner) return other(winner.winner);
  const finisher = state.finisherCue;
  if (finisher) return finisher.loser;
  return state.hp.A <= state.hp.B ? "A" : "B";
}

/** Heavy fog settles over the deck in sudden death. */
function drawDim(ctx: CanvasRenderingContext2D, actor: Slot): void {
  const onLeft = actor === "B";
  const edge = onLeft ? 0 : STAGE_WIDTH;
  const centre = STAGE_WIDTH / 2;
  const gradient = ctx.createLinearGradient(edge, 0, centre, 0);
  gradient.addColorStop(0, "rgba(12, 12, 22, 0.42)");
  gradient.addColorStop(1, "rgba(12, 12, 22, 0)");
  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(Math.min(edge, centre), 0, Math.abs(centre - edge), STAGE_HEIGHT);
  ctx.restore();
}

function drawFogEdge(ctx: CanvasRenderingContext2D, nowMs: number, reducedMotion: boolean): void {
  const time = reducedMotion ? 0 : nowMs;
  const layers = [
    { y: STAGE_HEIGHT - 22, alpha: 0.3, drift: 34, rx: 74, ry: 15 },
    { y: STAGE_HEIGHT - 12, alpha: 0.24, drift: 22, rx: 96, ry: 13 },
    { y: STAGE_HEIGHT - 2, alpha: 0.16, drift: 15, rx: 120, ry: 11 },
  ];
  ctx.save();
  for (const layer of layers) {
    for (let index = 0; index < 4; index += 1) {
      const span = STAGE_WIDTH + layer.rx * 2;
      const x = ((time / layer.drift + index * 131) % span) - layer.rx;
      const y = layer.y + Math.sin(time / 1700 + index * 1.3) * 3;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, layer.rx);
      gradient.addColorStop(0, `rgba(214, 224, 236, ${layer.alpha})`);
      gradient.addColorStop(0.55, `rgba(196, 208, 222, ${layer.alpha * 0.6})`);
      gradient.addColorStop(1, "rgba(196, 208, 222, 0)");
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, layer.ry / layer.rx);
      ctx.translate(-x, -y);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, layer.rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
}

export { chestOf, GROUND };
