import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { pixelPortraitSchema } from "@sf-fight-club/schemas";
import { describe, expect, it } from "vitest";

import { fetchPortrait, type AvatarFetchFn } from "../src/portrait.js";
import type { FetchHeaders } from "../src/types.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const samplesDir = path.join(here, "..", "..", "portrait", "fixtures", "samples");

const HEX = /^#[0-9a-fA-F]{6}$/;
const sleep = async () => {};

function sampleBytes(file: string): Uint8Array {
  return new Uint8Array(readFileSync(path.join(samplesDir, file)));
}

function headersFor(entries: Record<string, string>): FetchHeaders {
  const lower: Record<string, string> = {};
  for (const [key, value] of Object.entries(entries)) lower[key.toLowerCase()] = value;
  return { get: (name: string) => lower[name.toLowerCase()] ?? null };
}

interface FakeAvatar {
  fetch: AvatarFetchFn;
  calls: string[];
}

function fakeAvatarFetch(args: {
  status?: number;
  contentType?: string;
  contentLength?: string;
  body?: Uint8Array;
  throws?: boolean;
}): FakeAvatar {
  const calls: string[] = [];
  const fetch: AvatarFetchFn = async (url) => {
    calls.push(url);
    if (args.throws === true) throw new Error("network down");
    const entries: Record<string, string> = {};
    if (args.contentType !== undefined) entries["content-type"] = args.contentType;
    if (args.contentLength !== undefined) entries["content-length"] = args.contentLength;
    return {
      status: args.status ?? 200,
      headers: headersFor(entries),
      arrayBuffer: async () => args.body ?? new Uint8Array(0),
    };
  };
  return { fetch, calls };
}

describe("fetchPortrait", () => {
  it("portraits a sample JPEG", async () => {
    const { fetch } = fakeAvatarFetch({ contentType: "image/jpeg", body: sampleBytes("obama.jpg") });
    const result = await fetchPortrait({ avatarUrl: "https://example.com/obama.jpg" }, { fetch, sleep });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(() => pixelPortraitSchema.parse(result.portrait)).not.toThrow();
    for (const color of [result.traits.skin, result.traits.skinShadow, result.traits.hair, result.traits.accent]) {
      expect(color).toMatch(HEX);
    }
  });

  it("portraits a sample PNG", async () => {
    const { fetch } = fakeAvatarFetch({ contentType: "image/png", body: sampleBytes("tubman.png") });
    const result = await fetchPortrait({ avatarUrl: "https://example.com/tubman.png" }, { fetch, sleep });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(() => pixelPortraitSchema.parse(result.portrait)).not.toThrow();
  });

  it("returns none on a 404 without throwing", async () => {
    const { fetch } = fakeAvatarFetch({ status: 404, contentType: "text/plain", body: new Uint8Array(0) });
    const result = await fetchPortrait({ avatarUrl: "https://example.com/missing.jpg" }, { fetch, sleep });
    expect(result).toEqual({ kind: "none", reason: "http_error", detail: "avatar request returned HTTP 404" });
  });

  it("returns none when the content type is not an image", async () => {
    const { fetch } = fakeAvatarFetch({
      contentType: "text/html",
      body: new TextEncoder().encode("<html>not a photo</html>"),
    });
    const result = await fetchPortrait({ avatarUrl: "https://example.com/page" }, { fetch, sleep });
    expect(result.kind).toBe("none");
    if (result.kind !== "none") return;
    expect(result.reason).toBe("not_image");
  });

  it("returns none for an oversized body without throwing", async () => {
    const { fetch } = fakeAvatarFetch({ contentType: "image/jpeg", body: sampleBytes("obama.jpg") });
    const result = await fetchPortrait(
      { avatarUrl: "https://example.com/obama.jpg" },
      { fetch, sleep, maxBytes: 64 },
    );
    expect(result.kind).toBe("none");
    if (result.kind !== "none") return;
    expect(result.reason).toBe("too_large");
  });

  it("returns none for a declared length over the cap without downloading", async () => {
    const avatar = fakeAvatarFetch({
      contentType: "image/jpeg",
      contentLength: String(100 * 1024 * 1024),
      body: new Uint8Array(0),
    });
    const result = await fetchPortrait(
      { avatarUrl: "https://example.com/huge.jpg" },
      { fetch: avatar.fetch, sleep },
    );
    expect(result.kind).toBe("none");
    if (result.kind !== "none") return;
    expect(result.reason).toBe("too_large");
  });

  it("returns none for corrupt bytes without throwing", async () => {
    const { fetch } = fakeAvatarFetch({
      contentType: "image/jpeg",
      body: new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3]),
    });
    const result = await fetchPortrait({ avatarUrl: "https://example.com/broken.jpg" }, { fetch, sleep });
    expect(result.kind).toBe("none");
    if (result.kind !== "none") return;
    expect(result.reason).toBe("no_portrait");
  });

  it.each(["file:///etc/photo.jpg", "javascript:alert(1)", "ftp://example.com/a.jpg"])(
    "never fetches %s",
    async (avatarUrl) => {
      const avatar = fakeAvatarFetch({ contentType: "image/jpeg", body: sampleBytes("obama.jpg") });
      const result = await fetchPortrait({ avatarUrl }, { fetch: avatar.fetch, sleep });
      expect(result.kind).toBe("none");
      if (result.kind !== "none") return;
      expect(result.reason).toBe("bad_url");
      expect(avatar.calls).toEqual([]);
    },
  );

  it("returns none when the fetch itself throws", async () => {
    const { fetch } = fakeAvatarFetch({ throws: true });
    const result = await fetchPortrait({ avatarUrl: "https://example.com/a.jpg" }, { fetch, sleep });
    expect(result.kind).toBe("none");
    if (result.kind !== "none") return;
    expect(result.reason).toBe("fetch_failed");
  });
});
