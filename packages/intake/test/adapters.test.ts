import { describe, expect, it } from "vitest";

import { fetchHn } from "../src/hn.js";
import type { FetchFn, NetworkDeps } from "../src/types.js";
import { fetchWeb } from "../src/web.js";
import { fetchX } from "../src/x.js";

const now = () => "2026-11-05T19:05:00.000Z";
const sleep = async () => {};

function jsonResponse(status: number, body: unknown): { status: number; headers: { get(n: string): string | null }; text(): Promise<string> } {
  return { status, headers: { get: () => null }, text: async () => JSON.stringify(body) };
}

function depsFor(fetch: FetchFn, bearerToken?: string): NetworkDeps & { bearerToken?: string } {
  return { fetch, now, sleep, bearerToken };
}

const hnItem = {
  id: 8863,
  created_at: "2026-11-04T16:00:00.000Z",
  type: "story",
  author: "pg",
  title: "Test story",
  url: "https://example.com",
  text: null,
  points: 42,
  children: [],
};

const xUser = {
  data: {
    id: "123",
    name: "Test User",
    username: "testuser",
    public_metrics: { followers_count: 1000, following_count: 10, tweet_count: 50, listed_count: 1 },
  },
};

describe("fetchHn", () => {
  it("retries a 429 then succeeds", async () => {
    let calls = 0;
    const fetch: FetchFn = async () => {
      calls += 1;
      if (calls === 1) return jsonResponse(429, {});
      return jsonResponse(200, hnItem);
    };
    const result = await fetchHn({ item: "8863" }, depsFor(fetch));
    expect(calls).toBe(2);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.value.posts).toHaveLength(1);
      expect(result.value.posts[0]?.metrics.points).toBe(42);
    }
  });

  it("fails on a 404 item", async () => {
    const fetch: FetchFn = async () => jsonResponse(404, { message: "not found" });
    const result = await fetchHn({ item: "1" }, depsFor(fetch));
    expect(result.kind).toBe("failed");
  });

  it("fails on a malformed item body", async () => {
    const fetch: FetchFn = async () => ({
      status: 200,
      headers: { get: () => null },
      text: async () => "this is not json{{{",
    });
    const result = await fetchHn({ item: "8863" }, depsFor(fetch));
    expect(result.kind).toBe("failed");
  });

  it("keeps karma from good users when one lookup 404s", async () => {
    const fetch: FetchFn = async (url: string) => {
      if (url.includes("/users/good")) return jsonResponse(200, { username: "good", karma: 50 });
      return jsonResponse(404, {});
    };
    const result = await fetchHn({ users: ["good", "ghost"] }, depsFor(fetch));
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.value.karmaByUser).toEqual({ good: 50 });
      expect(result.warnings).toHaveLength(1);
    }
  });
});

describe("fetchX", () => {
  it("skips without a bearer token", async () => {
    let called = false;
    const fetch: FetchFn = async () => {
      called = true;
      return jsonResponse(200, xUser);
    };
    const result = await fetchX({ handle: "testuser" }, depsFor(fetch));
    expect(result).toEqual({ kind: "skipped", reason: expect.stringContaining("X_BEARER_TOKEN") });
    expect(called).toBe(false);
  });

  it("retries a 429 then succeeds", async () => {
    let calls = 0;
    const fetch: FetchFn = async (url: string) => {
      calls += 1;
      if (calls === 1) return jsonResponse(429, {});
      if (url.includes("/tweets")) return jsonResponse(200, { data: [] });
      return jsonResponse(200, xUser);
    };
    const result = await fetchX({ handle: "testuser" }, depsFor(fetch, "token"));
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.value.followers).toBe(1000);
  });

  it("fails on a malformed user body", async () => {
    const fetch: FetchFn = async () => ({
      status: 200,
      headers: { get: () => null },
      text: async () => "not json",
    });
    const result = await fetchX({ handle: "testuser" }, depsFor(fetch, "token"));
    expect(result.kind).toBe("failed");
  });
});

describe("fetchWeb", () => {
  it("rejects non-http URLs", async () => {
    let called = false;
    const fetch: FetchFn = async () => {
      called = true;
      return { status: 200, headers: { get: () => null }, text: async () => "" };
    };
    const result = await fetchWeb({ url: "ftp://example.com/page" }, { fetch, now, sleep });
    expect(result.kind).toBe("failed");
    expect(called).toBe(false);
  });

  it("reads title, description and Open Graph tags", async () => {
    const html = [
      "<html><head><title>Acme &amp; Co</title>",
      '<meta name="description" content="We make widgets">',
      '<meta property="og:site_name" content="Acme">',
      '<meta property="og:image" content="https://example.com/og.png">',
      "</head></html>",
    ].join("\n");
    const fetch: FetchFn = async () => ({ status: 200, headers: { get: () => null }, text: async () => html });
    const result = await fetchWeb({ url: "https://example.com" }, { fetch, now, sleep });
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.value.title).toBe("Acme & Co");
      expect(result.value.description).toBe("We make widgets");
      expect(result.value.siteName).toBe("Acme");
      expect(result.value.logoUrl).toBe("https://example.com/og.png");
    }
  });

  it("fails on a 404 homepage", async () => {
    const fetch: FetchFn = async () => ({ status: 404, headers: { get: () => null }, text: async () => "nope" });
    const result = await fetchWeb({ url: "https://example.com" }, { fetch, now, sleep });
    expect(result.kind).toBe("failed");
  });
});
