import * as z from "zod";

import { getJsonWithRetry, type GetJsonResult } from "./http.js";
import type { AdapterResult, AdapterWarning, NetworkDeps, SourceEntry } from "./types.js";

const X_API = "https://api.x.com/2";

const xUserSchema = z.object({
  data: z.object({
    id: z.string(),
    name: z.string(),
    username: z.string(),
    description: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    verified: z.boolean().optional(),
    created_at: z.string().optional(),
    public_metrics: z
      .object({
        followers_count: z.number(),
        following_count: z.number().optional(),
        tweet_count: z.number().optional(),
        listed_count: z.number().optional(),
      })
      .optional(),
  }),
});

const xAvatarSchema = z.object({
  data: z.object({
    profile_image_url: z.string().nullable().optional(),
  }),
});

const xTweetSchema = z.object({
  id: z.string(),
  text: z.string(),
  author_id: z.string().optional(),
  created_at: z.string().optional(),
  public_metrics: z
    .object({
      like_count: z.number().optional(),
      retweet_count: z.number().optional(),
      repost_count: z.number().optional(),
      reply_count: z.number().optional(),
      quote_count: z.number().optional(),
      bookmark_count: z.number().optional(),
      impression_count: z.number().optional(),
      view_count: z.number().optional(),
    })
    .optional(),
});

const xTimelineSchema = z.object({
  data: z.array(xTweetSchema).optional(),
});

const xSingleTweetSchema = z.object({
  data: xTweetSchema,
});

export interface XPostDraft {
  source: "x";
  url: string;
  title?: string;
  text: string;
  postedAt?: string;
  metrics: { likes?: number; reposts?: number; replies?: number; views?: number };
}

export interface XValue {
  userId: string;
  name: string;
  handle: string;
  followers: number;
  /** Profile photo in the larger variant, when the user object carries one. */
  avatarUrl?: string;
  posts: XPostDraft[];
}

export type XResult = AdapterResult<XValue>;

export interface XInput {
  handle?: string;
  userId?: string;
  /** A single post id or x.com post URL to include. */
  post?: string;
  /** How many recent posts to keep. Defaults to 5. */
  maxPosts?: number;
}

function describeFailure(result: GetJsonResult): string {
  if (result.kind === "http-error") return `X request returned HTTP ${result.status}`;
  if (result.kind === "malformed") return result.detail;
  if (result.kind === "failed") return result.error;
  return "unexpected X response";
}

function parsePostId(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/\/status\/(\d+)/);
  if (match?.[1] !== undefined) return match[1];
  return null;
}

/**
 * The user lookup returns the small `_normal` thumbnail. The same file exists
 * at `_400x400`, which is what the portrait pipeline wants. URLs without the
 * documented suffix pass through unchanged.
 */
export function largerAvatarUrl(raw: string): string {
  const hashIndex = raw.indexOf("#");
  const queryIndex = raw.indexOf("?");
  const end = [hashIndex, queryIndex].filter((index) => index !== -1).sort((a, b) => a - b)[0] ?? raw.length;
  const stem = raw.slice(0, end);
  const suffix = raw.slice(end);
  const match = stem.match(/^(.*)_normal(\.[A-Za-z0-9]+)$/);
  if (match?.[1] === undefined || match?.[2] === undefined) return raw;
  return `${match[1]}_400x400${match[2]}${suffix}`;
}

function toAvatarUrl(raw: string | null | undefined): string | undefined {
  if (raw === null || raw === undefined || raw.trim() === "") return undefined;
  return largerAvatarUrl(raw);
}

/**
 * The profile photo in its larger variant. Requested on its own lookup so the
 * main user lookup — whose URL is recorded in committed demo profiles — never
 * changes. Anything missing or malformed resolves to no avatar, silently.
 */
async function fetchAvatarUrl(
  args: { userId: string },
  deps: { fetch: NetworkDeps["fetch"]; sleep: NetworkDeps["sleep"]; now: NetworkDeps["now"]; headers: Record<string, string> },
): Promise<{ avatarUrl?: string; source?: SourceEntry }> {
  const url = `${X_API}/users/${encodeURIComponent(args.userId)}?user.fields=profile_image_url`;
  const result = await getJsonWithRetry({ fetch: deps.fetch, sleep: deps.sleep, url, options: { headers: deps.headers } });
  if (result.kind !== "ok") return {};
  const parsed = xAvatarSchema.safeParse(result.body);
  const avatarUrl = parsed.success ? toAvatarUrl(parsed.data.data.profile_image_url) : undefined;
  if (avatarUrl === undefined) return {};
  return { avatarUrl, source: { source: "x", url, retrievedAt: deps.now() } };
}

function toDraft(args: { tweet: z.infer<typeof xTweetSchema>; handle: string }): XPostDraft {
  const metrics = args.tweet.public_metrics;
  return {
    source: "x",
    url: `https://x.com/${args.handle}/status/${args.tweet.id}`,
    text: args.tweet.text.slice(0, 1000),
    postedAt: args.tweet.created_at,
    metrics: {
      likes: metrics?.like_count,
      reposts: metrics?.retweet_count ?? metrics?.repost_count,
      replies: metrics?.reply_count,
      views: metrics?.impression_count ?? metrics?.view_count,
    },
  };
}

