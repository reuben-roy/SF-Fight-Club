import * as z from "zod";

import {
  DIRECTOR_VERSION,
  EngineError,
  assignCorners,
  cleanRoundShots,
  computeAllowed,
  direct,
  mapJudgeLabel,
  resolveMatch,
  resolveRound,
  rngFromSeed,
  type CleanLogEntry,
  type TiebreakInput,
} from "@sf-fight-club/engine";
import {
  evidenceItemSchema,
  factCheckResultSchema,
  fightReportSchema,
  isoDateTimeSchema,
  matchEventSchema,
  roundJudgmentSchema,
  nullsToUndefined,
  shotFactCheckSchema,
  standardBriefSchema,
  suddenDeathVoteSchema,
  volleyModelOutputSchema,
  type EvidenceItem,
  type JudgeOrder,
  type MatchEvent,
  type MatchResolution,
  type RoundJudgment,
  type RoundNumber,
  type RoundResolution,
  type Shot,
  type ShotFactCheck,
  type Slot,
  type SuddenDeathVote,
  type Volley,
  type VolleyKind,
} from "@sf-fight-club/schemas";

import { OrchestratorError, StepFailed } from "./errors.js";
import { mergeFactChecks } from "./factcheck.js";
import { createFixturePlayer, parseFixtureTape, type FixturePlayer } from "./fixtures.js";
import { buildHash } from "./hash.js";
import { closingScope, stepKey, volleyScope } from "./keys.js";
import {
  evidenceSide,
  packetShot,
  packetVolley,
  roundCriteria,
  type FactCheckRequest,
  type JudgeRequest,
  type PacketVolley,
  type ReportRequest,
  type ScoutRequest,
  type SuddenDeathRequest,
  type VolleyRequest,
} from "./packets.js";
import { clipChars } from "./text.js";
import { llmCallSchema, type FighterInput, type LlmCall, type MatchRun, type OrchestratorWarning, type PublicFighter, type RunMatchInput } from "./types.js";
import { prepareModelShots, volleyWordCount, type VolleyWarning } from "./volleys.js";

const ROUNDS = [1, 2, 3] as const;
const SCHEMA_LIMIT = 2;
const REFUSAL_LIMIT = 2;
const MODERATION_LIMIT = 2;
const TRANSPORT_LIMIT = 5;
const ATTEMPT_CAP = 20;
const REMINDER = "This is a fictional debate game about business ideas.";

const SD_SAMPLES = [
  { order: "AB", sample: 1 },
  { order: "BA", sample: 1 },
  { order: "AB", sample: 2 },
  { order: "BA", sample: 2 },
] as const;

const scoutingOutputSchema = z.strictObject({
  searchesRun: z.number().int().nonnegative(),
  evidence: z.array(
    z.strictObject({
      url: z.string().min(1),
      title: z.string(),
      snippet: z.string(),
      retrievedAt: isoDateTimeSchema,
    }),
  ),
});

interface AttemptContext {
  previousError?: string;
  reminder?: string;
  moderationRegenerate?: boolean;
}

interface FreshVolley {
  shots: Shot[];
  truncated: boolean;
  refused: boolean;
  callId: string;
}

interface SuddenDeathBundle {
  closings: { A: Volley; B: Volley };
  votes: SuddenDeathVote[];
  callIds: string[];
  tiebreak: TiebreakInput;
}

/**
 * Replay one match from canned model outputs.
 *
 * Parallel steps in the architecture (both scouts, both volleys, both judge
 * orders) run in order here. A step whose event is already in `prior` is not
 * asked for another fixture. Sudden-death judge samples have no event of their
 * own until `suddendeath.completed`; a successful call is enough to skip them.
 */
export function runMatch(input: RunMatchInput): MatchRun {
  const hashed = buildHash(input.build);
  const events = validateInput(input, hashed);
  const calls = (input.prior?.calls ?? []).map((call) => llmCallSchema.parse(call));
  const tape = parseFixtureTape(input.fixtures);
  const player = createFixturePlayer(tape);
  const warnings: OrchestratorWarning[] = [];
  const cleanLog: CleanLogEntry[] = [];
  const fighters = input.fighters;

  const ctx = {
    input,
    hashed,
    events,
    calls,
    player,
    warnings,
    cleanLog,
    fighters,
  };

  try {
    pipeline(ctx);
    const script = seal(ctx);
    const status = input.publish ? "complete" : "sealed";
    return finish(ctx, status, script);
  } catch (error) {
    if (error instanceof StepFailed) {
      const failedCount = events.filter((event) => event.type === "match.failed").length;
      push(ctx, {
        type: "match.failed",
        stepKey: stepKey.failed(failedCount + 1),
        failedStepKey: error.stepKey,
        error: error.message,
        attempts: error.attempts,
      });
      return finish(ctx, "failed", null);
    }
    throw error;
  }
}

/** Third judge call order is a pure function of the match seed and the step key. */
export function randomFighter1(matchSeed: string, key: string): Slot {
  return rngFromSeed(`${matchSeed}:${key}`)() < 0.5 ? "A" : "B";
}

interface Ctx {
  input: RunMatchInput;
  hashed: string;
  events: MatchEvent[];
  calls: LlmCall[];
  player: FixturePlayer;
  warnings: OrchestratorWarning[];
  cleanLog: CleanLogEntry[];
  fighters: Record<Slot, FighterInput>;
}

