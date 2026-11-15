import type { ReactElement } from "react";

import type { EntrantProfile } from "@sf-fight-club/schemas";
import { FighterCard } from "../cards/FighterCard.js";
import type { TowerEntrant } from "../tower/types.js";
import { PortraitCanvas } from "./portrait.js";
import { CrewCanvas } from "./sprites.js";
import { SAMPLE_PORTRAITS, type SamplePortrait } from "./fixtures/sample-portraits.js";

function mockEntrant(sample: SamplePortrait): TowerEntrant {
  return {
    entrantId: `sample-${sample.slug}`,
    name: sample.slug,
    spriteSeed: `sample-${sample.slug}`,
    category: "sample",
    oneLiner: "Sample portrait fixture",
    clout: 50,
    cloutTier: "B",
  };
}

function mockProfile(sample: SamplePortrait): EntrantProfile {
  return {
    entrantId: `sample-${sample.slug}`,
    company: { name: sample.slug, tagline: "Sample portrait fixture" },
    founders: [
      {
        name: sample.slug,
        portrait: sample.portrait,
        portraitTraits: { ...sample.traits },
      },
    ],
    posts: [],
    clout: { score: 50, tier: "B", x: 50, hn: 50 },
    sources: [],
  };
}

function SampleRow({ sample, index }: { sample: SamplePortrait; index: number }): ReactElement {
  const traits = { skin: sample.traits.skin, hair: sample.traits.hair, shirt: sample.traits.accent };
  return (
    <section className="art-section" aria-label={`Sample portrait ${sample.slug}`}>
      <div className="art-section__head">
        <h2 className="art-section__title">
          {sample.slug} <small>skin {sample.traits.skin} / hair {sample.traits.hair}</small>
        </h2>
      </div>
      <div className="art-crew-grid">
        <div className="art-crew-card">
          <PortraitCanvas portrait={sample.portrait} size={96} label={`${sample.slug} portrait at 3x`} />
          <div className="art-crew-card__foot">
            <span>portrait</span>
            <span>3x / 96 px</span>
          </div>
        </div>
        <div className="art-crew-card">
          <PortraitCanvas portrait={sample.portrait} size={192} label={`${sample.slug} portrait at 6x`} />
          <div className="art-crew-card__foot">
            <span>portrait</span>
            <span>6x / 192 px</span>
          </div>
        </div>
        <div className="art-crew-card">
          <CrewCanvas handle={sample.slug} traits={traits} state="idle" size={56} label={`${sample.slug} crew figure idle`} />
          <div className="art-crew-card__foot">
            <span>crew</span>
            <span>idle</span>
          </div>
        </div>
        <div className="art-crew-card">
          <CrewCanvas handle={sample.slug} traits={traits} state="cheer" size={56} label={`${sample.slug} crew figure cheering`} />
          <div className="art-crew-card__foot">
            <span>crew</span>
            <span>cheer</span>
          </div>
        </div>
      </div>
      <div className="card-grid">
        <FighterCard
          entrant={mockEntrant(sample)}
          profile={mockProfile(sample)}
          title="Director"
          headcount={1}
          seed={index + 1}
          tier="B"
          buildHash="SAMPLE"
        />
      </div>
    </section>
  );
}

export default function PortraitsGallery(): ReactElement {
  return (
    <div className="art-page" data-testid="portraits-gallery">
      <header className="art-hero">
        <div className="art-hero__bands" aria-hidden="true" />
        <div className="art-hero__inner">
          <p className="art-kicker">Art lab / portraits</p>
          <h1 className="art-title">PORTRAITS.</h1>
          <p className="art-lede">
            Sample portraits are public-domain photos used to test the pipeline. They are not entrants.
          </p>
          <p className="art-note">
            Each founder shows a 32x32 portrait at 3x and 6x, the crew figure repainted from its trait colors in
            idle and cheer, and a mock fighter card. Photos are never rendered.
          </p>
        </div>
      </header>
      {SAMPLE_PORTRAITS.map((sample, index) => (
        <SampleRow key={sample.slug} sample={sample} index={index} />
      ))}
    </div>
  );
}
