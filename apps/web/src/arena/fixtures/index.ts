import type {
  BroadcastScript,
  CriterionId,
  Cue,
  FighterStatus,
  OutcomeKind,
  RoundName,
  RoundNumber,
  Slot,
  Weapon,
} from "@sf-fight-club/schemas";

import type { ArenaFighter } from "../types.js";
import demoJson from "./demo.json";

/**
 * The committed JSON comes from `fixtures/generate.ts`, which runs the demo
 * tournament through the real orchestrator. The arena still validates it on
 * load: a fixture that drifts must fail loudly instead of drawing a blank ring.
 */

type Field<T> = (value: unknown) => T | null;

const CRITERIA: readonly CriterionId[] = [
  "problem",
  "market",
  "wtp",
  "differentiation",
  "moat",
  "timing",
  "gtm",
  "feasibility",
  "scale",
];

const WEAPONS: readonly Weapon[] = [
  "flame_lance",
  "ballista",
  "coin_cannon",
  "laser_rifle",
  "trebuchet",
  "clockwork_railgun",
  "gatling",
  "rocket",
  "orbital_beam",
];

const STATUSES: readonly FighterStatus[] = ["momentum", "exposed", "last_stand"];

const OUTCOMES: readonly OutcomeKind[] = ["KO", "DECISION", "SUDDEN_DEATH", "BYE", "WALKOVER"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readAs<T>(value: unknown, read: (raw: Record<string, unknown>) => T | null): T | null {
  return isRecord(value) ? read(value) : null;
}

const readString: Field<string> = (value) => (typeof value === "string" ? value : null);

const readNumber: Field<number> = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);

const readBoolean: Field<boolean> = (value) => (typeof value === "boolean" ? value : null);

function readArray<T>(read: Field<T>): Field<readonly T[]> {
  return (value) => {
    if (!Array.isArray(value)) return null;
    const items: T[] = [];
    for (const item of value) {
      const parsed = read(item);
      if (parsed === null) return null;
      items.push(parsed);
    }
    return items;
  };
}

function readEnum<T extends string>(values: readonly T[]): Field<T> {
  return (value) => (typeof value === "string" ? (values.find((candidate) => candidate === value) ?? null) : null);
}

const readSlot = readEnum<Slot>(["A", "B"]);
const readRound = (value: unknown): RoundNumber | null => {
  if (value === 1) return 1;
  if (value === 2) return 2;
  if (value === 3) return 3;
  return null;
};

const readRoundName = readEnum<RoundName>(["MARKET", "MOAT", "EXECUTION"]);

const readImpact = (value: unknown): 0 | 1 | 2 | 3 | null => {
  if (value === 0) return 0;
  if (value === 1) return 1;
  if (value === 2) return 2;
  if (value === 3) return 3;
  return null;
};

const readVolley = (value: unknown): 1 | 2 | null => {
  if (value === 1) return 1;
  if (value === 2) return 2;
  return null;
};
const readCriterion = readEnum(CRITERIA);
const readWeapon = readEnum(WEAPONS);
const readStatus = readEnum(STATUSES);
const readOutcome = readEnum(OUTCOMES);

type Move = Extract<Cue, { kind: "shot" }>["move"];
type Evidence = Extract<Cue, { kind: "shot" }>["evidence"][number];

const readMove: Field<Move> = (value) =>
  readAs(value, (raw) => {
    const name = readString(raw.name);
    const element = readEnum<Move["element"]>(["market", "moat", "execution"])(raw.element);
    const criterion = readCriterion(raw.criterion);
    const type = readEnum<Move["type"]>(["pitch", "attack", "defense"])(raw.type);
    if (name === null || element === null || criterion === null || type === null) return null;
    return { name, element, criterion, type };
  });

const readEvidence: Field<Evidence> = (value) =>
  readAs(value, (raw) => {
    const id = readString(raw.id);
    const status = readEnum<Evidence["status"]>(["supported", "partial", "estimate", "fabricated"])(raw.status);
    if (id === null || status === null) return null;
    return { id, status };
  });