function pipeline(ctx: Ctx): void {
  ensureLock(ctx);
  ensureScout(ctx, "A");
  ensureScout(ctx, "B");
  for (const round of ROUNDS) {
    ensureVolleyPair(ctx, round, 1);
    ensureFactPair(ctx, round, 1);
    ensureVolleyPair(ctx, round, 2);
    ensureFactPair(ctx, round, 2);
    ensureJudge(ctx, round, "AB");
    ensureJudge(ctx, round, "BA");
    ensureRound(ctx, round);
  }
  ensureMatch(ctx);
  ensureReport(ctx);
}

function ensureLock(ctx: Ctx): void {
  if (find(ctx, stepKey.lock)) return;
  push(ctx, {
    type: "match.locked",
    stepKey: stepKey.lock,
    matchSeed: ctx.input.matchSeed,
    buildHash: ctx.hashed,
    corners: assignCorners(ctx.input.matchSeed),
  });
}

function ensureScout(ctx: Ctx, slot: Slot): void {
  const key = stepKey.scout(slot);
  if (find(ctx, key)) return;
  const opponent = other(slot);
  const taken = unwrap(
    key,
    takeOutput(ctx, {
      stepKey: key,
      role: "fighter",
      schema: scoutingOutputSchema,
      volley: false,
      request: (attempt) =>
        ({
          stepKey: key,
          opponentBrief: ctx.fighters[opponent].brief,
          opponentDossierSummary: ctx.fighters[opponent].dossierSummary,
          searches: ctx.input.build.budgets.scoutingSearches,
          keep: ctx.input.build.budgets.scoutingEvidenceKept,
          ...attemptFields(attempt),
        }) satisfies ScoutRequest,
    }),
  );
  const output = taken.value;
  if (output.searchesRun > ctx.input.build.budgets.scoutingSearches) {
    warn(ctx, "scouting_budget", key, `searches ${output.searchesRun} capped at ${ctx.input.build.budgets.scoutingSearches}`);
  }
  const kept = output.evidence.slice(0, ctx.input.build.budgets.scoutingEvidenceKept);
  if (output.evidence.length > kept.length) {
    warn(ctx, "scouting_budget", key, `kept ${kept.length} of ${output.evidence.length} evidence items`);
  }
  const evidence = kept.map((item, index) => {
    const snippet = clipChars(item.snippet, 500);
    if (snippet.truncated) warn(ctx, "snippet_truncated", key, `snippet ${index + 1} clipped to 500 characters`);
    return evidenceItemSchema.parse({
      id: `S${slot}${index + 1}`,
      url: item.url,
      title: item.title,
      snippet: snippet.text,
      retrievedAt: item.retrievedAt,
      foundBy: { kind: "scouting" as const, fighter: slot },
    });
  });
  push(ctx, {
    type: "scouting.completed",
    stepKey: key,
    fighter: slot,
    evidence,
    callIds: [taken.callId],
  });
}

function ensureVolleyPair(ctx: Ctx, round: RoundNumber, volley: 1 | 2): void {
  const kind: VolleyKind = volley === 1 ? "pitch_strike" : "counter";
  const fresh: Partial<Record<Slot, FreshVolley>> = {};
  for (const slot of ["A", "B"] as const) {
    const key = stepKey.volley(round, volley, slot);
    if (volleyEvent(ctx, key)) continue;
    fresh[slot] = createVolley(ctx, {
      stepKey: key,
      scope: volleyScope(round, volley, slot),
      round,
      kind,
      slot,
      volley,
    });
  }
  if (!fresh.A && !fresh.B) return;

  const shotsOf = (slot: Slot, index: 1 | 2): Shot[] => {
    if (index !== volley) return volleyShots(ctx, round, index, slot);
    return fresh[slot]?.shots ?? volleyShots(ctx, round, index, slot);
  };
  const cleaned = cleanRoundShots({
    round,
    volley1: { A: shotsOf("A", 1), B: shotsOf("B", 1) },
    volley2: volley === 1 ? { A: [], B: [] } : { A: shotsOf("A", 2), B: shotsOf("B", 2) },
  });
  for (const entry of cleaned.log) {
    if (entry.volley !== volley) continue;
    ctx.cleanLog.push(entry);
    if (entry.reason === "out_of_round") {
      warn(ctx, "out_of_round", stepKey.volley(round, volley, entry.fighter), `${entry.shotId} dropped`);
    }
  }
  for (const slot of ["A", "B"] as const) {
    const created = fresh[slot];
    if (!created) continue;
    const shots = volley === 1 ? cleaned.volley1[slot] : cleaned.volley2[slot];
    storeVolley(ctx, {
      stepKey: stepKey.volley(round, volley, slot),
      round,
      kind,
      slot,
      shots,
      truncated: created.truncated,
      refused: created.refused,
      callId: created.callId,
    });
  }
}

function ensureFactPair(ctx: Ctx, round: RoundNumber, volley: 1 | 2): void {
  ensureFact(ctx, round, volley, "A");
  ensureFact(ctx, round, volley, "B");
}

