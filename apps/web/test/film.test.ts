import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { DEMO_BUNDLE } from "../src/data/generated/demo.js";
import { initialAppState, reduceAppState, selectFilm, type AppState } from "../src/data/store.js";
import { EvidenceLink, FilmRoom } from "../src/film/film-room.js";

const bundle = DEMO_BUNDLE;

function completedTournament(): AppState {
  let state = initialAppState(bundle);
  for (const roundIndex of [0, 1, 2]) {
    for (const match of bundle.matches.filter((entry) => entry.roundIndex === roundIndex)) {
      state = reduceAppState(state, { type: "open_betting", matchId: match.matchId }, bundle);
      state = reduceAppState(state, { type: "ring_bell", matchId: match.matchId }, bundle);
      state = reduceAppState(state, { type: "ring_bell", matchId: match.matchId }, bundle);
      state = reduceAppState(state, { type: "finish", matchId: match.matchId }, bundle);
    }
  }
  return state;
}

function count(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

function renderFilm(matchId: string): { html: string; shots: number } {
  const state = completedTournament();
  const view = selectFilm(state, bundle, matchId);
  if (!view?.film) throw new Error(`no film for ${matchId}`);
  const html = renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(FilmRoom, { view })),
  );
  return { html, shots: view.film.shots.length };
}

describe("film room render", () => {
  it("renders nine scorecard rows and one timeline row per shot for every demo match", () => {
    for (const match of bundle.matches) {
      const { html, shots } = renderFilm(match.matchId);
      expect(count(html, "data-criterion="), `${match.matchId} scorecard rows`).toBe(9);
      expect(count(html, "data-shot="), `${match.matchId} timeline rows`).toBe(shots);
      expect(shots).toBeGreaterThan(0);
    }
  });

  it("renders the sealed state before the match completes", () => {
    const view = selectFilm(initialAppState(bundle), bundle, bundle.matches[0]?.matchId ?? "");
    if (!view) throw new Error("no view");
    const html = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(FilmRoom, { view })),
    );
    expect(html).toContain("Sealed until this fight completes.");
    expect(count(html, "data-criterion=")).toBe(0);
    expect(count(html, "data-shot=")).toBe(0);
  });
});

describe("evidence links", () => {
  it("never renders a javascript: URL as a link", () => {
    const html = renderToStaticMarkup(
      createElement(EvidenceLink, { url: "javascript:alert(1)", children: "bad source" }),
    );
    expect(html).not.toContain("<a");
    expect(html).not.toContain("href");
    expect(html).toContain("bad source");
  });

  it("renders http(s) URLs with rel=noopener noreferrer", () => {
    const html = renderToStaticMarkup(
      createElement(EvidenceLink, { url: "https://example.com/source", children: "good source" }),
    );
    expect(html).toContain('href="https://example.com/source"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
});
