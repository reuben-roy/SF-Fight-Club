import type { OrgChart, OrgNode, OrgTitle } from "@sf-fight-club/schemas";

import type { Bracket, BracketMatch, SlotResolution } from "./bracket.js";
import { EngineError } from "./errors.js";

const LADDER: readonly OrgTitle[] = ["Intern", "Associate", "Manager", "Director", "VP", "President", "CEO"];

interface Builder {
  node: OrgNode;
  advances: number;
  position: { slotIndex: number; side: number };
}

/**
 * Totem view of the bracket. Beat a company and it reports to you with its
 * whole sub-org. Only COMPLETE, BYE and WALKOVER resolutions move anyone.
 * Sealed, pending and void slots read as unplayed.
 */
export function buildOrgChart(input: { bracket: Bracket; resolutions: readonly SlotResolution[] }): OrgChart {
  const rounds = countRounds(input.bracket);
  if (rounds + 1 > LADDER.length) {
    throw new EngineError("field_too_large", `a ${rounds}-round field needs more rungs than the ladder has`);
  }
  const rungs = LADDER.slice(LADDER.length - (rounds + 1));
  const builders = seedBuilders(input.bracket);
  const winners = new Map<string, string>();

  const ordered = input.resolutions.slice().sort((left, right) => {
    if (left.roundIndex !== right.roundIndex) return left.roundIndex - right.roundIndex;
    return left.slotIndex - right.slotIndex;
  });
  for (const resolution of ordered) {
    applyResolution({ bracket: input.bracket, builders, winners, rungs, resolution });
  }

  for (const builder of builders.values()) {
    builder.node.headcount = countHeadcount(builder.node);
    builder.node.wins = builder.node.reports.filter((report) => report.via === "FIGHT").length;
  }

  const roots = [...builders.values()]
    .filter((builder) => builder.node.defeatedBy === null)
    .sort((left, right) => {
      if (left.position.slotIndex !== right.position.slotIndex) return left.position.slotIndex - right.position.slotIndex;
      return left.position.side - right.position.side;
    })
    .map((builder) => builder.node);

  return { rounds, roots, championId: championOf(input.bracket, input.resolutions) };
}

function countRounds(bracket: Bracket): number {
  let max = -1;
  for (const match of bracket.matches) {
    if (match.roundIndex > max) max = match.roundIndex;
  }
  if (max < 0) {
    throw new EngineError("empty_bracket", "the bracket has no matches");
  }
  return max + 1;
}

function seedBuilders(bracket: Bracket): Map<string, Builder> {
  const builders = new Map<string, Builder>();
  for (const entrant of bracket.entrants) {
    const position = bracketPosition(bracket, entrant.id);
    builders.set(entrant.id, {
      node: {
        entrantId: entrant.id,
        seed: entrant.seed,
        title: startTitle(bracket, entrant.id),
        wins: 0,
        headcount: 1,
        alive: true,
        defeatedBy: null,
        defeatedInRound: null,
        via: null,
        reports: [],
      },
      advances: 0,
      position,
    });
  }
  return builders;
}

function startTitle(bracket: Bracket, entrantId: string): OrgTitle {
  const rounds = countRounds(bracket);
  const rungs = LADDER.slice(LADDER.length - (rounds + 1));
  const title = rungs[0];
  if (!title) {
    throw new EngineError("field_too_large", `entrant ${entrantId} has no starting rung`);
  }
  return title;
}

function bracketPosition(bracket: Bracket, entrantId: string): { slotIndex: number; side: number } {
  const openers = bracket.matches
    .filter((match) => match.roundIndex === 0)
    .sort((left, right) => left.slotIndex - right.slotIndex);
  for (const match of openers) {
    if (match.a.kind === "fighter" && match.a.id === entrantId) return { slotIndex: match.slotIndex, side: 0 };
    if (match.b.kind === "fighter" && match.b.id === entrantId) return { slotIndex: match.slotIndex, side: 1 };
  }
  throw new EngineError("missing_entrant", `entrant ${entrantId} has no opening slot`);
}

