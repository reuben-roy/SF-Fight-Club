/**
 * Home: the landing page. Stripe-sunset hero, tournament progress, the five
 * house rules from docs/01-product.md, the eight-entrant field, and a
 * confirmed restart. Every fighter card opens from the field.
 */

import { useState, type ReactElement } from "react";
import { Link } from "react-router-dom";

import type { FighterCardProps } from "../cards/types.js";
import { Button, Stamp } from "../styles/components.js";
import { useAppStore } from "../data/index.js";
import { selectFighterCard } from "../data/store.js";
import { FighterCardDialog } from "./fighter-card-dialog.js";
import { MascotFigure, HeroStage } from "./visuals.js";

const HOUSE_RULES = [
  "Every fighter is the same agent. Only the idea fights.",
  "No source, no damage. Claims without evidence hit softer. Made-up evidence blows up in your own hands.",
  "Every hit has a receipt.",
  "Nobody sees the result before the bell. Bets lock before the match is computed.",
  "The judges never see seeds, odds, names of submitters, or who the crowd likes.",
] as const;

export default function HomeScreen(): ReactElement {
  const { bundle, state, dispatch } = useAppStore();
  const [cardId, setCardId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const total = bundle.matches.length;
  const done = state.completedOrder.length;
  const final = bundle.matches.find((m) => m.roundIndex === 2 && m.slotIndex === 0);
  const championId = final && state.statuses[final.matchId] === "complete" ? final.winnerId : null;
  const champion = championId ? (bundle.entrants.find((e) => e.id === championId)?.name ?? championId) : null;
  const card: FighterCardProps | null = cardId ? selectFighterCard(state, bundle, cardId) : null;
  const seedOf = (entrantId: string): number =>
    bundle.bracket.entrants.find((entry) => entry.id === entrantId)?.seed ?? 0;

  return (
    <div className="sfc-home">
      <section className="sfc-hero" data-theme="night" aria-label="SF Fight Club">
        <HeroStage />
        <div className="sfc-page sfc-hero__inner">
          <p className="sfc-kicker">A tournament of identical agents</p>
          <h1 className="sfc-hero__title">
            SF
            <br />
            FIGHT CLUB
          </h1>
          <p className="sfc-hero__tagline">Startup ideas enter the ring. One gets the belt.</p>
          <Link className="sfc-btn sfc-hero__cta" to="/tower">
            Enter the Tower
          </Link>
        </div>
      </section>

      <div className="sfc-page sfc-home__body">
        <section aria-label="Tournament progress">
          <div className="sfc-section-head">
            <h2>The tournament</h2>
            <span className="sfc-kicker">Seven fights. One champion.</span>
          </div>
          <div className="sfc-progress">
            <div className="sfc-progress__cell">
              <p>
                Tournament: {done} of {total} fights complete
              </p>
            </div>
            <div className="sfc-progress__cell">
              <p>Wallet: S${state.wallet}</p>
            </div>
            <div className="sfc-progress__cell">
              <p>Champion: {champion ?? "TBD"}</p>
            </div>
          </div>
        </section>

        <section aria-label="House rules">
          <div className="sfc-section-head">
            <h2>House rules</h2>
            <span className="sfc-kicker">Five rules. No exceptions.</span>
          </div>
          <ol className="sfc-rules">
            {HOUSE_RULES.map((rule, index) => (
              <li className="sfc-rule" key={rule}>
                <span className="sfc-rule__num" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <p>{rule}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-label="The field">
          <div className="sfc-section-head">
            <h2>The field</h2>
            <span className="sfc-kicker">Eight entrants. One frozen build.</span>
          </div>
          <ul className="sfc-field">
            {bundle.entrants.map((entrant) => (
              <li key={entrant.id}>
                <button
                  type="button"
                  className="sfc-fieldcard"
                  onClick={() => setCardId(entrant.id)}
                  aria-label={`Fighter card for ${entrant.name}`}
                >
                  <span className="sfc-fieldcard__top">
                    <MascotFigure
                      spriteSeed={entrant.spriteSeed}
                      category={entrant.category}
                      corner="left"
                      size={56}
                    />
                    <span className="sfc-fieldcard__seed">SEED {seedOf(entrant.id)}</span>
                  </span>
                  <span className="sfc-fieldcard__name">{entrant.name}</span>
                  <span className="sfc-fieldcard__line">{entrant.oneLiner}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="sfc-restart" aria-label="Restart tournament">
          {confirming ? (
            <>
              <Stamp tone="red">Confirm</Stamp>
              <p>Restart the whole tournament? Every fight, bet and wallet resets.</p>
              <Button
                variant="hot"
                onClick={() => {
                  dispatch({ type: "reset" });
                  setConfirming(false);
                }}
              >
                Yes, restart
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Keep playing
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => setConfirming(true)}>Restart tournament</Button>
              <p>Play money only. Restarting clears the bracket, the bets and the wallet.</p>
            </>
          )}
        </section>
      </div>

      {card ? <FighterCardDialog card={card} onClose={() => setCardId(null)} /> : null}
    </div>
  );
}
