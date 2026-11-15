import { describe, expect, it } from "vitest";

import { computePool } from "../src/bets/odds.js";
import { DEMO_BUNDLE } from "../src/data/generated/demo.js";
import {
  bundleMatchById,
  crewOf,
  initialAppState,
  isAvailable,
  reduceAppState,
  selectOrgCharts,
  sidesOf,
  titleOf,
  type AppState,
} from "../src/data/store.js";

const bundle = DEMO_BUNDLE;

function openers(): AppState {
  return initialAppState(bundle);
}

/** Ring twice then finish: the full arc of one match. */
function playMatch(state: AppState, matchId: string): AppState {
  let next = reduceAppState(state, { type: "ring_bell", matchId }, bundle);
  next = reduceAppState(next, { type: "ring_bell", matchId }, bundle);
  return reduceAppState(next, { type: "finish", matchId }, bundle);
}

function quarterId(slot: number): string {
  const match = bundle.matches.find((m) => m.roundIndex === 0 && m.slotIndex === slot);
  if (!match) throw new Error(`no quarterfinal slot ${slot}`);
  return match.matchId;
}

describe("initialAppState", () => {
  it("opens betting on openers and schedules the rest", () => {
    const state = openers();
    for (const match of bundle.matches) {
      expect(state.statuses[match.matchId]).toBe(match.roundIndex === 0 ? "betting_open" : "scheduled");
    }
    expect(state.wallet).toBe(1000);
    expect(state.bets).toEqual([]);
  });
});

describe("open_betting", () => {
  it("opens an available scheduled match", () => {
    let state = openers();
    state = playMatch(state, quarterId(0));
    state = playMatch(state, quarterId(1));
    const semi = bundle.matches.find((m) => m.roundIndex === 1 && m.slotIndex === 0);
    if (!semi) throw new Error("no semifinal");
    expect(isAvailable(state, bundle, semi.matchId)).toBe(true);
    const next = reduceAppState(state, { type: "open_betting", matchId: semi.matchId }, bundle);
    expect(next.statuses[semi.matchId]).toBe("betting_open");
  });

  it("refuses a match whose feeders are unplayed", () => {
    const state = openers();
    const semi = bundle.matches.find((m) => m.roundIndex === 1 && m.slotIndex === 0);
    if (!semi) throw new Error("no semifinal");
    expect(isAvailable(state, bundle, semi.matchId)).toBe(false);
    const next = reduceAppState(state, { type: "open_betting", matchId: semi.matchId }, bundle);
    expect(next).toBe(state);
  });

  it("refuses a match that is already open", () => {
    const state = openers();
    const next = reduceAppState(state, { type: "open_betting", matchId: quarterId(0) }, bundle);
    expect(next).toBe(state);
  });
});

describe("place_bet", () => {
  it("takes the stake out of the wallet", () => {
    const state = openers();
    const matchId = quarterId(0);
    const sides = sidesOf(state, bundle, matchId);
    if (!sides.a) throw new Error("no side A");
    const next = reduceAppState(state, { type: "place_bet", matchId, entrantId: sides.a, stake: 100 }, bundle);
    expect(next.wallet).toBe(900);
    expect(next.bets).toHaveLength(1);
  });

  it("rejects bets after the bell locks them", () => {
    let state = openers();
    const matchId = quarterId(0);
    state = reduceAppState(state, { type: "ring_bell", matchId }, bundle);
    expect(state.statuses[matchId]).toBe("locked");
    const sides = sidesOf(state, bundle, matchId);
    if (!sides.a) throw new Error("no side A");
    const next = reduceAppState(state, { type: "place_bet", matchId, entrantId: sides.a, stake: 100 }, bundle);
    expect(next).toBe(state);
  });

  it("rejects unknown sides and unaffordable stakes", () => {
    const state = openers();
    const matchId = quarterId(0);
    expect(reduceAppState(state, { type: "place_bet", matchId, entrantId: "nope", stake: 10 }, bundle)).toBe(state);
    const sides = sidesOf(state, bundle, matchId);
    if (!sides.a) throw new Error("no side A");
    expect(reduceAppState(state, { type: "place_bet", matchId, entrantId: sides.a, stake: 1001 }, bundle)).toBe(state);
    expect(reduceAppState(state, { type: "place_bet", matchId, entrantId: sides.a, stake: 0 }, bundle)).toBe(state);
  });
});

describe("ring_bell", () => {
  it("locks bets on the first bell and starts the fight on the second", () => {
    let state = openers();
    const matchId = quarterId(0);
    state = reduceAppState(state, { type: "ring_bell", matchId }, bundle);
    expect(state.statuses[matchId]).toBe("locked");
    state = reduceAppState(state, { type: "ring_bell", matchId }, bundle);
    expect(state.statuses[matchId]).toBe("live");
  });

  it("does nothing to scheduled or complete matches", () => {
    const state = openers();
    const semi = bundle.matches.find((m) => m.roundIndex === 1 && m.slotIndex === 0);
    if (!semi) throw new Error("no semifinal");
    expect(reduceAppState(state, { type: "ring_bell", matchId: semi.matchId }, bundle)).toBe(state);
  });
});

