import type { Bracket } from "@sf-fight-club/engine";
import type { EntrantProfile } from "@sf-fight-club/schemas";

/** One entrant as the Tower and the fighter cards read it. */
export interface FixtureEntrant {
  entrantId: string;
  name: string;
  category: string;
  oneLiner: string;
  spriteSeed: string;
  tier: string;
  clout: { score: number; tier: string };
  profile: EntrantProfile;
}

/** One played match, in air order. */
export interface FixtureMatch {
  matchId: string;
  roundIndex: number;
  slotIndex: number;
  entrantA: string;
  entrantB: string;
  winnerId: string;
}

export interface FixtureDocument {
  buildHash: string;
  seed: string;
  bracket: Bracket;
  entrants: FixtureEntrant[];
  matches: FixtureMatch[];
}
