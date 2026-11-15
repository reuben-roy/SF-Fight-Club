/**
 * Tower route entry: thin wiring from the store to the screens registry.
 * The Tower screen itself lives in src/app/screens.tsx.
 */

import { useState, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";

import { FighterCardScreen, TowerScreen } from "../app/screens.js";
import { useAppStore } from "../data/index.js";
import { selectFighterCard, selectTowerProps } from "../data/store.js";

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
    <>
      <h2>Tower</h2>
      <TowerScreen {...props} />
      {card ? (
        <section aria-label="Selected fighter">
          <button type="button" onClick={() => setCardId(null)}>
            Close card
          </button>
          <FighterCardScreen {...card} />
        </section>
      ) : null}
    </>
  );
}
