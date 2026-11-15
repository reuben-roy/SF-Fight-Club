import type { PixelPortrait } from "@sf-fight-club/schemas";
import { decodeImage, pixelatePortrait, portraitReference, portraitTraits } from "@sf-fight-club/portrait";
import type { PortraitTraits } from "@sf-fight-club/portrait";

import type { FetchHeaders, FetchOptions, SleepFn } from "./types.js";

export const AVATAR_TIMEOUT_MS = 10000;
export const AVATAR_MAX_BYTES = 8 * 1024 * 1024;

export interface AvatarFetchResponse {
  status: number;
  headers: FetchHeaders;
  arrayBuffer(): Promise<Uint8Array>;
}

export type AvatarFetchFn = (url: string, init?: FetchOptions) => Promise<AvatarFetchResponse>;

export interface PortraitDeps {
  fetch: AvatarFetchFn;
  sleep: SleepFn;
  timeoutMs?: number;
  maxBytes?: number;
}

export type PortraitFailureReason =
  | "bad_url"
  | "fetch_failed"
  | "http_error"
  | "not_image"
  | "too_large"
  | "no_portrait";

export type FetchPortraitResult =
  | { kind: "ok"; portrait: PixelPortrait; traits: PortraitTraits }
  | { kind: "none"; reason: PortraitFailureReason; detail: string };

function fail(reason: PortraitFailureReason, detail: string): FetchPortraitResult {
  return { kind: "none", reason, detail };
}

function isHttpUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
}

/**
 * Downloads a founder avatar and turns it into a pixel portrait plus trait
 * colors. Every failure path returns `none` with a reason, never throws.
 * Callers turn the reason into a profile warning and keep the generated
 * figure for that founder.
 */
export async function fetchPortrait(
  args: { avatarUrl: string },
  deps: PortraitDeps,
): Promise<FetchPortraitResult> {
  try {
    return await runPortraitStep(args, deps);
  } catch (error) {
    return fail("fetch_failed", error instanceof Error ? error.message : String(error));
  }
}

async function runPortraitStep(
  args: { avatarUrl: string },
  deps: PortraitDeps,
): Promise<FetchPortraitResult> {
  if (!isHttpUrl(args.avatarUrl)) {
    return fail("bad_url", `avatar URL must be http or https: ${args.avatarUrl}`);
  }
  const timeoutMs = deps.timeoutMs ?? AVATAR_TIMEOUT_MS;
  const maxBytes = deps.maxBytes ?? AVATAR_MAX_BYTES;

  let response: AvatarFetchResponse;
  try {
    response = await Promise.race([
      deps.fetch(args.avatarUrl),
      deps.sleep(timeoutMs).then((): never => {
        throw new Error(`timed out after ${timeoutMs}ms: ${args.avatarUrl}`);
      }),
    ]);
  } catch (error) {
    return fail("fetch_failed", error instanceof Error ? error.message : String(error));
  }

  if (response.status < 200 || response.status >= 300) {
    return fail("http_error", `avatar request returned HTTP ${response.status}`);
  }
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!contentType.startsWith("image/")) {
    return fail("not_image", `avatar content-type is not an image: ${contentType || "missing"}`);
  }
  const declaredLength = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return fail("too_large", `avatar declares ${declaredLength} bytes, cap is ${maxBytes}`);
  }

  let bytes: Uint8Array;
  try {
    bytes = await response.arrayBuffer();
  } catch (error) {
    return fail("fetch_failed", error instanceof Error ? error.message : String(error));
  }
  if (bytes.length > maxBytes) {
    return fail("too_large", `avatar body is ${bytes.length} bytes, cap is ${maxBytes}`);
  }

  const decoded = decodeImage(bytes);
  if (decoded.kind !== "ok") {
    return fail("no_portrait", `avatar bytes did not decode: ${decoded.reason}`);
  }
  const rendered = pixelatePortrait(decoded.image);
  if (rendered.kind !== "ok") {
    return fail("no_portrait", `avatar did not portrait: ${rendered.reason}`);
  }
  const reference = portraitReference(decoded.image);
  if (reference === null) {
    return fail("no_portrait", "avatar has no portrait reference");
  }
  return { kind: "ok", portrait: rendered.portrait, traits: portraitTraits(reference) };
}
