import { DIRECTOR_VERSION, direct, resultsPublic } from "@sf-fight-club/engine";
import type { BroadcastScript } from "@sf-fight-club/schemas";

import { OrchestratorError } from "./errors.js";
import type { MatchRun, PublicMatch } from "./types.js";

/**
 * Public surface. Winner, outcome, script, events, and calls stay hidden
 * until the match status is `complete`. A sealed worker record still holds them.
 */
export function toPublicMatch(run: MatchRun): PublicMatch {
  const open = resultsPublic(run.status);
  return {
    matchId: run.matchId,
    status: run.status,
    fighters: run.fighters,
    corners: run.corners,
    winner: open ? (run.resolution?.winner ?? null) : null,
    outcome: open ? (run.resolution?.outcome ?? null) : null,
    decidedBy: open ? (run.resolution?.decidedBy ?? null) : null,
    script: open ? run.script : null,
    events: open ? run.events : null,
    calls: open ? run.calls : null,
  };
}

/** Host reveal after the broadcast. Sealed results become public. */
export function markComplete(run: MatchRun): MatchRun {
  if (run.status === "complete") return run;
  if (run.status !== "sealed") {
    throw new OrchestratorError("not_sealed", "only a sealed match can be completed");
  }
  return { ...run, status: "complete" };
}

/** BC-9. Re-direct from the compute log. Does not re-run any model step. */
export function redirect(run: MatchRun, presentationSeed: string, directorVersion = DIRECTOR_VERSION): BroadcastScript {
  return direct(
    {
      matchId: run.matchId,
      events: run.events,
      fighters: run.fighters,
      rubric: run.rubric,
    },
    directorVersion,
    presentationSeed,
  );
}
