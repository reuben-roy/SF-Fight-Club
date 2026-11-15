/**
 * Match route entry. Three phases on one route: tale of the tape (betting and
 * the bell), the fight (arena screen registry), and the result. Unknown ids
 * and unplayed feeders keep their own styled states.
 */

import { useEffect, useState, type ReactElement } from "react";
import { Link, useParams } from "react-router-dom";

import type { OrgChart } from "@sf-fight-club/schemas";

import { settleBets } from "../bets/index.js";
import { useAppStore } from "../data/index.js";
import {
  bundleMatchById,
  headcountOf,
  selectArena,
  selectFighterCard,
  selectMatchView,
  selectOrgChartBefore,
  selectOrgCharts,
  titleOf,
  type MatchView,
} from "../data/store.js";
import type { DemoBundle } from "../data/demo-bundle.js";
import { FighterCardDialog } from "../app/fighter-card-dialog.js";
import { MatchPreFight, MatchResult, type MatchSide } from "../app/match-view.js";
import { ArenaScreen } from "../app/screens.js";
import { Button, Panel } from "../styles/components.js";

const ROUND_LABELS = ["Quarterfinal", "Semifinal", "Final"] as const;

function roundLabelOf(roundIndex: number): string {
  return ROUND_LABELS[roundIndex] ?? `Round ${roundIndex + 1}`;
}

function sideOf({
  bundle,
  chart,
  matchId,
  entrantId,
  slot,
}: {
  bundle: DemoBundle;
  chart: OrgChart;
  matchId: string;
  entrantId: string;
  slot: "A" | "B";
}): MatchSide | null {
  const match = bundleMatchById(bundle, matchId);
  const entrant = bundle.entrants.find((entry) => entry.id === entrantId);
  const profile = bundle.profiles[entrantId];
  const seeded = bundle.bracket.entrants.find((entry) => entry.id === entrantId);
  if (!match || !entrant || !profile || !seeded) return null;
  const corner = match.corners
    ? match.corners.left === slot
      ? "left"
      : "right"
    : slot === "A"
      ? "left"
      : "right";
  return {
    entrantId,
    name: entrant.name,
    seed: seeded.seed,
    tier: entrant.tier,
    spriteSeed: entrant.spriteSeed,
    category: entrant.category,
    clout: entrant.cloutScore,
    cloutTier: entrant.cloutTier,
    oneLiner: entrant.oneLiner,
    title: titleOf(chart, entrantId),
    headcount: headcountOf(chart, entrantId),
    founders: profile.founders.map((founder) => founder.name),
    corner,
  };
}

function StatusPage({
  kicker,
  title,
  body,
}: {
  kicker: string;
  title: string;
  body: string;
}): ReactElement {
  return (
    <section className="sfc-match" data-theme="night" aria-label="Match">
      <div className="sfc-page sfc-match__inner">
        <p className="sfc-kicker">{kicker}</p>
        <Panel title={title} stripe>
          <p>{body}</p>
          <p>
            <Link to="/tower">Back to the Tower</Link>
          </p>
        </Panel>
      </div>
    </section>
  );
}

