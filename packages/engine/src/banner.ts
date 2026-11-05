import type { MatchResolution, OutcomeKind } from "@sf-fight-club/schemas";

export interface OutcomeBanner {
  outcome: OutcomeKind;
  decisionType?: "unanimous" | "majority";
  perfect: boolean;
  /** FE-15. Both weighted rubric totals are under 30. */
  pyrrhic: boolean;
  stamp: string;
  pyrrhicStamp: "PYRRHIC VICTORY" | null;
  perfectStamp: "PERFECT" | null;
}

const STAMP: Record<OutcomeKind, string> = {
  KO: "K.O.",
  DECISION: "DECISION",
  SUDDEN_DEATH: "SUDDEN DEATH",
  BYE: "BYE",
  WALKOVER: "WALKOVER",
};

export function outcomeBanner(resolution: Pick<MatchResolution, "outcome" | "decisionType" | "perfect" | "pyrrhic">): OutcomeBanner {
  return {
    outcome: resolution.outcome,
    ...(resolution.decisionType ? { decisionType: resolution.decisionType } : {}),
    perfect: resolution.perfect,
    pyrrhic: resolution.pyrrhic === true,
    stamp: STAMP[resolution.outcome],
    pyrrhicStamp: resolution.pyrrhic === true ? "PYRRHIC VICTORY" : null,
    perfectStamp: resolution.perfect ? "PERFECT" : null,
  };
}
