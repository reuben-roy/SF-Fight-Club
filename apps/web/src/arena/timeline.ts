import type {
  BroadcastScript,
  CriterionId,
  Cue,
  FighterStatus,
  RoundName,
  RoundNumber,
  Slot,
  Weapon,
} from "@sf-fight-club/schemas";

import { WEAPON_INFO, type WeaponId } from "../art/fx.js";
import type { TimeOfDay } from "../art/stage.js";

export type ShotCue = Extract<Cue, { kind: "shot" }>;
export type HammerCue = Extract<Cue, { kind: "hammer" }>;
export type RoundTitleCue = Extract<Cue, { kind: "round_title" }>;
export type ScorecardCue = Extract<Cue, { kind: "scorecard" }>;
export type StatusCue = Extract<Cue, { kind: "status" }>;
export type OutcomeCue = Extract<Cue, { kind: "outcome" }>;
export type SuddenDeathCue = Extract<Cue, { kind: "sudden_death" }>;
export type FinisherCue = Extract<Cue, { kind: "finisher" }>;
export type WinnerCue = Extract<Cue, { kind: "winner" }>;

export const TURN_PHASES = ["turn_start", "menu", "callout", "attack", "impact", "verdict"] as const;
export type TurnPhase = (typeof TURN_PHASES)[number];

export const PHASE_LABELS: Record<TurnPhase, string> = {
  turn_start: "Turn start",
  menu: "Move",
  callout: "Call out",
  attack: "Attack",
  impact: "Impact",
  verdict: "Verdict",
};

const PHASE_BASE_MS: Record<Exclude<TurnPhase, "attack">, number> = {
  turn_start: 300,
  menu: 600,
  callout: 900,
  impact: 400,
  verdict: 900,
};

const BASE_REST_MS = Object.values(PHASE_BASE_MS).reduce((sum, value) => sum + value, 0);

export const WEAPON_FOR: Record<Weapon, WeaponId> = {
  flame_lance: "flame",
  ballista: "ballista",
  coin_cannon: "coin",
  laser_rifle: "laser",
  trebuchet: "trebuchet",
  clockwork_railgun: "railgun",
  gatling: "gatling",
  rocket: "rocket",
  orbital_beam: "orbital",
};

export const CRITERION_LABELS: Record<CriterionId, string> = {
  problem: "problem",
  market: "market size",
  wtp: "willingness to pay",
  differentiation: "differentiation",
  moat: "moat",
  timing: "timing",
  gtm: "go to market",
  feasibility: "feasibility",
  scale: "scale",
};

export const STATUS_LABELS: Record<FighterStatus, string> = {
  momentum: "MOMENTUM",
  exposed: "EXPOSED",
  last_stand: "LAST STAND",
};

export const STATUS_ORDER: readonly FighterStatus[] = ["momentum", "exposed", "last_stand"];

export const ROUND_NAMES: Record<RoundNumber, RoundName> = {
  1: "MARKET",
  2: "MOAT",
  3: "EXECUTION",
};

export interface PhaseWindow {
  phase: TurnPhase;
  startMs: number;
  endMs: number;
}

export interface TurnWindow {
  cue: ShotCue;
  turn: number;
  round: RoundNumber;
  startMs: number;
  endMs: number;
  phases: readonly PhaseWindow[];
  attackAt: number;
  impactAt: number;
  travelMs: number;
}

export interface RoundSlice {
  round: RoundNumber;
  name: RoundName;
  criteria: RoundTitleCue["criteria"];
  startMs: number;
  endMs: number;
  turns: readonly number[];
}

export interface ArenaTimeline {
  script: BroadcastScript;
  cues: readonly Cue[];
  durationMs: number;
  turns: readonly TurnWindow[];
  turnByNumber: ReadonlyMap<number, TurnWindow>;
  rounds: readonly RoundSlice[];
  statusCues: readonly StatusCue[];
  suddenDeathAt: number | null;
  winnerAt: number | null;
}

export interface TurnState {
  window: TurnWindow;
  phase: TurnPhase;
  phaseStartMs: number;
  phaseEndMs: number;
  phaseProgress: number;
  phaseElapsedMs: number;
}

export interface ImpactState {
  cue: ShotCue | HammerCue;
  at: number;
  target: Slot;
  damage: number;
}

