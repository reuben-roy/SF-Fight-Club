import { buildOrgChart, resolveBracket, seedBracket, type Bracket, type SlotResolution } from "@sf-fight-club/engine";
import type { OrgChart } from "@sf-fight-club/schemas";

import type { TowerEntrant, TowerMatch } from "../types.js";
import { MASCOT_CLASS_INFO } from "../../art/palette.js";
import type { FixtureDocument } from "./schema.js";

export interface TournamentResult {
  matchId: string;
  roundIndex: number;
  slotIndex: number;
  entrantA: string;
  entrantB: string;
  winnerId: string;
}

export interface TournamentData {
  bracket: Bracket;
  entrants: Record<string, TowerEntrant>;
  /** Played matches in air order. Every prefix is a legal tournament state. */
  results: readonly TournamentResult[];
}

export interface TournamentStep {
  chart: OrgChart;
  previousChart: OrgChart | null;
  matches: TowerMatch[];
  /** The result that moved the chart into this step, if any. */
  applied: TournamentResult | null;
}

export function emptyEntrants(): Record<string, TowerEntrant> {
  return {};
}

export function entrantsFromFixture(document: FixtureDocument): Record<string, TowerEntrant> {
  const entrants: Record<string, TowerEntrant> = {};
  for (const entrant of document.entrants) {
    entrants[entrant.entrantId] = {
      entrantId: entrant.entrantId,
      name: entrant.name,
      spriteSeed: entrant.spriteSeed,
      category: entrant.category,
      oneLiner: entrant.oneLiner,
      clout: entrant.clout.score,
      cloutTier: entrant.clout.tier,
    };
  }
  return entrants;
}

export function tournamentFromFixture(document: FixtureDocument): TournamentData {
  return {
    bracket: document.bracket,
    entrants: entrantsFromFixture(document),
    results: document.matches,
  };
}

function completedResults(data: TournamentData, step: number): TournamentResult[] {
  return data.results.slice(0, Math.max(0, Math.min(step, data.results.length)));
}

export function chartAt(data: TournamentData, step: number): OrgChart {
  const resolutions = resolveBracket({
    bracket: data.bracket,
    results: completedResults(data, step).map((result) => ({
      roundIndex: result.roundIndex,
      slotIndex: result.slotIndex,
      winnerId: result.winnerId,
      status: "complete" as const,
    })),
  });
  return buildOrgChart({ bracket: data.bracket, resolutions });
}

function advancedWinners(data: TournamentData, step: number): Map<string, string> {
  const winners = new Map<string, string>();
  const resolutions: SlotResolution[] = resolveBracket({
    bracket: data.bracket,
    results: completedResults(data, step).map((result) => ({
      roundIndex: result.roundIndex,
      slotIndex: result.slotIndex,
      winnerId: result.winnerId,
      status: "complete" as const,
    })),
  });
  for (const resolution of resolutions) {
    switch (resolution.kind) {
      case "COMPLETE":
      case "BYE":
      case "WALKOVER":
        winners.set(`${resolution.roundIndex}:${resolution.slotIndex}`, resolution.winnerId);
        break;
      case "SEALED":
      case "PENDING":
      case "VOID":
        break;
      default: {
        const _exhaustive: never = resolution;
        throw new Error(`unknown resolution ${JSON.stringify(_exhaustive)}`);
      }
    }
  }
  return winners;
}

/**
 * The public match list for a step. A side fed by an unfinished match stays
 * null, so nothing sealed leaks through this screen.
 */
export function matchesAt(data: TournamentData, step: number): TowerMatch[] {
  const winners = advancedWinners(data, step);
  const played = new Set(
    completedResults(data, step).map((result) => `${result.roundIndex}:${result.slotIndex}`),
  );

  const ordered = data.bracket.matches.slice().sort((left, right) => {
    if (left.roundIndex !== right.roundIndex) return left.roundIndex - right.roundIndex;
    return left.slotIndex - right.slotIndex;
  });
  const next = ordered.find((match) => !played.has(`${match.roundIndex}:${match.slotIndex}`));

  return ordered.map((match) => {
    const key = `${match.roundIndex}:${match.slotIndex}`;
    const status: TowerMatch["status"] = played.has(key)
      ? "complete"
      : next === match
        ? "betting_open"
        : "scheduled";
    return {
      matchId: matchIdOf(data, match.roundIndex, match.slotIndex),
      roundIndex: match.roundIndex,
      slotIndex: match.slotIndex,
      a: entrantOfSide(match.a, winners),
      b: entrantOfSide(match.b, winners),
      status,
    };
  });
}

