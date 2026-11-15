import { CRITERIA_BY_ROUND, CRITERION_IDS, type CriterionId, type ShotType } from "@sf-fight-club/schemas";
import { describe, expect, it } from "vitest";

import { elementOf, moveFor, verdictLine } from "../src/index.js";

const TYPES: ShotType[] = ["pitch", "attack", "defense"];

describe("moves", () => {
  it("gives every (criterion, type) pair a unique move name", () => {
    const names = new Set<string>();
    for (const criterion of CRITERION_IDS) {
      for (const type of TYPES) {
        const move = moveFor({ criterion, type });
        expect(move.criterion).toBe(criterion);
        expect(move.type).toBe(type);
        expect(move.element).toBe(elementOf(criterion));
        expect(move.name.length).toBeGreaterThan(0);
        expect(names.has(move.name)).toBe(false);
        names.add(move.name);
      }
    }
    expect(names.size).toBe(CRITERION_IDS.length * TYPES.length);
  });

  it("matches the element to the round each criterion belongs to", () => {
    const expected = { 1: "market", 2: "moat", 3: "execution" } as const;
    for (const round of [1, 2, 3] as const) {
      for (const criterion of CRITERIA_BY_ROUND[round]) {
        expect(elementOf(criterion)).toBe(expected[round]);
      }
    }
  });

  it("fills the verdict line for every outcome", () => {
    const base = { actor: "PermitPilot", target: "Fogcast", criterion: "moat" as CriterionId, defenseMove: "Side by Side" };
    expect(verdictLine({ ...base, outcome: "crit" })).toBe("DIRECT HIT. The judges bought all of it.");
    expect(verdictLine({ ...base, outcome: "hit" })).toBe("It landed.");
    expect(verdictLine({ ...base, outcome: "partial" })).toBe("Partly landed.");
    expect(verdictLine({ ...base, outcome: "parried" })).toBe("Fogcast answered with SIDE BY SIDE.");
    expect(verdictLine({ ...base, outcome: "glancing" })).toBe("Fair point. Fogcast still wins moat.");
    expect(verdictLine({ ...base, outcome: "whiff" })).toBe("The judges did not move.");
    expect(verdictLine({ ...base, outcome: "backfire" })).toBe("FACT-CHECKED. It blew up in PermitPilot's hands.");
  });
});
