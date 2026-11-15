import type { ReactElement } from "react";

import { Pill, classNames } from "../styles/components.js";
import { matchStatusLook } from "./status.js";
import type { TowerEntrant, TowerMatch } from "./types.js";

const CARD_WIDTH = 214;
const CARD_GAP = 20;

export interface BracketViewProps {
  matches: readonly TowerMatch[];
  entrants: Record<string, TowerEntrant>;
  seeds: Record<string, number>;
  championId: string | null;
  onOpenMatch: (matchId: string) => void;
}

function finalRoundOf(matches: readonly TowerMatch[]): number {
  return matches.reduce((max, match) => Math.max(max, match.roundIndex), 0);
}

/**
 * The winner of a completed match, read only from what is already public: the
 * next round's sides, or the champion for the final. A match that is not
 * complete has no winner here.
 */
export function bracketWinner(input: {
  match: TowerMatch;
  matches: readonly TowerMatch[];
  championId: string | null;
  finalRound: number;
}): string | null {
  const { match, matches, championId, finalRound } = input;
  if (match.status !== "complete") return null;
  const sides = [match.a, match.b];
  if (match.roundIndex === finalRound) {
    return championId !== null && sides.includes(championId) ? championId : null;
  }
  const next = matches.find((candidate) => {
    if (candidate.roundIndex !== match.roundIndex + 1) return false;
    const nextSides = [candidate.a, candidate.b];
    return sides.some((side) => side !== null && nextSides.includes(side));
  });
  if (!next) return null;
  const winner = [next.a, next.b].find((side) => side !== null && sides.includes(side));
  return winner ?? null;
}

function roundLabel(level: number, finalRound: number): string {
  if (level === finalRound) return "FINAL";
  if (level === finalRound - 1) return "SEMIS";
  if (level === 0) return "OPENERS";
  return `ROUND ${level + 1}`;
}

function cellWidth(level: number): number {
  return (CARD_WIDTH + CARD_GAP) * 2 ** level;
}

export function BracketView({ matches, entrants, seeds, championId, onOpenMatch }: BracketViewProps): ReactElement {
  const finalRound = finalRoundOf(matches);
  const levels = Array.from({ length: finalRound + 1 }, (_, index) => finalRound - index);
  const champion = championId === null ? null : entrants[championId];

  return (
    <div className="bracket" role="group" aria-label="Classic tournament bracket">
      <div className="bracket__belt">
        <span className="bracket__belt-stripes" aria-hidden="true" />
        <span className="bracket__belt-label">THE GOLDEN GATE BELT</span>
        <span className="bracket__belt-holder">{champion ? champion.name.toUpperCase() : "UNCLAIMED"}</span>
      </div>

      {levels.map((level) => {
        const roundMatches = matches
          .filter((match) => match.roundIndex === level)
          .slice()
          .sort((left, right) => left.slotIndex - right.slotIndex);
        return (
          <div className="bracket__block" key={level}>
            <p className="bracket__round">
              {roundLabel(level, finalRound)}{" "}
              <span>
                {roundMatches.length} {roundMatches.length === 1 ? "bout" : "bouts"}
              </span>
            </p>
            <div className="bracket__row">
              {roundMatches.map((match) => {
                const winner = bracketWinner({ match, matches, championId, finalRound });
                const look = matchStatusLook(match.status);
                const a = match.a === null ? null : entrants[match.a] ?? null;
                const b = match.b === null ? null : entrants[match.b] ?? null;
                return (
                  <div className="bracket__cell" key={match.matchId} style={{ width: cellWidth(level) }}>
                    <button
                      type="button"
                      className={classNames("bracket__card", match.status === "live" && "bracket__card--live")}
                      onClick={() => onOpenMatch(match.matchId)}
                      aria-label={`${a?.name ?? "To be decided"} versus ${b?.name ?? "To be decided"}, ${look.label.toLowerCase()}`}
                    >
                      <span className="bracket__card-head">
                        <span className="bracket__slot">R{level + 1}.{match.slotIndex + 1}</span>
                        <Pill tone={look.tone}>{look.label}</Pill>
                      </span>
                      <BracketSide entrant={a} seed={match.a === null ? null : seeds[match.a] ?? null} winner={winner} side="a" />
                      <BracketSide entrant={b} seed={match.b === null ? null : seeds[match.b] ?? null} winner={winner} side="b" />
                    </button>
                  </div>
                );
              })}
            </div>
            {level > 0 ? (
              <div className="bracket__links" aria-hidden="true">
                {roundMatches.map((match) => (
                  <div
                    className="bracket__link"
                    key={`${match.matchId}-link`}
                    style={{ width: cellWidth(level) }}
                  >
                    <span className="bracket__link-left" />
                    <span className="bracket__link-right" />
                    <span className="bracket__link-stem" />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function BracketSide({
  entrant,
  seed,
  winner,
  side,
}: {
  entrant: TowerEntrant | null;
  seed: number | null;
  winner: string | null;
  side: "a" | "b";
}): ReactElement {
  const isWinner = entrant !== null && winner === entrant.entrantId;
  return (
    <span
      className={classNames(
        "bracket__side",
        isWinner && "bracket__side--winner",
        winner !== null && !isWinner && "bracket__side--out",
      )}
      data-side={side}
    >
      <span className="bracket__seed">{seed === null ? "--" : `#${seed}`}</span>
      <span className="bracket__name">{entrant?.name ?? "TBD"}</span>
      {isWinner ? <span className="bracket__win">W</span> : null}
    </span>
  );
}