describe("finish", () => {
  it("settles winning bets into the wallet", () => {
    let state = openers();
    const matchId = quarterId(0);
    const match = bundleMatchById(bundle, matchId);
    if (!match) throw new Error("no match");
    state = reduceAppState(state, { type: "place_bet", matchId, entrantId: match.winnerId, stake: 100 }, bundle);
    state = reduceAppState(state, { type: "ring_bell", matchId }, bundle);
    state = reduceAppState(state, { type: "ring_bell", matchId }, bundle);
    state = reduceAppState(state, { type: "finish", matchId }, bundle);
    expect(state.statuses[matchId]).toBe("complete");
    expect(state.wallet).toBeGreaterThan(900);
  });

  it("forfeits losing stakes", () => {
    let state = openers();
    const matchId = quarterId(0);
    const match = bundleMatchById(bundle, matchId);
    if (!match) throw new Error("no match");
    const loser = match.winnerId === match.entrantA ? match.entrantB : match.entrantA;
    state = reduceAppState(state, { type: "place_bet", matchId, entrantId: match.winnerId, stake: 10 }, bundle);
    state = reduceAppState(state, { type: "place_bet", matchId, entrantId: loser, stake: 100 }, bundle);
    expect(state.wallet).toBe(890);
    state = playMatch(state, matchId);
    const entrantA = bundle.entrants.find((e) => e.id === match.entrantA);
    const entrantB = bundle.entrants.find((e) => e.id === match.entrantB);
    if (!entrantA || !entrantB) throw new Error("no entrants");
    const pool = computePool(
      match.winnerId === match.entrantA ? 10 : 100,
      match.winnerId === match.entrantA ? 100 : 10,
      entrantA.weighinTotal,
      entrantB.weighinTotal,
    );
    const winnerPool = match.winnerId === match.entrantA ? pool.poolA : pool.poolB;
    const expectedPayout = Math.floor((10 * pool.poolTotal) / winnerPool);
    expect(state.wallet).toBe(890 + expectedPayout);
    expect(expectedPayout).toBeGreaterThan(0);
  });

  it("refuses to finish a match that never went live", () => {
    const state = openers();
    expect(reduceAppState(state, { type: "finish", matchId: quarterId(0) }, bundle)).toBe(state);
  });
});

describe("mark_turn", () => {
  it("tracks progress only while live", () => {
    let state = openers();
    const matchId = quarterId(0);
    expect(reduceAppState(state, { type: "mark_turn", matchId, turn: 3 }, bundle)).toBe(state);
    state = reduceAppState(state, { type: "ring_bell", matchId }, bundle);
    state = reduceAppState(state, { type: "ring_bell", matchId }, bundle);
    state = reduceAppState(state, { type: "mark_turn", matchId, turn: 3 }, bundle);
    expect(state.turnsSeen[matchId]).toBe(3);
    expect(reduceAppState(state, { type: "mark_turn", matchId, turn: 2 }, bundle)).toBe(state);
  });
});

describe("reset", () => {
  it("restores the opening bell", () => {
    let state = playMatch(openers(), quarterId(0));
    state = reduceAppState(state, { type: "reset" }, bundle);
    expect(state).toEqual(initialAppState(bundle));
  });
});

describe("org chart over complete matches", () => {
  it("crowns PermitPilot CEO after the full tournament", () => {
    let state = openers();
    for (const match of bundle.matches.filter((m) => m.roundIndex === 0)) {
      state = playMatch(state, match.matchId);
    }
    for (const match of bundle.matches.filter((m) => m.roundIndex === 1)) {
      state = reduceAppState(state, { type: "open_betting", matchId: match.matchId }, bundle);
      state = playMatch(state, match.matchId);
    }
    const final = bundle.matches.find((m) => m.roundIndex === 2 && m.slotIndex === 0);
    if (!final) throw new Error("no final");
    state = reduceAppState(state, { type: "open_betting", matchId: final.matchId }, bundle);
    state = playMatch(state, final.matchId);
    const { chart, previousChart } = selectOrgCharts(state, bundle);
    expect(chart.championId).toBe("permitpilot");
    expect(titleOf(chart, "permitpilot")).toBe("CEO");
    expect(previousChart?.championId).toBeNull();
  });

  it("only counts complete matches, one rung per win", () => {
    let state = playMatch(openers(), quarterId(0));
    const { chart } = selectOrgCharts(state, bundle);
    expect(titleOf(chart, "permitpilot")).toBe("VP");
    expect(titleOf(chart, "dermalens")).toBe("Director");
    expect(chart.championId).toBeNull();
  });
});

describe("crewOf", () => {
  it("gathers every founder the champion absorbed", () => {
    const crew = crewOf(bundle, "permitpilot");
    const handles = new Set(crew.map((member) => member.handle));
    for (const profile of Object.values(bundle.profiles)) {
      for (const founder of profile.founders) {
        expect(handles.has(founder.xHandle ?? founder.hnUser ?? founder.name)).toBe(true);
      }
    }
    expect(crew.length).toBe(14);
  });

  it("starts with just the entrant's own founders", () => {
    const crew = crewOf(bundle, "fogcast");
    expect(crew).toHaveLength(2);
    expect(new Set(crew.map((member) => member.from))).toEqual(new Set(["fogcast"]));
  });
});
