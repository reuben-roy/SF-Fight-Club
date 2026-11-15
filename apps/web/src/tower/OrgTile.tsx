import { useEffect, useState, type CSSProperties, type ReactElement } from "react";

import { MascotCanvas } from "../art/sprites.js";
import { Icon } from "../art/icons.jsx";
import { Stamp, TitleBadge, classNames } from "../styles/components.js";
import type { TowerEntrant } from "./types.js";
import type { LayoutTile } from "./layout.js";
import type { OrgNode } from "@sf-fight-club/schemas";

export interface TileOffset {
  dx: number;
  dy: number;
}

export interface OrgTileProps {
  node: OrgNode;
  entrant: TowerEntrant;
  placement: LayoutTile;
  /** Set only while the acquisition plays, so the tile starts where it used to be. */
  offset: TileOffset | null;
  slide: boolean;
  countFrom: number | null;
  promoted: boolean;
  showStamp: boolean;
  champion: boolean;
  acquiredByName: string | null;
  onOpen: (entrantId: string) => void;
}

function useCountUp(input: { from: number | null; to: number; animate: boolean; durationMs: number }): number {
  const { from, to, animate, durationMs } = input;
  const [value, setValue] = useState(to);

  useEffect(() => {
    if (!animate || from === null || from === to) {
      setValue(to);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number): void => {
      const progress = Math.min(1, (now - start) / durationMs);
      setValue(Math.round(from + (to - from) * progress));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    setValue(from);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [from, to, animate, durationMs]);

  return value;
}

export function OrgTile({
  node,
  entrant,
  placement,
  offset,
  slide,
  countFrom,
  promoted,
  showStamp,
  champion,
  acquiredByName,
  onOpen,
}: OrgTileProps): ReactElement {
  const compact = placement.width < 124;
  const headcount = useCountUp({
    from: countFrom,
    to: node.headcount,
    animate: slide && countFrom !== null,
    durationMs: 1200,
  });

  const style: CSSProperties = {
    left: placement.x,
    top: placement.y,
    width: placement.width,
    height: placement.height,
    transform: offset ? `translate(${offset.dx}px, ${offset.dy}px)` : undefined,
    transition: slide ? "transform 1400ms steps(14, end)" : undefined,
  };

  const label = [
    entrant.name,
    node.title,
    `${node.headcount} ${node.headcount === 1 ? "person" : "people"}`,
    `clout ${entrant.clout}`,
    node.defeatedBy !== null && acquiredByName ? `acquired by ${acquiredByName}` : null,
    node.via === "WALKOVER" ? "walkover" : null,
    champion ? "champion" : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <button
      type="button"
      className={classNames(
        "tower-tile",
        placement.depth === 0 && "tower-tile--root",
        !node.alive && "tower-tile--acquired",
        champion && "tower-tile--champion",
        compact && "tower-tile--compact",
        promoted && "tower-tile--promoted",
      )}
      style={style}
      data-tile={node.entrantId}
      data-champion={champion ? "true" : undefined}
      aria-label={label}
      onClick={() => onOpen(node.entrantId)}
    >
      <span className="tower-tile__stripe" aria-hidden="true" />
      <span className="tower-tile__sprite" aria-hidden="true">
        <MascotCanvas
          spriteSeed={entrant.spriteSeed}
          category={entrant.category}
          corner={node.seed % 2 === 0 ? "right" : "left"}
          size={compact ? 46 : placement.depth === 0 ? 68 : 60}
          label={`${entrant.name} mascot`}
        />
      </span>
      <span className="tower-tile__main">
        <span className="tower-tile__name">{entrant.name}</span>
        <span className="tower-tile__meta">
          <TitleBadge title={node.title} headcount={headcount} className={promoted ? "tower-tile__title--flip" : undefined} />
          {!compact ? (
            <span className="tower-tile__clout">
              CLOUT {entrant.clout}
            </span>
          ) : null}
        </span>
        {node.defeatedBy !== null ? (
          <span className="tower-tile__acquired">
            {node.via === "WALKOVER" ? (
              <span className="tower-tile__walkover">WALKOVER</span>
            ) : (
              `ACQUIRED BY ${(acquiredByName ?? "").toUpperCase()}`
            )}
          </span>
        ) : null}
      </span>
      {champion ? (
        <span className="tower-tile__crown" aria-hidden="true">
          <Icon name="crown" size={18} />
        </span>
      ) : null}
      {champion ? <span className="tower-tile__belt" aria-hidden="true" /> : null}
      {promoted && slide ? (
        <span className="tower-tile__rankup" aria-hidden="true">
          <Icon name="briefcase" size={14} />
        </span>
      ) : null}
      {showStamp ? (
        <span className="tower-tile__stamp" aria-hidden="true">
          <Stamp tone="sun">ACQUIRED</Stamp>
        </span>
      ) : null}
    </button>
  );
}
