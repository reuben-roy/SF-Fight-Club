import { describe, expect, it } from "vitest";

import type { OrgNode } from "@sf-fight-club/schemas";

import { diffOrgCharts, nextMeetings } from "../src/tower/diff.js";
import { DEMO_FIXTURE } from "../src/tower/fixtures/index.js";
import {
  chartAt,
  matchesAt,
  totalSteps,
  tournamentFromFixture,
} from "../src/tower/fixtures/tournament.js";

const DATA = tournamentFromFixture(DEMO_FIXTURE);
const STEPS = totalSteps(DATA);

describe("diffOrgCharts", () => {
  it("reports one acquisition and one promotion per completed fight", () => {
    expect(STEPS).toBe(7);
    for (let step = 1; step <= STEPS; step += 1) {
      const result = DATA.results[step - 1];
      if (!result) throw new Error(`no result at step ${step}`);
      const diff = diffOrgCharts({ previous: chartAt(DATA, step - 1), next: chartAt(DATA, step) });
      expect(diff.changed).toBe(true);
      expect(diff.acquisitions).toHaveLength(1);
      expect(diff.promotions).toHaveLength(1);

      const acquisition = diff.acquisitions[0];
      if (!acquisition) throw new Error("no acquisition");
      expect(acquisition.winnerId).toBe(result.winnerId);
      expect(acquisition.loserId).toBe(result.winnerId === result.entrantA ? result.entrantB : result.entrantA);
      expect(acquisition.via).toBe("FIGHT");

      const promotion = diff.promotions[0];
      if (!promotion) throw new Error("no promotion");
      expect(promotion.entrantId).toBe(result.winnerId);
      expect(promotion.to).not.toBe(promotion.from);

      const winner = diff.headcounts.find((change) => change.entrantId === result.winnerId);
      expect(winner).toBeDefined();
      expect(winner?.to).toBe((winner?.from ?? 0) + acquisition.subtreeIds.length);
    }
  });

  it("reports nothing for an unchanged chart", () => {
    const chart = chartAt(DATA, 4);
    const diff = diffOrgCharts({ previous: chart, next: structuredClone(chart) });
    expect(diff.changed).toBe(false);
    expect(diff.acquisitions).toEqual([]);
    expect(diff.promotions).toEqual([]);
    expect(diff.headcounts).toEqual([]);
  });

  it("carries the loser's whole subtree with the acquisition", () => {
    const before = chartAt(DATA, 4);
    const diff = diffOrgCharts({ previous: before, next: chartAt(DATA, 5) });
    const acquisition = diff.acquisitions[0];
    if (!acquisition) throw new Error("no acquisition");

    const find = (entrantId: string): OrgNode | null => {
      let found: OrgNode | null = null;
      const walk = (node: OrgNode): void => {
        if (found) return;
        if (node.entrantId === entrantId) {
          found = node;
          return;
        }
        node.reports.forEach(walk);
      };
      before.roots.forEach(walk);
      return found;
    };
    const loser = find(acquisition.loserId);
    if (!loser) throw new Error("loser is not in the previous chart");
    expect(acquisition.subtreeIds[0]).toBe(acquisition.loserId);
    expect(acquisition.subtreeIds).toHaveLength(loser.headcount);
    expect(acquisition.subtreeIds).toEqual(expect.arrayContaining([acquisition.loserId, "paperroute"]));
  });
});

describe("nextMeetings", () => {
  it("finds the match that is about to be played at every step", () => {
    for (let step = 0; step < STEPS; step += 1) {
      const result = DATA.results[step];
      if (!result) throw new Error(`no result at step ${step}`);
      const meetings = nextMeetings({ chart: chartAt(DATA, step), matches: matchesAt(DATA, step) });
      const match = meetings.find((meeting) => meeting.matchId === result.matchId);
      expect(match, `step ${step} should offer ${result.matchId}`).toBeDefined();
      expect(match?.leftId).toBe(result.entrantA);
      expect(match?.rightId).toBe(result.entrantB);
      expect(match?.status).not.toBe("complete");
    }
  });

  it("joins only adjacent roots with both sides known", () => {
    const expectedCounts = [4, 3, 3, 2, 2, 1, 1, 0];
    for (let step = 0; step <= STEPS; step += 1) {
      const chart = chartAt(DATA, step);
      const matches = matchesAt(DATA, step);
      const meetings = nextMeetings({ chart, matches });
      expect(meetings.length, `step ${step}`).toBe(expectedCounts[step]);

      const seen = new Set<string>();
      for (const meeting of meetings) {
        expect(seen.has(meeting.matchId)).toBe(false);
        seen.add(meeting.matchId);
        const leftIndex = chart.roots.findIndex((root) => root.entrantId === meeting.leftId);
        expect(leftIndex).toBe(meeting.leftIndex);
        expect(chart.roots[leftIndex + 1]?.entrantId).toBe(meeting.rightId);
        const match = matches.find((candidate) => candidate.matchId === meeting.matchId);
        expect(match?.a).toBe(meeting.leftId);
        expect(match?.b).toBe(meeting.rightId);
        expect(match?.status).not.toBe("complete");
      }
    }
  });
});