export interface ArenaState {
  timeMs: number;
  cue: Cue | null;
  beat: Cue | null;
  turn: TurnState | null;
  turnNumber: number;
  round: RoundNumber;
  roundCue: RoundTitleCue | null;
  hp: Record<Slot, number>;
  statuses: Record<Slot, readonly FighterStatus[]>;
  airedTurns: readonly number[];
  lastImpact: ImpactState | null;
  timeOfDay: TimeOfDay;
  fog: boolean;
  spotlight: Slot | null;
  suddenDeath: boolean;
  suddenDeathCue: SuddenDeathCue | null;
  outcomeCue: OutcomeCue | null;
  finisherCue: FinisherCue | null;
  winnerCue: WinnerCue | null;
}

export type CueTreatment =
  | "tale"
  | "round"
  | "turn"
  | "hammer"
  | "badge"
  | "scorecard"
  | "outcome"
  | "sudden-death"
  | "finisher"
  | "winner";

export type ShotOutcome = ShotCue["outcome"];

export type ShotTreatment =
  | "land"
  | "critical"
  | "partial"
  | "parried"
  | "glancing"
  | "whiff"
  | "backfire";

export function shotTreatment(outcome: ShotOutcome): ShotTreatment {
  switch (outcome) {
    case "hit":
      return "land";
    case "crit":
      return "critical";
    case "partial":
      return "partial";
    case "parried":
      return "parried";
    case "glancing":
      return "glancing";
    case "whiff":
      return "whiff";
    case "backfire":
      return "backfire";
    default: {
      const _exhaustive: never = outcome;
      return _exhaustive;
    }
  }
}

export function cueTreatment(cue: Cue): CueTreatment {
  switch (cue.kind) {
    case "intro":
      return "tale";
    case "round_title":
      return "round";
    case "shot":
      return "turn";
    case "hammer":
      return "hammer";
    case "status":
      return "badge";
    case "scorecard":
      return "scorecard";
    case "outcome":
      return "outcome";
    case "sudden_death":
      return "sudden-death";
    case "finisher":
      return "finisher";
    case "winner":
      return "winner";
    default: {
      const _exhaustive: never = cue;
      return _exhaustive;
    }
  }
}

export function other(slot: Slot): Slot {
  return slot === "A" ? "B" : "A";
}

export function damageTarget(cue: ShotCue | HammerCue): Slot {
  if (cue.kind === "hammer") return cue.target;
  return cue.outcome === "backfire" ? cue.shooter : other(cue.shooter);
}

