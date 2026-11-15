import type { ReactElement } from "react";

import { Button } from "../styles/components.js";
import { ArenaScreen } from "./ArenaScreen.js";
import { DEMO_BUILD_HASH, DEMO_MATCHES } from "./fixtures/index.js";

const CARRIED_PARAMS = ["turn", "at", "t", "paused", "speed"] as const;

/** A moment survives a fixture change; the match itself does not. */
function hrefFor(matchId: string): string {
  const current = new URLSearchParams(window.location.search);
  const next = new URLSearchParams({ match: matchId });
  for (const key of CARRIED_PARAMS) {
    const value = current.get(key);
    if (value !== null) next.set(key, value);
  }
  return `/dev/arena?${next.toString()}`;
}

export default function ArenaDevRoute(): ReactElement {
  const first = DEMO_MATCHES[0];
  if (!first) throw new Error("The demo fixture library is empty");
  const requested = new URLSearchParams(window.location.search).get("match");
  const index = Math.max(
    0,
    DEMO_MATCHES.findIndex((candidate) => candidate.matchId === requested),
  );
  const match = DEMO_MATCHES[index] ?? first;
  const previous = DEMO_MATCHES[(index - 1 + DEMO_MATCHES.length) % DEMO_MATCHES.length] ?? first;
  const next = DEMO_MATCHES[(index + 1) % DEMO_MATCHES.length] ?? first;

  return (
    <div className="arena-dev">
      <div className="arena-dev__bar">
        <div className="arena-dev__id">
          <span className="arena-dev__title">ARENA HARNESS</span>
          <span className="arena-dev__hash">BUILD {DEMO_BUILD_HASH.slice(0, 12)}</span>
          <span className="arena-dev__now">
            {match.label} · {match.fighters[match.winner].name} wins by {match.outcome}
          </span>
        </div>
        <div className="arena-dev__nav">
          <Button size="sm" variant="ghost" onClick={() => window.location.assign(hrefFor(previous.matchId))}>
            PREV
          </Button>
          <select
            className="arena-dev__select"
            aria-label="Demo match"
            value={match.matchId}
            onChange={(event) => window.location.assign(hrefFor(event.target.value))}
          >
            {DEMO_MATCHES.map((option) => (
              <option key={option.matchId} value={option.matchId}>
                {option.label} · {option.outcome}
              </option>
            ))}
          </select>
          <Button size="sm" variant="ghost" onClick={() => window.location.assign(hrefFor(next.matchId))}>
            NEXT
          </Button>
        </div>
      </div>
      <ArenaScreen key={match.matchId} script={match.script} fighters={match.fighters} autoplay />
    </div>
  );
}