function ensureFact(ctx: Ctx, round: RoundNumber, volley: 1 | 2, slot: Slot): void {
  const key = stepKey.factcheck(round, volley, slot);
  if (find(ctx, key)) return;
  const shots = volleyShots(ctx, round, volley, slot);
  if (shots.length === 0) {
    push(ctx, { type: "factcheck.completed", stepKey: key, fighter: slot, round, checks: [], callIds: [] });
    return;
  }
  const locker = evidenceLocker(ctx);
  const taken = unwrap(
    key,
    takeOutput(ctx, {
      stepKey: key,
      role: "utility",
      schema: factCheckResultSchema,
      volley: false,
      request: (attempt) =>
        ({
          stepKey: key,
          round,
          shots: shots.map((shot) => packetShot(shot)),
          locker: locker.map((item) => ({ id: item.id, title: item.title, snippet: item.snippet })),
          ...attemptFields(attempt),
        }) satisfies FactCheckRequest,
    }),
  );
  const checks = mergeFactChecks(shots, taken.value.checks, new Set(locker.map((item) => item.id))).map((check) =>
    shotFactCheckSchema.parse(check),
  );
  push(ctx, {
    type: "factcheck.completed",
    stepKey: key,
    fighter: slot,
    round,
    checks,
    callIds: [taken.callId],
  });
}

function ensureJudge(ctx: Ctx, round: RoundNumber, order: JudgeOrder): RoundJudgment {
  const key = stepKey.judge(round, order);
  const existing = find(ctx, key);
  if (existing) {
    if (existing.type !== "judge.completed") throw new OrchestratorError("bad_log", `${key} is not a judge event`);
    return existing.judgment;
  }
  const prior = successfulCall(ctx, key);
  if (prior) {
    const judgment = roundJudgmentSchema.parse(prior.response);
    if (judgment.injectionSuspected) warn(ctx, "injection", key, "judge flagged injectionSuspected");
    push(ctx, { type: "judge.completed", stepKey: key, round, order, judgment, callId: prior.id });
    return judgment;
  }
  const fighter1 = order === "random" ? randomFighter1(ctx.input.matchSeed, key) : order === "BA" ? "B" : "A";
  const taken = unwrap(
    key,
    takeOutput(ctx, {
      stepKey: key,
      role: "judge",
      schema: roundJudgmentSchema,
      volley: false,
      request: (attempt) => judgeRequest(ctx, { stepKey: key, round, order, fighter1, ...attemptFields(attempt) }),
    }),
  );
  if (taken.value.injectionSuspected) {
    warn(ctx, "injection", key, "judge flagged injectionSuspected");
  }
  push(ctx, {
    type: "judge.completed",
    stepKey: key,
    round,
    order,
    judgment: taken.value,
    callId: taken.callId,
  });
  return taken.value;
}

function ensureRound(ctx: Ctx, round: RoundNumber): void {
  const key = stepKey.roundResolved(round);
  if (find(ctx, key)) return;
  const shots = {
    A: [...volleyShots(ctx, round, 1, "A"), ...volleyShots(ctx, round, 2, "A")],
    B: [...volleyShots(ctx, round, 1, "B"), ...volleyShots(ctx, round, 2, "B")],
  };
  const factChecks = (["A", "B"] as const).flatMap((slot) =>
    ([1, 2] as const).flatMap((volley) => factChecksOf(ctx, round, volley, slot)),
  );
  const ab = judgeCall(ctx, round, "AB");
  const ba = judgeCall(ctx, round, "BA");
  let resolution: RoundResolution;
  try {
    resolution = resolveRound({ round, rubric: ctx.input.rubric, ab, ba, shots, factChecks });
  } catch (error) {
    if (!(error instanceof EngineError) || error.code !== "unstable_needs_extra") {
      throw new StepFailed(key, error instanceof Error ? error.message : "round resolve failed", 1);
    }
    ensureJudge(ctx, round, "random");
    const extra = judgeCall(ctx, round, "random");
    try {
      resolution = resolveRound({ round, rubric: ctx.input.rubric, ab, ba, extra, shots, factChecks });
    } catch (again) {
      throw new StepFailed(key, again instanceof Error ? again.message : "round resolve failed", 1);
    }
  }
  push(ctx, { type: "round.resolved", stepKey: key, resolution });
}

function ensureMatch(ctx: Ctx): void {
  if (!find(ctx, stepKey.matchResolved)) {
    const rounds = ROUNDS.map((round) => roundResolution(ctx, round));
    let sudden: SuddenDeathBundle | null = null;
    let resolved;
    try {
      resolved = resolveMatch({ rubric: ctx.input.rubric, rounds });
    } catch (error) {
      if (!(error instanceof EngineError) || error.code !== "tiebreak_required") {
        throw new StepFailed(stepKey.matchResolved, error instanceof Error ? error.message : "match resolve failed", 1);
      }
      sudden = runSuddenDeath(ctx);
      try {
        resolved = resolveMatch({ rubric: ctx.input.rubric, rounds, tiebreak: sudden.tiebreak });
      } catch (again) {
        throw new StepFailed(stepKey.matchResolved, again instanceof Error ? again.message : "match resolve failed", 1);
      }
    }
    push(ctx, { type: "match.resolved", stepKey: stepKey.matchResolved, resolution: resolved.resolution });
    if (sudden) writeSuddenDeath(ctx, sudden);
    writeTiebreaks(ctx, resolved.resolution);
    return;
  }
  const resolution = resolutionOf(ctx);
  if (resolution?.outcome === "SUDDEN_DEATH" && !find(ctx, stepKey.suddenDeath)) {
    writeSuddenDeath(ctx, runSuddenDeath(ctx));
  }
  if (resolution) writeTiebreaks(ctx, resolution);
}

