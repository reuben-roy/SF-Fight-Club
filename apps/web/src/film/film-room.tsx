/**
 * Film room: the full sealed-then-unsealed record of a fight. Paper theme.
 * Verdict header, scorecard, shot-by-shot timeline and evidence locker all
 * render committed bundle text as plain text. Only http(s) URLs become links.
 */

import { useState, type ReactElement, type ReactNode } from "react";
import { Link } from "react-router-dom";

import type {
  Cue,
  EvidenceItem,
  FightReport,
  MatchResolution,
  RoundNumber,
  ShotFactCheck,
  ShotVerdict,
  Slot,
  TiebreakRecord,
} from "@sf-fight-club/schemas";

import type { FilmData, FilmRound, FilmShot } from "../data/demo-bundle.js";
import type { FilmView } from "../data/store.js";
import { safeHref } from "../app/screens.js";
import { Stamp, classNames } from "../styles/components.js";

type ShotCue = Extract<Cue, { kind: "shot" }>;

const CRITERION_LABELS: Record<string, string> = {
  problem: "Problem",
  market: "Market",
  wtp: "Willingness to pay",
  differentiation: "Differentiation",
  moat: "Moat",
  timing: "Timing",
  gtm: "Go to market",
  feasibility: "Feasibility",
  scale: "Scale",
};

const ROUND_TITLES: Record<RoundNumber, string> = {
  1: "The problem",
  2: "The moat",
  3: "The execution",
};

function criterionLabel(criterion: string): string {
  return CRITERION_LABELS[criterion] ?? criterion.replace(/_/g, " ");
}

function slotName(view: FilmView, slot: Slot): string {
  return slot === "A" ? (view.aName ?? "A") : (view.bName ?? "B");
}

function cornerOf(view: FilmView, slot: Slot): "left" | "right" {
  if (!view.corners) return slot === "A" ? "left" : "right";
  return view.corners.left === slot ? "left" : "right";
}

function verdictTone(verdict: ShotVerdict["verdict"]): string {
  switch (verdict) {
    case "landed":
      return "supported";
    case "partial":
      return "partial";
    case "glancing":
      return "partial";
    case "parried":
      return "unsupported";
    case "whiff":
      return "unsupported";
    default: {
      const _exhaustive: never = verdict;
      return _exhaustive;
    }
  }
}

function tiebreakLabel(record: TiebreakRecord, winner: Slot): string {
  switch (record.strategy) {
    case "sudden_death_judge": {
      if (record.result === "split") return "sudden death judge, split";
      const forWinner = record.votes.filter((vote) => vote.winner === winner).length;
      const against = record.votes.length - forWinner;
      return `sudden death judge, ${forWinner} to ${against}`;
    }
    case "vc_panel":
      return "VC panel";
    case "weighin_total":
      return "weigh-in total";
    case "seed":
      return "seed";
    default: {
      const _exhaustive: never = record;
      return _exhaustive;
    }
  }
}

function decidedByLabel(resolution: MatchResolution): string {
  switch (resolution.decidedBy) {
    case "scores":
      return "scores";
    case "sudden_death_judge":
    case "vc_panel":
    case "weighin_total":
    case "seed": {
      const record = resolution.tiebreak?.find((entry) => entry.strategy === resolution.decidedBy);
      return record ? tiebreakLabel(record, resolution.winner) : resolution.decidedBy.replace(/_/g, " ");
    }
    default: {
      const _exhaustive: never = resolution.decidedBy;
      return _exhaustive;
    }
  }
}

