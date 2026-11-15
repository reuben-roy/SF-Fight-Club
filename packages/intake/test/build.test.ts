import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { buildProfile, toSubmission } from "../src/build.js";
import type { PortraitHook } from "../src/build.js";
import { DEMO_ENTRANTS, fetchDemoEntrant } from "../src/demo.js";
import type { AvatarFetchFn } from "../src/portrait.js";
import type { FetchHeaders } from "../src/types.js";
import type { XResult } from "../src/x.js";
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

describe("buildProfile portraits", () => {
  it("is a pure function of adapter results: a failed source becomes a warning, not a crash", async () => {
    const { profile, warnings } = await fetchDemoEntrant("permitpilot");
    expect(warnings).toEqual([]);
    expect(profile.entrantId).toBe("permitpilot");
    expect(profile.posts.length).toBeGreaterThan(0);
    expect(profile.sources.length).toBeGreaterThan(0);
  });

  const samplesDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "portrait",
    "fixtures",
    "samples",
  );
  const HEX = /^#[0-9a-fA-F]{6}$/;

  function headersFor(entries: Record<string, string>): FetchHeaders {
    const lower: Record<string, string> = {};
    for (const [key, value] of Object.entries(entries)) lower[key.toLowerCase()] = value;
    return { get: (name: string) => lower[name.toLowerCase()] ?? null };
  }

  function hookFor(body: Uint8Array, contentType: string): PortraitHook {
    const fetch: AvatarFetchFn = async () => ({
      status: 200,
      headers: headersFor({ "content-type": contentType }),
      arrayBuffer: async () => body,
    });
    return { fetch, sleep: async () => {} };
  }

  function xWithAvatar(avatarUrl: string, handle: string): XResult {
    return {
      kind: "ok",
      value: { userId: "1", name: "Ada Lovelace", handle, followers: 10, avatarUrl, posts: [] },
      sources: [],
      warnings: [],
    };
  }

  it("attaches a schema-valid portrait and traits to the matching founder only", async () => {
    const body = new Uint8Array(readFileSync(path.join(samplesDir, "obama.jpg")));
    const { profile, warnings } = await buildProfile(
      {
        entrantId: "test",
        company: { name: "TestCo" },
        founders: [{ name: "Ada Lovelace", xHandle: "@adalove" }, { name: "Dev Raman" }],
        hn: null,
        x: xWithAvatar("https://example.com/ada.jpg", "adalove"),
        web: null,
      },
      hookFor(body, "image/jpeg"),
    );
    expect(warnings).toEqual([]);
    const [ada, dev] = profile.founders;
    expect(ada?.avatarUrl).toBe("https://example.com/ada.jpg");
    expect(ada?.portrait?.size).toBe(32);
    expect(ada?.portrait?.pixels).toHaveLength(1024);
    for (const color of [ada?.portraitTraits?.skin, ada?.portraitTraits?.skinShadow, ada?.portraitTraits?.hair, ada?.portraitTraits?.accent]) {
      expect(color).toMatch(HEX);
    }
    expect(dev).not.toHaveProperty("avatarUrl");
    expect(dev).not.toHaveProperty("portrait");
    expect(dev).not.toHaveProperty("portraitTraits");
  });

  it("attaches a host-supplied avatar without an X account", async () => {
    const body = new Uint8Array(readFileSync(path.join(samplesDir, "tubman.png")));
    const { profile } = await buildProfile(
      {
        entrantId: "test",
        company: { name: "TestCo" },
        founders: [{ name: "Dev Raman", avatarUrl: "https://example.com/dev.png" }],
        hn: null,
        x: null,
        web: null,
      },
      hookFor(body, "image/png"),
    );
    expect(profile.founders[0]?.avatarUrl).toBe("https://example.com/dev.png");
    expect(profile.founders[0]?.portrait?.size).toBe(32);
  });

  it("warns and skips the portrait when the download fails, keeping the profile valid", async () => {
    const fetch: AvatarFetchFn = async () => ({
      status: 404,
      headers: headersFor({}),
      arrayBuffer: async () => new Uint8Array(0),
    });
    const { profile, warnings } = await buildProfile(
      {
        entrantId: "test",
        company: { name: "TestCo" },
        founders: [{ name: "Ada Lovelace", xHandle: "adalove" }],
        hn: null,
        x: xWithAvatar("https://example.com/missing.jpg", "adalove"),
        web: null,
      },
      { fetch, sleep: async () => {} },
    );
    expect(warnings.some((warning) => warning.startsWith("portrait:"))).toBe(true);
    expect(profile.founders[0]?.avatarUrl).toBe("https://example.com/missing.jpg");
    expect(profile.founders[0]).not.toHaveProperty("portrait");
  });

  it("gives no demo entrant a portrait", async () => {
    for (const entrant of DEMO_ENTRANTS) {
      const { profile } = await fetchDemoEntrant(entrant.entrantId);
      for (const founder of profile.founders) {
        expect(founder, `${entrant.entrantId}/${founder.name}`).not.toHaveProperty("avatarUrl");
        expect(founder, `${entrant.entrantId}/${founder.name}`).not.toHaveProperty("portrait");
        expect(founder, `${entrant.entrantId}/${founder.name}`).not.toHaveProperty("portraitTraits");
      }
    }
  });

  it("keeps the portrait and its source photo out of the idea submission", async () => {
    const body = new Uint8Array(readFileSync(path.join(samplesDir, "obama.jpg")));
    const { profile } = await buildProfile(
      {
        entrantId: "test",
        company: { name: "TestCo", url: "https://testco.example.com", tagline: "Test tagline" },
        founders: [{ name: "Ada Lovelace", role: "CEO", xHandle: "@adalove", hnUser: "adal" }],
        hn: null,
        x: xWithAvatar("https://example.com/ada.jpg", "adalove"),
        web: null,
      },
      hookFor(body, "image/jpeg"),
    );
    expect(profile.founders[0]?.portrait).toBeDefined();
    const { submission } = toSubmission(profile);
    expect(JSON.stringify(submission)).not.toContain("avatarUrl");
    expect(JSON.stringify(submission)).not.toContain("portrait");
    expect(JSON.stringify(submission)).not.toContain("https://example.com/ada.jpg");
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
