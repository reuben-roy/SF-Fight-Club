import type { ReactElement } from "react";

import { PlaceholderPage } from "../styles/components.js";

export default function HomeScreen(): ReactElement {
  return (
    <PlaceholderPage
      kicker="Home"
      title="STARTUP IDEAS ENTER THE RING"
      body="Stripe hero, house rules and the way into the Tower live here. App task owns this screen."
    />
  );
}
