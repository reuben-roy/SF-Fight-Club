import type { EntrantProfile, OrgTitle } from "@sf-fight-club/schemas";

import type { TowerEntrant } from "../tower/types.js";

export interface FighterCardProps {
  entrant: TowerEntrant;
  profile: EntrantProfile;
  title: OrgTitle;
  headcount: number;
  seed: number;
  tier: string;
  buildHash: string;
}
