import { describe, expect, it } from "vitest";

import { buildProfile, toSubmission } from "../src/build.js";
import { DEMO_ENTRANTS, fetchDemoEntrant } from "../src/demo.js";
import type { EntrantProfile } from "../../schemas/src/index.js";

function profileWithText(text: string): EntrantProfile {
  return {
    entrantId: "test",
    company: { name: "TestCo", url: "https://testco.example.com", tagline: "Test tagline" },
    founders: [{ name: "Ada Lovelace", role: "CEO", xHandle: "@adalove", hnUser: "adal" }],
    posts: [{ source: "hn", url: "https://news.ycombinator.com/item?id=1", text, metrics: {} }],
    clout: { score: 50, tier: "B", x: 50, hn: 50 },
    sources: [{ source: "hn", url: "https://hn.algolia.com/api/v1/items/1", retrievedAt: "2026-11-05T19:05:00.000Z" }],
  };
}

function mentions(haystack: string, token: string): boolean {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "iu").test(haystack);
}

describe("buildProfile", () => {
  it("is a pure function of adapter results: a failed source becomes a warning, not a crash", async () => {
    const { profile, warnings } = await fetchDemoEntrant("permitpilot");
    expect(warnings).toEqual([]);
    expect(profile.entrantId).toBe("permitpilot");
    expect(profile.posts.length).toBeGreaterThan(0);
    expect(profile.sources.length).toBeGreaterThan(0);
  });
});

describe("toSubmission", () => {
  it("strips every founder name, name part and handle from the draft", async () => {
    for (const entrant of DEMO_ENTRANTS) {
      const { profile } = await fetchDemoEntrant(entrant.entrantId);
      const { submission, stripped } = toSubmission(profile);
      if (entrant.entrantId === "tabclear") {
        expect(stripped, "tabclear mentions founders in its HN text").not.toEqual([]);
      }
      const haystack = `${submission.title}\n${submission.oneLiner}\n${submission.description}`.toLowerCase();
      for (const founder of entrant.founders) {
        expect(haystack, `${entrant.entrantId} leaks ${founder.name}`).not.toContain(founder.name.toLowerCase());
        for (const part of founder.name.split(/\s+/)) {
          if (part.length >= 3) {
            expect(mentions(haystack, part), `${entrant.entrantId} leaks ${part}`).toBe(false);
          }
        }
        expect(haystack, `${entrant.entrantId} leaks ${founder.xHandle}`).not.toContain(founder.xHandle.toLowerCase());
        expect(haystack, `${entrant.entrantId} leaks ${founder.hnUser}`).not.toContain(founder.hnUser.toLowerCase());
      }
      for (const link of submission.links ?? []) {
        const lower = link.toLowerCase();
        for (const founder of entrant.founders) {
          expect(lower, `${entrant.entrantId} leaks ${founder.name} in links`).not.toContain(
            founder.name.toLowerCase(),
          );
          if (founder.xHandle !== "") {
            expect(lower, `${entrant.entrantId} leaks ${founder.xHandle} in links`).not.toContain(
              founder.xHandle.toLowerCase(),
            );
          }
        }
      }
    }
  });

  it("strips whole names only and leaves words that contain a name alone", () => {
    const profile = profileWithText("Ada built this for developers who adapt fast. Thanks, Ada Lovelace (@adalove).");
    profile.founders = [{ name: "Ada Lovelace", xHandle: "@adalove" }, { name: "Dev Raman" }];
    const { submission, stripped } = toSubmission(profile);
    expect(submission.description).toContain("developers");
    expect(submission.description).toContain("adapt");
    expect(mentions(submission.description, "Ada")).toBe(false);
    expect(mentions(submission.description, "adalove")).toBe(false);
    expect(stripped).toContain("Ada Lovelace");
  });

  it("caps title at 60, one-liner at 140 and description at 1500 chars", () => {
    const long = "word ".repeat(600);
    const { submission } = toSubmission(profileWithText(long));
    expect(submission.title.length).toBeLessThanOrEqual(60);
    expect(submission.oneLiner.length).toBeLessThanOrEqual(140);
    expect(submission.description.length).toBeLessThanOrEqual(1500);
  });

  it("passes injected instructions through as data, never interpreting them", async () => {
    const { profile } = await fetchDemoEntrant("looproom");
    const needle = "ignore previous instructions";
    expect(profile.posts.some((post) => post.text.toLowerCase().includes(needle))).toBe(true);
    const { submission } = toSubmission(profile);
    expect(submission.description.toLowerCase()).toContain(needle);
  });
});
