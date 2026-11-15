import type { OrgChart } from "@sf-fight-club/schemas";

export interface TowerEntrant {
  entrantId: string;
  name: string;
  spriteSeed: string;
  category: string;
  oneLiner: string;
  clout: number;
  cloutTier: string;
}

export interface TowerMatch {
  matchId: string;
  roundIndex: number;
  slotIndex: number;
  /** Entrant ids. Null until the feeder match is complete. */
  a: string | null;
  b: string | null;
  status: "scheduled" | "betting_open" | "locked" | "live" | "complete";
}

export interface TowerScreenProps {
  chart: OrgChart;
  /** When set, the screen animates the difference from this chart to `chart`. */
  previousChart?: OrgChart;
  entrants: Record<string, TowerEntrant>;
  matches: TowerMatch[];
  onOpenMatch: (matchId: string) => void;
  onOpenCard: (entrantId: string) => void;
}
