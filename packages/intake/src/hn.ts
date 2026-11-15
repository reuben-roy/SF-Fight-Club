import * as z from "zod";

import { getJsonWithRetry } from "./http.js";
import type { AdapterResult, AdapterWarning, NetworkDeps, SourceEntry } from "./types.js";

const HN_API = "https://hn.algolia.com/api/v1";

const hnItemSchema = z.object({
  id: z.number(),
  author: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  text: z.string().nullable().optional(),
  points: z.number().nullable().optional(),
  created_at: z.string().optional(),
  children: z.array(z.object({ id: z.number() }).catchall(z.unknown())).optional(),
});

const hnSearchHitSchema = z.object({
  objectID: z.string(),
  author: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  points: z.number().nullable().optional(),
  num_comments: z.number().nullable().optional(),
  created_at: z.string().optional(),
});

const hnSearchSchema = z.object({ hits: z.array(hnSearchHitSchema) });

const hnUserSchema = z.object({
  username: z.string(),
  karma: z.number(),
});

export interface HnPostDraft {
  source: "hn";
  url: string;
  title?: string;
  text: string;
  postedAt?: string;
  metrics: { points?: number; comments?: number };
}

export interface HnValue {
  posts: HnPostDraft[];
  karmaByUser: Record<string, number>;
  authors: string[];
}

export type HnResult = AdapterResult<HnValue>;

function describeFailure(result: { kind: string; status?: number; detail?: string; error?: string }): string {
  if (result.kind === "http-error") return `HN request returned HTTP ${result.status}`;
  if (result.kind === "malformed") return result.detail ?? "malformed HN response";
  return result.error ?? "HN request failed";
}

export interface HnInput {
  /** An Algolia item id ("8863") or an HN item URL. Omit for handle-only intake. */
  item?: string;
  /** Full company URL or free-text query when no item id is known. */
  query?: string;
  /** HN usernames to look up for karma. */
  users?: string[];
}

function parseItemId(input: string): number | null {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const match = trimmed.match(/[?&]id=(\d+)/);
  if (match?.[1] !== undefined) return Number(match[1]);
  return null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x2F;/g, "/")
    .replace(/&#x27;/g, "'")
    .trim();
}

function toDraft(args: {
  id: string | number;
  author?: string | null;
  title?: string | null;
  url?: string | null;
  rawText?: string | null;
  points?: number | null;
  comments?: number | null;
  createdAt?: string;
}): HnPostDraft {
  const title = args.title ?? undefined;
  const body = args.rawText !== undefined && args.rawText !== null ? stripHtml(args.rawText) : "";
  const combined = title !== undefined && title !== "" ? `${title}\n\n${body}`.trim() : body;
  return {
    source: "hn",
    url: `https://news.ycombinator.com/item?id=${args.id}`,
    title,
    text: combined.slice(0, 1000),
    postedAt: args.createdAt,
    metrics: {
      points: args.points ?? undefined,
      comments: args.comments ?? undefined,
    },
  };
}

/**
 * Hacker News via the public Algolia HN Search API.
 * Item lookup, story search by URL or query, and user lookup for karma.
 * Verified against the live API: GET /api/v1/items/{id},
 * GET /api/v1/search?query=&tags=story, GET /api/v1/users/{username}.
 */
export async function fetchHn(input: HnInput, deps: NetworkDeps): Promise<HnResult> {
  const posts: HnPostDraft[] = [];
  const karmaByUser: Record<string, number> = {};
  const authors: string[] = [];
  const sources: SourceEntry[] = [];
  const warnings: AdapterWarning[] = [];

  if (input.item !== undefined && input.item !== "") {
    const id = parseItemId(input.item);
    if (id === null) {
      return { kind: "failed", error: `cannot parse an HN item id from: ${input.item}` };
    }
    const url = `${HN_API}/items/${id}`;
    const result = await getJsonWithRetry({ fetch: deps.fetch, sleep: deps.sleep, url });
    if (result.kind !== "ok") {
      return { kind: "failed", error: describeFailure(result) };
    }
    const parsed = hnItemSchema.safeParse(result.body);
    if (!parsed.success) {
      return { kind: "failed", error: "HN item response has an unexpected shape" };
    }
    const item = parsed.data;
    posts.push(
      toDraft({
        id: item.id,
        author: item.author,
        title: item.title,
        url: item.url,
        rawText: item.text,
        points: item.points,
        comments: item.children?.length,
        createdAt: item.created_at,
      }),
    );
    if (item.author !== undefined && item.author !== null && item.author !== "") authors.push(item.author);
    sources.push({ source: "hn", url, retrievedAt: deps.now() });
  } else if (input.query !== undefined && input.query !== "") {
    const url = `${HN_API}/search?query=${encodeURIComponent(input.query)}&tags=story`;
    const result = await getJsonWithRetry({ fetch: deps.fetch, sleep: deps.sleep, url });
    if (result.kind !== "ok") {
      return { kind: "failed", error: describeFailure(result) };
    }
    const parsed = hnSearchSchema.safeParse(result.body);
    if (!parsed.success) {
      return { kind: "failed", error: "HN search response has an unexpected shape" };
    }
    const [hit] = parsed.data.hits;
    if (hit === undefined) {
      warnings.push({ adapter: "hn", message: `HN search found no story for: ${input.query}` });
    } else {
      posts.push(
        toDraft({
          id: hit.objectID,
          author: hit.author,
          title: hit.title,
          url: hit.url,
          rawText: null,
          points: hit.points,
          comments: hit.num_comments,
          createdAt: hit.created_at,
        }),
      );
      if (hit.author !== undefined && hit.author !== null && hit.author !== "") authors.push(hit.author);
    }
    sources.push({ source: "hn", url, retrievedAt: deps.now() });
  }

  for (const username of input.users ?? []) {
    const name = username.trim().replace(/^@/, "");
    if (name === "") continue;
    const url = `${HN_API}/users/${encodeURIComponent(name)}`;
    const result = await getJsonWithRetry({ fetch: deps.fetch, sleep: deps.sleep, url });
    if (result.kind !== "ok") {
      warnings.push({ adapter: "hn", message: `skipping HN user ${name}: ${describeFailure(result)}` });
      continue;
    }
    const parsed = hnUserSchema.safeParse(result.body);
    if (!parsed.success) {
      warnings.push({ adapter: "hn", message: `skipping HN user ${name}: unexpected response shape` });
      continue;
    }
    karmaByUser[parsed.data.username] = parsed.data.karma;
    sources.push({ source: "hn", url, retrievedAt: deps.now() });
  }

  if (posts.length === 0 && Object.keys(karmaByUser).length === 0) {
    return { kind: "failed", error: "HN adapter found nothing usable" };
  }
  return { kind: "ok", value: { posts, karmaByUser, authors }, sources, warnings };
}
