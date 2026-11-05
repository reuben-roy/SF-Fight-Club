import {
  CRITERIA_BY_ROUND,
  CRITERION_IDS,
  type CriterionId,
  type FactCheckResult,
  type RoundJudgment,
  type RoundNumber,
  type ShotModelOutput,
  type ShotVerdict,
  type Slot,
  type SuddenDeathVote,
} from "@sf-fight-club/schemas";

import type { FixtureAttempt, FixtureStep, FixtureTape } from "./fixtures.js";
import { stepKey, volleyScope } from "./keys.js";

const AT = "2026-11-05T18:00:00.000Z";

/**
 * Worked example finals from the fight-system doc. AB uses the floor of a
 * half-point and BA uses the ceiling, so the mean is the final and the gap
 * stays inside the instability threshold.
 */
const PERMIT_FINALS: Record<CriterionId, { A: number; B: number }> = {
  problem: { A: 8.5, B: 6 },
  market: { A: 7, B: 4.5 },
  wtp: { A: 7.5, B: 5 },
  differentiation: { A: 6, B: 7 },
  moat: { A: 6, B: 6 },
  timing: { A: 7, B: 6.5 },
  gtm: { A: 6.5, B: 4 },
  feasibility: { A: 5, B: 7.5 },
  scale: { A: 7, B: 3.5 },
};

/** PermitPilot vs Fogcast. One fabrication, a K.O., no sudden death. */
export function permitVsFogcastTape(): FixtureTape {
  return tapeFromPlans(permitPlans(), PERMIT_FINALS, permitReport(), {
    A: "The counter queue is public.",
    B: "Patios watch the marine layer.",
  });
}

/** All criteria tied. Sudden-death judges vote 3-1 for A. */
export function suddenDeathTape(): FixtureTape {
  const base = tapeFromPlans(tiedPlans(), tiedScores(), suddenReport(), {
    A: "No new permit source.",
    B: "No new weather source.",
  });
  return {
    steps: {
      ...base.steps,
      [stepKey.closing("A")]: output(closing("Permit the city", "The permit backlog is the better opportunity.")),
      [stepKey.closing("B")]: output(closing("Forecast the block", "Outdoor revenue is the better opportunity.")),
      [stepKey.sdJudge("AB", 1)]: output(vote("fighter_1")),
      [stepKey.sdJudge("BA", 1)]: output(vote("fighter_2")),
      [stepKey.sdJudge("AB", 2)]: output(vote("fighter_1")),
      [stepKey.sdJudge("BA", 2)]: output(vote("fighter_1")),
    },
  };
}

export function withStep(tape: FixtureTape, key: string, attempts: readonly FixtureAttempt[]): FixtureTape {
  return {
    steps: {
      ...tape.steps,
      [key]: { attempts: attempts.slice() },
    },
  };
}

interface SidePlan {
  v1: ShotModelOutput[];
  v2: ShotModelOutput[];
}

function tapeFromPlans(
  plans: Record<RoundNumber, Record<Slot, SidePlan>>,
  finals: Record<CriterionId, { A: number; B: number }>,
  report: unknown,
  scoutSnippets: Record<Slot, string>,
): FixtureTape {
  const steps: Record<string, FixtureStep> = {};
  for (const slot of ["A", "B"] as const) {
    steps[stepKey.scout(slot)] = output({
      searchesRun: 2,
      evidence: [
        {
          url: `https://example.com/scout-${slot.toLowerCase()}`,
          title: slot === "A" ? "Permit desk" : "Patio weather",
          snippet: scoutSnippets[slot],
          retrievedAt: AT,
        },
      ],
    });
  }
  for (const round of [1, 2, 3] as const) {
    const verdicts: ShotVerdict[] = [];
    for (const slot of ["A", "B"] as const) {
      for (const volley of [1, 2] as const) {
        const shots = plans[round][slot][volley === 1 ? "v1" : "v2"];
        steps[stepKey.volley(round, volley, slot)] = output({ shots });
        const ids = shots.map((_, index) => `${volleyScope(round, volley, slot)}.s${index + 1}`);
        steps[stepKey.factcheck(round, volley, slot)] = output(factChecks(ids, shots));
        ids.forEach((id, index) => {
          const shot = shots[index];
          if (!shot) return;
          verdicts.push({
            shotId: id,
            verdict: shot.type === "defense" ? "glancing" : "landed",
            impact: shot.type === "defense" ? 1 : 2,
            note: "Scored from the claim.",
          });
        });
      }
    }
    steps[stepKey.judge(round, "AB")] = output(judgment(round, "AB", orderScores(finals, "AB"), verdicts));
    steps[stepKey.judge(round, "BA")] = output(judgment(round, "BA", orderScores(finals, "BA"), verdicts));
  }
  steps[stepKey.report] = output(report);
  return { steps };
}

