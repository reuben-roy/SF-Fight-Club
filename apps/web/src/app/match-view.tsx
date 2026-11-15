/**
 * Match page composition: the pre-fight tale of the tape and the result
 * screen. The fight itself stays in the arena screen registry.
 */

import type { ReactElement } from "react";
import { Link } from "react-router-dom";

import type { MatchResolution } from "@sf-fight-club/schemas";

import type { Corner } from "../art/palette.js";
import { BetSlip, BetSettlement, type BetSettlementProps } from "../bets/index.js";
import type { MatchView } from "../data/store.js";
import {
  Button,
  CloutMeter,
  Stamp,
  TitleBadge,
  classNames,
  type CloutTier,
  type OrgTitle,
  type StampTone,
} from "../styles/components.js";
import { Confetti, MascotFigure } from "./visuals.js";

export interface MatchSide {
  entrantId: string;
  name: string;
  seed: number;
  tier: string;
  spriteSeed: string;
  category: string;
  clout: number;
  cloutTier: CloutTier;
  oneLiner: string;
  title: OrgTitle;
  headcount: number;
  founders: readonly string[];
  corner: Corner;
}

function FighterSide({ side, onOpenCard }: { side: MatchSide; onOpenCard: (entrantId: string) => void }): ReactElement {
  const right = side.corner === "right";
  return (
    <div className={classNames("sfc-fighter", right && "sfc-fighter--right", `sfc-corner--${side.corner}`)}>
      <div className="sfc-fighter__stage">
        <MascotFigure
          spriteSeed={side.spriteSeed}
          category={side.category}
          corner={side.corner}
          facing={right ? -1 : 1}
          size={132}
          alt={`${side.name} mascot`}
        />
      </div>
      <h2 className="sfc-fighter__name">{side.name}</h2>
      <div className="sfc-fighter__meta">
        <span className="sfc-fighter__seed">Seed {side.seed}</span>
        <span className="sfc-fighter__seed">Tier {side.tier}</span>
        <TitleBadge title={side.title} headcount={side.headcount} />
      </div>
      <CloutMeter score={side.clout} tier={side.cloutTier} />
      <p className="sfc-fighter__line">{side.oneLiner}</p>
      <p className="sfc-fighter__founders">
        Founders: {side.founders.length > 0 ? side.founders.join(", ") : "undisclosed"}
      </p>
      <Button size="sm" onClick={() => onOpenCard(side.entrantId)}>
        Fighter card
      </Button>
    </div>
  );
}

export interface MatchPreFightProps {
  view: MatchView;
  a: MatchSide;
  b: MatchSide;
  roundLabel: string;
  onOpenCard: (entrantId: string) => void;
  onOpenBetting: () => void;
  onRingBell: () => void;
  onPlaceBet: (entrantId: string, stake: number) => void;
}

export function MatchPreFight({
  view,
  a,
  b,
  roundLabel,
  onOpenCard,
  onOpenBetting,
  onRingBell,
  onPlaceBet,
}: MatchPreFightProps): ReactElement {
  const bettingOpen = view.status === "betting_open";
  const locked = view.status === "locked";
  const scheduled = view.status === "scheduled";

  return (
    <section className="sfc-match" data-theme="night" aria-label="Match">
      <div className="sfc-page sfc-match__inner">
        <div className="sfc-match__head">
          <p className="sfc-kicker">{roundLabel} · Tale of the tape</p>
          <p className="sfc-status">Status: {view.status}</p>
        </div>

        <div className="sfc-tale">
          <FighterSide side={a} onOpenCard={onOpenCard} />
          <div className="sfc-vs" aria-hidden="true">
            <span className="sfc-vs__rule" />
            <span className="sfc-vs__mark">VS</span>
            <span className="sfc-vs__rule" />
          </div>
          <FighterSide side={b} onOpenCard={onOpenCard} />
        </div>

        <div className="sfc-match__grid">
          <BetSlip
            aId={a.entrantId}
            bId={b.entrantId}
            aName={a.name}
            bName={b.name}
            odds={view.odds}
            wallet={view.wallet}
            canBet={view.canBet}
            bets={view.myBets}
            onPlace={onPlaceBet}
          />

          <aside className="sfc-bell" aria-label="Ring the bell">
            <h2>Ring the bell</h2>
            {bettingOpen ? (
              <>
                <p className="sfc-bell__sub">The first bell locks every bet in this fight.</p>
                <button type="button" className="sfc-bell__button" onClick={onRingBell}>
                  Ring the bell
                  <span className="sfc-sr">(lock bets)</span>
                </button>
              </>
            ) : null}
            {locked ? (
              <>
                <span className="sfc-bell__stamp">
                  <Stamp tone="red" size="lg">
                    BETS LOCKED
                  </Stamp>
                </span>
                <p className="sfc-bell__sub">No more bets. The second bell starts the fight.</p>
                <button type="button" className="sfc-bell__button" onClick={onRingBell}>
                  Ring the bell
                  <span className="sfc-sr">(start the fight)</span>
                </button>
              </>
            ) : null}
            {scheduled ? (
              <>
                <p className="sfc-bell__sub">Betting has not opened for this fight yet.</p>
                <Button variant="hot" onClick={onOpenBetting}>
                  Open betting
                </Button>
              </>
            ) : null}
            <p className="sfc-bell__sub">Play money only. No cash value.</p>
          </aside>
        </div>
      </div>
    </section>
  );
}

