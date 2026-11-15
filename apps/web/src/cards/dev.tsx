import type { ReactElement } from "react";

import type { OrgTitle } from "@sf-fight-club/schemas";
import { ORG_TITLES } from "../styles/components.js";
import { DEMO_FIXTURE } from "../tower/fixtures/index.js";
import type { TowerEntrant } from "../tower/types.js";
import { FighterCard } from "./FighterCard.js";

const TITLES: readonly OrgTitle[] = [...ORG_TITLES, "CEO"];
const HEADCOUNTS = [4, 8, 2, 5, 1, 3, 7, 6] as const;

export default function CardsDevScreen(): ReactElement {
  return (
    <div className="card-page" data-testid="cards-dev">
      <header className="card-page__head">
        <div>
          <p className="card-page__kicker">Dev route / paper theme</p>
          <h1 className="card-page__title">FIGHTER CARDS</h1>
        </div>
        <p className="sfc-mono">8 demo entrants / all titles / seeded crew / no photos</p>
      </header>

      <div className="card-grid">
        {DEMO_FIXTURE.entrants.map((fixtureEntrant, index) => {
          const entrant: TowerEntrant = {
            entrantId: fixtureEntrant.entrantId,
            name: fixtureEntrant.name,
            spriteSeed: fixtureEntrant.spriteSeed,
            category: fixtureEntrant.category,
            oneLiner: fixtureEntrant.oneLiner,
            clout: fixtureEntrant.clout.score,
            cloutTier: fixtureEntrant.clout.tier,
          };
          return (
            <FighterCard
              key={fixtureEntrant.entrantId}
              entrant={entrant}
              profile={fixtureEntrant.profile}
              title={TITLES[index] ?? "Director"}
              headcount={HEADCOUNTS[index] ?? 1}
              seed={index + 1}
              tier={fixtureEntrant.tier}
              buildHash={DEMO_FIXTURE.buildHash}
            />
          );
        })}
      </div>
    </div>
  );
}
