import type {
  CriterionId,
  FactCheckResult,
  RoundJudgment,
  RoundNumber,
  ShotModelOutput,
  ShotVerdict,
  Slot,
  SuddenDeathVote,
} from "@sf-fight-club/schemas";

import type { FixtureAttempt, FixtureStep, FixtureTape } from "../fixtures.js";
import { closingScope, stepKey, volleyScope } from "../keys.js";

export const DEMO_AT = "2026-11-05T18:00:00.000Z";

export type DemoShotType = "pitch" | "attack" | "defense";

export interface DemoShot {
  type: DemoShotType;
  criterion: CriterionId;
  headline: string;
  claim: string;
  evidence?: string[];
  estimate?: boolean;
  respondsTo?: string;
  verdict: ShotVerdict["verdict"];
  impact: ShotVerdict["impact"];
  note: string;
}

export interface DemoPlan {
  v1: DemoShot[];
  v2: DemoShot[];
}

export interface DemoScore {
  A: number;
  B: number;
}

export interface DemoReport {
  headline: string;
  whyTheyWon: [string, string, string];
  turningPoint: { criterion?: CriterionId; text: string };
  loserTakeaways: [string, string];
  announcer: string;
}

export interface DemoClosing {
  headline: string;
  claim: string;
}

export interface DemoTapeInput {
  plans: Record<RoundNumber, Record<Slot, DemoPlan>>;
  scoresAB: Record<CriterionId, DemoScore>;
  scoresBA: Record<CriterionId, DemoScore>;
  rationales: Record<CriterionId, { comparison: string; A: string; B: string }>;
  roundSummaries: Record<RoundNumber, string>;
  report: DemoReport;
  scout: Record<Slot, string>;
  suddenDeath?: {
    closings: Record<Slot, DemoClosing>;
    votes: Record<"AB1" | "BA1" | "AB2" | "BA2", { winner: SuddenDeathVote["winner"]; analysis: string; decidingFactor: string }>;
  };
}

/**
 * Canned-tape builder for the demo tournament. Mirrors the shape of the
 * existing worked-example tapes: one scouting item per side, simultaneous
 * volleys, mechanical fact-checks, two judge orders, a report, and optional
 * sudden-death closings with four judge votes.
 */
export function buildDemoTape(input: DemoTapeInput): FixtureTape {
  checkDefenses(input.plans);
  const steps: Record<string, FixtureStep> = {};
  for (const slot of ["A", "B"] as const) {
    steps[stepKey.scout(slot)] = output({
      searchesRun: 2,
      evidence: [
        {
          url: `https://example.com/scout-${slot.toLowerCase()}`,
          title: slot === "A" ? "Opposition file" : "Response file",
          snippet: input.scout[slot],
          retrievedAt: DEMO_AT,
        },
      ],
    });
  }
  for (const round of [1, 2, 3] as const) {
    const verdicts: ShotVerdict[] = [];
    for (const slot of ["A", "B"] as const) {
      for (const volley of [1, 2] as const) {
        const shots = planFor(input.plans, round, slot)[volley === 1 ? "v1" : "v2"];
        steps[stepKey.volley(round, volley, slot)] = output({ shots: shots.map(toModelShot) });
        const ids = shots.map((_, index) => `${volleyScope(round, volley, slot)}.s${index + 1}`);
        steps[stepKey.factcheck(round, volley, slot)] = output(factChecks(ids, shots));
        ids.forEach((id, index) => {
          const shot = shots[index];
          if (!shot) return;
          verdicts.push({ shotId: id, verdict: shot.verdict, impact: shot.impact, note: shot.note });
        });
      }
    }
    steps[stepKey.judge(round, "AB")] = output(judgment(round, "AB", input, verdicts));
    steps[stepKey.judge(round, "BA")] = output(judgment(round, "BA", input, verdicts));
  }
  steps[stepKey.report] = output({
    headline: input.report.headline,
    whyTheyWon: [...input.report.whyTheyWon],
    turningPoint: { ...input.report.turningPoint },
    loserTakeaways: [...input.report.loserTakeaways],
    announcerLines: [{ cueRef: "intro", text: input.report.announcer }],
  });
  if (input.suddenDeath) {
    const closings = input.suddenDeath.closings;
    const closingA = closings.A;
    const closingB = closings.B;
    if (!closingA || !closingB) throw new Error("sudden death needs both closings");
    steps[stepKey.closing("A")] = output({ shots: [closingShot(closingA)] });
    steps[stepKey.closing("B")] = output({ shots: [closingShot(closingB)] });
    const votes = input.suddenDeath.votes;
    steps[stepKey.sdJudge("AB", 1)] = output(vote(votes.AB1));
    steps[stepKey.sdJudge("BA", 1)] = output(vote(votes.BA1));
    steps[stepKey.sdJudge("AB", 2)] = output(vote(votes.AB2));
    steps[stepKey.sdJudge("BA", 2)] = output(vote(votes.BA2));
  }
  return { steps };
}

