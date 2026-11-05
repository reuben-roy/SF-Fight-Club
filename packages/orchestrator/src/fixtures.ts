import * as z from "zod";

import { OrchestratorError } from "./errors.js";

export const fixtureAttemptSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("output"),
    output: z.unknown(),
    /** Volleys only. A flag regenerates once, then the volley is emptied. */
    moderation: z.enum(["pass", "flag"]).optional(),
  }),
  z.strictObject({
    kind: z.literal("refusal"),
  }),
  z.strictObject({
    kind: z.literal("transport"),
    error: z.string().min(1),
  }),
]);

export const fixtureStepSchema = z.strictObject({
  attempts: z.array(fixtureAttemptSchema).min(1),
});

export const fixtureTapeSchema = z.strictObject({
  steps: z.record(z.string(), fixtureStepSchema),
});

export type FixtureAttempt = z.infer<typeof fixtureAttemptSchema>;
export type FixtureStep = z.infer<typeof fixtureStepSchema>;
export type FixtureTape = z.infer<typeof fixtureTapeSchema>;

export function parseFixtureTape(data: unknown): FixtureTape {
  const parsed = fixtureTapeSchema.safeParse(data);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ");
    throw new OrchestratorError("bad_fixture", message);
  }
  return parsed.data;
}

export interface FixturePlayer {
  /** Step keys read during this invocation, in order. Reused steps are absent. */
  readonly reads: readonly string[];
  next(stepKey: string): FixtureAttempt;
}

export function createFixturePlayer(tape: FixtureTape): FixturePlayer {
  const cursor = new Map<string, number>();
  const reads: string[] = [];
  return {
    reads,
    next(stepKey: string): FixtureAttempt {
      const step = tape.steps[stepKey];
      if (!step) {
        throw new OrchestratorError("missing_fixture", `no fixture for ${stepKey}`);
      }
      const index = cursor.get(stepKey) ?? 0;
      const attempt = step.attempts[index];
      if (!attempt) {
        throw new OrchestratorError("fixture_exhausted", `fixture for ${stepKey} ran out of attempts`);
      }
      cursor.set(stepKey, index + 1);
      reads.push(stepKey);
      return attempt;
    },
  };
}