function permitPlans(): Record<RoundNumber, Record<Slot, SidePlan>> {
  return {
    1: {
      A: {
        v1: [
          pitch("problem", "Permits stall builds", "Delays run for months for a named contractor.", ["E1"]),
          attack("market", "Weather budgets are small", "Outdoor venues spend little on forecasts."),
        ],
        v2: [
          defense("problem", "Patios still open", "The marine layer is an inconvenience.", "r1.v1.B.s1"),
          pitch("wtp", "Contractors already pay", "Expediters charge for the same chase."),
        ],
      },
      B: {
        v1: [
          pitch("problem", "Fog empties patios", "The marine layer clears the sidewalks."),
          attack("market", "Permit volume is local", "One city is a narrow beachhead."),
        ],
        v2: [
          defense("problem", "Delays are normal", "Months-long permits are the baseline.", "r1.v1.A.s1"),
          attack("wtp", "Software budget is thin", "Contractors will not add another subscription."),
        ],
      },
    },
    2: {
      A: {
        v1: [
          pitch("differentiation", "Filing plus chasing", "The product does the follow-up, not just the form."),
          pitch("moat", "Workflow lock-in", "A contractor's permit history is hard to export."),
        ],
        v2: [
          defense("differentiation", "Follow-up is the product", "A data feed does not chase an inspector.", "r2.v1.B.s1"),
          pitch("timing", "Staffing shortage", "Departments are short, so software has a window."),
        ],
      },
      B: {
        v1: [
          attack("differentiation", "Forecasts are a feature", "Weather data is available from public feeds."),
          pitch("timing", "Sensors got cheap", "Neighborhood stations are finally affordable."),
        ],
        v2: [
          defense("differentiation", "Public data is enough", "The forecast is the product, not a side feature.", "r2.v1.A.s1"),
          pitch("moat", "Station network", "Owned sensors are a physical moat."),
        ],
      },
    },
    3: {
      A: {
        v1: [
          pitch("gtm", "Start with expediters", "Sell to the shops that already charge for permits.", ["E1"]),
          pitch("scale", "Every city with a desk", "The backlog is not unique to San Francisco."),
        ],
        v2: [
          defense("gtm", "That stat is not sourced", "No locker item says forty percent.", "r3.v1.B.s1"),
          attack("feasibility", "Hardware is slow", "A sensor network takes years to install."),
        ],
      },
      B: {
        v1: [
          attack("gtm", "Forty percent lose ten thousand", "Mission restaurants lose ten thousand a year to weather.", ["E404"]),
          pitch("feasibility", "Ships this season", "A forecast can launch on public data."),
        ],
        v2: [
          defense("gtm", "Expediters are the incumbent", "Selling through them is a long cycle.", "r3.v1.A.s1"),
          pitch("scale", "Every outdoor block", "Patios exist in every coastal city."),
        ],
      },
    },
  };
}

function tiedPlans(): Record<RoundNumber, Record<Slot, SidePlan>> {
  const plans = {} as Record<RoundNumber, Record<Slot, SidePlan>>;
  for (const round of [1, 2, 3] as const) {
    const [first, second] = CRITERIA_BY_ROUND[round];
    if (!first || !second) throw new Error("round is missing criteria");
    const side = (slot: Slot): SidePlan => ({
      v1: [
        pitch(first, `${slot} states the pain`, "Both ideas name a real customer."),
        pitch(second, `${slot} sizes the field`, "Both ideas can name a buyer."),
      ],
      v2: [
        pitch(first, `${slot} answers back`, "The counter keeps the same estimate."),
        pitch(second, `${slot} presses on`, "Nothing here separates the two ideas."),
      ],
    });
    plans[round] = { A: side("A"), B: side("B") };
  }
  return plans;
}

