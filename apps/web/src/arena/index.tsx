/**
 * Match route entry: pre-fight (betting + bell), fight (arena player), and
 * result phases. Unknown ids and unplayed feeders render "not yet".
 */

import type { ReactElement } from "react";
import { Link, useParams } from "react-router-dom";

import { ArenaScreen } from "../app/screens.js";
import { BetSlip } from "../bets/index.js";
import { useAppStore } from "../data/index.js";
import { selectArena, selectMatchView } from "../data/store.js";

export default function MatchEntry(): ReactElement {
  const { bundle, state, dispatch } = useAppStore();
  const { matchId } = useParams();
  const view = matchId ? selectMatchView(state, bundle, matchId) : null;

  if (!view) {
    return (
      <section aria-label="Match">
        <h2>No such fight</h2>
        <p>
          <Link to="/tower">Back to the Tower</Link>
        </p>
      </section>
    );
  }

  if (!view.available) {
    return (
      <section aria-label="Match">
        <h2>Not yet</h2>
        <p>This fight is not on the card until its feeders complete.</p>
        <p>
          <Link to="/tower">Back to the Tower</Link>
        </p>
      </section>
    );
  }

  const title = `${view.aName ?? "?"} vs ${view.bName ?? "?"}`;
  const winnerName = (id: string): string =>
    id === view.aId ? (view.aName ?? id) : id === view.bId ? (view.bName ?? id) : id;

  if (view.status === "scheduled" || view.status === "betting_open" || view.status === "locked") {
    return (
      <section aria-label="Match">
        <h2>{title}</h2>
        <p>Status: {view.status}</p>
        {view.status === "scheduled" ? (
          <button type="button" onClick={() => dispatch({ type: "open_betting", matchId: view.matchId })}>
            Open betting
          </button>
        ) : null}
        {view.aId && view.bId && view.aName && view.bName ? (
          <BetSlip
            aId={view.aId}
            bId={view.bId}
            aName={view.aName}
            bName={view.bName}
            odds={view.odds}
            wallet={view.wallet}
            canBet={view.canBet}
            onPlace={(entrantId, stake) => dispatch({ type: "place_bet", matchId: view.matchId, entrantId, stake })}
          />
        ) : null}
        {view.myBets.length > 0 ? (
          <ul aria-label="My bets">
            {view.myBets.map((bet) => (
              <li key={bet.id}>
                S${bet.stake} on {bet.entrantId}
              </li>
            ))}
          </ul>
        ) : null}
        {view.status === "betting_open" ? (
          <button type="button" onClick={() => dispatch({ type: "ring_bell", matchId: view.matchId })}>
            Ring the bell (lock bets)
          </button>
        ) : null}
        {view.status === "locked" ? (
          <button type="button" onClick={() => dispatch({ type: "ring_bell", matchId: view.matchId })}>
            Ring the bell (start the fight)
          </button>
        ) : null}
        <p>
          <Link to="/tower">Back to the Tower</Link>
        </p>
      </section>
    );
  }

  if (view.status === "live") {
    const arena = selectArena(state, bundle, view.matchId);
    const resumed = state.turnsSeen[view.matchId] ?? 0;
    return (
      <section aria-label="Match">
        <h2>{title} (live)</h2>
        {resumed > 0 ? <p>Resumed at turn {resumed}.</p> : null}
        {arena.props ? (
          <ArenaScreen
            {...arena.props}
            onTurn={(turn) => dispatch({ type: "mark_turn", matchId: view.matchId, turn })}
            onComplete={() => dispatch({ type: "finish", matchId: view.matchId })}
          />
        ) : null}
        <button type="button" onClick={() => dispatch({ type: "finish", matchId: view.matchId })}>
          Skip to result
        </button>
        <p>
          <Link to="/tower">Back to the Tower</Link>
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Match">
      <h2>
        {view.winnerId
          ? `${winnerName(view.winnerId)} wins ${title}`
          : title}
      </h2>
      <p>Status: complete</p>
      {view.resolution ? (
        <p>
          {view.resolution.outcome}
          {view.resolution.decisionType ? ` ${view.resolution.decisionType}` : ""}
          {view.resolution.perfect ? " PERFECT" : ""} decided by {view.resolution.decidedBy}
        </p>
      ) : null}
      {(() => {
        const arena = selectArena(state, bundle, view.matchId);
        return arena.props ? <ArenaScreen {...arena.props} /> : null;
      })()}
      <p>
        <Link to={`/film/${view.matchId}`}>Open the film room</Link> <Link to="/tower">Back to the Tower</Link>
      </p>
    </section>
  );
}
