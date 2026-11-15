import * as z from "zod";

import { isoDateTimeSchema } from "./common.js";
import { hexColorSchema, pixelPortraitSchema } from "./portrait.js";

const companySchema = z.strictObject({
  name: z.string().min(1),
  url: z.string().min(1).optional(),
  tagline: z.string().optional(),
  logoUrl: z.string().min(1).optional(),
  location: z.string().optional(),
});

const portraitTraitsSchema = z
  .strictObject({
    skin: hexColorSchema,
    skinShadow: hexColorSchema,
    hair: hexColorSchema,
    accent: hexColorSchema,
  })
  .meta({ title: "PortraitTraits", description: "Hex colors measured from the profile photo. The photo itself is never rendered." });

const founderSchema = z.strictObject({
  name: z.string().min(1),
  role: z.string().optional(),
  xHandle: z.string().min(1).optional(),
  hnUser: z.string().min(1).optional(),
  followers: z.number().int().min(0).optional(),
  hnKarma: z.number().int().min(0).optional(),
  avatarUrl: z.string().min(1).optional(),
  portrait: pixelPortraitSchema.optional(),
  portraitTraits: portraitTraitsSchema.optional(),
});

const postSourceSchema = z.enum(["x", "hn", "web"]);

const postMetricsSchema = z.strictObject({
  likes: z.number().int().min(0).optional(),
  reposts: z.number().int().min(0).optional(),
  replies: z.number().int().min(0).optional(),
  views: z.number().int().min(0).optional(),
  points: z.number().int().optional(),
  comments: z.number().int().min(0).optional(),
});

const postSchema = z.strictObject({
  source: postSourceSchema,
  url: z.string().min(1),
  title: z.string().optional(),
  text: z.string().max(1000).describe("Untrusted input. Stored as data, never interpreted."),
  postedAt: isoDateTimeSchema.optional(),
  metrics: postMetricsSchema,
});

const cloutTierSchema = z.enum(["S", "A", "B", "C"]);

const cloutSchema = z
  .strictObject({
    score: z.number().min(0).max(100),
    tier: cloutTierSchema,
    x: z.number().min(0).max(100),
    hn: z.number().min(0).max(100),
  })
  .describe("Clout 0 to 100. Presentation only, never seeds or scores.");

const profileSourceSchema = z.strictObject({
  source: postSourceSchema,
  url: z.string().min(1),
  retrievedAt: isoDateTimeSchema,
});

export const entrantProfileSchema = z
  .strictObject({
    entrantId: z.string().min(1),
    company: companySchema,
    founders: z.array(founderSchema),
    posts: z.array(postSchema),
    clout: cloutSchema,
    sources: z.array(profileSourceSchema),
  })
  .meta({
    title: "EntrantProfile",
    description: "Public entrant card data. Never enters a fighter or judge prompt.",
  });

export type EntrantProfile = z.infer<typeof entrantProfileSchema>;