function noteEmpty(ctx: Ctx, key: string, reason: "refusal" | "moderation"): void {
  if (reason === "moderation") {
    warn(ctx, "moderation", key, "second moderation hit replaced the volley");
    return;
  }
  warn(ctx, "refusal", key, "second refusal became an empty volley");
}

function ensureReport(ctx: Ctx): void {
  const key = stepKey.report;
  if (find(ctx, key)) return;
  const resolution = resolutionOf(ctx);
  if (!resolution) throw new StepFailed(key, "report ran before the match resolved", 0);
  const prior = successfulCall(ctx, key);
  if (prior) {
    push(ctx, {
      type: "report.completed",
      stepKey: key,
      report: fightReportSchema.parse(prior.response),
      callId: prior.id,
    });
    return;
  }
  const winnerName = ctx.fighters[resolution.winner].name;
  const loserName = ctx.fighters[other(resolution.winner)].name;
  const taken = unwrap(
    key,
    takeOutput(ctx, {
      stepKey: key,
      role: "utility",
      schema: fightReportSchema,
      volley: false,
      request: (attempt) =>
        ({
          stepKey: key,
          names: { winner: winnerName, loser: loserName },
          briefs: { A: ctx.fighters.A.brief, B: ctx.fighters.B.brief },
          winner: resolution.winner,
          outcome: resolution.outcome,
          decidedBy: resolution.decidedBy,
          delta: resolution.delta,
          ...attemptFields(attempt),
        }) satisfies ReportRequest,
    }),
  );
  push(ctx, { type: "report.completed", stepKey: key, report: taken.value, callId: taken.callId });
}

function seal(ctx: Ctx): ReturnType<typeof direct> {
  let script;
  try {
    script = direct(
      {
        matchId: ctx.input.matchId,
        events: ctx.events,
        fighters: publicFighters(ctx.fighters),
        rubric: ctx.input.rubric,
      },
      DIRECTOR_VERSION,
      ctx.input.matchSeed,
    );
  } catch (error) {
    throw new StepFailed(stepKey.seal, error instanceof Error ? error.message : "director failed", 1);
  }
  if (!find(ctx, stepKey.seal)) {
    push(ctx, { type: "match.sealed", stepKey: stepKey.seal, directorVersion: DIRECTOR_VERSION });
  }
  return script;
}

function runSuddenDeath(ctx: Ctx): SuddenDeathBundle {
  const closings = {
    A: ensureClosing(ctx, "A"),
    B: ensureClosing(ctx, "B"),
  };
  const votes: SuddenDeathVote[] = [];
  const callIds: string[] = [closingCallId(ctx, "A"), closingCallId(ctx, "B")];
  const mapped: NonNullable<TiebreakInput["suddenDeathVotes"]>[number][] = [];
  for (const sample of SD_SAMPLES) {
    const key = stepKey.sdJudge(sample.order, sample.sample);
    const existing = successfulCall(ctx, key);
    let vote: SuddenDeathVote;
    let callId: string;
    if (existing) {
      vote = suddenDeathVoteSchema.parse(existing.response);
      callId = existing.id;
    } else {
      const taken = unwrap(
        key,
        takeOutput(ctx, {
          stepKey: key,
          role: "judge",
          schema: suddenDeathVoteSchema,
          volley: false,
          request: (attempt) => suddenDeathRequest(ctx, sample.order, sample.sample, key, attempt),
        }),
      );
      vote = taken.value;
      callId = taken.callId;
    }
    votes.push(vote);
    callIds.push(callId);
    mapped.push({
      order: sample.order,
      winner: mapJudgeLabel(vote.winner, sample.order),
      callId,
    });
  }
  return {
    closings,
    votes,
    callIds,
    tiebreak: {
      strategies: ctx.input.build.tiebreakers,
      disabled: ctx.input.build.disabledTiebreakers,
      suddenDeathVotes: mapped,
      weighinTotals: { A: ctx.fighters.A.weighinTotal, B: ctx.fighters.B.weighinTotal },
      seeds: { A: ctx.fighters.A.seed, B: ctx.fighters.B.seed },
      weighinGap: ctx.input.rubric.thresholds.weighinTiebreakGap,
    },
  };
}

function ensureClosing(ctx: Ctx, slot: Slot): Volley {
  const key = stepKey.closing(slot);
  const existing = volleyEvent(ctx, key);
  if (existing) return existing.volley;
  const created = createVolley(ctx, {
    stepKey: key,
    scope: closingScope(slot),
    round: "sudden_death",
    kind: "closing",
    slot,
    volley: "closing",
  });
  return storeVolley(ctx, {
    stepKey: key,
    round: "sudden_death",
    kind: "closing",
    slot,
    shots: created.shots,
    truncated: created.truncated,
    refused: created.refused,
    callId: created.callId,
  });
}

