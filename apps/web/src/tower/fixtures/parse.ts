import type { Bracket, BracketMatch, BracketSide, SeededEntrant } from "@sf-fight-club/engine";
import { entrantProfileSchema } from "@sf-fight-club/schemas";

import type { FixtureDocument, FixtureEntrant, FixtureMatch } from "./schema.js";

function fail(where: string, message: string): never {
  throw new Error(`fixture ${where}: ${message}`);
}

function record(value: unknown, where: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(where, "expected an object");
  return value as Record<string, unknown>;
}

function list(value: unknown, where: string): unknown[] {
  if (!Array.isArray(value)) fail(where, "expected an array");
  return value;
}

function text(value: unknown, where: string): string {
  if (typeof value !== "string" || value.length === 0) fail(where, "expected a non-empty string");
  return value;
}

function integer(value: unknown, where: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum) {
    fail(where, `expected an integer of at least ${minimum}`);
  }
  return value;
}

function side(value: unknown, where: string): BracketSide {
  const source = record(value, where);
  const kind = text(source["kind"], `${where}.kind`);
  switch (kind) {
    case "fighter":
      return {
        kind: "fighter",
        id: text(source["id"], `${where}.id`),
        seed: integer(source["seed"], `${where}.seed`, 1),
      };
    case "bye":
      return { kind: "bye" };
    case "winner_of":
      return {
        kind: "winner_of",
        roundIndex: integer(source["roundIndex"], `${where}.roundIndex`),
        slotIndex: integer(source["slotIndex"], `${where}.slotIndex`),
      };
    default:
      fail(`${where}.kind`, `unknown bracket side ${kind}`);
  }
}

function seededEntrant(value: unknown, where: string): SeededEntrant {
  const source = record(value, where);
  return {
    id: text(source["id"], `${where}.id`),
    weighinTotal: number(source["weighinTotal"], `${where}.weighinTotal`),
    seed: integer(source["seed"], `${where}.seed`, 1),
  };
}

function number(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(where, "expected a number");
  return value;
}

function match(value: unknown, where: string): BracketMatch {
  const source = record(value, where);
  const bye = source["bye"];
  if (typeof bye !== "boolean") fail(`${where}.bye`, "expected a boolean");
  const out: BracketMatch = {
    roundIndex: integer(source["roundIndex"], `${where}.roundIndex`),
    slotIndex: integer(source["slotIndex"], `${where}.slotIndex`),
    a: side(source["a"], `${where}.a`),
    b: side(source["b"], `${where}.b`),
    bye,
  };
  const winnerId = source["winnerId"];
  const winnerSeed = source["winnerSeed"];
  if (winnerId !== undefined) out.winnerId = text(winnerId, `${where}.winnerId`);
  if (winnerSeed !== undefined) out.winnerSeed = integer(winnerSeed, `${where}.winnerSeed`, 1);
  return out;
}

function bracket(value: unknown): Bracket {
  const source = record(value, "bracket");
  const mode = text(source["seedingMode"], "bracket.seedingMode");
  if (mode !== "weighin" && mode !== "random") fail("bracket.seedingMode", `unknown mode ${mode}`);
  const fallback = source["seedingFallback"];
  if (fallback !== null && fallback !== "random") fail("bracket.seedingFallback", "expected null or random");
  return {
    fieldSize: integer(source["fieldSize"], "bracket.fieldSize", 2),
    bracketSize: integer(source["bracketSize"], "bracket.bracketSize", 2),
    seedingMode: mode,
    seedingFallback: fallback,
    seed: text(source["seed"], "bracket.seed"),
    entrants: list(source["entrants"], "bracket.entrants").map((item, index) =>
      seededEntrant(item, `bracket.entrants[${index}]`),
    ),
    matches: list(source["matches"], "bracket.matches").map((item, index) => match(item, `bracket.matches[${index}]`)),
  };
}

function entrant(value: unknown, where: string): FixtureEntrant {
  const source = record(value, where);
  const clout = record(source["clout"], `${where}.clout`);
  const parsedProfile = entrantProfileSchema.safeParse(source["profile"]);
  if (!parsedProfile.success) fail(`${where}.profile`, parsedProfile.error.message);
  return {
    entrantId: text(source["entrantId"], `${where}.entrantId`),
    name: text(source["name"], `${where}.name`),
    category: text(source["category"], `${where}.category`),
    oneLiner: text(source["oneLiner"], `${where}.oneLiner`),
    spriteSeed: text(source["spriteSeed"], `${where}.spriteSeed`),
    tier: text(source["tier"], `${where}.tier`),
    clout: {
      score: number(clout["score"], `${where}.clout.score`),
      tier: text(clout["tier"], `${where}.clout.tier`),
    },
    profile: parsedProfile.data,
  };
}

function playedMatch(value: unknown, where: string): FixtureMatch {
  const source = record(value, where);
  return {
    matchId: text(source["matchId"], `${where}.matchId`),
    roundIndex: integer(source["roundIndex"], `${where}.roundIndex`),
    slotIndex: integer(source["slotIndex"], `${where}.slotIndex`),
    entrantA: text(source["entrantA"], `${where}.entrantA`),
    entrantB: text(source["entrantB"], `${where}.entrantB`),
    winnerId: text(source["winnerId"], `${where}.winnerId`),
  };
}

/**
 * Boundary parser for the committed JSON fixture. Browser code imports the raw
 * text, so nothing reaches a component until it has the shape the screens expect.
 */
export function parseFixtureDocument(value: unknown): FixtureDocument {
  const source = record(value, "document");
  return {
    buildHash: text(source["buildHash"], "document.buildHash"),
    seed: text(source["seed"], "document.seed"),
    bracket: bracket(source["bracket"]),
    entrants: list(source["entrants"], "document.entrants").map((item, index) =>
      entrant(item, `document.entrants[${index}]`),
    ),
    matches: list(source["matches"], "document.matches").map((item, index) =>
      playedMatch(item, `document.matches[${index}]`),
    ),
  };
}
