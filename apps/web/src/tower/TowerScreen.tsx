import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactElement } from "react";

import { Icon } from "../art/icons.jsx";
import { Button, classNames } from "../styles/components.js";
import { useAppState, useReducedMotion } from "../styles/app-state.js";
import { BracketView } from "./BracketView.js";
import { FloorsRail } from "./FloorsRail.js";
import { OrgTile, type TileOffset } from "./OrgTile.js";
import { VsLink } from "./VsLink.js";
import { diffOrgCharts, nextMeetings, type OrgChartDiff } from "./diff.js";
import { layoutOptionsFor, layoutOrgChart, tileInDirection, type Direction, type LayoutTile } from "./layout.js";
import type { TowerScreenProps } from "./types.js";

const ANIMATION_MS = 2500;

interface SlideState {
  offsets: Record<string, TileOffset>;
  moving: Record<string, true>;
  winning: Record<string, true>;
  promoted: Record<string, true>;
  headcountFrom: Record<string, number>;
  championId: string | null;
}

function seedsOf(chart: TowerScreenProps["chart"]): Record<string, number> {
  const seeds: Record<string, number> = {};
  const walk = (node: TowerScreenProps["chart"]["roots"][number]): void => {
    seeds[node.entrantId] = node.seed;
    node.reports.forEach(walk);
  };
  chart.roots.forEach(walk);
  return seeds;
}

function buildAnnouncement(input: {
  diff: OrgChartDiff;
  entrants: TowerScreenProps["entrants"];
}): string {
  const nameOf = (id: string): string => input.entrants[id]?.name ?? id;
  const lines = input.diff.acquisitions.map((acquisition) => {
    const winner = nameOf(acquisition.winnerId);
    const loser = nameOf(acquisition.loserId);
    return `${winner} acquired ${loser} by ${acquisition.via === "WALKOVER" ? "walkover" : "fight"}.`;
  });
  for (const promotion of input.diff.promotions) {
    lines.push(`${nameOf(promotion.entrantId)} promoted from ${promotion.from} to ${promotion.to}.`);
  }
  const counting = input.diff.headcounts.at(-1);
  if (counting) lines.push(`${nameOf(counting.entrantId)} now runs a company of ${counting.to}.`);
  return lines.join(" ");
}

/** Offsets that put each moved tile where it sat before the acquisition. */
function slideOffsets(input: {
  diff: OrgChartDiff;
  before: readonly LayoutTile[];
  after: readonly LayoutTile[];
}): { offsets: Record<string, TileOffset>; moving: Record<string, true> } {
  const offsets: Record<string, TileOffset> = {};
  const moving: Record<string, true> = {};
  const beforeById = new Map(input.before.map((tile) => [tile.entrantId, tile]));
  const afterById = new Map(input.after.map((tile) => [tile.entrantId, tile]));
  for (const acquisition of input.diff.acquisitions) {
    for (const entrantId of acquisition.subtreeIds) {
      const before = beforeById.get(entrantId);
      const after = afterById.get(entrantId);
      if (!before || !after) continue;
      const dx = before.x - after.x;
      const dy = before.y - after.y;
      if (dx === 0 && dy === 0) continue;
      offsets[entrantId] = { dx, dy };
      moving[entrantId] = true;
    }
  }
  return { offsets, moving };
}