function createVolley(
  ctx: Ctx,
  spec: {
    stepKey: string;
    scope: string;
    round: RoundNumber | "sudden_death";
    kind: VolleyKind;
    slot: Slot;
    volley: 1 | 2 | "closing";
  },
): FreshVolley {
  const terminal = priorTerminal(ctx, spec.stepKey);
  if (terminal) {
    noteEmpty(ctx, spec.stepKey, terminal);
    const last = ctx.calls.filter((call) => call.stepKey === spec.stepKey).at(-1);
    return { shots: [], truncated: false, refused: terminal === "refusal", callId: last?.id ?? spec.stepKey };
  }
  const prior = successfulCall(ctx, spec.stepKey);
  if (prior) {
    const output = volleyModelOutputSchema.parse(prior.response);
    const prepared = acceptShots(ctx, spec.stepKey, spec.scope, spec.kind, output.shots);
    return { ...prepared, refused: false, callId: prior.id };
  }
  const taken = takeOutput(ctx, {
    stepKey: spec.stepKey,
    role: "fighter",
    schema: volleyModelOutputSchema,
    volley: true,
    request: (attempt) => volleyRequest(ctx, spec, attempt),
  });
  if ("empty" in taken) {
    noteEmpty(ctx, spec.stepKey, taken.empty);
    return { shots: [], truncated: false, refused: taken.empty === "refusal", callId: taken.callId };
  }
  const prepared = acceptShots(ctx, spec.stepKey, spec.scope, spec.kind, taken.value.shots);
  return { ...prepared, refused: false, callId: taken.callId };
}

function acceptShots(
  ctx: Ctx,
  key: string,
  scope: string,
  kind: VolleyKind,
  shots: Parameters<typeof prepareModelShots>[0]["shots"],
): { shots: Shot[]; truncated: boolean } {
  const prepared = prepareModelShots({ scope, kind, shots, budgets: ctx.input.build.budgets });
  for (const warning of prepared.warnings) warn(ctx, warning.code, key, warning.detail);
  if (prepared.truncated) warn(ctx, "truncated", key, `${scope} truncated to the word cap`);
  return prepared;
}

function storeVolley(
  ctx: Ctx,
  spec: {
    stepKey: string;
    round: Volley["round"];
    kind: VolleyKind;
    slot: Slot;
    shots: Shot[];
    truncated: boolean;
    refused: boolean;
    callId: string;
  },
): Volley {
  const volley: Volley = {
    matchId: ctx.input.matchId,
    round: spec.round,
    kind: spec.kind,
    fighter: spec.slot,
    shots: spec.shots,
    wordCount: volleyWordCount(spec.shots),
    truncated: spec.truncated,
    refused: spec.refused,
  };
  push(ctx, { type: "volley.submitted", stepKey: spec.stepKey, volley, callId: spec.callId });
  return volley;
}

function writeSuddenDeath(ctx: Ctx, bundle: SuddenDeathBundle): void {
  if (find(ctx, stepKey.suddenDeath)) return;
  push(ctx, {
    type: "suddendeath.completed",
    stepKey: stepKey.suddenDeath,
    closings: bundle.closings,
    votes: bundle.votes,
    callIds: bundle.callIds,
  });
}

function writeTiebreaks(ctx: Ctx, resolution: MatchResolution): void {
  for (const record of resolution.tiebreak ?? []) {
    const key = stepKey.tiebreak(record.strategy);
    if (find(ctx, key)) continue;
    push(ctx, { type: "tiebreak.applied", stepKey: key, record });
  }
}

function unwrap<T>(
  step: string,
  result: { value: T; callId: string } | { empty: "refusal" | "moderation"; callId: string },
): { value: T; callId: string } {
  if ("value" in result) return result;
  throw new StepFailed(step, "structured step returned no output", 0);
}

