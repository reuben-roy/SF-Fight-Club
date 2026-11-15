import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { EntrantProfile } from "@sf-fight-club/schemas";
import { FighterCard, mainMetric, safeHttpUrl } from "../src/cards/FighterCard.js";
import type { TowerEntrant } from "../src/tower/types.js";

const ENTRANT: TowerEntrant = {
  entrantId: "permitpilot",
  name: "PermitPilot",
  spriteSeed: "sprite-permit-9f3a",
  category: "proptech",
  oneLiner: "AI agent that files and chases SF building permits.",
  clout: 57,
  cloutTier: "B",
};

const PROFILE: EntrantProfile = {
  entrantId: "permitpilot",
  company: { name: "PermitPilot", tagline: "Permits, chased." },
  founders: [
    { name: "Maya Okafor", role: "CEO", xHandle: "mayabuilds", hnUser: "mayab" },
    { name: "Dev Raman", role: "CTO", xHandle: "devraman" },
  ],
  posts: [
    {
      source: "hn",
      url: "https://news.ycombinator.com/item?id=45120011",
      title: "Show HN: PermitPilot",
      text: "We file the paperwork and chase the city.",
      metrics: { points: 60, comments: 2 },
    },
    {
      source: "x",
      url: "javascript:alert(1)",
      title: "<b>Not a heading</b>",
      text: '<script>alert("x")</script> <b>bold</b>',
      metrics: { likes: 60 },
    },
  ],
  clout: { score: 57, tier: "B", x: 59, hn: 54 },
  sources: [],
};

function renderCard(profile: EntrantProfile = PROFILE): string {
  return renderToStaticMarkup(
    createElement(FighterCard, {
      entrant: ENTRANT,
      profile,
      title: "Director",
      headcount: 4,
      seed: 1,
      tier: "A",
      buildHash: "ea1861",
    }),
  );
}

describe("FighterCard", () => {
  it("renders the card's reading order", () => {
    const html = renderCard();
    expect(html).toContain("PermitPilot");
    expect(html).toContain("Permits, chased.");
    expect(html).toContain("Director");
    expect(html).toContain("Runs a company of 4");
    expect(html).toContain("Clout is for show. It never affects a fight.");
    expect(html).toContain("Maya Okafor");
    expect(html).toContain("@mayabuilds");
    expect(html).toContain("BUILD EA1861");
    expect(html).toContain("proptech");
    expect(html).toContain("Clerk");
  });

  it("never turns a javascript: url into a link", () => {
    const html = renderCard();
    expect(html).not.toContain("javascript:");
    expect((html.match(/<a /g) ?? []).length).toBe(1);
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('href="https://news.ycombinator.com/item?id=45120011"');
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,hello")).toBeNull();
    expect(safeHttpUrl("https://example.com/post")).toBe("https://example.com/post");
    expect(safeHttpUrl("not a url")).toBeNull();
  });

  it("renders post text as text, never as markup", () => {
    const html = renderCard();
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<b>bold</b>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
  });

describe("FighterCard portraits", () => {
  const portrait = { size: 32 as const, palette: ["#1a2130", "#e0b48a"], pixels: Array.from({ length: 1024 }, (_, i) => i % 2) };
  const profileWithPortrait: EntrantProfile = {
    ...PROFILE,
    founders: [
      {
        name: "Ada Lovelace",
        role: "CEO",
        xHandle: "adalove",
        avatarUrl: "https://example.com/ada.jpg",
        portrait,
        portraitTraits: { skin: "#e0b48a", skinShadow: "#7a4a30", hair: "#1a2130", accent: "#44ba82" },
      },
      { name: "Dev Raman", xHandle: "devraman" },
    ],
  };

  it("draws the founder portrait instead of the generated figure", () => {
    const html = renderCard(profileWithPortrait);
    expect(html).toContain('aria-label="Ada Lovelace"');
    expect(html).toContain("Generated crew figure for Dev Raman");
    expect(html).not.toContain("Generated crew figure for Ada Lovelace");
  });

  it("never renders the avatar URL as an image or a link", () => {
    const html = renderCard(profileWithPortrait);
    expect(html).not.toContain("https://example.com/ada.jpg");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("avatarUrl");
  });

  it("reads the main metric of a post", () => {
});
    expect(mainMetric({ points: 60, comments: 2 })).toEqual({ label: "points", value: 60 });
    expect(mainMetric({ views: 1500, likes: 60 })).toEqual({ label: "views", value: 1500 });
    expect(mainMetric({})).toBeNull();
  });
});
