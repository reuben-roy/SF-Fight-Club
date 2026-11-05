import {
  CRITERIA_BY_ROUND,
  type CriterionId,
  type EvidenceItem,
  type JudgeOrder,
  type RoundNumber,
  type Rubric,
  type Shot,
  type ShotFactCheck,
  type Slot,
  type StandardBrief,
  type Volley,
  type VolleyKind,
} from "@sf-fight-club/schemas";

export interface PacketShot {
  id: string;
  type: Shot["type"];
  criterion: CriterionId;
  headline: string;
  claim: string;
  evidence: string[];
  estimate: boolean;
  respondsTo?: string;
  fact?: Pick<ShotFactCheck, "missingIds" | "perEvidence" | "numberContradicted" | "fabricated">;
}

export type PacketVolley =
  | { kind: VolleyKind; note: string }
  | { kind: VolleyKind; shots: PacketShot[] };

export interface CriterionBrief {
  id: CriterionId;
  name: string;
  weight: number;
  question: string;
}

export interface VolleyRequest {
  stepKey: string;
  round: RoundNumber | "sudden_death";
  kind: VolleyKind;
  brief: StandardBrief;
  dossierSummary: string;
  opponentBrief: StandardBrief;
  opponentDossierSummary: string;
  evidence: { id: string; title: string; snippet: string; side: "self" | "opponent" }[];
  criteria: CriterionBrief[];
  ownVolley1?: PacketVolley;
  opponentVolley1?: PacketVolley;
  earlierRounds: { round: RoundNumber; self: PacketVolley[]; opponent: PacketVolley[] }[];
  previousError?: string;
  reminder?: string;
  moderationRegenerate?: boolean;
}

export interface JudgeFighterView {
  brief: StandardBrief;
  dossierSummary: string;
  volleys: PacketVolley[];
}

export interface JudgeRequest {
  stepKey: string;
  round: RoundNumber;
  order: JudgeOrder;
  criteria: CriterionBrief[];
  fighter1: JudgeFighterView;
  fighter2: JudgeFighterView;
  evidence: { id: string; title: string; snippet: string; side: "fighter_1" | "fighter_2" }[];
  earlierRounds: { round: RoundNumber; fighter1: PacketVolley[]; fighter2: PacketVolley[] }[];
  previousError?: string;
}

export interface FactCheckRequest {
  stepKey: string;
  round: RoundNumber;
  shots: PacketShot[];
  locker: { id: string; title: string; snippet: string }[];
  previousError?: string;
}

export interface ScoutRequest {
  stepKey: string;
  opponentBrief: StandardBrief;
  opponentDossierSummary: string;
  searches: number;
  keep: number;
  previousError?: string;
}

export interface SuddenDeathRequest {
  stepKey: string;
  order: "AB" | "BA";
  sample: 1 | 2;
  fighter1: { brief: StandardBrief; dossierSummary: string; closing: PacketVolley };
  fighter2: { brief: StandardBrief; dossierSummary: string; closing: PacketVolley };
  transcript: { round: RoundNumber; fighter1: PacketVolley[]; fighter2: PacketVolley[] }[];
  previousError?: string;
}

export interface ReportRequest {
  stepKey: string;
  names: { winner: string; loser: string };
  briefs: { A: StandardBrief; B: StandardBrief };
  winner: Slot;
  outcome: string;
  decidedBy: string;
  delta: number;
  previousError?: string;
}

export function roundCriteria(rubric: Rubric, round: RoundNumber): CriterionBrief[] {
  return CRITERIA_BY_ROUND[round].map((id) => {
    const criterion = rubric.criteria.find((item) => item.id === id);
    return {
      id,
      name: criterion?.name ?? id,
      weight: criterion?.weight ?? 0,
      question: criterion?.question ?? "",
    };
  });
}

/** Any empty volley is shown to the judge as no argument. Slurs never reach the packet. */
export function packetVolley(volley: Volley, label: "Fighter 1" | "Fighter 2", checks: readonly ShotFactCheck[]): PacketVolley {
  if (volley.shots.length === 0) {
    return { kind: volley.kind, note: `${label} made no argument this volley.` };
  }
  return {
    kind: volley.kind,
    shots: volley.shots.map((shot) => packetShot(shot, checks.find((check) => check.shotId === shot.id))),
  };
}

export function packetShot(shot: Shot, check?: ShotFactCheck): PacketShot {
  return {
    id: shot.id,
    type: shot.type,
    criterion: shot.criterion,
    headline: shot.headline,
    claim: shot.claim,
    evidence: shot.evidence,
    estimate: shot.estimate,
    ...(shot.respondsTo ? { respondsTo: shot.respondsTo } : {}),
    ...(check
      ? {
          fact: {
            missingIds: check.missingIds,
            perEvidence: check.perEvidence,
            numberContradicted: check.numberContradicted,
            fabricated: check.fabricated,
          },
        }
      : {}),
  };
}

export function evidenceSide(item: EvidenceItem, selfIdeaId: string, opponentIdeaId: string, self: Slot): "self" | "opponent" | null {
  if (item.foundBy.kind === "dossier") {
    if (item.foundBy.ideaId === selfIdeaId) return "self";
    if (item.foundBy.ideaId === opponentIdeaId) return "opponent";
    return null;
  }
  if (item.foundBy.fighter === self) return "self";
  return "opponent";
}

export const EMPTY_VOLLEY_NOTE = "made no argument this volley.";
