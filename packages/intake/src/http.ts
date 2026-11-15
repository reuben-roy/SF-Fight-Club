import type { FetchFn, SleepFn } from "./types.js";

export interface GetJsonOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
}

export type GetJsonResult =
  | { kind: "ok"; status: number; body: unknown }
  | { kind: "http-error"; status: number }
  | { kind: "malformed"; detail: string }
  | { kind: "failed"; error: string };

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

/**
 * GET with bounded retry on 429 and 5xx, a timeout, and a body size cap.
 * Returns a result union. Never throws for HTTP or parse failures.
 */
export async function getJsonWithRetry(args: {
  fetch: FetchFn;
  sleep: SleepFn;
  url: string;
  options?: GetJsonOptions;
}): Promise<GetJsonResult> {
  const { fetch, sleep, url } = args;
  const timeoutMs = args.options?.timeoutMs ?? 10000;
  const maxBytes = args.options?.maxBytes ?? 500000;
  const maxAttempts = args.options?.maxAttempts ?? 3;
  const baseDelayMs = args.options?.baseDelayMs ?? 500;

  let attempt = 0;
  for (;;) {
    attempt += 1;
    let response;
    try {
      response = await Promise.race([
        fetch(url, { headers: args.options?.headers }),
        sleep(timeoutMs).then((): never => {
          throw new Error(`timed out after ${timeoutMs}ms: ${url}`);
        }),
      ]);
    } catch (error) {
      if (attempt >= maxAttempts) {
        return { kind: "failed", error: error instanceof Error ? error.message : String(error) };
      }
      await sleep(baseDelayMs * 2 ** (attempt - 1));
      continue;
    }
    if (isRetryableStatus(response.status)) {
      if (attempt >= maxAttempts) {
        return { kind: "http-error", status: response.status };
      }
      await sleep(baseDelayMs * 2 ** (attempt - 1));
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      return { kind: "http-error", status: response.status };
    }
    let raw: string;
    try {
      raw = await response.text();
    } catch (error) {
      return { kind: "failed", error: error instanceof Error ? error.message : String(error) };
    }
    if (raw.length > maxBytes) {
      return { kind: "failed", error: `response body exceeds ${maxBytes} bytes: ${url}` };
    }
    try {
      return { kind: "ok", status: response.status, body: JSON.parse(raw) as unknown };
    } catch {
      return { kind: "malformed", detail: `response is not valid JSON: ${url}` };
    }
  }
}

/** Plain-text GET with the same retry, timeout and size cap. Response stays a string. */
export async function getTextRaw(args: {
  fetch: FetchFn;
  sleep: SleepFn;
  url: string;
  options?: GetJsonOptions;
}): Promise<
  | { kind: "ok"; status: number; text: string }
  | { kind: "http-error"; status: number }
  | { kind: "failed"; error: string }
> {
  const { fetch, sleep, url } = args;
  const timeoutMs = args.options?.timeoutMs ?? 10000;
  const maxBytes = args.options?.maxBytes ?? 500000;
  const maxAttempts = args.options?.maxAttempts ?? 3;
  const baseDelayMs = args.options?.baseDelayMs ?? 500;

  let attempt = 0;
  for (;;) {
    attempt += 1;
    let response;
    try {
      response = await Promise.race([
        fetch(url, { headers: args.options?.headers }),
        sleep(timeoutMs).then((): never => {
          throw new Error(`timed out after ${timeoutMs}ms: ${url}`);
        }),
      ]);
    } catch (error) {
      if (attempt >= maxAttempts) {
        return { kind: "failed", error: error instanceof Error ? error.message : String(error) };
      }
      await sleep(baseDelayMs * 2 ** (attempt - 1));
      continue;
    }
    if (isRetryableStatus(response.status)) {
      if (attempt >= maxAttempts) {
        return { kind: "http-error", status: response.status };
      }
      await sleep(baseDelayMs * 2 ** (attempt - 1));
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      return { kind: "http-error", status: response.status };
    }
    let raw: string;
    try {
      raw = await response.text();
    } catch (error) {
      return { kind: "failed", error: error instanceof Error ? error.message : String(error) };
    }
    if (raw.length > maxBytes) {
      return { kind: "failed", error: `response body exceeds ${maxBytes} bytes: ${url}` };
    }
    return { kind: "ok", status: response.status, text: raw };
  }
}
