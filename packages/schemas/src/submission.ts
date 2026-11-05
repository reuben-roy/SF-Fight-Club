import * as z from "zod";

import { isoDateTimeSchema, slotSchema } from "./common.js";

export const ideaSubmissionSchema = z
  .strictObject({
    title: z.string().min(1).max(60),
    oneLiner: z.string().min(1).max(140),
    description: z.string().min(1).max(1500),
    customer: z.string().optional(),
    businessModel: z.string().optional(),
    links: z.array(z.string().min(1)).optional(),
  })
  .describe("Idea intake. Title <= 60 chars, one-liner <= 140, description <= 1500.");

export const standardBriefSchema = z
  .strictObject({
    title: z.string(),
    oneLiner: z.string(),
    problem: z.string().describe("At most 60 words."),
    customer: z.string().describe("At most 40 words."),
    solution: z.string().describe("At most 60 words."),
    businessModel: z.string().describe("At most 40 words."),
    whyNow: z.string().describe("At most 40 words."),
    category: z.string().describe("A short category label such as proptech or devtools."),
    strippedContent: z.array(z.string()).describe("Instructions or private names removed from the submission."),
  })
  .meta({
    title: "StandardBrief",
    description: "Fixed-template rewrite of one startup idea. Use only what the submission says.",
  });

export const claimSchema = z.strictObject({
  text: z.string(),
  evidence: z.array(z.string().min(1)).describe("Evidence ids supporting this claim."),
  estimate: z.boolean().describe("True when no source backs the claim."),
});

export const foundBySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("dossier"),
    ideaId: z.string().min(1),
  }),
  z.strictObject({
    kind: z.literal("scouting"),
    fighter: slotSchema,
  }),
]);

export const evidenceItemSchema = z.strictObject({
  id: z.string().min(1),
  url: z.string().min(1),
  title: z.string(),
  snippet: z.string().max(500).describe("At most 500 characters. Never the full page."),
  retrievedAt: isoDateTimeSchema,
  foundBy: foundBySchema,
});

const competitorSchema = z.strictObject({
  name: z.string(),
  kind: z.enum(["direct", "indirect", "status_quo"]),
  note: z.string(),
  evidence: z.array(z.string().min(1)),
});

export const dossierSchema = z
  .strictObject({
    ideaId: z.string().min(1),
    sections: z.strictObject({
      problemEvidence: z.array(claimSchema),
      marketSizing: z.array(claimSchema).describe("Bottom-up sizing preferred."),
      competitors: z.array(competitorSchema),
      pricingAnalogs: z.array(claimSchema),
      whyNowSignals: z.array(claimSchema),
      risks: z.array(claimSchema),
    }),
    summary: z.string().describe("At most 150 words. Shown to both fighters and the judges."),
    gaps: z.array(z.string()).describe("Sections where nothing useful was found."),
  })
  .meta({
    title: "Dossier",
    description: "Neutral research dossier for one idea. Every claim cites evidence ids or is an estimate.",
  });

export type IdeaSubmission = z.infer<typeof ideaSubmissionSchema>;
export type StandardBrief = z.infer<typeof standardBriefSchema>;
export type Claim = z.infer<typeof claimSchema>;
export type EvidenceItem = z.infer<typeof evidenceItemSchema>;
export type Dossier = z.infer<typeof dossierSchema>;
