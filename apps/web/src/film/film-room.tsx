/**
 * Film room: full fight record for a complete match. Sealed until complete:
 * nothing about the script, resolution, or report renders before the bell.
 */

import type { ReactElement } from "react";

import type { FilmView } from "../data/store.js";

export function FilmRoom({ view }: { view: FilmView }): ReactElement {
  if (view.sealed) {
    return (
      <section aria-label="Film room">
        <h2>Film room</h2>
        <p>Sealed until this fight completes. No footage before the final bell.</p>
      </section>
    );
  }
  return (
    <section aria-label="Film room">
      <h2>
        Film room: {view.aName ?? "?"} v {view.bName ?? "?"}
      </h2>
      {view.report ? (
        <>
          <h3>{view.report.headline}</h3>
          <ul>
            {view.report.whyTheyWon.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p>Turning point: {view.report.turningPoint.text}</p>
        </>
      ) : null}
      {view.resolution ? (
        <dl>
          <dt>Outcome</dt>
          <dd>
            {view.resolution.outcome}
            {view.resolution.decisionType ? ` ${view.resolution.decisionType}` : ""}
            {view.resolution.perfect ? " PERFECT" : ""}
          </dd>
          <dt>Delta</dt>
          <dd>{view.resolution.delta}</dd>
          <dt>Lambda</dt>
          <dd>{view.resolution.lambda}</dd>
          <dt>Decided by</dt>
          <dd>{view.resolution.decidedBy}</dd>
        </dl>
      ) : null}
      <h3>Full script</h3>
      <ol>
        {view.script?.cues.map((cue) => (
          <li key={cue.id}>
            [{cue.kind}]{" "}
            {cue.kind === "shot"
              ? `T${cue.turn}V${cue.volley} ${cue.shooter} ${cue.move} ${cue.outcome}: ${cue.headline}`
              : cue.id}
          </li>
        ))}
      </ol>
    </section>
  );
}