export function weaponTravelMs(weapon: Weapon): number {
  return WEAPON_INFO[WEAPON_FOR[weapon]].travelMs;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * The table in docs/09 has a 500 ms attack. A weapon that flies longer gets
 * that time and the five named beats share whatever is left, so every phase
 * still lands inside the cue slot.
 */
export function scheduleTurn(input: {
  startMs: number;
  endMs: number;
  travelMs: number;
}): { phases: PhaseWindow[]; attackAt: number; impactAt: number } {
  const span = Math.max(1, input.endMs - input.startMs);
  const attackMs = clamp(input.travelMs + 80, 480, Math.max(480, span - 1800));
  const rest = Math.max(1, span - attackMs);
  const scale = rest / BASE_REST_MS;
  let cursor = input.startMs;
  const phases: PhaseWindow[] = [];
  const push = (phase: TurnPhase, duration: number): void => {
    const end = cursor + duration;
    phases.push({ phase, startMs: cursor, endMs: end });
    cursor = end;
  };
  push("turn_start", PHASE_BASE_MS.turn_start * scale);
  push("menu", PHASE_BASE_MS.menu * scale);
  push("callout", PHASE_BASE_MS.callout * scale);
  const attackAt = cursor;
  push("attack", attackMs);
  const impactAt = cursor;
  push("impact", PHASE_BASE_MS.impact * scale);
  push("verdict", PHASE_BASE_MS.verdict * scale);
  const last = phases[phases.length - 1];
  if (last) last.endMs = input.endMs;
  return { phases, attackAt, impactAt };
}

export function buildTimeline(script: BroadcastScript): ArenaTimeline {
  const cues = [...script.cues].sort((left, right) => left.t - right.t);
  const durationMs = Math.max(script.durationMs, (cues[cues.length - 1]?.t ?? 0) + 1);
  const nonStatus = cues.filter((cue) => cue.kind !== "status");
  const endFor = (index: number): number => nonStatus[index + 1]?.t ?? durationMs;

  const roundTitles = cues.filter((cue): cue is RoundTitleCue => cue.kind === "round_title");
  const statusCues = cues.filter((cue): cue is StatusCue => cue.kind === "status");
  const suddenDeath = cues.find((cue): cue is SuddenDeathCue => cue.kind === "sudden_death");
  const winner = cues.find((cue): cue is WinnerCue => cue.kind === "winner");

  const turns: TurnWindow[] = [];
  for (let index = 0; index < nonStatus.length; index += 1) {
    const cue = nonStatus[index];
    if (!cue || cue.kind !== "shot") continue;
    const round = roundAt(roundTitles, cue.t);
    const travelMs = weaponTravelMs(cue.weapon);
    const endMs = endFor(index);
    const schedule = scheduleTurn({ startMs: cue.t, endMs, travelMs });
    turns.push({
      cue,
      turn: cue.turn,
      round,
      startMs: cue.t,
      endMs,
      phases: schedule.phases,
      attackAt: schedule.attackAt,
      impactAt: schedule.impactAt,
      travelMs,
    });
  }

  const rounds: RoundSlice[] = roundTitles.map((title, index) => {
    const startMs = title.t;
    const endMs = roundTitles[index + 1]?.t ?? durationMs;
    const roundTurns = turns.filter((turn) => turn.startMs >= startMs && turn.startMs < endMs);
    return {
      round: title.round,
      name: title.name,
      criteria: title.criteria,
      startMs,
      endMs,
      turns: roundTurns.map((turn) => turn.turn),
    };
  });

  const turnByNumber = new Map(turns.map((turn) => [turn.turn, turn]));

  return {
    script,
    cues,
    durationMs,
    turns,
    turnByNumber,
    rounds,
    statusCues,
    suddenDeathAt: suddenDeath?.t ?? null,
    winnerAt: winner?.t ?? null,
  };
}

function roundAt(roundTitles: readonly RoundTitleCue[], timeMs: number): RoundNumber {
  let round: RoundNumber = 1;
  for (const title of roundTitles) {
    if (title.t > timeMs) break;
    round = title.round;
  }
  return round;
}

function roundCueAt(roundTitles: readonly RoundTitleCue[], timeMs: number): RoundTitleCue | null {
  let found: RoundTitleCue | null = null;
  for (const title of roundTitles) {
    if (title.t > timeMs) break;
    found = title;
  }
  return found;
}

export function impactTimeOf(cue: ShotCue | HammerCue, timeline: ArenaTimeline): number {
  if (cue.kind === "shot") {
    return timeline.turnByNumber.get(cue.turn)?.impactAt ?? cue.t;
  }
  const next = timeline.cues.find((candidate) => candidate.kind !== "status" && candidate.t > cue.t);
  const end = next?.t ?? timeline.durationMs;
  return cue.t + (end - cue.t) * 0.55;
}

export function timeOfDayFor(round: RoundNumber, suddenDeath: boolean): TimeOfDay {
  if (suddenDeath || round === 3) return "night";
  if (round === 2) return "dusk";
  return "sunset";
}

export function stateAt(timeline: ArenaTimeline, timeMs: number): ArenaState {
  const time = clamp(timeMs, 0, timeline.durationMs);
  const aired = timeline.cues.filter((cue) => cue.t <= time);
  const cue = aired[aired.length - 1] ?? null;

  let beat: Cue | null = null;
  for (const candidate of aired) {
    if (candidate.kind !== "status") beat = candidate;
  }

  const roundCue = roundCueAt(
    timeline.cues.filter((candidate): candidate is RoundTitleCue => candidate.kind === "round_title"),
    time,
  );
  const round = roundCue?.round ?? 1;

  const turnWindow = timeline.turns.find((candidate) => candidate.startMs <= time && time < candidate.endMs) ?? null;
  let turn: TurnState | null = null;
  if (turnWindow) {
    const phase = turnWindow.phases.find((candidate) => candidate.startMs <= time && time < candidate.endMs)
      ?? turnWindow.phases[turnWindow.phases.length - 1]
      ?? null;
    if (phase) {
      const span = Math.max(1, phase.endMs - phase.startMs);
      turn = {
        window: turnWindow,
        phase: phase.phase,
        phaseStartMs: phase.startMs,
        phaseEndMs: phase.endMs,
        phaseProgress: clamp((time - phase.startMs) / span, 0, 1),
        phaseElapsedMs: time - phase.startMs,
      };
    }
  }

  const hp: Record<Slot, number> = { A: 100, B: 100 };
  let lastImpact: ImpactState | null = null;
  for (const candidate of timeline.cues) {
    if (candidate.kind !== "shot" && candidate.kind !== "hammer") continue;
    const at = impactTimeOf(candidate, timeline);
    if (at > time) break;
    hp.A = candidate.hpAfter.A;
    hp.B = candidate.hpAfter.B;
    lastImpact = { cue: candidate, at, target: damageTarget(candidate), damage: candidate.damage };
  }

  const statuses: Record<Slot, FighterStatus[]> = { A: [], B: [] };
  for (const status of timeline.statusCues) {
    if (status.t > time) break;
    const list = statuses[status.target];
    const index = list.indexOf(status.status);
    if (status.on && index < 0) list.push(status.status);
    if (!status.on && index >= 0) list.splice(index, 1);
  }
  for (const slot of ["A", "B"] as const) {
    statuses[slot] = STATUS_ORDER.filter((status) => statuses[slot].includes(status));
  }

  const airedTurns = timeline.turns.filter((candidate) => candidate.impactAt <= time).map((candidate) => candidate.turn);

  const suddenDeath = timeline.suddenDeathAt !== null && time >= timeline.suddenDeathAt;
  const outcomeCue = latest(timeline.cues, time, (cue): cue is OutcomeCue => cue.kind === "outcome");
  const suddenDeathCue = latest(timeline.cues, time, (cue): cue is SuddenDeathCue => cue.kind === "sudden_death");
  const finisherCue = latest(timeline.cues, time, (cue): cue is FinisherCue => cue.kind === "finisher");
  const winnerCue = latest(timeline.cues, time, (cue): cue is WinnerCue => cue.kind === "winner");

  const spotlight: Slot | null = turnWindow
    ? turnWindow.cue.shooter
    : finisherCue
      ? finisherCue.winner
      : null;

  return {
    timeMs: time,
    cue,
    beat,
    turn,
    turnNumber: turnWindow?.turn ?? 0,
    round,
    roundCue,
    hp,
    statuses,
    airedTurns,
    lastImpact,
    timeOfDay: timeOfDayFor(round, suddenDeath),
    fog: suddenDeath || round === 2,
    spotlight,
    suddenDeath,
    suddenDeathCue,
    outcomeCue,
    finisherCue,
    winnerCue,
  };
}

function latest<T extends Cue>(cues: readonly Cue[], timeMs: number, predicate: (cue: Cue) => cue is T): T | null {
  let found: T | null = null;
  for (const cue of cues) {
    if (cue.t > timeMs) break;
    if (predicate(cue)) found = cue;
  }
  return found;
}

export interface Receipt {
  turn: number;
  actor: Slot;
  move: ShotCue["move"];
  criterion: CriterionId;
  headline: string;
  evidence: ShotCue["evidence"];
  verdictLine: string;
  outcome: ShotOutcome;
  damage: number;
  target: Slot;
  hpAfter: Record<Slot, number>;
}

export function receiptFor(turn: TurnWindow): Receipt {
  return {
    turn: turn.turn,
    actor: turn.cue.shooter,
    move: turn.cue.move,
    criterion: turn.cue.criterion,
    headline: turn.cue.headline,
    evidence: turn.cue.evidence,
    verdictLine: turn.cue.verdictLine,
    outcome: turn.cue.outcome,
    damage: turn.cue.damage,
    target: damageTarget(turn.cue),
    hpAfter: turn.cue.hpAfter,
  };
}

export function receiptsAt(timeline: ArenaTimeline, timeMs: number): Receipt[] {
  return timeline.turns.filter((turn) => turn.impactAt <= timeMs).map(receiptFor);
}

export function turnStartMs(timeline: ArenaTimeline, turn: number): number {
  return timeline.turnByNumber.get(turn)?.startMs ?? 0;
}

export function stateAtTurn(timeline: ArenaTimeline, turn: number): ArenaState {
  return stateAt(timeline, turnStartMs(timeline, turn));
}

export function nextTurnAfter(timeline: ArenaTimeline, timeMs: number): TurnWindow | null {
  return timeline.turns.find((turn) => turn.startMs > timeMs + 1) ?? null;
}

export function previousTurnBefore(timeline: ArenaTimeline, timeMs: number): TurnWindow | null {
  let found: TurnWindow | null = null;
  for (const turn of timeline.turns) {
    if (turn.startMs >= timeMs - 1) break;
    found = turn;
  }
  return found;
}

export function advancePlayback(input: {
  positionMs: number;
  dtMs: number;
  speed: 1 | 2 | 4;
  durationMs: number;
}): number {
  return clamp(input.positionMs + input.dtMs * input.speed, 0, input.durationMs);
}

export function phaseKey(state: ArenaState): string {
  if (!state.turn) return state.beat?.id ?? "cold";
  return `${state.turn.window.cue.id}:${state.turn.phase}`;
}

export function isFinished(timeline: ArenaTimeline, timeMs: number): boolean {
  return timeline.winnerAt !== null && timeMs >= timeline.winnerAt + 1;
}

export function phaseFor(turn: TurnWindow, phase: TurnPhase): PhaseWindow | null {
  return turn.phases.find((candidate) => candidate.phase === phase) ?? null;
}
