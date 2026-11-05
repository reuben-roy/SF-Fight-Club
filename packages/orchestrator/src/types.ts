import * as z from "zod";

import type { CleanLogEntry } from "@sf-fight-club/engine";
import type {
  BroadcastScript,
  EvidenceItem,
  FighterBuild,
  MatchEvent,
  MatchResolution,
  MatchStatus,
  Rubric,
  Slot,
  StandardBrief,
} from "@sf-fight-club/schemas";

import type { FixtureTape } from "./fixtures.js";

export const llmCallSchema = z.strictObject({
  id: z.string().min(1),
  matchId: z.string().min(1),
  stepKey: z.string().min(1),
  role: z.enum(["fighter", "judge", "utility"]),
  model: z.string().min(1),
  attempt: z.number().int().positive(),
  retry: z.boolean(),
  ok: z.boolean(),
  request: z.unknown(),
  response: z.unknown(),
  error: z.string().optional(),
  latencyMs: z.literal(0),
  tokensIn: z.literal(0),
  tokensOut: z.literal(0),
  costUsd: z.literal(0),
});

export type LlmCall = z.infer<typeof llmCallSchema>;

export interface OrchestratorWarning {
  code: string;
  stepKey: string;
  detail: string;
}

export interface FighterInput {
  name: string;
  seed: number;
  tier: string;
  spriteSeed: string;
  ideaId: string;
  weighinTotal: number;
  brief: StandardBrief;
  dossierSummary: string;
}

export interface PublicFighter {
  name: string;
  seed: number;
  tier: string;
  spriteSeed: string;
}

/**
 * Worker input. `at` is the timestamp written on new events. This package
 * does not read the clock. `fixtures` is parsed with `parseFixtureTape`.
 */
export interface RunMatchInput {
  matchId: string;
  matchSeed: string;
  status: MatchStatus;
  at: string;
  build: FighterBuild;
  rubric: Rubric;
  fighters: Record<Slot, FighterInput>;
  dossierEvidence: readonly EvidenceItem[];
  fixtures: unknown;
  prior?: {
    events: readonly MatchEvent[];
    calls: readonly LlmCall[];
  };
  /** FE-19. Checked only when starting a match that has no compute events yet. */
  budget?: {
    remainingUsd: number;
    medianMatchUsd: number;
  };
  /** When the pipeline seals, mark the match `complete` so the public view reveals it. */
  publish?: boolean;
}

/** Worker record. The script is here once sealed. Public readers use `toPublicMatch`. */
export interface MatchRun {
  matchId: string;
  status: "sealed" | "failed" | "complete";
  events: MatchEvent[];
  calls: LlmCall[];
  warnings: OrchestratorWarning[];
  cleanLog: CleanLogEntry[];
  script: BroadcastScript | null;
  resolution: MatchResolution | null;
  buildHash: string;
  rubric: Rubric;
  fighters: Record<Slot, PublicFighter>;
  corners: { left: Slot; right: Slot } | null;
  fixtureReads: readonly string[];
}

export interface PublicMatch {
  matchId: string;
  status: MatchStatus;
  fighters: Record<Slot, PublicFighter>;
  corners: { left: Slot; right: Slot } | null;
  winner: Slot | null;
  outcome: MatchResolution["outcome"] | null;
  decidedBy: MatchResolution["decidedBy"] | null;
  script: BroadcastScript | null;
  events: MatchEvent[] | null;
  calls: LlmCall[] | null;
}

export type { FixtureTape };