function applyResolution(input: {
  bracket: Bracket;
  builders: Map<string, Builder>;
  winners: Map<string, string>;
  rungs: readonly OrgTitle[];
  resolution: SlotResolution;
}): void {
  const { resolution } = input;
  switch (resolution.kind) {
    case "COMPLETE": {
      const loser = loserOf(input.bracket, input.winners, resolution.roundIndex, resolution.slotIndex, resolution.winnerId);
      advance(input.builders, input.rungs, resolution.winnerId);
      attach(input.builders, loser, {
        defeatedBy: resolution.winnerId,
        defeatedInRound: resolution.roundIndex,
        via: "FIGHT",
      });
      input.winners.set(slotKey(resolution.roundIndex, resolution.slotIndex), resolution.winnerId);
      return;
    }
    case "BYE": {
      advance(input.builders, input.rungs, resolution.winnerId);
      input.winners.set(slotKey(resolution.roundIndex, resolution.slotIndex), resolution.winnerId);
      return;
    }
    case "WALKOVER": {
      advance(input.builders, input.rungs, resolution.winnerId);
      attach(input.builders, resolution.absentId, {
        defeatedBy: resolution.winnerId,
        defeatedInRound: resolution.roundIndex,
        via: "WALKOVER",
      });
      input.winners.set(slotKey(resolution.roundIndex, resolution.slotIndex), resolution.winnerId);
      return;
    }
    case "SEALED":
    case "PENDING":
    case "VOID": {
      return;
    }
    default: {
      const _exhaustive: never = resolution;
      throw new EngineError("bad_resolution", `unknown resolution kind ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function advance(builders: Map<string, Builder>, rungs: readonly OrgTitle[], winnerId: string): void {
  const builder = builders.get(winnerId);
  if (!builder) {
    throw new EngineError("missing_entrant", `winner ${winnerId} is not in the field`);
  }
  builder.advances += 1;
  const title = rungs[Math.min(builder.advances, rungs.length - 1)];
  if (!title) {
    throw new EngineError("field_too_large", `winner ${winnerId} advanced past the top rung`);
  }
  builder.node.title = title;
}

function attach(
  builders: Map<string, Builder>,
  loserId: string,
  input: { defeatedBy: string; defeatedInRound: number; via: "FIGHT" | "WALKOVER" },
): void {
  const loser = builders.get(loserId);
  if (!loser) {
    throw new EngineError("missing_entrant", `loser ${loserId} is not in the field`);
  }
  if (loser.node.defeatedBy !== null) {
    throw new EngineError("double_defeat", `entrant ${loserId} already reports to ${loser.node.defeatedBy}`);
  }
  const winner = builders.get(input.defeatedBy);
  if (!winner) {
    throw new EngineError("missing_entrant", `winner ${input.defeatedBy} is not in the field`);
  }
  loser.node.alive = false;
  loser.node.defeatedBy = input.defeatedBy;
  loser.node.defeatedInRound = input.defeatedInRound;
  loser.node.via = input.via;
  winner.node.reports.unshift(loser.node);
}

function loserOf(
  bracket: Bracket,
  winners: ReadonlyMap<string, string>,
  roundIndex: number,
  slotIndex: number,
  winnerId: string,
): string {
  const match = bracket.matches.find((item) => item.roundIndex === roundIndex && item.slotIndex === slotIndex);
  if (!match) {
    throw new EngineError("unknown_slot", `no bracket slot ${roundIndex}:${slotIndex}`);
  }
  const sides = [sideEntrant(match.a, winners), sideEntrant(match.b, winners)];
  const loser = sides.find((id) => id !== null && id !== winnerId);
  if (loser === undefined || loser === null) {
    throw new EngineError("unknown_loser", `slot ${roundIndex}:${slotIndex} has no opponent for ${winnerId}`);
  }
  return loser;
}

function sideEntrant(
  side: BracketMatch["a"],
  winners: ReadonlyMap<string, string>,
): string | null {
  switch (side.kind) {
    case "fighter":
      return side.id;
    case "bye":
      return null;
    case "winner_of":
      return winners.get(slotKey(side.roundIndex, side.slotIndex)) ?? null;
    default: {
      const _exhaustive: never = side;
      throw new EngineError("bad_side", `unknown bracket side ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function championOf(bracket: Bracket, resolutions: readonly SlotResolution[]): string | null {
  let lastRound = -1;
  for (const match of bracket.matches) {
    if (match.roundIndex > lastRound) lastRound = match.roundIndex;
  }
  const fin = resolutions.find((resolution) => resolution.roundIndex === lastRound && resolution.slotIndex === 0);
  if (!fin || fin.kind !== "COMPLETE") return null;
  return fin.winnerId;
}

function countHeadcount(node: OrgNode): number {
  let total = 1;
  for (const report of node.reports) {
    total += countHeadcount(report);
  }
  return total;
}

function slotKey(roundIndex: number, slotIndex: number): string {
  return `${roundIndex}:${slotIndex}`;
}
