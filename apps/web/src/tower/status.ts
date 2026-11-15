import type { PillTone } from "../styles/components.js";
import type { TowerMatch } from "./types.js";

export interface MatchStatusLook {
  label: string;
  tone: PillTone;
}

const LOOKS: Record<TowerMatch["status"], MatchStatusLook> = {
  scheduled: { label: "UP NEXT", tone: "default" },
  betting_open: { label: "BETTING OPEN", tone: "open" },
  locked: { label: "LOCKED", tone: "locked" },
  live: { label: "LIVE", tone: "live" },
  complete: { label: "FINAL", tone: "final" },
};

export function matchStatusLook(status: TowerMatch["status"]): MatchStatusLook {
  return LOOKS[status];
}