function matchIdOf(data: TournamentData, roundIndex: number, slotIndex: number): string {
  const found = data.results.find(
    (result) => result.roundIndex === roundIndex && result.slotIndex === slotIndex,
  );
  return found ? found.matchId : `r${roundIndex}s${slotIndex}`;
}

function entrantOfSide(
  side: Bracket["matches"][number]["a"],
  winners: ReadonlyMap<string, string>,
): string | null {
  switch (side.kind) {
    case "fighter":
      return side.id;
    case "bye":
      return null;
    case "winner_of":
      return winners.get(`${side.roundIndex}:${side.slotIndex}`) ?? null;
    default: {
      const _exhaustive: never = side;
      throw new Error(`unknown bracket side ${JSON.stringify(_exhaustive)}`);
    }
  }
}

export function stepOf(data: TournamentData, step: number): TournamentStep {
  const clamped = Math.max(0, Math.min(step, data.results.length));
  return {
    chart: chartAt(data, clamped),
    previousChart: clamped > 0 ? chartAt(data, clamped - 1) : null,
    matches: matchesAt(data, clamped),
    applied: clamped > 0 ? data.results[clamped - 1] ?? null : null,
  };
}

export function totalSteps(data: TournamentData): number {
  return data.results.length;
}

/* Synthetic fields ------------------------------------------------------- */

const PREFIXES = [
  "North",
  "Curb",
  "Permit",
  "Fog",
  "Tab",
  "Loop",
  "Flake",
  "Derma",
  "Paper",
  "Signal",
  "Ledger",
  "Modal",
  "Relay",
  "Harbor",
  "Pixel",
  "Queue",
] as const;

const SUFFIXES = ["Pilot", "Works", "Labs", "Desk", "Route", "Room", "Grid", "Stack"] as const;

const CATEGORIES = Object.values(MASCOT_CLASS_INFO).flatMap((info) => info.categories);

function tierFor(clout: number): string {
  if (clout >= 78) return "S";
  if (clout >= 58) return "A";
  if (clout >= 34) return "B";
  return "C";
}

export interface SyntheticTournamentInput {
  size: number;
  seed?: string;
}

/**
 * A deterministic fake field for size checks. Every match is played with a
 * random winner, so any prefix is a legal state and the stepper always works.
 */
export function buildSyntheticTournament(input: SyntheticTournamentInput): TournamentData {
  const seed = input.seed ?? "synthetic-tower";
  const ids = Array.from({ length: input.size }, (_, index) => `synth-${index + 1}`);
  const names = ids.map((_, index) => {
    const prefix = PREFIXES[index % PREFIXES.length] ?? "North";
    const suffix = SUFFIXES[Math.floor(index / PREFIXES.length) % SUFFIXES.length] ?? "Works";
    return `${prefix}${suffix}`;
  });
  const entrants: Record<string, TowerEntrant> = {};
  ids.forEach((entrantId, index) => {
    const category = CATEGORIES[index % CATEGORIES.length] ?? "proptech";
    const clout = 12 + ((index * 37) % 84);
    entrants[entrantId] = {
      entrantId,
      name: names[index] ?? entrantId,
      spriteSeed: `synth-${index + 1}-${seed}`,
      category,
      oneLiner: `${names[index] ?? "A startup"} runs the ${category} block.`,
      clout,
      cloutTier: tierFor(clout),
    };
  });

  const bracket = seedBracket(
    ids.map((id, index) => ({ id, weighinTotal: 40 + ((index * 17) % 40) })),
    { mode: "weighin", seed: `${seed}:${input.size}` },
  );

  const results: TournamentResult[] = [];
  const winners = new Map<string, string>();
  const ordered = bracket.matches.slice().sort((left, right) => {
    if (left.roundIndex !== right.roundIndex) return left.roundIndex - right.roundIndex;
    return left.slotIndex - right.slotIndex;
  });
  ordered.forEach((match, index) => {
    const a = entrantOfSide(match.a, winners);
    const b = entrantOfSide(match.b, winners);
    if (a === null || b === null) return;
    const winnerId = ((index * 7 + input.size * 3) % 11) % 2 === 0 ? a : b;
    winners.set(`${match.roundIndex}:${match.slotIndex}`, winnerId);
    results.push({
      matchId: `synthetic-r${match.roundIndex}s${match.slotIndex}`,
      roundIndex: match.roundIndex,
      slotIndex: match.slotIndex,
      entrantA: a,
      entrantB: b,
      winnerId,
    });
  });

  return { bracket, entrants, results };
}

/** Where a synthetic field opens: partway through, so several roots are alive. */
export function syntheticOpeningStep(data: TournamentData): number {
  if (data.results.length === 0) return 0;
  return Math.max(1, Math.floor(data.results.length * 0.6));
}