const readHp: Field<Record<Slot, number>> = (value) =>
  readAs(value, (raw) => {
    const a = readNumber(raw.A);
    const b = readNumber(raw.B);
    if (a === null || b === null) return null;
    return { A: a, B: b };
  });

/** A scorecard row names a winner only when one side took the criterion. */
function readTo(value: unknown): Slot | null | undefined {
  if (value === null) return null;
  return readSlot(value) ?? undefined;
}

const readCue: Field<Cue> = (value) =>
  readAs(value, (raw) => {
    const t = readNumber(raw.t);
    const id = readString(raw.id);
    const kind = readString(raw.kind);
    if (t === null || id === null || kind === null) return null;
    switch (kind) {
      case "intro": {
        const fighters = readAs(raw.fighters, (both) => {
          const a = readAs(both.A, (fighter) => {
            const name = readString(fighter.name);
            const seed = readNumber(fighter.seed);
            const tier = readString(fighter.tier);
            const spriteSeed = readString(fighter.spriteSeed);
            const corner = readEnum<"left" | "right">(["left", "right"])(fighter.corner);
            const category = readString(fighter.category);
            if (
              name === null ||
              seed === null ||
              tier === null ||
              spriteSeed === null ||
              corner === null ||
              category === null
            ) {
              return null;
            }
            return { name, seed, tier, spriteSeed, corner, category };
          });
          const b = readAs(both.B, (fighter) => {
            const name = readString(fighter.name);
            const seed = readNumber(fighter.seed);
            const tier = readString(fighter.tier);
            const spriteSeed = readString(fighter.spriteSeed);
            const corner = readEnum<"left" | "right">(["left", "right"])(fighter.corner);
            const category = readString(fighter.category);
            if (
              name === null ||
              seed === null ||
              tier === null ||
              spriteSeed === null ||
              corner === null ||
              category === null
            ) {
              return null;
            }
            return { name, seed, tier, spriteSeed, corner, category };
          });
          if (a === null || b === null) return null;
          return { A: a, B: b };
        });
        if (fighters === null) return null;
        return { t, id, kind, fighters };
      }
      case "round_title": {
        const round = readRound(raw.round);
        const name = readRoundName(raw.name);
        const criteria = readArray((item) =>
          readAs(item, (entry) => {
            const criterionId = readCriterion(entry.id);
            const weight = readNumber(entry.weight);
            if (criterionId === null || weight === null) return null;
            return { id: criterionId, weight };
          }),
        )(raw.criteria);
        if (round === null || name === null || criteria === null) return null;
        return { t, id, kind, round, name, criteria: [...criteria] };
      }
      case "shot": {
        const shooter = readSlot(raw.shooter);
        const shotId = readString(raw.shotId);
        const criterion = readCriterion(raw.criterion);
        const weapon = readWeapon(raw.weapon);
        const impact = readImpact(raw.impact);
        const outcome = readEnum<Extract<Cue, { kind: "shot" }>["outcome"]>([
          "hit",
          "crit",
          "partial",
          "parried",
          "glancing",
          "whiff",
          "backfire",
        ])(raw.outcome);
        const headline = readString(raw.headline);
        const evidence = readArray(readEvidence)(raw.evidence);
        const damage = readNumber(raw.damage);
        const hpAfter = readHp(raw.hpAfter);
        const turn = readNumber(raw.turn);
        const volley = readVolley(raw.volley);
        const move = readMove(raw.move);
        const menu = readArray(readMove)(raw.menu);
        const verdictLine = readString(raw.verdictLine);
        const parry = raw.parry === undefined
          ? undefined
          : readAs(raw.parry, (entry) => {
              const defenseShotId = readString(entry.defenseShotId);
              const parryHeadline = readString(entry.headline);
              const parryMove = readMove(entry.move);
              if (defenseShotId === null || parryHeadline === null || parryMove === null) return null;
              return { defenseShotId, headline: parryHeadline, move: parryMove };
            });
        if (
          shooter === null ||
          shotId === null ||
          criterion === null ||
          weapon === null ||
          impact === null ||
          outcome === null ||
          headline === null ||
          evidence === null ||
          damage === null ||
          hpAfter === null ||
          turn === null ||
          volley === null ||
          move === null ||
          menu === null ||
          verdictLine === null ||
          parry === null
        ) {
          return null;
        }
        const cue: Extract<Cue, { kind: "shot" }> = {
          t,
          id,
          kind,
          shooter,
          shotId,
          criterion,
          weapon,
          impact,
          outcome,
          headline,
          evidence: [...evidence],
          damage,
          hpAfter,
          turn,
          volley,
          move,
          menu: [...menu],
          verdictLine,
        };
        return parry === undefined ? cue : { ...cue, parry };
      }
      case "hammer": {
        const target = readSlot(raw.target);
        const criterion = readCriterion(raw.criterion);
        const reason = readString(raw.reason);
        const damage = readNumber(raw.damage);
        const hpAfter = readHp(raw.hpAfter);
        if (target === null || criterion === null || reason === null || damage === null || hpAfter === null) {
          return null;
        }
        return { t, id, kind, target, criterion, reason, damage, hpAfter };
      }
      case "status": {
        const target = readSlot(raw.target);
        const status = readStatus(raw.status);
        const on = readBoolean(raw.on);
        if (target === null || status === null || on === null) return null;
        return { t, id, kind, target, status, on };
      }
      case "scorecard": {
        const round = readRound(raw.round);
        const rows = readArray((item) =>
          readAs(item, (entry) => {
            const criterion = readCriterion(entry.criterion);
            const a = readNumber(entry.A);
            const b = readNumber(entry.B);
            const points = readNumber(entry.points);
            const hp = readNumber(entry.hp);
            const to = readTo(entry.to);
            if (criterion === null || a === null || b === null || points === null || hp === null || to === undefined) {
              return null;
            }
            return { criterion, A: a, B: b, points, hp, to };
          }),
        )(raw.rows);
        const agreement = readNumber(raw.agreement);
        if (round === null || rows === null || agreement === null) return null;
        return { t, id, kind, round, rows: [...rows], agreement };
      }
      case "outcome": {
        const outcome = readOutcome(raw.outcome);
        const perfect = readBoolean(raw.perfect);
        if (outcome === null || perfect === null) return null;
        const decisionType =
          raw.decisionType === undefined
            ? undefined
            : readEnum<"unanimous" | "majority">(["unanimous", "majority"])(raw.decisionType);
        const pyrrhic = raw.pyrrhic === undefined ? undefined : readBoolean(raw.pyrrhic);
        if (decisionType === null || pyrrhic === null) return null;
        return {
          t,
          id,
          kind,
          outcome,
          perfect,
          ...(decisionType === undefined ? {} : { decisionType }),
          ...(pyrrhic === undefined ? {} : { pyrrhic }),
        };
      }
      case "sudden_death": {
        const closings = readAs(raw.closings, (both) => {
          const a = readString(both.A);
          const b = readString(both.B);
          return a === null || b === null ? null : { A: a, B: b };
        });
        const tally = readHp(raw.tally);
        if (closings === null || tally === null) return null;
        return { t, id, kind, closings, tally };
      }
      case "finisher": {
        const winner = readSlot(raw.winner);
        const loser = readSlot(raw.loser);
        const style = readEnum<"ko" | "decision">(["ko", "decision"])(raw.style);
        if (winner === null || loser === null || style === null) return null;
        return { t, id, kind, winner, loser, style };
      }
      case "winner": {
        const winner = readSlot(raw.winner);
        const decidedBy = readEnum<Extract<Cue, { kind: "winner" }>["decidedBy"]>([
          "scores",
          "sudden_death_judge",
          "vc_panel",
          "weighin_total",
          "seed",
        ])(raw.decidedBy);
        if (winner === null || decidedBy === null) return null;
        return { t, id, kind, winner, decidedBy };
      }
      default:
        return null;
    }
  });