/**
 * X via the official API v2. User lookup, recent posts by a user, single post
 * lookup. Bearer token comes from the caller; without one the adapter is
 * skipped. Verified against the X API v2 user and post lookup docs:
 * GET /2/users/by/username/{username}, GET /2/users/{id}/tweets,
 * GET /2/tweets/{id}, all with public_metrics field selections, plus a
 * profile_image_url lookup for the founder avatar.
 */
export async function fetchX(
  input: XInput,
  deps: NetworkDeps & { bearerToken?: string },
): Promise<XResult> {
  const token = deps.bearerToken?.trim() ?? "";
  if (token === "") {
    return { kind: "skipped", reason: "X_BEARER_TOKEN is not set, skipping the X adapter" };
  }
  const headers = { Authorization: `Bearer ${token}` };
  const sources: SourceEntry[] = [];
  const warnings: AdapterWarning[] = [];

  let userId = input.userId?.trim() ?? "";
  let name = "";
  let handle = (input.handle ?? "").trim().replace(/^@/, "");
  let followers = 0;
  let avatarUrl: string | undefined;

  if (userId === "") {
    if (handle === "") {
      return { kind: "failed", error: "X adapter needs a handle or a user id" };
    }
    const url = `${X_API}/users/by/username/${encodeURIComponent(handle)}?user.fields=created_at,description,location,public_metrics,url,verified`;
    const result = await getJsonWithRetry({ fetch: deps.fetch, sleep: deps.sleep, url, options: { headers } });
    if (result.kind !== "ok") {
      return { kind: "failed", error: describeFailure(result) };
    }
    const parsed = xUserSchema.safeParse(result.body);
    if (!parsed.success) {
      return { kind: "failed", error: "X user response has an unexpected shape" };
    }
    userId = parsed.data.data.id;
    name = parsed.data.data.name;
    handle = parsed.data.data.username;
    followers = parsed.data.data.public_metrics?.followers_count ?? 0;
    sources.push({ source: "x", url, retrievedAt: deps.now() });
  } else {
    const url = `${X_API}/users/${encodeURIComponent(userId)}?user.fields=created_at,description,location,public_metrics,url,verified`;
    const result = await getJsonWithRetry({ fetch: deps.fetch, sleep: deps.sleep, url, options: { headers } });
    if (result.kind !== "ok") {
      return { kind: "failed", error: describeFailure(result) };
    }
    const parsed = xUserSchema.safeParse(result.body);
    if (!parsed.success) {
      return { kind: "failed", error: "X user response has an unexpected shape" };
    }
    name = parsed.data.data.name;
    if (handle === "") handle = parsed.data.data.username;
    followers = parsed.data.data.public_metrics?.followers_count ?? 0;
    sources.push({ source: "x", url, retrievedAt: deps.now() });
  }

  // The avatar lives on a separate lookup so the main lookup URL — recorded in
  // committed demo profiles — never changes. A missing photo is normal and
  // stays silent; only a known avatar that fails to portrait warns later.
  const avatar = await fetchAvatarUrl({ userId }, { fetch: deps.fetch, sleep: deps.sleep, now: deps.now, headers });
  if (avatar.avatarUrl !== undefined) {
    avatarUrl = avatar.avatarUrl;
    if (avatar.source !== undefined) sources.push(avatar.source);
  }

  const posts: XPostDraft[] = [];
  const timelineUrl =
    `${X_API}/users/${encodeURIComponent(userId)}/tweets` +
    `?max_results=20&exclude=retweets,replies&tweet.fields=author_id,created_at,public_metrics`;
  const timeline = await getJsonWithRetry({ fetch: deps.fetch, sleep: deps.sleep, url: timelineUrl, options: { headers } });
  if (timeline.kind !== "ok") {
    warnings.push({ adapter: "x", message: `skipping recent posts for @${handle}: ${describeFailure(timeline)}` });
  } else {
    const parsed = xTimelineSchema.safeParse(timeline.body);
    if (!parsed.success) {
      warnings.push({ adapter: "x", message: `skipping recent posts for @${handle}: unexpected response shape` });
    } else {
      const limit = input.maxPosts ?? 5;
      for (const tweet of (parsed.data.data ?? []).slice(0, limit)) {
        posts.push(toDraft({ tweet, handle }));
      }
      sources.push({ source: "x", url: timelineUrl, retrievedAt: deps.now() });
    }
  }

  if (input.post !== undefined && input.post !== "") {
    const postId = parsePostId(input.post);
    if (postId === null) {
      warnings.push({ adapter: "x", message: `cannot parse an X post id from: ${input.post}` });
    } else {
      const url = `${X_API}/tweets/${postId}?tweet.fields=author_id,created_at,public_metrics`;
      const result = await getJsonWithRetry({ fetch: deps.fetch, sleep: deps.sleep, url, options: { headers } });
      if (result.kind !== "ok") {
        warnings.push({ adapter: "x", message: `skipping X post ${postId}: ${describeFailure(result)}` });
      } else {
        const parsed = xSingleTweetSchema.safeParse(result.body);
        if (!parsed.success) {
          warnings.push({ adapter: "x", message: `skipping X post ${postId}: unexpected response shape` });
        } else {
          posts.push(toDraft({ tweet: parsed.data.data, handle }));
          sources.push({ source: "x", url, retrievedAt: deps.now() });
        }
      }
    }
  }

  return { kind: "ok", value: { userId, name, handle, followers, avatarUrl, posts }, sources, warnings };
}
