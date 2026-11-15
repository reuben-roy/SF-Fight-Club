import { describe, expect, it } from "vitest";

import { entrantProfileSchema } from "../../schemas/src/index.js";
import { toSubmission } from "../src/build.js";
import { DEMO_ENTRANTS, DEMO_IDS, fetchDemoEntrant, getDemoEntrant } from "../src/demo.js";

describe("demo entrants", () => {
  it("covers the eight section-7 entrants", () => {
    expect(DEMO_IDS).toEqual([
      "permitpilot",
      "dermalens",
      "flakehunter",
      "tabclear",
      "paperroute",
      "curbbot",
      "looproom",
      "fogcast",
    ]);
  });

  it("throws on an unknown entrant", () => {
    expect(() => getDemoEntrant("realcorp")).toThrow(/unknown demo entrant/);
  });

  it("builds a schema-valid profile with no warnings for every entrant", async () => {
    expect(DEMO_ENTRANTS).toHaveLength(8);
    for (const id of DEMO_IDS) {
      const { profile, warnings } = await fetchDemoEntrant(id);
      expect(warnings, id).toEqual([]);
      expect(() => entrantProfileSchema.parse(profile), id).not.toThrow();
      expect(profile.posts.length, id).toBeGreaterThan(0);
      expect(profile.sources.length, id).toBeGreaterThan(0);
    }
  });

  it("hits the clout targets: CurbBot S, Dermalens and TabClear A, the rest B or C", async () => {
    const expected: Record<string, { score: number; tier: string }> = {
      permitpilot: { score: 57, tier: "B" },
      dermalens: { score: 75, tier: "A" },
      flakehunter: { score: 58, tier: "B" },
      tabclear: { score: 72, tier: "A" },
      paperroute: { score: 31, tier: "C" },
      curbbot: { score: 91, tier: "S" },
      looproom: { score: 36, tier: "C" },
      fogcast: { score: 53, tier: "B" },
    };
    for (const [id, want] of Object.entries(expected)) {
      const { profile } = await fetchDemoEntrant(id);
      expect(profile.clout.score, id).toBe(want.score);
      expect(profile.clout.tier, id).toBe(want.tier);
    }
  });

  it("produces a founder-free submission draft for every entrant", async () => {
    for (const id of DEMO_IDS) {
      const { profile } = await fetchDemoEntrant(id);
      const { submission } = toSubmission(profile);
      const haystack = `${submission.title}\n${submission.oneLiner}\n${submission.description}`;
      for (const founder of getDemoEntrant(id).founders) {
        expect(haystack).not.toMatch(new RegExp(founder.name.split(/\s+/)[0] ?? "", "i"));
      }
    }
  });
});
