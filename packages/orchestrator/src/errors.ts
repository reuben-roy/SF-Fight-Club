/** Failure before any compute step runs (bets still open, budget, bad input). */
export class OrchestratorError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "OrchestratorError";
    this.code = code;
  }
}

/** A pipeline step failed. The runner turns this into `match.failed` and stops. */
export class StepFailed extends Error {
  readonly stepKey: string;
  readonly attempts: number;

  constructor(stepKey: string, message: string, attempts: number) {
    super(message);
    this.name = "StepFailed";
    this.stepKey = stepKey;
    this.attempts = attempts;
  }
}
