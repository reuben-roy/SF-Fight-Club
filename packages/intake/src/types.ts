export interface FetchHeaders {
  get(name: string): string | null;
}

export interface FetchResponse {
  status: number;
  headers: FetchHeaders;
  text(): Promise<string>;
  /** Raw bytes for image downloads. Present in live and test doubles that serve binary. */
  arrayBuffer?(): Promise<Uint8Array>;
}

export interface FetchOptions {
  headers?: Record<string, string>;
}

export type FetchFn = (url: string, init?: FetchOptions) => Promise<FetchResponse>;

/** Returns the current time as an ISO-8601 string. Passed in so tests control it. */
export type Clock = () => string;

/** Resolves after ms. Passed in so tests never wait. */
export type SleepFn = (ms: number) => Promise<void>;

export interface NetworkDeps {
  fetch: FetchFn;
  now: Clock;
  sleep: SleepFn;
}

export type SourceKind = "x" | "hn" | "web";

export interface SourceEntry {
  source: SourceKind;
  url: string;
  retrievedAt: string;
}

export interface AdapterWarning {
  adapter: string;
  message: string;
}

export type AdapterResult<T> =
  | { kind: "ok"; value: T; sources: SourceEntry[]; warnings: AdapterWarning[] }
  | { kind: "skipped"; reason: string }
  | { kind: "failed"; error: string };
