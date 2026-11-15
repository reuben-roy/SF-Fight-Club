import type { BroadcastScript, OrgTitle, Slot } from "@sf-fight-club/schemas";

/** A person standing behind a mascot. `from` is the entrant they came in with. */
export interface CrewMember {
  handle: string;
  name: string;
  from: string;
}

export interface ArenaFighter {
  entrantId: string;
  name: string;
  seed: number;
  tier: string;
  spriteSeed: string;
  category: string;
  title: OrgTitle;
  clout: number;
  crew: CrewMember[];
}

export interface ArenaScreenProps {
  script: BroadcastScript;
  fighters: Record<Slot, ArenaFighter>;
  autoplay?: boolean;
  initialSpeed?: 1 | 2 | 4;
  /** Fires when a turn's impact has aired. */
  onTurn?: (turn: number) => void;
  /** Fires after the winner cue. */
  onComplete?: () => void;
}