function tiedScores(): Record<CriterionId, { A: number; B: number }> {
  const scores = {} as Record<CriterionId, { A: number; B: number }>;
  for (const id of CRITERION_IDS) scores[id] = { A: 5, B: 5 };
  return scores;
}

function permitReport(): unknown {
  return {
    headline: "PermitPilot KOs Fogcast",
    whyTheyWon: [
      "Won problem, market, and willingness to pay.",
      "Won go-to-market and venture scale.",
      "Fogcast took a fabrication penalty.",
    ],
    turningPoint: { criterion: "scale", text: "The scale gap closed the match." },
    loserTakeaways: ["Cite a real source for the weather stat.", "Show a path past a single neighborhood."],
    announcerLines: [{ cueRef: "intro", text: "Fighters to the ring." }],
  };
}

function suddenReport(): unknown {
  return {
    headline: "PermitPilot wins in sudden death",
    whyTheyWon: [
      "The scoreline was a draw.",
      "Three sudden-death votes picked PermitPilot.",
      "The cascade stopped at the judges.",
    ],
    turningPoint: { text: "The closing volley tipped a tied card." },
    loserTakeaways: ["Separate the idea on one criterion.", "Bring a sourced number next time."],
    announcerLines: [{ cueRef: "sudden-death", text: "Sudden death." }],
  };
}

function closing(headline: string, claim: string): { shots: ShotModelOutput[] } {
  return { shots: [pitch("problem", headline, claim)] };
}

function vote(winner: SuddenDeathVote["winner"]): SuddenDeathVote {
  return {
    analysis: "One idea names a buyer who already pays for a workaround.",
    winner,
    confidence: 0.7,
    decidingFactor: "Problem severity is more concrete.",
  };
}

function factChecks(ids: readonly string[], shots: readonly ShotModelOutput[]): FactCheckResult {
  return {
    checks: ids.map((shotId, index) => {
      const shot = shots[index];
      const evidence = shot?.evidence ?? [];
      return {
        shotId,
        missingIds: [],
        perEvidence: evidence.map((evidenceId) => ({
          evidenceId,
          verdict: "supported" as const,
          note: "The snippet agrees.",
        })),
        numberContradicted: false,
        fabricated: false,
      };
    }),
  };
}

function judgment(
  round: RoundNumber,
  order: "AB" | "BA",
  scores: Record<CriterionId, { A: number; B: number }>,
  shots: ShotVerdict[],
): RoundJudgment {
  const first: Slot = order === "AB" ? "A" : "B";
  const second: Slot = first === "A" ? "B" : "A";
  return {
    criteria: CRITERIA_BY_ROUND[round].map((id) => ({
      criterion: id,
      comparison: `${id} compared against the anchors.`,
      fighter_1: { rationale: "Anchored against the rubric.", capsApplied: [], score: scores[id][first] },
      fighter_2: { rationale: "Anchored against the rubric.", capsApplied: [], score: scores[id][second] },
    })),
    shots,
    injectionSuspected: false,
    roundSummary: "Scored from the anchors.",
  };
}

function orderScores(
  finals: Record<CriterionId, { A: number; B: number }>,
  order: "AB" | "BA",
): Record<CriterionId, { A: number; B: number }> {
  const scores = {} as Record<CriterionId, { A: number; B: number }>;
  for (const id of CRITERION_IDS) {
    const cell = finals[id];
    scores[id] = {
      A: integerOrder(cell.A, order),
      B: integerOrder(cell.B, order),
    };
  }
  return scores;
}

function integerOrder(score: number, order: "AB" | "BA"): number {
  if (Number.isInteger(score)) return score;
  return order === "AB" ? Math.floor(score) : Math.ceil(score);
}

function pitch(criterion: CriterionId, headline: string, claim: string, evidence: string[] = []): ShotModelOutput {
  return { type: "pitch", criterion, headline, claim, evidence, estimate: evidence.length === 0 };
}

function attack(criterion: CriterionId, headline: string, claim: string, evidence: string[] = []): ShotModelOutput {
  return { type: "attack", criterion, headline, claim, evidence, estimate: evidence.length === 0 };
}

function defense(criterion: CriterionId, headline: string, claim: string, respondsTo: string): ShotModelOutput {
  return { type: "defense", criterion, headline, claim, evidence: [], estimate: true, respondsTo };
}

function output(value: unknown): FixtureStep {
  return { attempts: [{ kind: "output", output: value }] };
}
