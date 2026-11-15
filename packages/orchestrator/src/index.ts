export { DEMO_ENTRANTS, makeFighterInput } from "./demo/entrants.js";
export type { DemoEntrant } from "./demo/entrants.js";
export { DEMO_AT_DEFAULT, DEMO_SEED, runDemoTournament } from "./demo/runner.js";
export type { DemoMatchResult, DemoTournament, RunDemoTournamentInput } from "./demo/runner.js";
export {
  dermaVsCurbTape,
  dermaVsLoopTape,
  finalTape,
  flakeVsCurbTape,
  permitVsTabTape,
  tabVsPaperTape,
} from "./demo/tapes.js";
export { OrchestratorError } from "./errors.js";
export { mergeFactChecks } from "./factcheck.js";
export { createFixturePlayer, parseFixtureTape } from "./fixtures.js";
export type { FixtureAttempt, FixturePlayer, FixtureStep, FixtureTape } from "./fixtures.js";
export { buildHash, canonicalJson } from "./hash.js";
export { closingScope, shotId, stepKey, volleyScope } from "./keys.js";
export { markComplete, redirect, toPublicMatch } from "./public.js";
export { randomFighter1, runMatch } from "./run.js";
export { permitVsFogcastTape, suddenDeathTape, withStep } from "./tapes.js";
export { truncateAtCap, wordCount } from "./text.js";
export type { FighterInput, LlmCall, MatchRun, OrchestratorWarning, PublicFighter, PublicMatch, RunMatchInput } from "./types.js";