const readScript: Field<BroadcastScript> = (value) =>
  readAs(value, (raw) => {
    const matchId = readString(raw.matchId);
    const directorVersion = readString(raw.directorVersion);
    const durationMs = readNumber(raw.durationMs);
    const cues = readArray(readCue)(raw.cues);
    if (matchId === null || directorVersion === null || durationMs === null || cues === null) return null;
    return { matchId, directorVersion, durationMs, cues: [...cues] };
  });

const readFighter: Field<ArenaFighter> = (value) =>
  readAs(value, (raw) => {
    const entrantId = readString(raw.entrantId);
    const name = readString(raw.name);
    const seed = readNumber(raw.seed);
    const tier = readString(raw.tier);
    const spriteSeed = readString(raw.spriteSeed);
    const category = readString(raw.category);
    const title = readString(raw.title);
    const clout = readNumber(raw.clout);
    const crew = readArray((item) =>
      readAs(item, (member) => {
        const handle = readString(member.handle);
        const memberName = readString(member.name);
        const from = readString(member.from);
        if (handle === null || memberName === null || from === null) return null;
        return { handle, name: memberName, from };
      }),
    )(raw.crew);
    if (
      entrantId === null ||
      name === null ||
      seed === null ||
      tier === null ||
      spriteSeed === null ||
      category === null ||
      title === null ||
      clout === null ||
      crew === null
    ) {
      return null;
    }
    const orgTitle = readEnum<ArenaFighter["title"]>([
      "Intern",
      "Associate",
      "Manager",
      "Director",
      "VP",
      "President",
      "CEO",
    ])(title);
    if (orgTitle === null) return null;
    return { entrantId, name, seed, tier, spriteSeed, category, title: orgTitle, clout, crew: [...crew] };
  });