export function TowerScreen({
  chart,
  previousChart,
  entrants,
  matches,
  onOpenMatch,
  onOpenCard,
}: TowerScreenProps): ReactElement {
  const reducedMotion = useReducedMotion();
  const { sound } = useAppState();
  const [view, setView] = useState<"org" | "bracket">("org");
  const [slide, setSlide] = useState<SlideState | null>(null);
  const [overflowing, setOverflowing] = useState(false);
  const animatedRef = useRef<TowerScreenProps["chart"] | null>(null);
  const reducedRef = useRef(reducedMotion);
  reducedRef.current = reducedMotion;
  const stageRef = useRef<HTMLDivElement>(null);

  const options = useMemo(() => layoutOptionsFor(chart), [chart]);
  const layout = useMemo(() => layoutOrgChart({ chart, options }), [chart, options]);
  const previousLayout = useMemo(
    () => (previousChart ? layoutOrgChart({ chart: previousChart, options }) : null),
    [previousChart, options],
  );
  const diff = useMemo(
    () => (previousChart && previousChart !== chart ? diffOrgCharts({ previous: previousChart, next: chart }) : null),
    [previousChart, chart],
  );
  const meetings = useMemo(() => nextMeetings({ chart, matches }), [chart, matches]);
  const seeds = useMemo(() => seedsOf(chart), [chart]);

  const tileById = useMemo(() => new Map(layout.tiles.map((tile) => [tile.entrantId, tile])), [layout]);
  const matchById = useMemo(() => new Map(matches.map((match) => [match.matchId, match])), [matches]);
  const reporterOf = useMemo(() => {
    const reporters: Record<string, string> = {};
    const walk = (node: TowerScreenProps["chart"]["roots"][number]): void => {
      if (node.defeatedBy !== null) reporters[node.entrantId] = node.defeatedBy;
      node.reports.forEach(walk);
    };
    chart.roots.forEach(walk);
    return reporters;
  }, [chart]);

  const championId = chart.championId;
  const champion = championId === null ? null : entrants[championId] ?? null;
  const fieldSize = chart.roots.reduce((total, root) => total + root.headcount, 0);

  useEffect(() => {
    if (!previousChart || !previousLayout || !diff || !diff.changed) return;
    if (animatedRef.current === chart) return;
    animatedRef.current = chart;

    const { offsets, moving } = slideOffsets({ diff, before: previousLayout.tiles, after: layout.tiles });
    const winning: Record<string, true> = {};
    const promoted: Record<string, true> = {};
    const headcountFrom: Record<string, number> = {};
    for (const acquisition of diff.acquisitions) winning[acquisition.winnerId] = true;
    for (const promotion of diff.promotions) promoted[promotion.entrantId] = true;
    for (const change of diff.headcounts) headcountFrom[change.entrantId] = change.from;

    setSlide({
      offsets: reducedRef.current ? {} : offsets,
      moving,
      winning,
      promoted,
      headcountFrom,
      championId: chart.championId,
    });
    if (!reducedRef.current) sound.play("promotion");

    let frame = 0;
    if (!reducedRef.current) {
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          setSlide((current) => (current ? { ...current, offsets: {} } : current));
        });
      });
    }
    const timer = window.setTimeout(() => setSlide(null), reducedRef.current ? 600 : ANIMATION_MS);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [chart, previousChart, previousLayout, diff, layout, sound]);

  const announcement = useMemo(() => (diff && diff.changed ? buildAnnouncement({ diff, entrants }) : ""), [diff, entrants]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === "undefined") return;
    const measure = (): void => setOverflowing(stage.scrollWidth > stage.clientWidth + 8);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [view, layout]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Enter" || event.key === " ") return;
    const direction = directionOf(event.key);
    if (direction === null) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const tile = target.closest("[data-tile]");
    if (!(tile instanceof HTMLElement)) return;
    const currentId = tile.dataset["tile"];
    if (!currentId) return;
    const next = tileInDirection({ tiles: layout.tiles, fromId: currentId, direction });
    if (!next) return;
    event.preventDefault();
    const node = stageRef.current?.querySelector(`[data-tile="${next}"]`);
    if (node instanceof HTMLElement) node.focus();
  };

  const championTile = championId === null ? null : tileById.get(championId) ?? null;

  return (
    <div className="tower" data-theme="night" data-testid="tower">
      <header className="tower__head">
        <div className="tower__heading">
          <p className="tower__kicker">
            THE TOWER / {chart.roots.length} ALIVE / {fieldSize} ENTRANTS
          </p>
          <h1 className="tower__title">{champion ? `${champion.name.toUpperCase()} RUNS THE TOWER` : "THE ORG CHART"}</h1>
        </div>
        <div className="tower__controls">
          <span className="tower__round">ROUND {Math.min(chart.rounds + 1, roundsPlayed(matches) + 1)} OF {chart.rounds + 1}</span>
          {view === "org" && overflowing ? <span className="tower__scrollhint">SCROLL →</span> : null}
          <Button
            size="sm"
            aria-pressed={view === "bracket"}
            onClick={() => setView(view === "org" ? "bracket" : "org")}
          >
            {view === "org" ? "Bracket view" : "Org chart"}
          </Button>
        </div>
      </header>

      <p className="sfc-sr" aria-live="polite">
        {announcement}
      </p>

      {champion ? (
        <div className="tower__champion" data-testid="tower-champion">
          <span className="tower__champion-crown" aria-hidden="true">
            <Icon name="crown" size={22} />
          </span>
          <span className="tower__champion-kicker">CHAMPION</span>
          <strong className="tower__champion-name">{champion.name}</strong>
          <span className="tower__champion-stat">CEO / RUNS A COMPANY OF {fieldSize}</span>
        </div>
      ) : null}

      {view === "org" ? (
        <div className="tower__body">
          <FloorsRail chart={chart} />
          <div
            className={classNames("tower__stage", fieldSize > 8 && "tower__stage--scroll")}
            data-testid="tower-stage"
            ref={stageRef}
            onKeyDown={onKeyDown}
          >
            <div className="tower__canvas" style={{ width: layout.width, height: layout.height }}>
              <svg
                className="tower__wires"
                width={layout.width}
                height={layout.height}
                viewBox={`0 0 ${layout.width} ${layout.height}`}
                aria-hidden="true"
              >
                {layout.connectors.map((connector) =>
                  connector.segments.map((segment, index) => (
                    <line
                      key={`${connector.fromId}-${connector.toId}-${index}`}
                      className={classNames(
                        "tower__wire",
                        slide?.moving[connector.toId] && "tower__wire--fresh",
                      )}
                      x1={segment.x1}
                      y1={segment.y1}
                      x2={segment.x2}
                      y2={segment.y2}
                    />
                  )),
                )}
              </svg>

              {layout.tiles.map((placement) => {
                const entrant = entrants[placement.entrantId];
                if (!entrant) return null;
                const node = nodeOf(chart, placement.entrantId);
                if (!node) return null;
                return (
                  <OrgTile
                    key={placement.entrantId}
                    node={node}
                    entrant={entrant}
                    placement={placement}
                    offset={slide?.offsets[placement.entrantId] ?? null}
                    slide={slide !== null}
                    countFrom={slide?.headcountFrom[placement.entrantId] ?? null}
                    promoted={slide !== null && slide.promoted[placement.entrantId] === true}
                    showStamp={slide !== null && slide.winning[placement.entrantId] === true}
                    champion={championId === placement.entrantId}
                    acquiredByName={
                      node.defeatedBy === null ? null : entrants[node.defeatedBy]?.name ?? node.defeatedBy
                    }
                    onOpen={onOpenCard}
                  />
                );
              })}

              {meetings.map((meeting) => {
                const match = matchById.get(meeting.matchId);
                const left = tileById.get(meeting.leftId);
                const right = tileById.get(meeting.rightId);
                if (!match || !left || !right) return null;
                const leftEdge = left.x + left.width;
                const width = right.x - leftEdge - 8;
                if (width < 24) return null;
                return (
                  <VsLink
                    key={meeting.matchId}
                    meeting={meeting}
                    match={match}
                    leftName={entrants[meeting.leftId]?.name ?? meeting.leftId}
                    rightName={entrants[meeting.rightId]?.name ?? meeting.rightId}
                    style={{ left: leftEdge + 4, top: left.y + 22, width }}
                    onOpenMatch={onOpenMatch}
                  />
                );
              })}

              {slide && slide.championId === null
                ? Object.keys(slide.winning).map((winnerId) => {
                    const tile = tileById.get(winnerId);
                    if (!tile) return null;
                    return <Confetti key={`confetti-${winnerId}`} tile={tile} />;
                  })
                : null}

              {slide && slide.championId !== null && championTile ? (
                <Confetti key="champion-confetti" tile={championTile} crowned />
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="tower__bracket-wrap">
          <BracketView
            matches={matches}
            entrants={entrants}
            seeds={seeds}
            championId={chart.championId}
            onOpenMatch={onOpenMatch}
          />
        </div>
      )}
    </div>
  );
}

function roundsPlayed(matches: TowerScreenProps["matches"]): number {
  const rounds = new Set<number>();
  for (const match of matches) {
    if (match.status === "complete") rounds.add(match.roundIndex);
  }
  return rounds.size;
}

function directionOf(key: string): Direction | null {
  switch (key) {
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
    default:
      return null;
  }
}

function nodeOf(chart: TowerScreenProps["chart"], entrantId: string): TowerScreenProps["chart"]["roots"][number] | null {
  let found: TowerScreenProps["chart"]["roots"][number] | null = null;
  const walk = (node: TowerScreenProps["chart"]["roots"][number]): void => {
    if (found) return;
    if (node.entrantId === entrantId) {
      found = node;
      return;
    }
    node.reports.forEach(walk);
  };
  chart.roots.forEach(walk);
  return found;
}

const CONFETTI_COLORS = ["#FFDD73", "#FFAF01", "#FF8204", "#FA500F", "#E51300"] as const;

function Confetti({ tile, crowned = false }: { tile: LayoutTile; crowned?: boolean }): ReactElement {
  return (
    <span
      className={classNames("tower-confetti", crowned && "tower-confetti--crowned")}
      style={{ left: tile.x - 8, top: tile.y - 4, width: tile.width + 16 }}
      aria-hidden="true"
    >
      {Array.from({ length: crowned ? 20 : 14 }, (_, index) => (
        <span
          key={index}
          className="tower-confetti__bit"
          style={{
            left: `${(index * 37) % 100}%`,
            background: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
            animationDelay: `${(index % 7) * 70}ms`,
          }}
        />
      ))}
    </span>
  );
}
