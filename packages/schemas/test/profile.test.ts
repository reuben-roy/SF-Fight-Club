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

  it("parses a founder with a portrait and trait colors", () => {
    const pixels = Array.from({ length: 1024 }, (_, index) => index % 3);
    const founder = {
      ...base.founders[0],
      avatarUrl: "https://pbs.twimg.com/profile_images/1/abc_400x400.jpg",
      portrait: { size: 32, palette: ["#1a2130", "#e0b48a", "#7a4a30"], pixels },
      portraitTraits: { skin: "#e0b48a", skinShadow: "#7a4a30", hair: "#1a2130", accent: "#44ba82" },
    };
    const parsed = entrantProfileSchema.parse({ ...base, founders: [founder] });
    expect(parsed.founders[0]).toEqual(founder);
  });

  it("rejects a portrait with the wrong size and traits with a non-hex color", () => {
    const pixels = Array.from({ length: 1024 }, () => 0);
    const portrait = { size: 32, palette: ["#1a2130", "#e0b48a"], pixels };
    const traits = { skin: "#e0b48a", skinShadow: "#7a4a30", hair: "#1a2130", accent: "#44ba82" };
    expect(
      entrantProfileSchema.safeParse({
        ...base,
        founders: [{ ...base.founders[0], portrait: { ...portrait, size: 24 }, portraitTraits: traits }],
      }).success,
    ).toBe(false);
    expect(
      entrantProfileSchema.safeParse({
        ...base,
        founders: [{ ...base.founders[0], portrait, portraitTraits: { ...traits, skin: "tan" } }],
      }).success,
    ).toBe(false);
  });

  it("rejects a profile with an out-of-range clout score", () => {
    const bad = { ...base, clout: { ...base.clout, score: 140 } };
    expect(entrantProfileSchema.safeParse(bad).success).toBe(false);
  });
});
