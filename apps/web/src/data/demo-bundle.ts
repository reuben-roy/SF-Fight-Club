import * as z from "zod";

import {
  broadcastScriptSchema,
  criterionIdSchema,
  criterionResultSchema,
  entrantProfileSchema,
  evidenceItemSchema,
  fightReportSchema,
  isoDateTimeSchema,
  matchResolutionSchema,
  roundNumberSchema,
  shotFactCheckSchema,
  shotTypeSchema,
  shotVerdictSchema,
  tiebreakRecordSchema,
} from "@sf-fight-club/schemas";

/**
 * Committed demo bundle. scripts/build-demo-data.ts assembles this from
 * runDemoTournament plus the eight intake profiles, parses it once through
 * demoBundleSchema, and writes it to src/data/generated/demo.ts.
 */

const slotSchema = z.enum(["A", "B"]);

const bracketSideSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("fighter"), id: z.string().min(1), seed: z.number().int().positive() }),
  z.strictObject({ kind: z.literal("bye") }),
  z.strictObject({
    kind: z.literal("winner_of"),
    roundIndex: z.number().int().nonnegative(),
    slotIndex: z.number().int().nonnegative(),
  }),
]);

const bracketMatchSchema = z.strictObject({
  roundIndex: z.number().int().nonnegative(),
  slotIndex: z.number().int().nonnegative(),
  a: bracketSideSchema,
  b: bracketSideSchema,
  bye: z.boolean(),
  winnerId: z.string().min(1).optional(),
  winnerSeed: z.number().int().positive().optional(),
});

const bracketSchema = z.strictObject({
  fieldSize: z.number().int().min(2).max(64),
  bracketSize: z.number().int().min(2),
  seedingMode: z.enum(["weighin", "random"]),
  seedingFallback: z.enum(["random"]).nullable(),
  seed: z.string().min(1),
  entrants: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        weighinTotal: z.number().finite(),
        seed: z.number().int().positive(),
      }),
    )
    .min(2)
    .max(64),
  matches: z.array(bracketMatchSchema).min(1),
});

const bundleEntrantSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  oneLiner: z.string().min(1),
  weighinTotal: z.number().finite(),
  tier: z.string().min(1),
  spriteSeed: z.string().min(1),
  cloutScore: z.number().int().min(0).max(100),
  cloutTier: z.enum(["S", "A", "B", "C"]),
});

const publicFighterSchema = z.strictObject({
  name: z.string().min(1),
  seed: z.number().int().positive(),
  tier: z.string().min(1),
  spriteSeed: z.string().min(1),
  category: z.string().min(1),
});

/**
 * Film-room data, projected from the match compute log. Rounds carry the
 * judge's criterion results; shots carry the argument, its evidence, the
 * fact-check and the judge's verdict; the locker lists every source both
 * fighters could cite. Nothing here is authored for the web app.
 */
export const filmRoundSchema = z.strictObject({
  round: roundNumberSchema,
  criteria: z.array(criterionResultSchema).length(3),
});

export const filmShotSchema = z.strictObject({
  id: z.string().min(1),
  round: z.union([roundNumberSchema, z.literal("sudden_death")]),
  /** 1 pitch strike, 2 counter, 3 sudden-death closing. */
  volley: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  fighter: slotSchema,
  type: shotTypeSchema,
  criterion: criterionIdSchema,
  headline: z.string(),
  claim: z.string(),
  evidence: z.array(z.string()),
  estimate: z.boolean(),
  respondsTo: z.string().min(1).optional(),
  factCheck: shotFactCheckSchema.nullable(),
  verdict: shotVerdictSchema.nullable(),
});

export const filmDataSchema = z.strictObject({
  rounds: z.array(filmRoundSchema).length(3),
  shots: z.array(filmShotSchema),
  evidence: z.array(evidenceItemSchema),
  tiebreak: z.array(tiebreakRecordSchema),
});

const bundleMatchSchema = z.strictObject({
  roundIndex: z.number().int().nonnegative(),
  slotIndex: z.number().int().nonnegative(),
  matchId: z.string().min(1),
  entrantA: z.string().min(1),
  entrantB: z.string().min(1),
  winnerId: z.string().min(1),
  fighters: z.strictObject({ A: publicFighterSchema, B: publicFighterSchema }),
  corners: z.strictObject({ left: slotSchema, right: slotSchema }).nullable(),
  script: broadcastScriptSchema,
  resolution: matchResolutionSchema,
  report: fightReportSchema,
  film: filmDataSchema,
});

export const demoBundleSchema = z.strictObject({
  version: z.literal(1),
  generatedAt: isoDateTimeSchema,
  demoSeed: z.string().min(1),
  buildHash: z.string().min(1),
  bracket: bracketSchema,
  entrants: z.array(bundleEntrantSchema).length(8),
  profiles: z.record(z.string().min(1), entrantProfileSchema),
  matches: z.array(bundleMatchSchema).length(7),
});

export type DemoBundle = z.infer<typeof demoBundleSchema>;
export type BundleMatch = DemoBundle["matches"][number];
export type BundleEntrant = DemoBundle["entrants"][number];
export type FilmData = z.infer<typeof filmDataSchema>;
export type FilmRound = z.infer<typeof filmRoundSchema>;
export type FilmShot = z.infer<typeof filmShotSchema>;
