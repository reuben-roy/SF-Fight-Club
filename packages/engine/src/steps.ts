import type { MatchStatus } from "@sf-fight-club/schemas";

/** Step keys already in the compute log. Completed steps never re-run. */
export function completedStepKeys(events: readonly { stepKey: string }[]): Set<string> {
  return new Set(events.map((event) => event.stepKey));
}

/** Resume rule: a step key that is already in the log is reused as-is. */
export function stepDisposition(
  events: readonly { stepKey: string }[],
  stepKey: string,
): "reuse" | "run" {
  return completedStepKeys(events).has(stepKey) ? "reuse" : "run";
}

/**
 * Bets lock before compute. A match may start or resume only once betting
 * is closed. `failed` is the host retry path, which continues from the log.
 */
export function computeAllowed(status: MatchStatus): boolean {
  return status === "locked" || status === "computing" || status === "failed";
}

/** Results stay sealed on every public surface until the match is complete. */
export function resultsPublic(status: MatchStatus): boolean {
  return status === "complete";
}
