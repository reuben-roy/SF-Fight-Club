import type { CSSProperties, ReactElement } from "react";

import { Pill, classNames } from "../styles/components.js";
import { matchStatusLook } from "./status.js";
import type { NextMeeting } from "./diff.js";
import type { TowerMatch } from "./types.js";

export interface VsLinkProps {
  meeting: NextMeeting;
  match: TowerMatch;
  leftName: string;
  rightName: string;
  style: CSSProperties;
  onOpenMatch: (matchId: string) => void;
}

/** The joining link between two roots that fight next. */
export function VsLink({ meeting, match, leftName, rightName, style, onOpenMatch }: VsLinkProps): ReactElement {
  const look = matchStatusLook(match.status);
  return (
    <button
      type="button"
      className={classNames("tower-vs", match.status === "live" && "tower-vs--live")}
      style={style}
      onClick={() => onOpenMatch(match.matchId)}
      aria-label={`${leftName} versus ${rightName}, ${look.label.toLowerCase()}, round ${meeting.roundIndex + 1}`}
    >
      <span className="tower-vs__line" aria-hidden="true" />
      <span className="tower-vs__badge" aria-hidden="true">
        VS
      </span>
      <Pill tone={look.tone} className="tower-vs__pill">
        {look.label}
      </Pill>
    </button>
  );
}
