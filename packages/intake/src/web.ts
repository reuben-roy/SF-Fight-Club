import { getTextRaw } from "./http.js";
import type { AdapterResult, NetworkDeps } from "./types.js";

export interface WebValue {
  title?: string;
  description?: string;
  siteName?: string;
  logoUrl?: string;
}

export type WebResult = AdapterResult<WebValue>;

function firstMatch(html: string, pattern: RegExp): string | undefined {
  const match = html.match(pattern);
  const raw = match?.[1]?.trim().replace(/\s+/g, " ");
  return raw === undefined || raw === "" ? undefined : raw;
}

function metaContent(html: string, key: string, attr: "name" | "property"): string | undefined {
  const byAttr = new RegExp(
    `<meta\\s+[^>]*${attr}=["']${key}["'][^>]*content=["']([^"']*)["'][^>]*>`,
    "i",
  );
  const found = firstMatch(html, byAttr);
  if (found !== undefined) return found;
  const flipped = new RegExp(
    `<meta\\s+[^>]*content=["']([^"']*)["'][^>]*${attr}=["']${key}["'][^>]*>`,
    "i",
  );
  return firstMatch(html, flipped);
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

/**
 * One GET of the company homepage. Reads the title tag, the meta description
 * and Open Graph tags. Only http and https URLs. Timeout and size cap, same
 * retry policy as the other adapters.
 */
export async function fetchWeb(input: { url: string }, deps: NetworkDeps): Promise<WebResult> {
  const raw = input.url.trim();
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { kind: "failed", error: `not a valid URL: ${input.url}` };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { kind: "failed", error: `only http and https URLs are supported: ${input.url}` };
  }
  const result = await getTextRaw({ fetch: deps.fetch, sleep: deps.sleep, url: parsed.toString() });
  if (result.kind !== "ok") {
    const detail =
      result.kind === "http-error" ? `homepage GET returned HTTP ${result.status}` : result.error;
    return { kind: "failed", error: detail };
  }
  const html = result.text;
  const title = firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title\s*>/i);
  const value: WebValue = {
    title: title === undefined ? undefined : decodeEntities(title),
    description: metaContent(html, "description", "name") ?? metaContent(html, "og:description", "property"),
    siteName: metaContent(html, "og:site_name", "property"),
    logoUrl: metaContent(html, "og:image", "property"),
  };
  return {
    kind: "ok",
    value,
    sources: [{ source: "web", url: parsed.toString(), retrievedAt: deps.now() }],
    warnings: [],
  };
}