export function outcomeStamp(resolution: MatchResolution): { tone: StampTone; label: string } {
  switch (resolution.outcome) {
    case "KO":
      return { tone: "red", label: "K.O." };
    case "DECISION":
      return resolution.decisionType === "majority"
        ? { tone: "blue", label: "DECISION · MAJORITY" }
        : { tone: "blue", label: "DECISION · UNANIMOUS" };
    case "SUDDEN_DEATH":
      return { tone: "sun", label: "SUDDEN DEATH" };
    case "BYE":
      return { tone: "good", label: "BYE" };
    case "WALKOVER":
      return { tone: "good", label: "WALKOVER" };
    default: {
      const _exhaustive: never = resolution.outcome;
      return _exhaustive;
    }
  }
}

export interface MatchResultProps {
  view: MatchView;
  winner: MatchSide;
  loser: MatchSide;
  oldTitle: OrgTitle;
  newTitle: OrgTitle;
  settlement: BetSettlementProps;
  roundLabel: string;
}

export function MatchResult({
  view,
  winner,
  loser,
  oldTitle,
  newTitle,
  settlement,
  roundLabel,
}: MatchResultProps): ReactElement {
  const resolution = view.resolution;
  const stamp = resolution ? outcomeStamp(resolution) : { tone: "red" as const, label: "RESULT" };
  return (
    <section className="sfc-result" data-theme="night" aria-label="Result">
      <div className="sfc-page sfc-result__inner">
        <p className="sfc-kicker">{roundLabel} · Result</p>
        <div className="sfc-result__banner">
          <Stamp tone={stamp.tone} size="lg">
            {stamp.label}
          </Stamp>
          {resolution?.perfect ? (
            <Stamp tone="good" size="lg">
              PERFECT
            </Stamp>
          ) : null}
        </div>
        <h1 className="sfc-result__win">{winner.name} wins</h1>
        <p className="sfc-result__acquires">
          {winner.name} acquires {loser.name}
        </p>
        <div className="sfc-result__titles">
          <span>{winner.name}</span>
          <TitleBadge title={oldTitle} />
          <span aria-hidden="true">→</span>
          <span className="sfc-sr">becomes</span>
          <TitleBadge title={newTitle} headcount={winner.headcount} />
        </div>

        <div className="sfc-result__stage">
          <Confetti />
          <MascotFigure
            spriteSeed={winner.spriteSeed}
            category={winner.category}
            corner={winner.corner}
            state="victory"
            size={176}
            alt={`${winner.name} celebrates`}
          />
        </div>

        <div className="sfc-result__settle">
          <BetSettlement totalStake={settlement.totalStake} totalPayout={settlement.totalPayout} bets={settlement.bets} />
        </div>

        <div className="sfc-result__actions">
          <Link className="sfc-btn" to={`/film/${view.matchId}`}>
            Why did they win?
          </Link>
          <Link className="sfc-btn sfc-btn--hot" to="/tower">
            Back to the Tower
          </Link>
        </div>
      </div>
    </section>
  );
}
