import { resolveBracket, seedBracket, type Bracket, type SlotResolution } from "@sf-fight-club/engine";
import type { FighterBuild, Rubric } from "@sf-fight-club/schemas";

import { permitVsFogcastTape } from "../tapes.js";
import { runMatch } from "../run.js";
import type { MatchRun } from "../types.js";
import { DEMO_ENTRANTS, makeFighterInput, type DemoEntrant } from "./entrants.js";
import { dermaVsCurbTape, dermaVsLoopTape, finalTape, flakeVsCurbTape, permitVsTabTape, tabVsPaperTape } from "./tapes.js";
import type { FixtureTape } from "../fixtures.js";

export const DEMO_SEED = "demo-tournament-v1";
export const DEMO_AT_DEFAULT = "2026-11-05T18:00:00.000Z";

export interface DemoMatchResult {
  roundIndex: number;
  slotIndex: number;
  matchId: string;
  entrantA: string;
  entrantB: string;
  run: MatchRun;
}

export interface DemoTournament {
  bracket: Bracket;
  entrants: readonly DemoEntrant[];
  matches: DemoMatchResult[];
  resolutions: SlotResolution[];
}

export interface RunDemoTournamentInput {
  at: string;
  build: FighterBuild;
  rubric: Rubric;
  /** Complete each match as it seals, revealing the script. Defaults to true. */
  publish?: boolean;
}

type TapeKey = "qf1" | "qf2" | "qf3" | "qf4" | "sf1" | "sf2" | "final";

/**
 * Seed the eight demo entrants, run all seven matches in round order, and
 * project the bracket. Slot A always holds the better (lower-numbered) seed,
 * so every tape argues for the right side. The tournament completes each
 * match as it seals, which is what reveals the script to public readers.
 */
export function runDemoTournament(input: RunDemoTournamentInput): DemoTournament {
  const bracket = seedBracket(
    DEMO_ENTRANTS.map((entrant) => ({ id: entrant.id, weighinTotal: entrant.weighinTotal })),
    { mode: "weighin", seed: DEMO_SEED },
  );
  const byId = new Map(DEMO_ENTRANTS.map((entrant) => [entrant.id, entrant]));
  const winners = new Map<string, string>();
  const matches: DemoMatchResult[] = [];

  const ordered = bracket.matches.slice().sort((left: (typeof bracket.matches)[number], right: (typeof bracket.matches)[number]) => left.roundIndex - right.roundIndex || left.slotIndex - right.slotIndex);
  for (const match of ordered) {
    const entrantA = entrantFor(match.a.kind === "fighter" ? match.a.id : winners.get(`${match.roundIndex - 1}:${match.slotIndex * 2}`), byId);
    const entrantB = entrantFor(match.b.kind === "fighter" ? match.b.id : winners.get(`${match.roundIndex - 1}:${match.slotIndex * 2 + 1}`), byId);
    const seeds = seedOf(bracket, entrantA.id, entrantB.id);
    const first = seeds.a < seeds.b ? entrantA : entrantB;
    const second = first === entrantA ? entrantB : entrantA;
    const tapeKey = tapeFor(match.roundIndex, match.slotIndex);
    const matchId = `demo-r${match.roundIndex}s${match.slotIndex}`;
    const run = runMatch({
      matchId,
      matchSeed: `${DEMO_SEED}/r${match.roundIndex}s${match.slotIndex}`,
      status: "locked",
      at: input.at,
      build: input.build,
      rubric: input.rubric,
      fighters: {
        A: makeFighterInput(first, seedsOf(bracket, first.id)),
        B: makeFighterInput(second, seedsOf(bracket, second.id)),
      },
      dossierEvidence: [...first.dossierEvidence, ...second.dossierEvidence],
      fixtures: tapeForKey(tapeKey),
      ...(input.publish === false ? {} : { publish: true as const }),
    });
    const winner = run.resolution?.winner;
    if (!winner) throw new Error(`${matchId} resolved without a winner`);
    winners.set(`${match.roundIndex}:${match.slotIndex}`, winner === "A" ? first.id : second.id);
    matches.push({ roundIndex: match.roundIndex, slotIndex: match.slotIndex, matchId, entrantA: first.id, entrantB: second.id, run });
  }

  const resolutions = resolveBracket({
    bracket,
    results: matches.map((match) => ({
      roundIndex: match.roundIndex,
      slotIndex: match.slotIndex,
      winnerId: match.run.resolution?.winner === "A" ? match.entrantA : match.entrantB,
      status: "complete" as const,
    })),
  });
  return { bracket, entrants: DEMO_ENTRANTS, matches, resolutions };
}

function entrantFor(id: string | undefined, byId: ReadonlyMap<string, DemoEntrant>): DemoEntrant {
  const entrant = id === undefined ? undefined : byId.get(id);
  if (!entrant) throw new Error(`demo bracket produced an unknown entrant ${id ?? "missing"}`);
  return entrant;
}

function seedOf(bracket: Bracket, a: string, b: string): { a: number; b: number } {
  return { a: seedsOf(bracket, a), b: seedsOf(bracket, b) };
}

function seedsOf(bracket: Bracket, id: string): number {
  const found = bracket.entrants.find((entrant) => entrant.id === id);
  if (!found) throw new Error(`entrant ${id} is not in the demo bracket`);
  return found.seed;
}

function tapeFor(roundIndex: number, slotIndex: number): TapeKey {
  if (roundIndex === 0 && slotIndex === 0) return "qf1";
  if (roundIndex === 0 && slotIndex === 1) return "qf2";
  if (roundIndex === 0 && slotIndex === 2) return "qf3";
  if (roundIndex === 0 && slotIndex === 3) return "qf4";
  if (roundIndex === 1 && slotIndex === 0) return "sf1";
  if (roundIndex === 1 && slotIndex === 1) return "sf2";
  if (roundIndex === 2 && slotIndex === 0) return "final";
  throw new Error(`demo bracket has no tape for round ${roundIndex} slot ${slotIndex}`);
}

function tapeForKey(key: TapeKey): FixtureTape {
  if (key === "qf1") return permitVsFogcastTape();
  if (key === "qf2") return tabVsPaperTape();
  if (key === "qf3") return dermaVsLoopTape();
  if (key === "qf4") return flakeVsCurbTape();
  if (key === "sf1") return permitVsTabTape();
  if (key === "sf2") return dermaVsCurbTape();
  return finalTape();
}
