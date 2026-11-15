import type { ReactElement } from "react";

import { PlaceholderPage } from "../styles/components.js";

export default function ArenaScreen(): ReactElement {
  return (
    <PlaceholderPage
      kicker="Match"
      title="THE ARENA"
      body="Turn-based battle, HUD, command deck, narration and receipts. Arena task owns this screen."
    />
  );
}
