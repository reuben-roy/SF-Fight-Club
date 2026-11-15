/**
 * Tower route entry: thin wiring from the store to the tower screen. The
 * screen owns the org chart, bracket view, champion banner and confetti; this
 * entry only supplies store props and the fighter-card dialog.
 */

import { useState, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";

import { FighterCardDialog } from "../app/fighter-card-dialog.js";
import { useAppStore } from "../data/index.js";
import { selectFighterCard, selectTowerProps } from "../data/store.js";
import { TowerScreen } from "../tower/TowerScreen.js";

export default function TowerEntry(): ReactElement {
  const { bundle, state } = useAppStore();
  const navigate = useNavigate();
  const [cardId, setCardId] = useState<string | null>(null);

  const props = selectTowerProps(state, bundle, {
    onOpenMatch: (matchId) => navigate(`/match/${matchId}`),
    onOpenCard: (entrantId) => setCardId(entrantId),
  });
  const card = cardId ? selectFighterCard(state, bundle, cardId) : null;

  return (
    <div className="sfc-tower-page">
      <TowerScreen {...props} />
      {card ? <FighterCardDialog card={card} onClose={() => setCardId(null)} /> : null}
    </div>
  );
}