function takeOutput<S extends z.ZodType>(
  ctx: Ctx,
  options: {
    stepKey: string;
    role: LlmCall["role"];
    schema: S;
    volley: boolean;
    request: (attempt: AttemptContext) => unknown;
  },
): { value: z.infer<S>; callId: string } | { empty: "refusal" | "moderation"; callId: string } {
  let schemaFailures = 0;
  let refusals = 0;
  let flags = 0;
  let transports = 0;
  let previousError: string | undefined;
  let reminder: string | undefined;
  let moderationRegenerate = false;
  let produced = 0;

  while (produced < ATTEMPT_CAP) {
    produced += 1;
    const attempt = ctx.calls.filter((call) => call.stepKey === options.stepKey).length + 1;
    let fixture;
    try {
      fixture = ctx.player.next(options.stepKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : "fixture failed";
      throw new StepFailed(options.stepKey, message, attempt - 1);
    }
    const request = options.request({ previousError, reminder, moderationRegenerate });
    const base = {
      id: `${ctx.input.matchId}/${options.stepKey}/${attempt}`,
      stepKey: options.stepKey,
      role: options.role,
      model: modelFor(ctx, options.role),
      attempt,
      retry: attempt > 1,
      request,
    };

    if (fixture.kind === "transport") {
      transports += 1;
      record(ctx, { ...base, ok: false, response: null, error: fixture.error });
      if (transports >= TRANSPORT_LIMIT) throw new StepFailed(options.stepKey, fixture.error, attempt);
      continue;
    }

    if (fixture.kind === "refusal") {
      if (!options.volley) {
        schemaFailures += 1;
        record(ctx, { ...base, ok: false, response: { refusal: true }, error: "refusal" });
        if (schemaFailures >= SCHEMA_LIMIT) throw new StepFailed(options.stepKey, "refusal", attempt);
        previousError = "refusal";
        continue;
      }
      refusals += 1;
      const call = record(ctx, { ...base, ok: false, response: { refusal: true }, error: "refusal" });
      if (refusals >= REFUSAL_LIMIT) return { empty: "refusal", callId: call.id };
      reminder = REMINDER;
      continue;
    }

    const parsed = options.schema.safeParse(nullsToUndefined(fixture.output));
    if (!parsed.success) {
      schemaFailures += 1;
      const message = issueMessage(parsed.error);
      record(ctx, { ...base, ok: false, response: fixture.output, error: message });
      if (schemaFailures >= SCHEMA_LIMIT) throw new StepFailed(options.stepKey, message, attempt);
      previousError = message;
      reminder = undefined;
      continue;
    }

    if (options.volley && fixture.moderation === "flag") {
      flags += 1;
      const call = record(ctx, { ...base, ok: false, response: parsed.data, error: "moderation" });
      if (flags >= MODERATION_LIMIT) return { empty: "moderation", callId: call.id };
      moderationRegenerate = true;
      previousError = undefined;
      continue;
    }

    const call = record(ctx, { ...base, ok: true, response: parsed.data });
    return { value: parsed.data as z.infer<S>, callId: call.id };
  }

  throw new StepFailed(options.stepKey, "attempt cap", produced);
}

function volleyRequest(
  ctx: Ctx,
  spec: {
    stepKey: string;
    round: RoundNumber | "sudden_death";
    kind: VolleyKind;
    slot: Slot;
    volley: 1 | 2 | "closing";
  },
  attempt: AttemptContext,
): VolleyRequest {
  const opponent = other(spec.slot);
  const self = ctx.fighters[spec.slot];
  const otherFighter = ctx.fighters[opponent];
  const request: VolleyRequest = {
    stepKey: spec.stepKey,
    round: spec.round,
    kind: spec.kind,
    brief: self.brief,
    dossierSummary: self.dossierSummary,
    opponentBrief: otherFighter.brief,
    opponentDossierSummary: otherFighter.dossierSummary,
    evidence: fighterEvidence(ctx, spec.slot),
    criteria: spec.round === "sudden_death" ? [] : roundCriteria(ctx.input.rubric, spec.round),
    earlierRounds: spec.round === "sudden_death" ? [] : earlierForFighter(ctx, spec.round, spec.slot),
    ...attemptFields(attempt),
  };
  if (spec.volley === 2 && spec.round !== "sudden_death") {
    request.ownVolley1 = packetFromStored(ctx, spec.round, 1, spec.slot, "Fighter 1");
    request.opponentVolley1 = packetFromStored(ctx, spec.round, 1, opponent, "Fighter 2");
  }
  return request;
}

function judgeRequest(
  ctx: Ctx,
  spec: { stepKey: string; round: RoundNumber; order: JudgeOrder; fighter1: Slot; previousError?: string },
): JudgeRequest {
  const fighter2 = other(spec.fighter1);
  return {
    stepKey: spec.stepKey,
    round: spec.round,
    order: spec.order,
    criteria: roundCriteria(ctx.input.rubric, spec.round),
    fighter1: fighterView(ctx, spec.fighter1, spec.round, "Fighter 1"),
    fighter2: fighterView(ctx, fighter2, spec.round, "Fighter 2"),
    evidence: judgeEvidence(ctx, spec.fighter1),
    earlierRounds: earlierForJudge(ctx, spec.round, spec.fighter1),
    ...(spec.previousError ? { previousError: spec.previousError } : {}),
  };
}

function suddenDeathRequest(
  ctx: Ctx,
  order: "AB" | "BA",
  sample: 1 | 2,
  key: string,
  attempt: AttemptContext,
): SuddenDeathRequest {
  const fighter1: Slot = order === "AB" ? "A" : "B";
  const fighter2 = other(fighter1);
  const closing = (slot: Slot, label: "Fighter 1" | "Fighter 2"): PacketVolley => {
    const event = volleyEvent(ctx, stepKey.closing(slot));
    if (!event) return { kind: "closing", note: `${label} made no argument this volley.` };
    return packetVolley(event.volley, label, []);
  };
  return {
    stepKey: key,
    order,
    sample,
    fighter1: {
      brief: ctx.fighters[fighter1].brief,
      dossierSummary: ctx.fighters[fighter1].dossierSummary,
      closing: closing(fighter1, "Fighter 1"),
    },
    fighter2: {
      brief: ctx.fighters[fighter2].brief,
      dossierSummary: ctx.fighters[fighter2].dossierSummary,
      closing: closing(fighter2, "Fighter 2"),
    },
    transcript: ROUNDS.map((round) => ({
      round,
      fighter1: roundVolleys(ctx, round, fighter1, "Fighter 1"),
      fighter2: roundVolleys(ctx, round, fighter2, "Fighter 2"),
    })),
    ...attemptFields(attempt),
  };
}

function fighterView(
  ctx: Ctx,
  slot: Slot,
  round: RoundNumber,
  label: "Fighter 1" | "Fighter 2",
): JudgeRequest["fighter1"] {
  return {
    brief: ctx.fighters[slot].brief,
    dossierSummary: ctx.fighters[slot].dossierSummary,
    volleys: roundVolleys(ctx, round, slot, label),
  };
}

function roundVolleys(ctx: Ctx, round: RoundNumber, slot: Slot, label: "Fighter 1" | "Fighter 2"): PacketVolley[] {
  return ([1, 2] as const).map((volley) => packetFromStored(ctx, round, volley, slot, label));
}

function packetFromStored(
  ctx: Ctx,
  round: RoundNumber,
  volley: 1 | 2,
  slot: Slot,
  label: "Fighter 1" | "Fighter 2",
): PacketVolley {
  const event = volleyEvent(ctx, stepKey.volley(round, volley, slot));
  if (!event) return { kind: volley === 1 ? "pitch_strike" : "counter", note: `${label} made no argument this volley.` };
  return packetVolley(event.volley, label, factChecksOf(ctx, round, volley, slot));
}

function earlierForFighter(ctx: Ctx, round: RoundNumber, slot: Slot): VolleyRequest["earlierRounds"] {
  const out: VolleyRequest["earlierRounds"] = [];
  for (const previous of ROUNDS) {
    if (previous >= round) break;
    out.push({
      round: previous,
      self: roundVolleys(ctx, previous, slot, "Fighter 1"),
      opponent: roundVolleys(ctx, previous, other(slot), "Fighter 2"),
    });
  }
  return out;
}

function earlierForJudge(ctx: Ctx, round: RoundNumber, fighter1: Slot): JudgeRequest["earlierRounds"] {
  const out: JudgeRequest["earlierRounds"] = [];
  for (const previous of ROUNDS) {
    if (previous >= round) break;
    out.push({
      round: previous,
      fighter1: roundVolleys(ctx, previous, fighter1, "Fighter 1"),
      fighter2: roundVolleys(ctx, previous, other(fighter1), "Fighter 2"),
    });
  }
  return out;
}

function fighterEvidence(ctx: Ctx, slot: Slot): VolleyRequest["evidence"] {
  const self = ctx.fighters[slot];
  const opponent = ctx.fighters[other(slot)];
  const items: VolleyRequest["evidence"] = [];
  for (const item of evidenceLocker(ctx)) {
    if (item.foundBy.kind === "scouting" && item.foundBy.fighter !== slot) continue;
    const side = evidenceSide(item, self.ideaId, opponent.ideaId, slot);
    if (!side) continue;
    items.push({ id: item.id, title: item.title, snippet: item.snippet, side });
  }
  return items;
}

function judgeEvidence(ctx: Ctx, fighter1: Slot): JudgeRequest["evidence"] {
  const first = ctx.fighters[fighter1];
  const second = ctx.fighters[other(fighter1)];
  const items: JudgeRequest["evidence"] = [];
  for (const item of evidenceLocker(ctx)) {
    const side = evidenceSide(item, first.ideaId, second.ideaId, fighter1);
    if (!side) continue;
    items.push({
      id: item.id,
      title: item.title,
      snippet: item.snippet,
      side: side === "self" ? "fighter_1" : "fighter_2",
    });
  }
  return items;
}

function evidenceLocker(ctx: Ctx): EvidenceItem[] {
  const scouted = ctx.events.flatMap((event) => (event.type === "scouting.completed" ? event.evidence : []));
  return [...ctx.input.dossierEvidence, ...scouted];
}

function judgeCall(ctx: Ctx, round: RoundNumber, order: JudgeOrder): { order: JudgeOrder; callId: string; judgment: RoundJudgment; fighter1?: Slot } {
  const event = find(ctx, stepKey.judge(round, order));
  if (!event || event.type !== "judge.completed") {
    throw new StepFailed(stepKey.judge(round, order), "judge call missing", 0);
  }
  const fighter1 = order === "random" ? randomFighter1(ctx.input.matchSeed, event.stepKey) : undefined;
  return {
    order,
    callId: event.callId,
    judgment: event.judgment,
    ...(fighter1 ? { fighter1 } : {}),
  };
}

function factChecksOf(ctx: Ctx, round: RoundNumber, volley: 1 | 2, slot: Slot): ShotFactCheck[] {
  const event = find(ctx, stepKey.factcheck(round, volley, slot));
  if (!event || event.type !== "factcheck.completed") return [];
  return event.checks;
}

function roundResolution(ctx: Ctx, round: RoundNumber): RoundResolution {
  const event = find(ctx, stepKey.roundResolved(round));
  if (!event || event.type !== "round.resolved") {
    throw new StepFailed(stepKey.roundResolved(round), "round resolution missing", 0);
  }
  return event.resolution;
}

function volleyShots(ctx: Ctx, round: RoundNumber, volley: 1 | 2, slot: Slot): Shot[] {
  return volleyEvent(ctx, stepKey.volley(round, volley, slot))?.volley.shots ?? [];
}

function volleyEvent(ctx: Ctx, key: string): Extract<MatchEvent, { type: "volley.submitted" }> | undefined {
  const event = find(ctx, key);
  if (!event) return undefined;
  if (event.type !== "volley.submitted") throw new OrchestratorError("bad_log", `${key} is not a volley`);
  return event;
}

function closingCallId(ctx: Ctx, slot: Slot): string {
  return volleyEvent(ctx, stepKey.closing(slot))?.callId ?? stepKey.closing(slot);
}

function resolutionOf(ctx: Ctx): MatchResolution | null {
  const found = ctx.events.filter((event) => event.type === "match.resolved").at(-1);
  if (!found || found.type !== "match.resolved") return null;
  return found.resolution;
}

function successfulCall(ctx: Ctx, key: string): LlmCall | undefined {
  return ctx.calls.filter((call) => call.stepKey === key && call.ok).at(-1);
}

function priorTerminal(ctx: Ctx, key: string): "refusal" | "moderation" | null {
  const related = ctx.calls.filter((call) => call.stepKey === key);
  if (related.filter((call) => call.error === "refusal").length >= REFUSAL_LIMIT) return "refusal";
  if (related.filter((call) => call.error === "moderation").length >= MODERATION_LIMIT) return "moderation";
  return null;
}

function modelFor(ctx: Ctx, role: LlmCall["role"]): string {
  if (role === "judge") return ctx.input.build.models.judge;
  if (role === "utility") return ctx.input.build.models.utility;
  return ctx.input.build.models.fighter;
}

function attemptFields(attempt: AttemptContext): AttemptContext {
  return {
    ...(attempt.previousError ? { previousError: attempt.previousError } : {}),
    ...(attempt.reminder ? { reminder: attempt.reminder } : {}),
    ...(attempt.moderationRegenerate ? { moderationRegenerate: true } : {}),
  };
}

function record(ctx: Ctx, call: Omit<LlmCall, "matchId" | "latencyMs" | "tokensIn" | "tokensOut" | "costUsd">): LlmCall {
  const parsed = llmCallSchema.parse({
    ...call,
    matchId: ctx.input.matchId,
    latencyMs: 0,
    tokensIn: 0,
    tokensOut: 0,
    costUsd: 0,
  });
  ctx.calls.push(parsed);
  return parsed;
}

function push(ctx: Ctx, body: Record<string, unknown>): MatchEvent {
  const seq = ctx.events.reduce((max, event) => Math.max(max, event.seq), 0) + 1;
  const parsed = matchEventSchema.parse({
    ...body,
    matchId: ctx.input.matchId,
    at: ctx.input.at,
    seq,
  });
  ctx.events.push(parsed);
  return parsed;
}

function find(ctx: Ctx, key: string): MatchEvent | undefined {
  return ctx.events.find((event) => event.stepKey === key);
}

function warn(ctx: Ctx, code: VolleyWarning["code"] | string, stepKeyValue: string, detail: string): void {
  ctx.warnings.push({ code, stepKey: stepKeyValue, detail });
}

function finish(ctx: Ctx, status: MatchRun["status"], script: MatchRun["script"]): MatchRun {
  const lock = ctx.events.find((event) => event.type === "match.locked");
  return {
    matchId: ctx.input.matchId,
    status,
    events: ctx.events,
    calls: ctx.calls,
    warnings: ctx.warnings,
    cleanLog: ctx.cleanLog,
    script,
    resolution: resolutionOf(ctx),
    buildHash: ctx.hashed,
    rubric: ctx.input.rubric,
    fighters: publicFighters(ctx.fighters),
    corners: lock && lock.type === "match.locked" ? lock.corners : null,
    fixtureReads: ctx.player.reads,
  };
}

function publicFighters(fighters: Record<Slot, FighterInput>): Record<Slot, PublicFighter> {
  const show = (fighter: FighterInput): PublicFighter => ({
    name: fighter.name,
    seed: fighter.seed,
    tier: fighter.tier,
    spriteSeed: fighter.spriteSeed,
  });
  return { A: show(fighters.A), B: show(fighters.B) };
}

function other(slot: Slot): Slot {
  return slot === "A" ? "B" : "A";
}

function issueMessage(error: { issues: readonly { path: PropertyKey[]; message: string }[] }): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.map(String).join(".")}: ` : "";
      return `${path}${issue.message}`;
    })
    .join("; ");
}

function validateInput(input: RunMatchInput, hashed: string): MatchEvent[] {
  if (!computeAllowed(input.status)) {
    const betting = input.status === "scheduled" || input.status === "betting_open";
    throw new OrchestratorError(
      betting ? "bets_open" : "compute_blocked",
      betting ? "bets must lock before compute" : `match status ${input.status} cannot compute`,
    );
  }
  if (!isoDateTimeSchema.safeParse(input.at).success) {
    throw new OrchestratorError("bad_clock", "at must be an ISO timestamp supplied by the caller");
  }
  if (input.matchId.length === 0 || input.matchSeed.length === 0) {
    throw new OrchestratorError("bad_input", "matchId and matchSeed are required");
  }
  for (const slot of ["A", "B"] as const) {
    const parsed = standardBriefSchema.safeParse(input.fighters[slot].brief);
    if (!parsed.success) throw new OrchestratorError("bad_brief", `${slot} brief is invalid`);
  }
  for (const item of input.dossierEvidence) {
    const parsed = evidenceItemSchema.safeParse(item);
    if (!parsed.success) throw new OrchestratorError("bad_evidence", "dossier evidence is invalid");
  }

  const events = (input.prior?.events ?? []).map((event) => matchEventSchema.parse(event));
  const seen = new Set<string>();
  for (const event of events) {
    if (event.matchId !== input.matchId) {
      throw new OrchestratorError("match_id", `prior event ${event.stepKey} belongs to ${event.matchId}`);
    }
    if (seen.has(event.stepKey)) throw new OrchestratorError("duplicate_step", event.stepKey);
    seen.add(event.stepKey);
  }
  const lock = events.find((event) => event.type === "match.locked");
  if (lock && lock.type === "match.locked") {
    if (lock.matchSeed !== input.matchSeed) {
      throw new OrchestratorError("seed_mismatch", "match seed is fixed at lock");
    }
    if (lock.buildHash !== hashed) {
      throw new OrchestratorError("build_mismatch", "build hash is fixed at lock");
    }
  }
  const started = events.length > 0;
  if (!started && input.budget && input.budget.remainingUsd < 3 * input.budget.medianMatchUsd) {
    throw new OrchestratorError("budget", "remaining budget is below 3x the median match cost");
  }
  return events;
}
