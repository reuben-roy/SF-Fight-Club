export { buildProfile, toSubmission } from "./build.js";
export type { BuildInput, BuildOutput, CompanySeed, FounderSeed, PortraitHook, SubmissionDraft } from "./build.js";
export { scoreClout, tierFor } from "./clout.js";
export type { CloutInput, CloutScore, CloutTier } from "./clout.js";
export { DEMO_ENTRANTS, DEMO_IDS, DEMO_NOW, fetchDemoEntrant, getDemoEntrant, makeDemoFetch } from "./demo.js";
export type { DemoEntrant, DemoFounder } from "./demo.js";
export { fetchHn } from "./hn.js";
export type { HnInput, HnResult, HnValue } from "./hn.js";
export { AVATAR_MAX_BYTES, AVATAR_TIMEOUT_MS, fetchPortrait } from "./portrait.js";
export type {
  AvatarFetchFn,
  AvatarFetchResponse,
  FetchPortraitResult,
  PortraitDeps,
  PortraitFailureReason,
} from "./portrait.js";
export { getJsonWithRetry, getTextRaw } from "./http.js";
export type { GetJsonOptions, GetJsonResult } from "./http.js";
export type { AdapterResult, AdapterWarning, Clock, FetchFn, FetchResponse, NetworkDeps, SleepFn, SourceEntry, SourceKind } from "./types.js";
export { fetchWeb } from "./web.js";
export type { WebResult, WebValue } from "./web.js";
export { fetchX } from "./x.js";
export type { XInput, XResult, XValue } from "./x.js";
export { largerAvatarUrl } from "./x.js";