/** A link only when the URL is http(s); otherwise the label as plain text. */
export function EvidenceLink({
  url,
  children,
  className,
}: {
  url: string;
  children: ReactNode;
  className?: string;
}): ReactElement {
  const href = safeHref(url);
  if (!href) return <span className={className}>{children}</span>;
  return (
    <a className={className} href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

function evidenceById(film: FilmData): Map<string, EvidenceItem> {
  return new Map(film.evidence.map((item) => [item.id, item]));
}

function factCheckFor(shot: FilmShot): Map<string, ShotFactCheck["perEvidence"][number]> {
  return new Map(shot.factCheck?.perEvidence.map((entry) => [entry.evidenceId, entry]) ?? []);
}

function shotCues(script: FilmView["script"]): Map<string, ShotCue> {
  const map = new Map<string, ShotCue>();
  for (const cue of script?.cues ?? []) {
    if (cue.kind === "shot") map.set(cue.shotId, cue);
  }
  return map;
}

function roundOrder(film: FilmData): (RoundNumber | "sudden_death")[] {
  const order: (RoundNumber | "sudden_death")[] = [1, 2, 3];
  if (film.shots.some((shot) => shot.round === "sudden_death")) order.push("sudden_death");
  return order;
}

function roundHeading(round: RoundNumber | "sudden_death"): string {
  return round === "sudden_death" ? "Sudden death" : `Round ${round} · ${ROUND_TITLES[round]}`;
}

function moveLabel(move: ShotCue["move"]): string {
  return typeof move === "string" ? move : move.name;
}

function Scorecard({ view, film, resolution }: { view: FilmView; film: FilmData; resolution: MatchResolution }): ReactElement {
  return (
    <section className="sfc-film__section" aria-label="Scorecard" data-scorecard>
      <h2 className="sfc-film__h">Scorecard</h2>
      <div className="sfc-scorecard__wrap">
        <table className="sfc-scorecard">
          <caption>
            Rubric points per criterion. AB and BA are the two judge orders; final is the settled score.
          </caption>
          <thead>
            <tr>
              <th scope="col">Criterion</th>
              <th scope="col">Weight</th>
              <th scope="colgroup" colSpan={3}>
                {view.aName ?? "A"}
              </th>
              <th scope="colgroup" colSpan={3}>
                {view.bName ?? "B"}
              </th>
              <th scope="col">Margin</th>
              <th scope="col">Points</th>
              <th scope="col">HP</th>
              <th scope="col">Flag</th>
            </tr>
            <tr>
              <th scope="col" aria-label="Criterion" />
              <th scope="col" aria-label="Weight" />
              <th scope="col">AB</th>
              <th scope="col">BA</th>
              <th scope="col">Final</th>
              <th scope="col">AB</th>
              <th scope="col">BA</th>
              <th scope="col">Final</th>
              <th scope="col" aria-label="Margin" />
              <th scope="col" aria-label="Points" />
              <th scope="col" aria-label="HP" />
              <th scope="col" aria-label="Flag" />
            </tr>
          </thead>
          {film.rounds.map((round: FilmRound) => {
            const hpA = resolution.hpAfterRound.A[round.round - 1] ?? "—";
            const hpB = resolution.hpAfterRound.B[round.round - 1] ?? "—";
            return (
              <tbody key={round.round}>
                <tr className="sfc-scorecard__round">
                  <th scope="colgroup" colSpan={12}>
                    Round {round.round} · {ROUND_TITLES[round.round]}
                  </th>
                </tr>
                {round.criteria.map((criterion) => {
                  const margin = criterion.scores.A.final - criterion.scores.B.final;
                  const points = (criterion.weight * margin) / 10;
                  const width = Math.min(100, Math.abs(margin) * 10) / 2;
                  return (
                    <tr key={criterion.criterion} data-criterion={criterion.criterion}>
                      <th scope="row" className="sfc-scorecard__criterion">
                        {criterionLabel(criterion.criterion)}
                      </th>
                      <td>{criterion.weight}</td>
                      <td>{criterion.scores.A.AB.toFixed(1)}</td>
                      <td>{criterion.scores.A.BA.toFixed(1)}</td>
                      <td>
                        <b>{criterion.scores.A.final.toFixed(1)}</b>
                      </td>
                      <td>{criterion.scores.B.AB.toFixed(1)}</td>
                      <td>{criterion.scores.B.BA.toFixed(1)}</td>
                      <td>
                        <b>{criterion.scores.B.final.toFixed(1)}</b>
                      </td>
                      <td>
                        <span className="sfc-scorecard__margin">
                          <span>
                            {margin > 0 ? "+" : ""}
                            {margin.toFixed(1)}
                          </span>
                          <span className="sfc-marginbar" aria-hidden="true">
                            <span className="sfc-marginbar__mid" />
                            {margin !== 0 ? (
                              <span
                                className={classNames(
                                  "sfc-marginbar__fill",
                                  margin < 0 && "sfc-marginbar__fill--right",
                                )}
                                style={{
                                  width: `${width}%`,
                                  left: margin > 0 ? "50%" : undefined,
                                  right: margin < 0 ? "50%" : undefined,
                                }}
                              />
                            ) : null}
                          </span>
                        </span>
                      </td>
                      <td>
                        {points > 0 ? "+" : ""}
                        {points.toFixed(1)}
                      </td>
                      <td>
                        A {hpA} / B {hpB}
                      </td>
                      <td>
                        {criterion.unstable ? <span className="sfc-scorecard__flag">unstable</span> : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            );
          })}
        </table>
      </div>
    </section>
  );
}

function EvidenceChips({
  shot,
  items,
}: {
  shot: FilmShot;
  items: Map<string, EvidenceItem>;
}): ReactElement {
  const checks = factCheckFor(shot);
  const missing = new Set(shot.factCheck?.missingIds ?? []);
  if (shot.evidence.length === 0 && missing.size === 0) {
    return (
      <div className="sfc-evchips" aria-label="Evidence">
        <span className="sfc-evchip sfc-evchip--unchecked">no source cited</span>
      </div>
    );
  }
  return (
    <div className="sfc-evchips" aria-label="Evidence">
      {shot.evidence.map((id) => {
        const item = items.get(id);
        const check = checks.get(id);
        const tone = missing.has(id) ? "missing" : check ? check.verdict : "unchecked";
        return (
          <span key={id} className={`sfc-evchip sfc-evchip--${tone}`}>
            {item ? item.title : id} · {missing.has(id) ? "missing" : check ? check.verdict : "unchecked"}
          </span>
        );
      })}
      {[...missing]
        .filter((id) => !shot.evidence.includes(id))
        .map((id) => (
          <span key={`missing-${id}`} className="sfc-evchip sfc-evchip--missing">
            {id} · missing
          </span>
        ))}
    </div>
  );
}

function ShotCard({
  shot,
  view,
  items,
  cue,
}: {
  shot: FilmShot;
  view: FilmView;
  items: Map<string, EvidenceItem>;
  cue: ShotCue | undefined;
}): ReactElement {
  const corner = cornerOf(view, shot.fighter);
  return (
    <article id={`shot-${shot.id}`} className={classNames("sfc-shot", `sfc-shot--${corner}`)} data-shot={shot.id}>
      <div className="sfc-shot__head">
        <span className="sfc-shot__move">{cue ? moveLabel(cue.move) : shot.type}</span>
        <span className="sfc-shot__fighter">
          {slotName(view, shot.fighter)} · {shot.type}
        </span>
        <span className="sfc-evchip">{criterionLabel(shot.criterion)}</span>
        {shot.estimate ? <span className="sfc-evchip">estimate</span> : null}
      </div>
      <h4 className="sfc-shot__headline">{shot.headline}</h4>
      <p className="sfc-shot__claim">{shot.claim}</p>
      <EvidenceChips shot={shot} items={items} />
      {shot.verdict ? (
        <div className="sfc-shot__judge">
          <b>{shot.verdict.verdict}</b>
          <span>impact {shot.verdict.impact}</span>
          <span>{shot.verdict.note}</span>
        </div>
      ) : (
        <div className="sfc-shot__judge">
          <b>No judge call</b>
          <span>Sudden-death closing. The panel votes instead.</span>
        </div>
      )}
      <div className="sfc-shot__damage">
        <span>Damage {cue ? cue.damage : "—"}</span>
        <span>
          HP after: A {cue?.hpAfter.A ?? "—"} / B {cue?.hpAfter.B ?? "—"}
        </span>
        {shot.respondsTo ? (
          <a className="sfc-shot__answer" href={`#shot-${shot.respondsTo}`}>
            Answers {shot.respondsTo}
          </a>
        ) : null}
      </div>
    </article>
  );
}

function Timeline({ view, film }: { view: FilmView; film: FilmData }): ReactElement {
  const items = evidenceById(film);
  const cues = shotCues(view.script);
  return (
    <section className="sfc-film__section" aria-label="Timeline">
      <h2 className="sfc-film__h">Timeline</h2>
      <div className="sfc-timeline" data-timeline>
        {roundOrder(film).map((round) => {
          const shots = film.shots.filter((shot) => shot.round === round);
          if (shots.length === 0) return null;
          return (
            <section className="sfc-round" key={round} aria-label={roundHeading(round)}>
              <div className="sfc-round__head">
                <h3>{roundHeading(round)}</h3>
                <span className="sfc-kicker">{shots.length} shots</span>
              </div>
              {[1, 2, 3].map((volley) => {
                const volleyShots = shots.filter((shot) => shot.volley === volley);
                if (volleyShots.length === 0) return null;
                return (
                  <div className="sfc-volley" key={volley}>
                    <p className="sfc-volley__head">Volley {volley}</p>
                    {volleyShots.map((shot) => (
                      <ShotCard
                        key={shot.id}
                        shot={shot}
                        view={view}
                        items={items}
                        cue={cues.get(shot.id)}
                      />
                    ))}
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </section>
  );
}

function Locker({ film }: { film: FilmData }): ReactElement {
  return (
    <section className="sfc-film__section" aria-label="Evidence locker">
      <h2 className="sfc-film__h">Evidence locker</h2>
      <div className="sfc-locker">
        {film.evidence.map((item) => {
          const cited = film.shots.filter((shot) => shot.evidence.includes(item.id)).map((shot) => shot.id);
          const found =
            item.foundBy.kind === "dossier"
              ? `Dossier · ${item.foundBy.ideaId}`
              : `Scouting · ${item.foundBy.fighter}`;
          return (
            <article className="sfc-locker__item" key={item.id}>
              <div>
                <p className="sfc-locker__title">
                  <EvidenceLink url={item.url}>{item.title}</EvidenceLink>
                </p>
                <p className="sfc-locker__meta">
                  {item.id} · {found} · retrieved {item.retrievedAt.slice(0, 10)}
                </p>
              </div>
              <p className="sfc-locker__meta">{safeHref(item.url) ? "link" : "unlinked"}</p>
              <p className="sfc-locker__snippet">{item.snippet}</p>
              <div className="sfc-locker__cited">
                <span className="sfc-locker__meta">Cited by:</span>
                {cited.length > 0 ? (
                  cited.map((shotId) => (
                    <a className="sfc-evchip" key={shotId} href={`#shot-${shotId}`}>
                      {shotId}
                    </a>
                  ))
                ) : (
                  <span className="sfc-locker__meta">no shot</span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function buildMarkdown({
  view,
  film,
  resolution,
  report,
}: {
  view: FilmView;
  film: FilmData;
  resolution: MatchResolution;
  report: FightReport;
}): string {
  const lines: string[] = [];
  lines.push(`# ${view.aName ?? "A"} v ${view.bName ?? "B"}`);
  lines.push("");
  lines.push(
    `${resolution.outcome}${resolution.decisionType ? ` ${resolution.decisionType}` : ""}${resolution.perfect ? " PERFECT" : ""}: ${slotName(view, resolution.winner)} wins by ${Math.abs(resolution.delta).toFixed(1)} rubric points.`,
  );
  lines.push(`Decided by: ${decidedByLabel(resolution)}`);
  lines.push("");
  lines.push(report.headline);
  lines.push("");
  for (const line of report.whyTheyWon) lines.push(`- ${line}`);
  lines.push("");
  lines.push(`Turning point: ${report.turningPoint.text}`);
  lines.push("");
  lines.push("Loser takeaways:");
  for (const line of report.loserTakeaways) lines.push(`- ${line}`);
  lines.push("");
  lines.push("## Scorecard");
  for (const round of film.rounds) {
    lines.push(`### Round ${round.round}`);
    for (const criterion of round.criteria) {
      lines.push(
        `- ${criterionLabel(criterion.criterion)} (weight ${criterion.weight.toFixed(2)}): A ${criterion.scores.A.AB.toFixed(1)}/${criterion.scores.A.BA.toFixed(1)}/${criterion.scores.A.final.toFixed(1)}, B ${criterion.scores.B.AB.toFixed(1)}/${criterion.scores.B.BA.toFixed(1)}/${criterion.scores.B.final.toFixed(1)}${criterion.unstable ? " [unstable]" : ""}`,
      );
    }
  }
  lines.push("");
  lines.push("## Timeline");
  for (const shot of film.shots) {
    lines.push(
      `- [${shot.id}] ${slotName(view, shot.fighter)} · ${shot.type} · ${criterionLabel(shot.criterion)}: ${shot.headline} — ${shot.claim}`,
    );
    if (shot.verdict) lines.push(`  Judge: ${shot.verdict.verdict} (impact ${shot.verdict.impact}) — ${shot.verdict.note}`);
    if (shot.respondsTo) lines.push(`  Answers: ${shot.respondsTo}`);
  }
  lines.push("");
  lines.push("## Evidence");
  for (const item of film.evidence) {
    const cited = film.shots.filter((shot) => shot.evidence.includes(item.id)).map((shot) => shot.id);
    lines.push(`- [${item.id}] ${item.title} — ${item.url} (cited by ${cited.join(", ") || "no shot"})`);
  }
  return lines.join("\n");
}

export function FilmRoom({ view }: { view: FilmView }): ReactElement {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  if (view.sealed || !view.film || !view.resolution || !view.report) {
    return (
      <div className="sfc-film" data-theme="paper">
        <div className="sfc-page sfc-film__inner">
          <div className="sfc-film__back">
            <Link to={`/match/${view.matchId}`}>Back to the fight</Link>
            <Link to="/tower">Tower</Link>
          </div>
          <div className="sfc-film__sealed">
            <Stamp tone="red" size="lg">
              SEALED
            </Stamp>
            <h2>Film room</h2>
            <p>Sealed until this fight completes.</p>
            <p className="sfc-kicker">No footage, scorecard or receipts before the final bell.</p>
          </div>
        </div>
      </div>
    );
  }

  const film = view.film;
  const resolution = view.resolution;
  const report = view.report;
  const winner = slotName(view, resolution.winner);
  const gap = Math.abs(resolution.delta).toFixed(1);

  const copy = (): void => {
    const markdown = buildMarkdown({ view, film, resolution, report });
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      setCopyState("failed");
      return;
    }
    void navigator.clipboard
      .writeText(markdown)
      .then(() => setCopyState("copied"))
      .catch(() => setCopyState("failed"));
  };

  return (
    <div className="sfc-film" data-theme="paper">
      <div className="sfc-page sfc-film__inner">
        <div className="sfc-film__back">
          <Link to={`/match/${view.matchId}`}>Back to the fight</Link>
          <Link to="/tower">Tower</Link>
        </div>

        <header>
          <p className="sfc-kicker">Film room · report card</p>
          <h1 className="sfc-film__title">
            {view.aName ?? "A"} v {view.bName ?? "B"}
          </h1>
        </header>

        <section className="sfc-verdict" aria-label="Verdict">
          <div className="sfc-verdict__main">
            <div className="sfc-verdict__stamps">
              <Stamp tone={resolution.outcome === "KO" ? "red" : resolution.outcome === "DECISION" ? "blue" : "sun"} size="lg">
                {resolution.outcome === "KO"
                  ? "K.O."
                  : resolution.outcome === "DECISION"
                    ? `DECISION · ${(resolution.decisionType ?? "unanimous").toUpperCase()}`
                    : resolution.outcome === "SUDDEN_DEATH"
                      ? "SUDDEN DEATH"
                      : resolution.outcome}
              </Stamp>
              {resolution.perfect ? (
                <Stamp tone="good" size="lg">
                  PERFECT
                </Stamp>
              ) : null}
            </div>
            <p className="sfc-verdict__win">{winner} wins</p>
            <p className="sfc-verdict__gap">
              won by <b>{gap}</b> rubric points
            </p>
            <p className="sfc-verdict__decided">Decided by: {decidedByLabel(resolution)}</p>
            <p className="sfc-verdict__decided">
              {report.headline}
            </p>
            <ul className="sfc-verdict__report">
              {report.whyTheyWon.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <div className="sfc-verdict__side">
            <h3>Turning point</h3>
            <p>{report.turningPoint.text}</p>
            <h3>Loser&apos;s takeaways</h3>
            <ul>
              {report.loserTakeaways.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        </section>

        <Scorecard view={view} film={film} resolution={resolution} />
        <Timeline view={view} film={film} />
        <Locker film={film} />

        <div className="sfc-film__copy">
          <button type="button" className="sfc-btn" onClick={copy}>
            Copy as Markdown
          </button>
          <p aria-live="polite">
            {copyState === "copied"
              ? "Report copied to the clipboard."
              : copyState === "failed"
                ? "Clipboard unavailable. Select the report text instead."
                : "A readable report card, ready to paste."}
          </p>
        </div>
      </div>
    </div>
  );
}
