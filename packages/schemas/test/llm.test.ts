import { describe, expect, it } from "vitest";

import {
  dossierSchema,
  factCheckResultSchema,
  fightReportSchema,
  ideaSubmissionSchema,
  parseMistralOutput,
  roundJudgmentSchema,
  shotFactCheckSchema,
  shotModelOutputSchema,
  shotSchema,
  standardBriefSchema,
  suddenDeathVoteSchema,
  volleyModelOutputSchema,
  volleySchema,
  weighinJudgmentSchema,
} from "../src/index.js";
import { brief, dossier, factCheck, fightReport, idea, roundJudgment, suddenDeath, volley, volleyModel, weighin } from "./fixtures.js";

describe("llm and intake parsers", () => {
  it("parses valid brief, dossier, volley, judgments, fact check, and report", () => {
    expect(standardBriefSchema.parse(brief)).toEqual(brief);
    expect(dossierSchema.parse(dossier)).toEqual(dossier);
    expect(ideaSubmissionSchema.parse(idea)).toEqual(idea);
    expect(volleyModelOutputSchema.parse(volleyModel)).toEqual(volleyModel);
    expect(volleySchema.parse(volley)).toEqual(volley);
    expect(roundJudgmentSchema.parse(roundJudgment)).toEqual(roundJudgment);
    expect(weighinJudgmentSchema.parse(weighin)).toEqual(weighin);
    expect(suddenDeathVoteSchema.parse(suddenDeath)).toEqual(suddenDeath);
    expect(factCheckResultSchema.parse(factCheck)).toEqual(factCheck);
    expect(fightReportSchema.parse(fightReport)).toEqual(fightReport);
  });

  it("rejects scores outside 0 to 10 and non-integers", () => {
    const high = structuredClone(roundJudgment);
    high.criteria[0]!.fighter_1.score = 11;
    expect(roundJudgmentSchema.safeParse(high).success).toBe(false);

    const low = structuredClone(roundJudgment);
    low.criteria[1]!.fighter_2.score = -1;
    expect(roundJudgmentSchema.safeParse(low).success).toBe(false);

    const fraction = structuredClone(weighin);
    fraction.criteria[0]!.score = 7.5;
    expect(weighinJudgmentSchema.safeParse(fraction).success).toBe(false);

    const confidence = structuredClone(suddenDeath);
    confidence.confidence = 1.2;
    expect(suddenDeathVoteSchema.safeParse(confidence).success).toBe(false);
    expect(suddenDeathVoteSchema.parse({ ...suddenDeath, confidence: 0 }).confidence).toBe(0);
  });

  it("rejects a missing criterion and a round set that is short or mixed", () => {
    const { criterion: _dropped, ...missingField } = roundJudgment.criteria[0]!;
    const missing = structuredClone(roundJudgment);
    missing.criteria[0] = missingField as (typeof missing.criteria)[number];
    expect(roundJudgmentSchema.safeParse(missing).success).toBe(false);

    const short = structuredClone(roundJudgment);
    short.criteria = short.criteria.slice(0, 2);
    const shortParsed = roundJudgmentSchema.safeParse(short);
    expect(shortParsed.success).toBe(false);
    if (!shortParsed.success) {
      expect(shortParsed.error.issues.some((issue) => issue.message.includes("exactly one round"))).toBe(true);
    }

    const mixed = structuredClone(roundJudgment);
    mixed.criteria[2] = { ...mixed.criteria[2]!, criterion: "moat" };
    expect(roundJudgmentSchema.safeParse(mixed).success).toBe(false);

    const weighinMissing = structuredClone(weighin);
    weighinMissing.criteria = weighinMissing.criteria.filter((row) => row.criterion !== "scale");
    const weighinParsed = weighinJudgmentSchema.safeParse(weighinMissing);
    expect(weighinParsed.success).toBe(false);
    if (!weighinParsed.success) {
      expect(weighinParsed.error.issues.some((issue) => issue.message.includes("scale"))).toBe(true);
    }
  });

  it("rejects a defense shot without respondsTo", () => {
    const defense = {
      type: "defense" as const,
      criterion: "problem" as const,
      headline: "Not their buyer",
      claim: "The city pays, and they never reach it.",
      evidence: ["E1"],
      estimate: false,
    };
    expect(shotModelOutputSchema.safeParse(defense).success).toBe(false);
    expect(shotSchema.safeParse({ ...defense, id: "r1.v2.A.s1" }).success).toBe(false);

    const volleyMissing = {
      shots: [...volleyModel.shots, defense],
    };
    const parsed = volleyModelOutputSchema.safeParse(volleyMissing);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(JSON.stringify(parsed.error.issues)).toContain("respondsTo");
    }

    const parsedDefense = shotModelOutputSchema.parse({ ...defense, respondsTo: "r1.v1.B.s1" });
    expect(parsedDefense.type).toBe("defense");
    if (parsedDefense.type === "defense") expect(parsedDefense.respondsTo).toBe("r1.v1.B.s1");
    expect(
      shotSchema.parse({ ...defense, id: "r1.v2.A.s1", respondsTo: "r1.v1.B.s1" }).respondsTo,
    ).toBe("r1.v1.B.s1");
  });

  it("rejects idea text over the length caps and a snippet over 500 characters", () => {
    expect(ideaSubmissionSchema.safeParse({ ...idea, title: "x".repeat(61) }).success).toBe(false);
    expect(ideaSubmissionSchema.safeParse({ ...idea, oneLiner: "x".repeat(141) }).success).toBe(false);
    expect(ideaSubmissionSchema.safeParse({ ...idea, description: "x".repeat(1501) }).success).toBe(false);
  });

  it("rejects a fabricated flag that disagrees with the evidence", () => {
    const check = structuredClone(factCheck.checks[0]!);
    check.missingIds = ["E99"];
    check.fabricated = false;
    expect(shotFactCheckSchema.safeParse(check).success).toBe(false);
    check.fabricated = true;
    expect(shotFactCheckSchema.parse(check).fabricated).toBe(true);

    check.missingIds = [];
    check.numberContradicted = true;
    check.fabricated = false;
    expect(shotFactCheckSchema.safeParse(check).success).toBe(false);
  });

  it("turns Mistral nulls into omitted optional fields", () => {
    const parsed = parseMistralOutput(fightReportSchema, {
      ...fightReport,
      turningPoint: { shotId: null, criterion: null, text: "The round turned on market size." },
    });
    expect(parsed.turningPoint).toEqual({ text: "The round turned on market size." });
  });

  it("rejects the wrong number of report bullets", () => {
    expect(fightReportSchema.safeParse({ ...fightReport, whyTheyWon: ["only one"] }).success).toBe(false);
    expect(fightReportSchema.safeParse({ ...fightReport, loserTakeaways: ["only one"] }).success).toBe(false);
  });

  it("accepts a stored pitch that also names respondsTo", () => {
    const pitch = volley.shots[0]!;
    expect(shotSchema.parse({ ...pitch, respondsTo: "r1.v1.B.s1" }).type).toBe("pitch");
  });
});
