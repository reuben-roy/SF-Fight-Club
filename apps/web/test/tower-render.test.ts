import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AppProviders } from "../src/styles/app-state.js";
import { BracketView, bracketWinner } from "../src/tower/BracketView.js";
import { TowerScreen } from "../src/tower/TowerScreen.js";
import { DEMO_FIXTURE } from "../src/tower/fixtures/index.js";
import { chartAt, matchesAt, tournamentFromFixture } from "../src/tower/fixtures/tournament.js";
import type { OrgNode } from "@sf-fight-club/schemas";

const DATA = tournamentFromFixture(DEMO_FIXTURE);
const CHART = chartAt(DATA, 0);
const SEALED = matchesAt(DATA, 0).map((match) =>
  match.status === "betting_open" ? { ...match, status: "locked" as const } : match,
);
const SEEDS: Record<string, number> = {};
const collect = (node: OrgNode): void => {
  SEEDS[node.entrantId] = node.seed;
  node.reports.forEach(collect);
};
CHART.roots.forEach(collect);

function renderTower(markup: ReturnType<typeof createElement>): string {
  return renderToStaticMarkup(createElement(AppProviders, null, markup));
}

describe("Tower sealed results", () => {
  it("shows no winner for a match that is not complete", () => {
    const html = renderTower(
      createElement(TowerScreen, {
        chart: CHART,
        entrants: DATA.entrants,
        matches: SEALED,
        onOpenMatch: () => undefined,
        onOpenCard: () => undefined,
      }),
    );

    expect(html).toContain("PermitPilot");
    expect(html).toContain("Fogcast");
    expect(html.toLowerCase()).not.toContain("acquired by");
    expect(html.toLowerCase()).not.toContain("champion");
    expect(html.toLowerCase()).not.toContain("winner");
    expect(html).toContain("LOCKED");
  });

  it("keeps the bracket unlit for a sealed match", () => {
    const html = renderToStaticMarkup(
      createElement(BracketView, {
        matches: SEALED,
        entrants: DATA.entrants,
        seeds: SEEDS,
        championId: null,
        onOpenMatch: () => undefined,
      }),
    );
    expect(html).not.toContain("bracket__side--winner");
    expect(html.toLowerCase()).not.toContain("champion");
    const sealed = SEALED[0];
    if (!sealed) throw new Error("no opening match");
    expect(
      bracketWinner({ match: sealed, matches: SEALED, championId: null, finalRound: 2 }),
    ).toBeNull();
  });

  it("lights the winner once the match is complete", () => {
    const matches = matchesAt(DATA, 1);
    const finalMatch = matches[0];
    if (!finalMatch) throw new Error("no match");
    expect(
      bracketWinner({ match: finalMatch, matches, championId: chartAt(DATA, 7).championId, finalRound: 2 }),
    ).toBe("permitpilot");
  });
});
