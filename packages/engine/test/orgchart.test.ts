import type { OrgChart, OrgNode } from "@sf-fight-club/schemas";
import { describe, expect, it } from "vitest";

import {
  buildOrgChart,
  rngFromSeed,
  seedBracket,
  type Bracket,
  type BracketSide,
  type SlotResolution,
} from "../src/index.js";

function entrants(ids: readonly string[]): { id: string; weighinTotal: number }[] {
  return ids.map((id, index) => ({ id, weighinTotal: 100 - index }));
}

function complete(roundIndex: number, slotIndex: number, winnerId: string): SlotResolution {
  return { kind: "COMPLETE", roundIndex, slotIndex, winnerId, bets: "settled", pastResultStands: true };
}

function allNodes(chart: OrgChart): OrgNode[] {
  const out: OrgNode[] = [];
  const visit = (node: OrgNode): void => {
    out.push(node);
    for (const report of node.reports) visit(report);
  };
  for (const root of chart.roots) visit(root);
  return out;
}

describe("buildOrgChart units", () => {
  it("advances a bye one rung and adds no report", () => {
    const bracket = seedBracket(entrants(["a", "b", "c"]), { mode: "weighin", seed: "bye-seed" });
    const bye = bracket.matches.find((match) => match.bye);
    expect(bye?.winnerId).toBe("a");
    const winnerId = bye?.winnerId ?? "";
    const resolutions: SlotResolution[] = bracket.matches.map((match) =>
      match.bye
        ? { kind: "BYE", roundIndex: match.roundIndex, slotIndex: match.slotIndex, winnerId, bets: "none", air: false }
        : { kind: "PENDING", roundIndex: match.roundIndex, slotIndex: match.slotIndex, bets: "pending" },
    );
    const chart = buildOrgChart({ bracket, resolutions });
    expect(chart.rounds).toBe(2);
    expect(chart.championId).toBeNull();
    const winner = chart.roots.find((root) => root.entrantId === winnerId);
    expect(winner?.title).toBe("President");
    expect(winner?.reports).toEqual([]);
    expect(winner?.wins).toBe(0);
    expect(winner?.headcount).toBe(1);
  });

  it("lists a walkover absentee as a report and keeps its subtree", () => {
    const bracket = seedBracket(entrants(["a", "b", "c", "d"]), { mode: "weighin", seed: "walk-seed" });
    const chart = buildOrgChart({
      bracket,
      resolutions: [
        complete(0, 0, "a"),
        complete(0, 1, "c"),
        { kind: "WALKOVER", roundIndex: 1, slotIndex: 0, winnerId: "a", absentId: "c", bets: "void", air: false, reason: "withdrawal", pastSealedDiscarded: false },
      ],
    });
    expect(chart.championId).toBeNull();
    expect(chart.roots.map((root) => root.entrantId)).toEqual(["a"]);
    const winner = chart.roots[0]!;
    expect(winner.title).toBe("CEO");
    expect(winner.wins).toBe(1);
    expect(winner.headcount).toBe(4);
    expect(winner.reports.map((report) => report.entrantId)).toEqual(["c", "d"]);
    const absent = winner.reports[0]!;
    expect(absent.via).toBe("WALKOVER");
    expect(absent.defeatedBy).toBe("a");
    expect(absent.defeatedInRound).toBe(1);
    expect(absent.title).toBe("President");
    expect(absent.reports.map((report) => report.entrantId)).toEqual(["b"]);
  });

  it("ends an 8-entrant field with the CEO over a President, a VP and a Director", () => {
    const bracket = seedBracket(entrants(["e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8"]), {
      mode: "weighin",
      seed: "tower-seed",
    });
    const chart = buildOrgChart({
      bracket,
      resolutions: [
        complete(0, 0, "e1"),
        complete(0, 1, "e4"),
        complete(0, 2, "e2"),
        complete(0, 3, "e6"),
        complete(1, 0, "e1"),
        complete(1, 1, "e6"),
        complete(2, 0, "e1"),
      ],
    });
    expect(chart.rounds).toBe(3);
    expect(chart.championId).toBe("e1");
    expect(chart.roots.map((root) => root.entrantId)).toEqual(["e1"]);
    const champion = chart.roots[0]!;
    expect(champion.title).toBe("CEO");
    expect(champion.wins).toBe(3);
    expect(champion.headcount).toBe(8);
    expect(champion.reports.map((report) => [report.entrantId, report.title] as const)).toEqual([
      ["e6", "President"],
      ["e4", "VP"],
      ["e8", "Director"],
    ]);
  });
});

describe("buildOrgChart properties", () => {
  it("holds across field sizes 2 to 64 with random results", () => {
    for (let size = 2; size <= 64; size += 1) {
      for (let trial = 0; trial < 3; trial += 1) {
        const rng = rngFromSeed(`orgchart-${size}-${trial}`);
        const { bracket, resolutions } = randomTournament(size, rng);
        const chart = buildOrgChart({ bracket, resolutions });
        checkShape(bracket, chart);
        checkChampion(bracket, resolutions, chart);
        checkSealedInvisible(bracket, resolutions, chart);
      }
    }
  });
});

