/**
 * Screen registry: the real-tournament Tower, Arena, and FighterCard screens
 * built on the committed prop types. Plain-text rendering; standard buttons
 * and links keep everything keyboard reachable.
 */

import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import type { Cue, OrgNode } from "@sf-fight-club/schemas";

import type { ArenaScreenProps } from "../arena/types.js";
import type { FighterCardProps } from "../cards/types.js";
import type { TowerScreenProps } from "../tower/types.js";

/** Links render only for http(s) targets, always with rel=noopener. */
export function safeHref(url: string): string | null {
  return url.startsWith("https://") || url.startsWith("http://") ? url : null;
}

function cueText(cue: Cue): string {
  switch (cue.kind) {
    case "intro":
      return `INTRO ${cue.fighters.A.name} vs ${cue.fighters.B.name}`;
    case "round_title":
      return `ROUND ${cue.round} ${cue.name}`;
    case "shot":
      return `T${cue.turn}V${cue.volley} ${cue.shooter} ${cue.move} ${cue.outcome} ${cue.headline} ${cue.verdictLine}`;
    case "hammer":
      return `HAMMER on ${cue.target} (${cue.criterion}): ${cue.reason}`;
    case "status":
      return `STATUS ${cue.target} ${cue.status} ${cue.on ? "on" : "off"}`;
    case "scorecard": {
      const rows = cue.rows.map((row) => `${row.criterion} A${row.A}/B${row.B}`).join(" ");
      return `SCORECARD R${cue.round}: ${rows}`;
    }
    case "outcome":
      return `OUTCOME ${cue.outcome}${cue.decisionType ? ` ${cue.decisionType}` : ""}${cue.perfect ? " PERFECT" : ""}`;
    case "sudden_death":
      return `SUDDEN DEATH A${cue.tally.A}-B${cue.tally.B}`;
    case "finisher":
      return `FINISHER ${cue.winner} by ${cue.style}`;
    case "winner":
      return `WINNER ${cue.winner} (${cue.decidedBy})`;
    default: {
      const _exhaustive: never = cue;
      return _exhaustive;
    }
  }
}

const SPEEDS = [1, 2, 4] as const;
type Speed = (typeof SPEEDS)[number];

/**
 * Placeholder arena: plays the broadcast script cue by cue. Fires onTurn
 * when a new shot turn airs and onComplete after the winner cue.
 */