export default function MatchEntry(): ReactElement {
  const { bundle, state, dispatch } = useAppStore();
  const { matchId } = useParams();
  const view = matchId ? selectMatchView(state, bundle, matchId) : null;
  const [cardId, setCardId] = useState<string | null>(null);

  // Betting opens on arrival: one obvious step, no hidden second click.
  useEffect(() => {
    if (view && view.status === "scheduled" && view.available) {
      dispatch({ type: "open_betting", matchId: view.matchId });
    }
  }, [view?.status, view?.available, view?.matchId, dispatch, view]);

  if (!view) {
    return <StatusPage kicker="Match" title="No such fight" body="That match id is not on this card." />;
  }

  if (!view.available) {
    return (
      <StatusPage
        kicker="Match"
        title="Not yet"
        body="This fight is not on the card until its feeders complete."
      />
    );
  }

  const card = cardId ? selectFighterCard(state, bundle, cardId) : null;
  const roundLabel = roundLabelOf(bundleMatchById(bundle, view.matchId)?.roundIndex ?? 0);
  const { chart } = selectOrgCharts(state, bundle);

  if (view.status === "scheduled" || view.status === "betting_open" || view.status === "locked") {
    const a = view.aId ? sideOf({ bundle, chart, matchId: view.matchId, entrantId: view.aId, slot: "A" }) : null;
    const b = view.bId ? sideOf({ bundle, chart, matchId: view.matchId, entrantId: view.bId, slot: "B" }) : null;
    if (!a || !b) {
      return <StatusPage kicker="Match" title="Not yet" body="This fight has no corner assigned yet." />;
    }
    return (
      <>
        <MatchPreFight
          view={view}
          a={a}
          b={b}
          roundLabel={roundLabel}
          onOpenCard={setCardId}
          onOpenBetting={() => dispatch({ type: "open_betting", matchId: view.matchId })}
          onRingBell={() => dispatch({ type: "ring_bell", matchId: view.matchId })}
          onPlaceBet={(entrantId, stake) =>
            dispatch({ type: "place_bet", matchId: view.matchId, entrantId, stake })
          }
        />
        {card ? <FighterCardDialog card={card} onClose={() => setCardId(null)} /> : null}
      </>
    );
  }

  if (view.status === "live") {
    const arena = selectArena(state, bundle, view.matchId);
    return (
      <section className="sfc-match" data-theme="night" aria-label="Match">
        <div className="sfc-match__livebar">
          <p className="sfc-kicker">{roundLabel} · Live</p>
          <div className="sfc-match__liveactions">
            <Button variant="hot" size="sm" onClick={() => dispatch({ type: "finish", matchId: view.matchId })}>
              Skip to result
            </Button>
            <Link className="sfc-btn sfc-btn--ghost sfc-btn--sm" to="/tower">
              Back to the Tower
            </Link>
          </div>
        </div>
        {arena.props ? (
          <ArenaScreen
            {...arena.props}
            onTurn={(turn) => dispatch({ type: "mark_turn", matchId: view.matchId, turn })}
            onComplete={() => dispatch({ type: "finish", matchId: view.matchId })}
          />
        ) : null}
      </section>
    );
  }

  return <CompleteMatch view={view} cardId={cardId} setCardId={setCardId} roundLabel={roundLabel} />;
}

function CompleteMatch({
  view,
  cardId,
  setCardId,
  roundLabel,
}: {
  view: MatchView;
  cardId: string | null;
  setCardId: (id: string | null) => void;
  roundLabel: string;
}): ReactElement {
  const { bundle, state } = useAppStore();
  const { chart } = selectOrgCharts(state, bundle);
  const a = view.aId ? sideOf({ bundle, chart, matchId: view.matchId, entrantId: view.aId, slot: "A" }) : null;
  const b = view.bId ? sideOf({ bundle, chart, matchId: view.matchId, entrantId: view.bId, slot: "B" }) : null;
  const card = cardId ? selectFighterCard(state, bundle, cardId) : null;

  if (!a || !b || !view.resolution || !view.winnerId) {
    return <StatusPage kicker="Match" title="No result" body="This fight has no sealed result yet." />;
  }

  const winner = view.winnerId === a.entrantId ? a : b;
  const loser = winner === a ? b : a;
  const before = selectOrgChartBefore(state, bundle, view.matchId);
  const oldTitle = titleOf(before, winner.entrantId);
  const newTitle = titleOf(chart, winner.entrantId);

  const entrantA = bundle.entrants.find((entry) => entry.id === a.entrantId);
  const entrantB = bundle.entrants.find((entry) => entry.id === b.entrantId);
  const matchBets = view.myBets;
  const payouts =
    entrantA && entrantB
      ? settleBets(
          matchBets,
          view.winnerId,
          a.entrantId,
          b.entrantId,
          entrantA.weighinTotal,
          entrantB.weighinTotal,
        )
      : [];
  const totalStake = matchBets.reduce((sum, bet) => sum + bet.stake, 0);
  const totalPayout = payouts.reduce((sum, payout) => sum + payout, 0);

  return (
    <>
      <MatchResult
        view={view}
        winner={{ ...winner, title: newTitle, headcount: headcountOf(chart, winner.entrantId) }}
        loser={loser}
        oldTitle={oldTitle}
        newTitle={newTitle}
        settlement={{ totalStake, totalPayout, bets: matchBets.length }}
        roundLabel={roundLabel}
      />
      {card ? <FighterCardDialog card={card} onClose={() => setCardId(null)} /> : null}
    </>
  );
}