/** A defense must answer a real volley-1 shot, or the engine reads it as a pitch. */
function checkDefenses(plans: Record<RoundNumber, Record<Slot, DemoPlan>>): void {
  for (const round of [1, 2, 3] as const) {
    for (const slot of ["A", "B"] as const) {
      const opponent = slot === "A" ? "B" : "A";
      const v1 = planFor(plans, round, opponent).v1;
      const v1Ids = new Set(v1.map((_, index) => `${volleyScope(round, 1, opponent)}.s${index + 1}`));
      for (const shot of planFor(plans, round, slot).v2) {
        if (shot.type !== "defense") continue;
        if (!shot.respondsTo || !v1Ids.has(shot.respondsTo)) {
          throw new Error(`defense "${shot.headline}" answers no real volley-1 shot in round ${round}`);
        }
      }
    }
  }
}

function toModelShot(shot: DemoShot): ShotModelOutput {
  const evidence = shot.evidence ?? [];
  if (shot.type === "defense") {
    return {
      type: "defense",
      criterion: shot.criterion,
      headline: shot.headline,
      claim: shot.claim,
      evidence,
      estimate: shot.estimate ?? evidence.length === 0,
      respondsTo: shot.respondsTo ?? "",
    };
  }
  return {
    type: shot.type,
    criterion: shot.criterion,
    headline: shot.headline,
    claim: shot.claim,
    evidence,
    estimate: shot.estimate ?? evidence.length === 0,
  };
}

function factChecks(ids: readonly string[], shots: readonly DemoShot[]): FactCheckResult {
  return {
    checks: ids.map((shotId, index) => ({
      shotId,
      missingIds: [],
      perEvidence: (shots[index]?.evidence ?? []).map((evidenceId) => ({
        evidenceId,
        verdict: "supported" as const,
        note: "The snippet agrees.",
      })),
      numberContradicted: false,
      fabricated: false,
    })),
  };
}

function judgment(
  round: RoundNumber,
  order: "AB" | "BA",
  input: DemoTapeInput,
  shots: ShotVerdict[],
): RoundJudgment {
  const first: Slot = order === "AB" ? "A" : "B";
  const second: Slot = first === "A" ? "B" : "A";
  const scores = order === "AB" ? input.scoresAB : input.scoresBA;
  return {
    criteria: criteriaOf(round).map((id) => {
      const cell = scores[id];
      const story = input.rationales[id];
      if (!cell || !story) throw new Error(`demo tape is missing scores for ${id}`);
      return {
        criterion: id,
        comparison: story.comparison,
        fighter_1: { rationale: sideText(story, first), capsApplied: [], score: sideScore(cell, first) },
        fighter_2: { rationale: sideText(story, second), capsApplied: [], score: sideScore(cell, second) },
      };
    }),
    shots,
    injectionSuspected: false,
    roundSummary: roundSummaryFor(input, round),
  };
}

function sideText(entry: { A: string; B: string }, slot: Slot): string {
  if (slot === "A") return entry.A;
  return entry.B;
}

function sideScore(score: DemoScore, slot: Slot): number {
  if (slot === "A") return score.A;
  return score.B;
}

function planFor(
  plans: DemoTapeInput["plans"],
  round: RoundNumber,
  slot: Slot,
): DemoPlan {
  const found = plans[round]?.[slot];
  if (!found) throw new Error(`demo tape is missing round ${round} ${slot}`);
  return found;
}

function roundSummaryFor(input: DemoTapeInput, round: RoundNumber): string {
  const found = input.roundSummaries[round];
  if (!found) throw new Error(`demo tape is missing a summary for round ${round}`);
  return found;
}

function criteriaOf(round: RoundNumber): CriterionId[] {
  if (round === 1) return ["problem", "market", "wtp"];
  if (round === 2) return ["differentiation", "moat", "timing"];
  return ["gtm", "feasibility", "scale"];
}

function closingShot(closing: DemoClosing): ShotModelOutput {
  return { type: "pitch", criterion: "problem", headline: closing.headline, claim: closing.claim, evidence: [], estimate: true };
}

function vote(voteInput: { winner: SuddenDeathVote["winner"]; analysis: string; decidingFactor: string }): SuddenDeathVote {
  return { analysis: voteInput.analysis, winner: voteInput.winner, confidence: 0.7, decidingFactor: voteInput.decidingFactor };
}

function output(value: unknown): FixtureStep {
  return { attempts: [{ kind: "output", output: value } satisfies FixtureAttempt] };
}
