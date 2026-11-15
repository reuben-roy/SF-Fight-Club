import { describe, expect, it } from "vitest";

import { DEMO_BUNDLE } from "../src/data/generated/demo.js";
import {
  initialAppState,
  reduceAppState,
  selectArena,
  selectFighterCard,
  selectFilm,
  selectMatchView,
  selectTowerProps,
  type AppState,
} from "../src/data/store.js";

const bundle = DEMO_BUNDLE;
const noop = (): void => undefined;

function liveState(matchId: string): AppState {
  let state = initialAppState(bundle);
  state = reduceAppState(state, { type: "ring_bell", matchId }, bundle);
  return reduceAppState(state, { type: "ring_bell", matchId }, bundle);
}

function openerId(slot: number): string {
  const match = bundle.matches.find((m) => m.roundIndex === 0 && m.slotIndex === slot);
  if (!match) throw new Error(`no quarterfinal slot ${slot}`);
  return match.matchId;
}

describe("sealing", () => {
  it("hides the arena script until the match is live", () => {
    const matchId = openerId(0);
    const scheduledView = selectMatchView(initialAppState(bundle), bundle, matchId);
    expect(scheduledView?.script).toBeNull();
    expect(selectArena(initialAppState(bundle), bundle, matchId)).toEqual({ sealed: true, props: null });

    let locked = reduceAppState(initialAppState(bundle), { type: "ring_bell", matchId }, bundle);
    expect(selectArena(locked, bundle, matchId)).toEqual({ sealed: true, props: null });
    expect(selectMatchView(locked, bundle, matchId)?.script).toBeNull();

    locked = reduceAppState(locked, { type: "ring_bell", matchId }, bundle);
    const liveArena = selectArena(locked, bundle, matchId);
    expect(liveArena.sealed).toBe(false);
    expect(liveArena.props?.script.cues.length).toBeGreaterThan(0);
    expect(selectMatchView(locked, bundle, matchId)?.script).not.toBeNull();
    expect(selectMatchView(locked, bundle, matchId)?.resolution).toBeNull();
  });

  it("reveals resolution and report only on completion", () => {
    const matchId = openerId(0);
    let state = liveState(matchId);
    expect(selectMatchView(state, bundle, matchId)?.resolution).toBeNull();
    expect(selectFilm(state, bundle, matchId)?.sealed).toBe(true);
    expect(selectFilm(state, bundle, matchId)?.script).toBeNull();
    state = reduceAppState(state, { type: "finish", matchId }, bundle);
    const view = selectMatchView(state, bundle, matchId);
    expect(view?.resolution).not.toBeNull();
    expect(view?.report).not.toBeNull();
    expect(view?.winnerId).toBe(bundle.matches.find((m) => m.matchId === matchId)?.winnerId);
    const film = selectFilm(state, bundle, matchId);
    expect(film?.sealed).toBe(false);
    expect(film?.script?.cues.length).toBeGreaterThan(0);
  });

  it("never leaks an unplayed winner through the tower", () => {
    const props = selectTowerProps(initialAppState(bundle), bundle, { onOpenMatch: noop, onOpenCard: noop });
    expect(props.chart.championId).toBeNull();
    const final = props.matches.find((m) => m.roundIndex === 2);
    expect(final?.a).toBeNull();
    expect(final?.b).toBeNull();
  });

  it("returns null for unknown matches", () => {
    const state = initialAppState(bundle);
    expect(selectMatchView(state, bundle, "demo-r9s9")).toBeNull();
    expect(selectFilm(state, bundle, "demo-r9s9")).toBeNull();
    expect(selectArena(state, bundle, "demo-r9s9")).toEqual({ sealed: true, props: null });
  });
});

describe("selectTowerProps", () => {
  it("builds committed props for every match and entrant", () => {
    const props = selectTowerProps(initialAppState(bundle), bundle, { onOpenMatch: noop, onOpenCard: noop });
    expect(props.matches).toHaveLength(7);
    expect(Object.keys(props.entrants)).toHaveLength(8);
    expect(props.previousChart).toBeUndefined();
    const openers = props.matches.filter((m) => m.roundIndex === 0);
    for (const match of openers) {
      expect(match.a).not.toBeNull();
      expect(match.b).not.toBeNull();
      expect(match.status).toBe("betting_open");
    }
  });

  it("fills semifinal sides once feeders complete", () => {
    let state = initialAppState(bundle);
    state = reduceAppState(state, { type: "ring_bell", matchId: openerId(0) }, bundle);
    state = reduceAppState(state, { type: "ring_bell", matchId: openerId(0) }, bundle);
    state = reduceAppState(state, { type: "finish", matchId: openerId(0) }, bundle);
    state = reduceAppState(state, { type: "ring_bell", matchId: openerId(1) }, bundle);
    state = reduceAppState(state, { type: "ring_bell", matchId: openerId(1) }, bundle);
    state = reduceAppState(state, { type: "finish", matchId: openerId(1) }, bundle);
    const props = selectTowerProps(state, bundle, { onOpenMatch: noop, onOpenCard: noop });
    const semi = props.matches.find((m) => m.roundIndex === 1 && m.slotIndex === 0);
    expect(semi?.a).toBe("permitpilot");
    expect(semi?.b).toBe("tabclear");
    expect(props.previousChart).toBeDefined();
  });
});

describe("selectFighterCard", () => {
  it("builds committed card props with the live title", () => {
    const card = selectFighterCard(initialAppState(bundle), bundle, "permitpilot");
    expect(card?.title).toBe("Director");
    expect(card?.seed).toBe(1);
    expect(card?.tier).toBe("A");
    expect(card?.buildHash).toBe(bundle.buildHash);
    expect(card?.profile.entrantId).toBe("permitpilot");
  });

  it("returns null for unknown entrants", () => {
    expect(selectFighterCard(initialAppState(bundle), bundle, "nope")).toBeNull();
  });
});
