/**
 * Tower route entry: a thin shell around the Tower screen registry. Adds the
 * champion banner, confetti once the final is complete, and the fighter card
 * dialog. All navigation and selection goes through the store props.
 */

import { useState, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";

import { FighterCardDialog } from "../app/fighter-card-dialog.js";
import { TowerScreen } from "../app/screens.js";
import { Confetti } from "../app/visuals.js";
import { useAppStore } from "../data/index.js";
import { selectFighterCard, selectOrgCharts, selectTowerProps } from "../data/store.js";
import { classNames } from "../styles/components.js";

export default function TowerEntry(): ReactElement {
  const { bundle, state } = useAppStore();
  const navigate = useNavigate();
  const [cardId, setCardId] = useState<string | null>(null);

  const props = selectTowerProps(state, bundle, {
    onOpenMatch: (matchId) => navigate(`/match/${matchId}`),
    onOpenCard: (entrantId) => setCardId(entrantId),
  });
  const card = cardId ? selectFighterCard(state, bundle, cardId) : null;
  const { chart } = selectOrgCharts(state, bundle);
  const championId = chart.championId;
  const championName = championId ? (props.entrants[championId]?.name ?? championId) : null;

  return (
    <div className="sfc-tower" data-theme="night">
      <div className="sfc-page sfc-tower__inner">
        <header>
          <p className="sfc-kicker">Org chart · play money only</p>
          <h1 className="sfc-tower__title">The Tower</h1>
        </header>

        <section
          className={classNames("sfc-tower__banner", !championName && "sfc-tower__banner--empty")}
          aria-label="Champion"
        >
          {championName ? <Confetti count={20} /> : null}
          <p>Champion: {championName ?? "TBD"}</p>
          {championName ? (
            <span className="sfc-kicker">Final complete. The whole field reports to the winner.</span>
          ) : (
            <span className="sfc-kicker">Win the final to take the belt and the whole org chart.</span>
          )}
        </section>

        <div className="sfc-tower__screen">
          <TowerScreen {...props} />
        </div>
      </div>

      {card ? <FighterCardDialog card={card} onClose={() => setCardId(null)} /> : null}
    </div>
  );
}