export function ArenaScreen(props: ArenaScreenProps): ReactElement {
  const cues = props.script.cues;
  const [cursor, setCursor] = useState(-1);
  const [playing, setPlaying] = useState(props.autoplay ?? false);
  const [speed, setSpeed] = useState<Speed>(props.initialSpeed ?? 1);
  const onTurn = useRef(props.onTurn);
  const onComplete = useRef(props.onComplete);
  onTurn.current = props.onTurn;
  onComplete.current = props.onComplete;
  const announcedTurn = useRef(0);

  const advance = (index: number): number => {
    const next = Math.min(index + 1, cues.length - 1);
    const cue = cues[next];
    if (cue && cue.kind === "shot" && cue.turn > announcedTurn.current) {
      announcedTurn.current = cue.turn;
      onTurn.current?.(cue.turn);
    }
    if (cue && cue.kind === "winner") {
      setPlaying(false);
      onComplete.current?.();
    }
    return next;
  };

  useEffect(() => {
    if (!playing) return;
    if (cursor >= cues.length - 1) {
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(() => setCursor((current) => advance(current)), 1200 / speed);
    return () => window.clearTimeout(id);
  }, [playing, cursor, speed, cues]);

  const aired = cursor >= 0 ? cues[cursor] : null;
  const cycleSpeed = (): void => {
    setSpeed((current) => SPEEDS[(SPEEDS.indexOf(current) + 1) % SPEEDS.length] ?? 1);
  };

  return (
    <section aria-label="Arena">
      <div>
        <span>
          {props.fighters.A.name} ({props.fighters.A.title})
        </span>
        <span> vs </span>
        <span>
          {props.fighters.B.name} ({props.fighters.B.title})
        </span>
      </div>
      <p>
        Crew A: {props.fighters.A.crew.map((member) => member.name).join(", ") || "none"} / Crew B:{" "}
        {props.fighters.B.crew.map((member) => member.name).join(", ") || "none"}
      </p>
      <div role="log" aria-live="polite" aria-label="Fight narration">
        {aired ? cueText(aired) : "The bell has not rung yet."}
      </div>
      <p>
        Cue {Math.max(cursor + 1, 0)} of {cues.length}
      </p>
      <div>
        {playing ? (
          <button type="button" onClick={() => setPlaying(false)}>
            Pause
          </button>
        ) : (
          <button type="button" onClick={() => setPlaying(true)} disabled={cursor >= cues.length - 1}>
            Play
          </button>
        )}
        <button type="button" onClick={() => setCursor((current) => advance(current))} disabled={cursor >= cues.length - 1}>
          Next cue
        </button>
        <button type="button" onClick={cycleSpeed}>
          Speed {speed}x
        </button>
      </div>
    </section>
  );
}

const ROUND_NAMES = ["Quarterfinals", "Semifinals", "Final"] as const;

function roundName(roundIndex: number): string {
  return ROUND_NAMES[roundIndex] ?? `Round ${roundIndex + 1}`;
}

function flattenRoots(roots: readonly OrgNode[]): OrgNode[] {
  const out: OrgNode[] = [];
  const visit = (node: OrgNode): void => {
    out.push(node);
    for (const report of node.reports) visit(report);
  };
  for (const root of roots) visit(root);
  return out;
}

/** Indented tournament tree with a button per match and per fighter. */
export function TowerScreen(props: TowerScreenProps): ReactElement {
  const byRound = new Map<number, typeof props.matches>();
  for (const match of props.matches) {
    const group = byRound.get(match.roundIndex) ?? [];
    group.push(match);
    byRound.set(match.roundIndex, group);
  }
  const rounds = [...byRound.entries()].sort(([a], [b]) => a - b);
  const standings = flattenRoots(props.chart.roots);
  const championId = props.chart.championId;
  const championName = championId ? (props.entrants[championId]?.name ?? championId) : null;
  return (
    <section aria-label="Tower">
      {championName ? <p>Champion: {championName}</p> : <p>Champion: TBD</p>}
      <h2>Standings</h2>
      <ul>
        {standings.map((node) => (
          <li key={node.entrantId}>
            <button type="button" onClick={() => props.onOpenCard(node.entrantId)}>
              {props.entrants[node.entrantId]?.name ?? node.entrantId}
            </button>{" "}
            {node.title} headcount {node.headcount} {node.alive ? "alive" : "out"}
          </li>
        ))}
      </ul>
      <h2>Bracket</h2>
      {rounds.map(([roundIndex, matches]) => (
        <div key={roundIndex} style={{ marginLeft: `${roundIndex * 2}rem` }}>
          <h3>{roundName(roundIndex)}</h3>
          <ul>
            {[...matches]
              .sort((a, b) => a.slotIndex - b.slotIndex)
              .map((match) => (
                <li key={match.matchId}>
                  <button type="button" onClick={() => props.onOpenMatch(match.matchId)}>
                    {match.a ? (props.entrants[match.a]?.name ?? match.a) : "TBD"} vs{" "}
                    {match.b ? (props.entrants[match.b]?.name ?? match.b) : "TBD"} [{match.status}]
                  </button>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

/** Fighter card: every committed field rendered as text. */
export function FighterCardScreen(props: FighterCardProps): ReactElement {
  const companyHref = props.profile.company.url ? safeHref(props.profile.company.url) : null;
  return (
    <article aria-label={`Fighter card for ${props.entrant.name}`}>
      <h2>
        {props.entrant.name} [{props.title}]
      </h2>
      <dl>
        <dt>One liner</dt>
        <dd>{props.entrant.oneLiner}</dd>
        <dt>Category</dt>
        <dd>{props.entrant.category}</dd>
        <dt>Seed</dt>
        <dd>{props.seed}</dd>
        <dt>Tier</dt>
        <dd>{props.tier}</dd>
        <dt>Headcount</dt>
        <dd>{props.headcount}</dd>
        <dt>Clout</dt>
        <dd>
          {props.entrant.clout} ({props.entrant.cloutTier})
        </dd>
        <dt>Company</dt>
        <dd>
          {props.profile.company.name}
          {props.profile.company.location ? ` ${props.profile.company.location}` : ""}
          {props.profile.company.tagline ? ` ${props.profile.company.tagline}` : ""}
          {companyHref ? (
            <>
              {" "}
              <a href={companyHref} rel="noreferrer noopener">
                {companyHref}
              </a>
            </>
          ) : null}
        </dd>
        <dt>Build</dt>
        <dd>{props.buildHash.slice(0, 12)}</dd>
      </dl>
      <h3>Founders</h3>
      <ul>
        {props.profile.founders.map((founder) => (
          <li key={`${founder.name}-${founder.role ?? "founder"}`}>
            {founder.name}
            {founder.role ? ` ${founder.role}` : ""}
            {founder.xHandle ? ` ${founder.xHandle}` : ""}
          </li>
        ))}
      </ul>
    </article>
  );
}