export interface DemoMatch {
  matchId: string;
  roundIndex: number;
  slotIndex: number;
  label: string;
  winner: Slot;
  outcome: OutcomeKind;
  fighters: Record<Slot, ArenaFighter>;
  script: BroadcastScript;
}

const readMatch: Field<DemoMatch> = (value) =>
  readAs(value, (raw) => {
    const matchId = readString(raw.matchId);
    const roundIndex = readNumber(raw.roundIndex);
    const slotIndex = readNumber(raw.slotIndex);
    const label = readString(raw.label);
    const winner = readSlot(raw.winner);
    const outcome = readOutcome(raw.outcome);
    const fighters = readAs(raw.fighters, (both) => {
      const a = readFighter(both.A);
      const b = readFighter(both.B);
      return a === null || b === null ? null : { A: a, B: b };
    });
    const script = readScript(raw.script);
    if (
      matchId === null ||
      roundIndex === null ||
      slotIndex === null ||
      label === null ||
      winner === null ||
      outcome === null ||
      fighters === null ||
      script === null
    ) {
      return null;
    }
    return { matchId, roundIndex, slotIndex, label, winner, outcome, fighters, script };
  });

function parseDemoLibrary(value: unknown): { buildHash: string; at: string; matches: DemoMatch[] } {
  if (!isRecord(value)) throw new Error("demo.json is not an object");
  const buildHash = readString(value.buildHash);
  const at = readString(value.at);
  const rawMatches = value.matches;
  if (buildHash === null || at === null || !Array.isArray(rawMatches)) {
    throw new Error("demo.json is missing buildHash, at or matches");
  }
  const matches: DemoMatch[] = [];
  for (const [index, raw] of rawMatches.entries()) {
    const match = readMatch(raw);
    if (match === null) throw new Error(`demo.json match ${index} is not a valid arena fixture`);
    matches.push(match);
  }
  if (matches.length === 0) throw new Error("demo.json has no matches");
  return { buildHash, at, matches };
}

const library = parseDemoLibrary(demoJson);

export const DEMO_BUILD_HASH: string = library.buildHash;
export const DEMO_AT: string = library.at;
export const DEMO_MATCHES: readonly DemoMatch[] = library.matches;

export function demoMatchById(matchId: string): DemoMatch | null {
  return DEMO_MATCHES.find((match) => match.matchId === matchId) ?? null;
}
