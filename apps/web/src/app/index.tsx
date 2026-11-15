import type { ReactElement } from "react";
import { Link } from "react-router-dom";

import { useAppStore } from "../data/index.js";

const HOUSE_RULES = [
  "One build for every fighter. Same agent, same odds, no excuses.",
  "No source, no damage. Every claim carries its receipts.",
  "Sealed till the bell. Judges never see seeds, odds, or bets.",
  "Play money only. S$ has no cash value.",
] as const;

export default function HomeScreen(): ReactElement {
  const { bundle, state } = useAppStore();
  const total = bundle.matches.length;
  const done = state.completedOrder.length;
  const final = bundle.matches.find((m) => m.roundIndex === 2 && m.slotIndex === 0);
  const championId =
    final && state.statuses[final.matchId] === "complete" ? final.winnerId : null;
  const champion = championId ? bundle.entrants.find((e) => e.id === championId)?.name : null;

  return (
    <section aria-label="Home">
      <h2>Startup ideas enter the ring</h2>
      <p>
        Eight fictional startups. One frozen build. Seven fights decided turn by turn by the same
        Mistral-powered judges.
      </p>
      <p>
        Tournament: {done} of {total} fights complete{champion ? ` Champion: ${champion}` : ""} Wallet:
        S${state.wallet}
      </p>
      <h3>House rules</h3>
      <ul>
        {HOUSE_RULES.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
      <p>
        <Link to="/tower">Enter the Tower</Link>
      </p>
    </section>
  );
}
