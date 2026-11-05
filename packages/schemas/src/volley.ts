import * as z from "zod";

import { criterionIdSchema, roundOrSuddenDeathSchema, slotSchema } from "./common.js";

export const shotTypeSchema = z.enum(["pitch", "attack", "defense"]);
export const volleyKindSchema = z.enum(["pitch_strike", "counter", "closing"]);

const shotFields = {
  type: shotTypeSchema,
  criterion: criterionIdSchema.describe("A criterion id. The orchestrator drops shots from other rounds."),
  headline: z.string().describe("At most 12 words. Shown as the caption."),
  claim: z.string().describe("At most 60 words. Shown in the receipt."),
  evidence: z.array(z.string().min(1)).describe("Evidence locker ids. Empty when the claim is an estimate."),
  estimate: z.boolean().describe("True when the claim has no source."),
};

/**
 * Stored shot. `id` is assigned by the orchestrator (`r1.v1.A.s2`).
 * `respondsTo` is required when `type` is `defense`.
 */
export const shotSchema = z
  .strictObject({
    id: z.string().min(1),
    ...shotFields,
    respondsTo: z.string().min(1).optional(),
  })
  .superRefine((shot, ctx) => {
    if (shot.type === "defense" && shot.respondsTo === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "defense shots require respondsTo",
        path: ["respondsTo"],
      });
    }
  });

/**
 * What the fighter model returns. Shot ids are not in this schema.
 * Pitch and attack omit `respondsTo`; defense requires it.
 * Shot count is not fixed here: a closing is one shot and a refusal is zero.
 */
export const shotModelOutputSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("pitch"),
    criterion: shotFields.criterion,
    headline: shotFields.headline,
    claim: shotFields.claim,
    evidence: shotFields.evidence,
    estimate: shotFields.estimate,
  }),
  z.strictObject({
    type: z.literal("attack"),
    criterion: shotFields.criterion,
    headline: shotFields.headline,
    claim: shotFields.claim,
    evidence: shotFields.evidence,
    estimate: shotFields.estimate,
  }),
  z.strictObject({
    type: z.literal("defense"),
    criterion: shotFields.criterion,
    headline: shotFields.headline,
    claim: shotFields.claim,
    evidence: shotFields.evidence,
    estimate: shotFields.estimate,
    respondsTo: z.string().min(1).describe("Id of the opponent shot this defense answers."),
  }),
]);

/** Compute-log volley, including orchestrator-assigned fields. */
export const volleySchema = z.strictObject({
  matchId: z.string().min(1),
  round: roundOrSuddenDeathSchema,
  kind: volleyKindSchema,
  fighter: slotSchema,
  shots: z.array(shotSchema),
  wordCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
  refused: z.boolean(),
});

/** Mistral structured output for a volley or a sudden-death closing. */
export const volleyModelOutputSchema = z
  .strictObject({
    shots: z.array(shotModelOutputSchema),
  })
  .meta({
    title: "Volley",
    description:
      "One fighter volley. Do not include shot ids, match id, or word counts. The orchestrator assigns those.",
  });

export type ShotType = z.infer<typeof shotTypeSchema>;
export type VolleyKind = z.infer<typeof volleyKindSchema>;
export type Shot = z.infer<typeof shotSchema>;
export type ShotModelOutput = z.infer<typeof shotModelOutputSchema>;
export type Volley = z.infer<typeof volleySchema>;
export type VolleyModelOutput = z.infer<typeof volleyModelOutputSchema>;
