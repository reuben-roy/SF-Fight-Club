import { useMemo, useState, type ReactElement } from "react";
import { useSearchParams } from "react-router-dom";

import { Button } from "../styles/components.js";
import { TowerScreen } from "./TowerScreen.js";
import { DEMO_FIXTURE } from "./fixtures/index.js";
import {
  buildSyntheticTournament,
  stepOf,
  syntheticOpeningStep,
  totalSteps,
  tournamentFromFixture,
  type TournamentData,
} from "./fixtures/tournament.js";

const DEMO = tournamentFromFixture(DEMO_FIXTURE);
const SIZES: readonly number[] = [8, 2, 4, 16, 32, 64];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function readNumber(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function TowerDevScreen(): ReactElement {
  const [params, setParams] = useSearchParams();
  const [opened, setOpened] = useState<string | null>(null);
  const requested = readNumber(params.get("size"));
  const size = requested !== null && SIZES.includes(requested) ? requested : 8;

  const data = useMemo<TournamentData>(
    () => (size === 8 ? DEMO : buildSyntheticTournament({ size })),
    [size],
  );
  const steps = totalSteps(data);
  const requestedStep = readNumber(params.get("step"));
  const defaultStep = size === 8 ? 0 : syntheticOpeningStep(data);
  const step = clamp(requestedStep ?? defaultStep, 0, steps);
  const view = stepOf(data, step);

  const go = (next: { size: number; step: number | null }): void => {
    const nextParams = new URLSearchParams();
    nextParams.set("size", String(next.size));
    if (next.step !== null) nextParams.set("step", String(next.step));
    setParams(nextParams);
  };

  return (
    <div className="tower-dev" data-testid="tower-dev">
      <div className="tower-dev__bar">
        <span className="tower-dev__label">Field</span>
        <div className="tower-dev__group" role="group" aria-label="Field size">
          {SIZES.map((option) => (
            <Button
              key={option}
              size="sm"
              aria-pressed={size === option}
              onClick={() => go({ size: option, step: null })}
              data-testid={`size-${option}`}
            >
              {option === 8 ? "Demo 8" : option}
            </Button>
          ))}
        </div>
        <div className="tower-dev__group" role="group" aria-label="Tournament stepper">
          <Button
            size="sm"
            variant="hot"
            disabled={step >= steps}
            onClick={() => go({ size, step: step + 1 })}
            data-testid="play-next"
          >
            Play next result
          </Button>
          <Button
            size="sm"
            disabled={step === 0}
            onClick={() => go({ size, step: step - 1 })}
            data-testid="play-back"
          >
            Step back
          </Button>
          <Button size="sm" onClick={() => go({ size, step: 0 })} data-testid="reset">
            Reset
          </Button>
        </div>
        <span className="tower-dev__step" data-testid="step-label">
          STEP {step} / {steps}
          {view.applied ? ` / ${view.applied.winnerId} beats ${view.applied.winnerId === view.applied.entrantA ? view.applied.entrantB : view.applied.entrantA}` : ""}
        </span>
        <span className="tower-dev__opened">{opened ?? "Pick a tile or a VS link"}</span>
      </div>

      <TowerScreen
        chart={view.chart}
        {...(view.previousChart ? { previousChart: view.previousChart } : {})}
        entrants={data.entrants}
        matches={view.matches}
        onOpenMatch={(matchId) => setOpened(`Open match ${matchId}`)}
        onOpenCard={(entrantId) => setOpened(`Open card ${entrantId}`)}
      />

      <p className="tower-dev__note">
        Demo data is the canned eight-entrant tournament. Larger fields are synthetic, with random winners, so the
        chart, the floors rail and the scrollbar can be checked at every size.
      </p>
    </div>
  );
}
