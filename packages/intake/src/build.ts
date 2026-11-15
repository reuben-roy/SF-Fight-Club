import { entrantProfileSchema, type EntrantProfile, type IdeaSubmission } from "@sf-fight-club/schemas";

import { scoreClout } from "./clout.js";
import type { HnResult, HnValue } from "./hn.js";
import type { WebResult } from "./web.js";
import type { XResult } from "./x.js";

export interface FounderSeed {
  name: string;
  role?: string;
  xHandle?: string;
  hnUser?: string;
}

export interface CompanySeed {
  name: string;
  url?: string;
  tagline?: string;
  logoUrl?: string;
  location?: string;
}

export interface BuildInput {
  entrantId: string;
  company: CompanySeed;
  founders: FounderSeed[];
  hn: HnResult | null;
  x: XResult | null;
  web: WebResult | null;
}

export interface BuildOutput {
  profile: EntrantProfile;
  warnings: string[];
}

function hnPosts(hn: HnResult | null): HnValue["posts"] {
  if (hn !== null && hn.kind === "ok") return hn.value.posts;
  return [];
}

function xPosts(x: XResult | null): { text: string; metrics: { likes?: number; reposts?: number; replies?: number } }[] {
  if (x !== null && x.kind === "ok") return x.value.posts;
  return [];
}

/**
 * Merges adapter results into a validated EntrantProfile. A failed source
 * becomes a warning, never a crash; the profile is built from what succeeded.
 */
export function buildProfile(input: BuildInput): BuildOutput {
  const warnings: string[] = [];

  for (const [label, result] of [
    ["hn", input.hn],
    ["x", input.x],
    ["web", input.web],
  ] as const) {
    if (result === null) continue;
    if (result.kind === "skipped") warnings.push(`${label}: ${result.reason}`);
    else if (result.kind === "failed") warnings.push(`${label}: ${result.error}`);
    else warnings.push(...result.warnings.map((w) => `${w.adapter}: ${w.message}`));
  }

  const hn = input.hn !== null && input.hn.kind === "ok" ? input.hn.value : null;
  const x = input.x !== null && input.x.kind === "ok" ? input.x.value : null;
  const web = input.web !== null && input.web.kind === "ok" ? input.web.value : null;

  const founders = input.founders.map((founder) => {
    const handle = founder.xHandle?.replace(/^@/, "").toLowerCase();
    const followers =
      handle !== undefined && handle !== "" && x !== null && x.handle.toLowerCase() === handle
        ? x.followers
        : undefined;
    const hnKarma = founder.hnUser !== undefined && hn !== null ? hn.karmaByUser[founder.hnUser] : undefined;
    return {
      name: founder.name,
      role: founder.role,
      xHandle: founder.xHandle,
      hnUser: founder.hnUser,
      followers,
      hnKarma,
    };
  });

  const posts: EntrantProfile["posts"] = [
    ...hnPosts(input.hn).map((post) => ({
      source: post.source,
      url: post.url,
      title: post.title,
      text: post.text.slice(0, 1000),
      postedAt: post.postedAt,
      metrics: post.metrics,
    })),
    ...(x !== null
      ? x.posts.map((post) => ({
          source: post.source,
          url: post.url,
          title: post.title,
          text: post.text.slice(0, 1000),
          postedAt: post.postedAt,
          metrics: post.metrics,
        }))
      : []),
  ];

  const tagline = input.company.tagline ?? web?.description;
  const company: EntrantProfile["company"] = {
    name: input.company.name,
    url: input.company.url,
    tagline,
    logoUrl: input.company.logoUrl ?? web?.logoUrl,
    location: input.company.location,
  };
  if (company.url === undefined && web !== null) company.url = undefined;

  const followers = founders.reduce((sum, founder) => sum + (founder.followers ?? 0), 0);
  const hnKarma = founders.reduce((sum, founder) => sum + (founder.hnKarma ?? 0), 0);
  const engagement = xPosts(input.x).reduce(
    (sum, post) => sum + (post.metrics.likes ?? 0) + (post.metrics.reposts ?? 0) + (post.metrics.replies ?? 0),
    0,
  );
  const hnPoints = hnPosts(input.hn).reduce((sum, post) => sum + (post.metrics.points ?? 0), 0);
  const clout = scoreClout({ followers, hnKarma, engagement, hnPoints });

  const sources: EntrantProfile["sources"] = [];
  if (input.hn !== null && input.hn.kind === "ok") sources.push(...input.hn.sources);
  if (input.x !== null && input.x.kind === "ok") sources.push(...input.x.sources);
  if (input.web !== null && input.web.kind === "ok") sources.push(...input.web.sources);

  const profile = entrantProfileSchema.parse({
    entrantId: input.entrantId,
    company,
    founders,
    posts,
    clout: { score: clout.score, tier: clout.tier, x: clout.x, hn: clout.hn },
    sources,
  });
  return { profile, warnings };
}

export interface SubmissionDraft {
  submission: IdeaSubmission;
  /** Founder names and handles removed from the draft. */
  stripped: string[];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collectTokens(profile: EntrantProfile): string[] {
  const tokens = new Set<string>();
  for (const founder of profile.founders) {
    tokens.add(founder.name);
    for (const part of founder.name.split(/\s+/)) {
      if (part.length >= 3) tokens.add(part);
    }
    if (founder.xHandle !== undefined && founder.xHandle !== "") {
      const bare = founder.xHandle.replace(/^@/, "");
      tokens.add(`@${bare}`);
      tokens.add(bare);
    }
    if (founder.hnUser !== undefined && founder.hnUser !== "") {
      tokens.add(founder.hnUser);
    }
  }
  return [...tokens].sort((a, b) => b.length - a.length);
}

/**
 * Builds the only thing that enters the brief pipeline. Founder names and
 * handles are stripped and reported. Post text passes through as data and is
 * never interpreted here.
 */
export function toSubmission(profile: EntrantProfile): SubmissionDraft {
  const tokens = collectTokens(profile);
  const stripped: string[] = [];
  const scrub = (text: string): string => {
    let out = text;
    for (const token of tokens) {
      const pattern = new RegExp(escapeRegExp(token), "gi");
      if (pattern.test(out)) {
        if (!stripped.includes(token)) stripped.push(token);
        out = out.replace(pattern, "");
      }
    }
    return out.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  };

  const title = scrub(profile.company.name).slice(0, 60) || "Untitled entrant";
  const firstPost = profile.posts[0];
  const oneLinerSource =
    profile.company.tagline ?? firstPost?.title ?? firstPost?.text ?? "An early-stage startup idea.";
  const oneLiner = scrub(oneLinerSource).slice(0, 140) || "An early-stage startup idea.";
  const descriptionSource = profile.posts.map((post) => post.text).join("\n\n");
  const description = scrub(descriptionSource).slice(0, 1500) || oneLiner;

  const submission: IdeaSubmission = { title, oneLiner, description };
  const url = profile.company.url;
  if (url !== undefined) {
    const scrubbed = scrub(url);
    if (scrubbed === url) submission.links = [url];
    else stripped.push(url);
  }
  return { submission, stripped };
}
