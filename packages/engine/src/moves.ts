import type { CriterionId, Move, MoveElement, ShotType } from "@sf-fight-club/schemas";

import { EngineError } from "./errors.js";

interface MoveRow {
  element: MoveElement;
  pitch: string;
  attack: string;
  defense: string;
}

const MOVES: Record<CriterionId, MoveRow> = {
  problem: { element: "market", pitch: "Hair on Fire", attack: "Nice to Have", defense: "Pain Receipt" },
  market: { element: "market", pitch: "Bottom-Up TAM", attack: "Niche Trap", defense: "Adjacent Market" },
  wtp: { element: "market", pitch: "Signed LOI", attack: "Free Alternative", defense: "Budget Line" },
  differentiation: { element: "moat", pitch: "Ten Times Better", attack: "Feature Not Product", defense: "Side by Side" },
  moat: { element: "moat", pitch: "Compounding Data", attack: "Weekend Clone", defense: "Switching Cost" },
  timing: { element: "moat", pitch: "Why Now", attack: "Too Early", defense: "Tailwind" },
  gtm: { element: "execution", pitch: "First Hundred", attack: "CAC Spiral", defense: "Channel Lock" },
  feasibility: { element: "execution", pitch: "Shipped Demo", attack: "Science Project", defense: "Proof of Build" },
  scale: { element: "execution", pitch: "Platform Play", attack: "Lifestyle Business", defense: "Second Act" },
};

export type ShotOutcome = "hit" | "crit" | "partial" | "parried" | "glancing" | "whiff" | "backfire";

export function elementOf(criterion: CriterionId): MoveElement {
  const row = MOVES[criterion];
  if (!row) {
    throw new EngineError("unknown_criterion", `no move row for criterion ${criterion}`);
  }
  return row.element;
}

export function moveFor(input: { criterion: CriterionId; type: ShotType }): Move {
  const row = MOVES[input.criterion];
  if (!row) {
    throw new EngineError("unknown_criterion", `no move row for criterion ${input.criterion}`);
  }
  switch (input.type) {
    case "pitch":
      return { name: row.pitch, element: row.element, criterion: input.criterion, type: input.type };
    case "attack":
      return { name: row.attack, element: row.element, criterion: input.criterion, type: input.type };
    case "defense":
      return { name: row.defense, element: row.element, criterion: input.criterion, type: input.type };
    default: {
      const _exhaustive: never = input.type;
      throw new EngineError("bad_shot_type", `unknown shot type ${_exhaustive}`);
    }
  }
}

export function verdictLine(input: {
  outcome: ShotOutcome;
  actor: string;
  target: string;
  criterion: CriterionId;
  defenseMove: string;
}): string {
  switch (input.outcome) {
    case "crit":
      return "DIRECT HIT. The judges bought all of it.";
    case "hit":
      return "It landed.";
    case "partial":
      return "Partly landed.";
    case "parried":
      return `${input.target} answered with ${input.defenseMove.toUpperCase()}.`;
    case "glancing":
      return `Fair point. ${input.target} still wins ${input.criterion}.`;
    case "whiff":
      return "The judges did not move.";
    case "backfire":
      return `FACT-CHECKED. It blew up in ${input.actor}'s hands.`;
    default: {
      const _exhaustive: never = input.outcome;
      throw new EngineError("bad_outcome", `unknown shot outcome ${_exhaustive}`);
    }
  }
}