function checkShape(bracket: Bracket, chart: OrgChart): void {
  const nodes = allNodes(chart);
  const ids = nodes.map((node) => node.entrantId);
  expect(new Set(ids).size).toBe(bracket.fieldSize);
  for (const entrant of bracket.entrants) {
    expect(ids).toContain(entrant.id);
  }
  const headcount = chart.roots.reduce((sum, root) => sum + root.headcount, 0);
  expect(headcount).toBe(bracket.fieldSize);
  for (const node of nodes) {
    expect(node.wins).toBe(node.reports.filter((report) => report.via === "FIGHT").length);
    expect(node.headcount).toBe(1 + node.reports.reduce((sum, report) => sum + report.headcount, 0));
  }
}

function checkChampion(bracket: Bracket, resolutions: readonly SlotResolution[], chart: OrgChart): void {
  let lastRound = -1;
  for (const match of bracket.matches) {
    if (match.roundIndex > lastRound) lastRound = match.roundIndex;
  }
  const fin = resolutions.find((resolution) => resolution.roundIndex === lastRound && resolution.slotIndex === 0);
  if (fin && fin.kind === "COMPLETE") {
    expect(chart.championId).toBe(fin.winnerId);
    const champion = chart.roots.find((root) => root.entrantId === fin.winnerId)!;
    expect(champion.title).toBe("CEO");
  } else {
    expect(chart.championId).toBeNull();
  }
}

function checkSealedInvisible(bracket: Bracket, resolutions: readonly SlotResolution[], chart: OrgChart): void {
  const changed: SlotResolution[] = resolutions.map((resolution) => {
    if (resolution.kind === "SEALED") return { ...resolution, winnerId: "ghost-entrant" };
    if (resolution.kind === "PENDING") {
      return { kind: "SEALED", roundIndex: resolution.roundIndex, slotIndex: resolution.slotIndex, winnerId: "ghost-entrant", bets: "locked", air: false };
    }
    return resolution;
  });
  expect(buildOrgChart({ bracket, resolutions: changed })).toEqual(chart);
}

interface RandomTournament {
  bracket: Bracket;
  resolutions: SlotResolution[];
}

function randomTournament(size: number, rng: () => number): RandomTournament {
  const ids = Array.from({ length: size }, (_, index) => `e${index + 1}`);
  const bracket = seedBracket(
    ids.map((id) => ({ id, weighinTotal: Math.floor(rng() * 100) })),
    { mode: "random", seed: `field-${size}` },
  );
  const withdrawn = new Set(ids.filter((id) => rng() < 0.1));
  const winners = new Map<string, string>();
  const resolutions: SlotResolution[] = [];
  let lastRound = 0;
  for (const match of bracket.matches) {
    if (match.roundIndex > lastRound) lastRound = match.roundIndex;
  }

  for (let roundIndex = 0; roundIndex <= lastRound; roundIndex += 1) {
    const slots = bracket.matches
      .filter((match) => match.roundIndex === roundIndex)
      .sort((left, right) => left.slotIndex - right.slotIndex);
    for (const match of slots) {
      const left = participant(match.a);
      const right = participant(match.b);
      if (match.bye) {
        const fighter = left ?? right;
        if (fighter !== null && !withdrawn.has(fighter)) {
          resolutions.push({ kind: "BYE", roundIndex, slotIndex: match.slotIndex, winnerId: fighter, bets: "none", air: false });
          winners.set(`${roundIndex}:${match.slotIndex}`, fighter);
        } else {
          resolutions.push({ kind: "VOID", roundIndex, slotIndex: match.slotIndex, bets: "none", air: false, reason: "bye_fighter_absent" });
        }
        continue;
      }
      if (left === null || right === null) {
        resolutions.push({ kind: "PENDING", roundIndex, slotIndex: match.slotIndex, bets: "pending" });
        continue;
      }
      const leftIn = !withdrawn.has(left);
      const rightIn = !withdrawn.has(right);
      if (!leftIn && !rightIn) {
        resolutions.push({ kind: "VOID", roundIndex, slotIndex: match.slotIndex, bets: "none", air: false, reason: "both_absent" });
        continue;
      }
      if (leftIn !== rightIn) {
        const winner = leftIn ? left : right;
        const absent = leftIn ? right : left;
        resolutions.push({ kind: "WALKOVER", roundIndex, slotIndex: match.slotIndex, winnerId: winner, absentId: absent, bets: "void", air: false, reason: "withdrawal", pastSealedDiscarded: false });
        winners.set(`${roundIndex}:${match.slotIndex}`, winner);
        continue;
      }
      const roll = rng();
      if (roll < 0.55) {
        const winner = rng() < 0.5 ? left : right;
        resolutions.push(complete(roundIndex, match.slotIndex, winner));
        winners.set(`${roundIndex}:${match.slotIndex}`, winner);
      } else if (roll < 0.8) {
        resolutions.push({ kind: "SEALED", roundIndex, slotIndex: match.slotIndex, winnerId: rng() < 0.5 ? left : right, bets: "locked", air: false });
      } else {
        resolutions.push({ kind: "PENDING", roundIndex, slotIndex: match.slotIndex, bets: "pending" });
      }
    }
  }
  return { bracket, resolutions };

  function participant(side: BracketSide): string | null {
    switch (side.kind) {
      case "fighter":
        return side.id;
      case "bye":
        return null;
      case "winner_of":
        return winners.get(`${side.roundIndex}:${side.slotIndex}`) ?? null;
    }
  }
}
