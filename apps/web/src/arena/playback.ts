import { turnStartMs, type ArenaTimeline } from "./timeline.js";

export type Speed = 1 | 2 | 4;

export const SPEEDS: readonly Speed[] = [1, 2, 4];

export interface PlaybackState {
  positionMs: number;
  playing: boolean;
  completed: boolean;
}

export const PLAYBACK_START: PlaybackState = { positionMs: 0, playing: true, completed: false };

export function isSpeed(value: number): value is Speed {
  return value === 1 || value === 2 || value === 4;
}

export function play(state: PlaybackState): PlaybackState {
  if (state.completed) return { positionMs: 0, playing: true, completed: false };
  return { ...state, playing: true };
}

export function pause(state: PlaybackState): PlaybackState {
  return { ...state, playing: false };
}

export function togglePlay(state: PlaybackState): PlaybackState {
  return state.playing ? pause(state) : play(state);
}

export function restart(state: PlaybackState): PlaybackState {
  return { positionMs: 0, playing: true, completed: false };
}

export function tick(state: PlaybackState, input: { dtMs: number; durationMs: number; speed: Speed }): PlaybackState {
  if (!state.playing || state.completed) return state;
  const positionMs = Math.min(input.durationMs, state.positionMs + Math.max(0, input.dtMs) * input.speed);
  if (positionMs >= input.durationMs) {
    return { positionMs: input.durationMs, playing: false, completed: true };
  }
  return { ...state, positionMs };
}

export function seek(state: PlaybackState, input: { positionMs: number; durationMs: number }): PlaybackState {
  const positionMs = Math.max(0, Math.min(input.durationMs, input.positionMs));
  return { positionMs, playing: state.playing, completed: positionMs >= input.durationMs };
}

export function jumpToTurn(state: PlaybackState, input: { timeline: ArenaTimeline; turn: number }): PlaybackState {
  return seek(state, {
    positionMs: turnStartMs(input.timeline, input.turn),
    durationMs: input.timeline.durationMs,
  });
}

export function jumpToMs(state: PlaybackState, input: { timeline: ArenaTimeline; timeMs: number }): PlaybackState {
  return seek(state, { positionMs: input.timeMs, durationMs: input.timeline.durationMs });
}

export function nextTurn(state: PlaybackState, input: { timeline: ArenaTimeline }): PlaybackState {
  const next = input.timeline.turns.find((turn) => turn.startMs > state.positionMs + 1);
  if (!next) return seek(state, { positionMs: input.timeline.durationMs, durationMs: input.timeline.durationMs });
  return seek(state, { positionMs: next.startMs, durationMs: input.timeline.durationMs });
}

export function previousTurn(state: PlaybackState, input: { timeline: ArenaTimeline }): PlaybackState {
  const earlier = input.timeline.turns.filter((turn) => turn.startMs < state.positionMs - 400);
  const target = earlier[earlier.length - 1];
  if (!target) return seek(state, { positionMs: 0, durationMs: input.timeline.durationMs });
  return seek(state, { positionMs: target.startMs, durationMs: input.timeline.durationMs });
}
