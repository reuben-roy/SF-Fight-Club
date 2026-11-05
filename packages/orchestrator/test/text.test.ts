import { describe, expect, it } from "vitest";

import { mergeFactChecks, truncateAtCap } from "../src/index.js";

describe("truncateAtCap", () => {
  it("cuts back to the last sentence inside the cap (FE-5)", () => {
    const text = "Hello world. This is extra noise.";
    expect(truncateAtCap(text, 4)).toEqual({ text: "Hello world.", truncated: true });
  });

  it("cuts on the word when no sentence boundary fits", () => {
    const text = "one two three four five";
    expect(truncateAtCap(text, 3)).toEqual({ text: "one two three", truncated: true });
  });

  it("leaves short text alone", () => {
    expect(truncateAtCap("Already short.", 8)).toEqual({ text: "Already short.", truncated: false });
  });
});

describe("mergeFactChecks", () => {
  it("treats a missing locker id as a fabrication even when the model disagrees (FE-7)", () => {
    const [check] = mergeFactChecks(
      [
        {
          id: "r3.v1.B.s1",
          type: "attack",
          criterion: "gtm",
          headline: "Forty percent",
          claim: "A made-up stat.",
          evidence: ["E404"],
          estimate: false,
        },
      ],
      [
        {
          shotId: "r3.v1.B.s1",
          missingIds: [],
          perEvidence: [{ evidenceId: "E404", verdict: "supported", note: "Model was wrong." }],
          numberContradicted: false,
          fabricated: false,
        },
      ],
      new Set(["E1"]),
    );
    expect(check).toMatchObject({
      shotId: "r3.v1.B.s1",
      missingIds: ["E404"],
      perEvidence: [],
      fabricated: true,
    });
  });

  it("treats a contradicted number as a fabrication (FE-8)", () => {
    const [check] = mergeFactChecks(
      [
        {
          id: "s1",
          type: "pitch",
          criterion: "market",
          headline: "Twenty million",
          claim: "Twenty million users.",
          evidence: ["E1"],
          estimate: false,
        },
      ],
      [
        {
          shotId: "s1",
          missingIds: [],
          perEvidence: [{ evidenceId: "E1", verdict: "contradicted", note: "Snippet says two million." }],
          numberContradicted: true,
          fabricated: true,
        },
      ],
      new Set(["E1"]),
    );
    expect(check?.fabricated).toBe(true);
    expect(check?.numberContradicted).toBe(true);
    expect(check?.missingIds).toEqual([]);
  });
});
