import { describe, expect, it } from "vitest";

import { entrantProfileSchema } from "../src/index.js";

const base = {
  entrantId: "curbbot",
  company: { name: "CurbBot", url: "https://example.com/curbbot", tagline: "Curb audits." },
  founders: [{ name: "Lena Brandt", xHandle: "lenabrandt", hnUser: "lenab", followers: 100, hnKarma: 50 }],
  posts: [
    {
      source: "x",
      url: "https://x.com/lenabrandt/status/1",
      text: "Launch day.",
      metrics: { likes: 10 },
    },
  ],
  clout: { score: 80, tier: "S", x: 85, hn: 70 },
  sources: [{ source: "x", url: "https://api.x.com/2/users/by/username/lenabrandt", retrievedAt: "2026-11-05T19:05:00.000Z" }],
} as const;

describe("entrant profile", () => {
  it("parses a valid profile", () => {
    expect(entrantProfileSchema.parse(base)).toEqual(base);
  });

  it("rejects a profile with an out-of-range clout score", () => {
    const bad = { ...base, clout: { ...base.clout, score: 140 } };
    expect(entrantProfileSchema.safeParse(bad).success).toBe(false);
  });
});
