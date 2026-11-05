import { describe, expect, it } from "vitest";

import { CRITERIA_BY_ROUND, loadVcDefaultRubric, loadVcDefaultRubricDocument, parseRubric, rubricSchema } from "../src/index.js";

describe("vc-default rubric", () => {
  const document = loadVcDefaultRubricDocument();
  const rubric = loadVcDefaultRubric();

  it("loads the contract rubric and keeps calibration beside it", () => {
    expect(rubric.id).toBe("vc-default");
    expect(rubric.version).toBe("1.0.0");
    expect(document.calibration?.length).toBeGreaterThan(0);
    expect(rubricSchema.parse(rubric)).toEqual(rubric);
    expect("calibration" in rubric).toBe(false);
  });

  it("sums criterion weights to 100 and groups them by round", () => {
    const sum = rubric.criteria.reduce((total, criterion) => total + criterion.weight, 0);
    expect(sum).toBe(100);
    expect(rubric.criteria).toHaveLength(9);
    for (const [round, ids] of Object.entries(CRITERIA_BY_ROUND)) {
      const rows = rubric.criteria.filter((criterion) => criterion.round === Number(round));
      expect(rows.map((criterion) => criterion.id)).toEqual([...ids]);
    }
    expect(rubric.criteria.filter((criterion) => criterion.round === 1).reduce((total, criterion) => total + criterion.weight, 0)).toBe(35);
    expect(rubric.criteria.filter((criterion) => criterion.round === 2).reduce((total, criterion) => total + criterion.weight, 0)).toBe(32);
    expect(rubric.criteria.filter((criterion) => criterion.round === 3).reduce((total, criterion) => total + criterion.weight, 0)).toBe(33);
  });

  it("matches the default thresholds from the rubric file", () => {
    expect(rubric.thresholds).toEqual({
      drawMargin: 1.5,
      koMargin: 10,
      decisionFloorHp: 12,
      suddenDeathFloorHp: 6,
      backfirePenalty: 1.5,
      backfireCap: 3,
      instabilityGap: 3,
      weighinTiebreakGap: 0.5,
    });
  });

  it("rejects a weight sum that is not 100", () => {
    const broken = structuredClone(rubric);
    const first = broken.criteria[0];
    if (first === undefined) throw new Error("rubric has no criteria");
    first.weight -= 1;
    const parsed = rubricSchema.safeParse(broken);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.message.includes("sum to 100"))).toBe(true);
    }
  });

  it("rejects a missing criterion and an unknown file key", () => {
    const missing = structuredClone(rubric);
    missing.criteria = missing.criteria.slice(1);
    expect(rubricSchema.safeParse(missing).success).toBe(false);

    expect(() => parseRubric({ ...document, hostNote: "nope" })).toThrow();
  });
});
