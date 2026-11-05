import {
  ROUND_NAME_BY_NUMBER,
  WEAPON_BY_CRITERION,
  broadcastScriptSchema,
  type BroadcastScript,
  type CriterionId,
  type CriterionResult,
  type Cue,
  type MatchEvent,
  type MatchResolution,
  type RoundNumber,
  type RoundResolution,
  type Rubric,
  type Shot,
  type ShotFactCheck,
  type ShotVerdict,
  type Slot,
  type Volley,
} from "@sf-fight-club/schemas";

import { EngineError } from "./errors.js";
import { largestRemainder } from "./hp.js";
import { planBackfires } from "./scoring.js";
import { distributeDamage, type CarrierShot } from "./shots.js";

/** Bump this when cue timing or ordering changes. Results do not. */
export const DIRECTOR_VERSION = "1";

const HOLD = {
  intro: 2000,
  title: 1500,
  shot: 2200,
  hammer: 2200,
  scorecard: 4000,
  outcome: 2000,
  suddenDeath: 4000,
  finisher: 2000,
  winner: 2500,
} as const;

export interface DirectorFighter {
  name: string;
  seed: number;
  tier: string;
  spriteSeed: string;
}

/**
 * Everything `direct` needs. Fighter names are presentation, not part of the
 * match event union. The winner is read from `match.resolved` and nowhere else.
 */
export interface ComputeLog {
  matchId: string;
  events: readonly MatchEvent[];
  fighters: Record<Slot, DirectorFighter>;
  rubric: Rubric;
}

interface Draft {
  id: string;
  hurt: Slot | null;
  floatHp: number;
  damage: number;
  criterion?: CriterionId;
  countsAsCriterionHp: boolean;
  hold: number;
  create: (ctx: { damage: number; hpAfter: { A: number; B: number }; t: number }) => Cue;
}

/**
 * Pure director. `script = direct(computeLog, directorVersion, presentationSeed)`.
 * Version 1 timing is the caption clock, so the presentation seed does not move
 * cues. Replays with the same log and version return the same script.
 * Animation never picks the winner: the winner cue copies `match.resolved`.
 *
 * Volleys are assumed cleaned (see `cleanRoundShots`). Out-of-round shots and
 * broken defenses are rewritten before they are stored on the log.
 */
export function direct(log: ComputeLog, directorVersion: string, presentationSeed: string): BroadcastScript {
  if (directorVersion !== DIRECTOR_VERSION) {
    throw new EngineError(
      "director_version",
      `director ${directorVersion} is not implemented; this build directs version ${DIRECTOR_VERSION}`,
    );
  }
  if (presentationSeed.length === 0) {
    throw new EngineError("presentation_seed", "presentation seed is required so a replay can pass the same seed");
  }

  const resolution = matchResolution(log);
  if (resolution.outcome === "BYE" || resolution.outcome === "WALKOVER") {
    throw new EngineError("not_a_fight", "byes and walkovers are bracket results and have no broadcast script");
  }
  const rounds = roundResolutions(log);
  const lock = lockEvent(log);
  const volleys = indexVolleys(log.events);
  const checks = indexChecks(log.events);
  const lambda = resolution.lambda;
  const backfire = planBackfires(rounds, log.rubric.thresholds.backfirePenalty, log.rubric.thresholds.backfireCap);

  const roundDrafts = rounds.map((round) =>
    roundDraftsFor({
      round,
      volleys,
      checks,
      lambda,
      backfireHits: backfire.hits.filter((hit) => hit.round === round.round),
    }),
  );
  assignIntegers(roundDrafts, resolution.hpAfterRound);

  const cues: Cue[] = [];
  let t = 0;
  const hp = { A: 100, B: 100 };
  const seen = new Set<string>();

  const push = (draft: Draft) => {
    if (seen.has(draft.id)) throw new EngineError("duplicate_cue", `duplicate cue id ${draft.id}`);
    seen.add(draft.id);
    if (draft.hurt && draft.damage !== 0) {
      hp[draft.hurt] -= draft.damage;
    }
    cues.push(draft.create({ damage: draft.damage, hpAfter: { A: hp.A, B: hp.B }, t }));
    t += draft.hold;
  };

  push(introDraft(log, lock.corners));
  for (const round of roundDrafts) {
    push(titleDraft(round.resolution, log.rubric));
    for (const draft of round.drafts) push(draft);
    const target = resolution.hpAfterRound;
    const index = round.resolution.round - 1;
    if (hp.A !== target.A[index] || hp.B !== target.B[index]) {
      throw new EngineError(
        "hp_drift",
        `round ${round.resolution.round} display HP is ${hp.A}-${hp.B}, log says ${target.A[index]}-${target.B[index]}`,
      );
    }
    push(scorecardDraft(round.resolution, round.drafts));
  }

  push(outcomeDraft(resolution));
  if (resolution.outcome === "SUDDEN_DEATH") {
    push(suddenDeathDraft(log, resolution));
  }
  const loser: Slot = resolution.winner === "A" ? "B" : "A";
  push({
    id: "finisher",
    hurt: null,
    floatHp: 0,
    damage: 0,
    countsAsCriterionHp: false,
    hold: HOLD.finisher,
    create: ({ t: at }) => ({
      kind: "finisher",
      id: "finisher",
      t: at,
      winner: resolution.winner,
      loser,
      style: resolution.outcome === "DECISION" ? "decision" : "ko",
    }),
  });
  push({
    id: "winner",
    hurt: null,
    floatHp: 0,
    damage: 0,
    countsAsCriterionHp: false,
    hold: HOLD.winner,
    create: ({ t: at }) => ({
      kind: "winner",
      id: "winner",
      t: at,
      winner: resolution.winner,
      decidedBy: resolution.decidedBy,
    }),
  });

  const script = {
    matchId: log.matchId,
    directorVersion,
    durationMs: t,
    cues,
  };
  const parsed = broadcastScriptSchema.safeParse(script);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ");
    throw new EngineError("bad_script", message);
  }
  return parsed.data;
}

function roundDraftsFor(input: {
  round: RoundResolution;
  volleys: Map<string, Volley>;
  checks: Map<string, ShotFactCheck[]>;
  lambda: number;
  backfireHits: { fighter: Slot; shotId: string; points: number }[];
}): { resolution: RoundResolution; drafts: Draft[] } {
  const round = input.round.round;
  const volley1 = interleave(
    offensiveShots(input.volleys, round, "pitch_strike", "A"),
    offensiveShots(input.volleys, round, "pitch_strike", "B"),
  );
  const volley2 = interleave(
    offensiveShots(input.volleys, round, "counter", "A"),
    offensiveShots(input.volleys, round, "counter", "B"),
  );
  const defenses = [
    ...defensesFrom(input.volleys, round, "A"),
    ...defensesFrom(input.volleys, round, "B"),
  ];
  const verdicts = new Map(input.round.shotVerdicts.map((verdict) => [verdict.shotId, verdict]));
  const checks = [...(input.checks.get(`${round}:A`) ?? []), ...(input.checks.get(`${round}:B`) ?? [])];
  const fabricated = new Set<string>([...input.round.fabrications.A, ...input.round.fabrications.B]);
  for (const check of checks) {
    if (check.fabricated) fabricated.add(check.shotId);
  }

  const playableShots = [...volley1, ...volley2];
  const carriers = carrierShots(playableShots, defenses, verdicts, fabricated);
  const shareByShot = new Map<string, { hp: number; criterion: CriterionId }>();
  const drafts: Draft[] = [];

  for (const criterion of input.round.criteria) {
    for (const target of ["A", "B"] as const) {
      const points = criterion.damageTo[target];
      if (!(points > 0)) continue;
      const spread = distributeDamage({
        points,
        lambda: input.lambda,
        criterion: criterion.criterion,
        target,
        shots: carriers,
      });
      for (const share of spread.carriers) {
        shareByShot.set(share.shotId, { hp: share.hp, criterion: criterion.criterion });
      }
      if (spread.hammer !== null) {
        drafts.push(hammerDraft(round, target, criterion.criterion, spread.hammer));
      }
    }
  }

  const shotDrafts = playableShots.map((entry) =>
    shotDraft({
      entry,
      round,
      verdicts,
      defenses,
      checks,
      fabricated,
      share: shareByShot.get(entry.shot.id),
      backfire: input.backfireHits.find((hit) => hit.shotId === entry.shot.id),
      lambda: input.lambda,
    }),
  );

  const seenShots = new Set(playableShots.map((entry) => entry.shot.id));
  const missingBackfires = input.backfireHits
    .filter((hit) => !seenShots.has(hit.shotId))
    .map((hit) => missingBackfireDraft(round, hit, input.lambda));

  const ordered = placeDrafts(shotDrafts, drafts, missingBackfires);
  return { resolution: input.round, drafts: ordered };
}

function placeDrafts(shots: Draft[], hammers: Draft[], missing: Draft[]): Draft[] {
  return [...shots, ...missing, ...hammers];
}

function shotDraft(input: {
  entry: { shot: Shot; shooter: Slot };
  round: RoundNumber;
  verdicts: Map<string, ShotVerdict>;
  defenses: { shot: Shot; shooter: Slot }[];
  checks: ShotFactCheck[];
  fabricated: Set<string>;
  share: { hp: number; criterion: CriterionId } | undefined;
  backfire: { fighter: Slot; points: number } | undefined;
  lambda: number;
}): Draft {
  const verdict = input.verdicts.get(input.entry.shot.id);
  const fabricated = input.fabricated.has(input.entry.shot.id);
  const parry = parryFor(input.entry.shot, input.defenses, input.verdicts);
  const neutralized = parry !== undefined || verdict?.verdict === "parried";
  const backfireHp = fabricated ? (input.backfire?.points ?? 0) * input.lambda : 0;
  const carrierHp = !fabricated && !neutralized ? (input.share?.hp ?? 0) : 0;
  const hurt: Slot | null = fabricated ? input.entry.shooter : carrierHp > 0 ? other(input.entry.shooter) : null;
  const floatHp = fabricated ? backfireHp : carrierHp;
  const chips = evidenceChips(input.entry.shot, input.checks, fabricated);
  const supported = chips.some((chip) => chip.status === "supported");
  return {
    id: `r${input.round}.shot.${input.entry.shot.id}`,
    hurt: floatHp > 0 ? hurt : null,
    floatHp,
    damage: 0,
    criterion: input.share?.criterion,
    countsAsCriterionHp: !fabricated && carrierHp > 0,
    hold: HOLD.shot,
    create: ({ damage, hpAfter, t }) => ({
      kind: "shot",
      id: `r${input.round}.shot.${input.entry.shot.id}`,
      t,
      shooter: input.entry.shooter,
      shotId: input.entry.shot.id,
      criterion: input.entry.shot.criterion,
      weapon: WEAPON_BY_CRITERION[input.entry.shot.criterion],
      impact: verdict?.impact ?? 0,
      outcome: shotVisual({
        fabricated,
        neutralized,
        verdict: verdict?.verdict,
        impact: verdict?.impact ?? 0,
        damage,
        supported,
      }),
      headline: input.entry.shot.headline,
      evidence: chips,
      ...(parry ? { parry } : {}),
      damage,
      hpAfter,
    }),
  };
}

function missingBackfireDraft(
  round: RoundNumber,
  hit: { fighter: Slot; shotId: string; points: number },
  lambda: number,
): Draft {
  const floatHp = hit.points * lambda;
  return {
    id: `r${round}.shot.${hit.shotId}`,
    hurt: floatHp > 0 ? hit.fighter : null,
    floatHp,
    damage: 0,
    countsAsCriterionHp: false,
    hold: HOLD.shot,
    create: ({ damage, hpAfter, t }) => ({
      kind: "shot",
      id: `r${round}.shot.${hit.shotId}`,
      t,
      shooter: hit.fighter,
      shotId: hit.shotId,
      criterion: "problem",
      weapon: "flame_lance",
      impact: 0,
      outcome: "backfire",
      headline: "Fact-checked",
      evidence: [],
      damage,
      hpAfter,
    }),
  };
}

function hammerDraft(round: RoundNumber, target: Slot, criterion: CriterionId, floatHp: number): Draft {
  return {
    id: `r${round}.hammer.${criterion}.${target}`,
    hurt: target,
    floatHp,
    damage: 0,
    criterion,
    countsAsCriterionHp: true,
    hold: HOLD.hammer,
    create: ({ damage, hpAfter, t }) => ({
      kind: "hammer",
      id: `r${round}.hammer.${criterion}.${target}`,
      t,
      target,
      criterion,
      reason: `No scoring shot carried the ${criterion} gap`,
      damage,
      hpAfter,
    }),
  };
}

function titleDraft(round: RoundResolution, rubric: Rubric): Draft {
  const name = ROUND_NAME_BY_NUMBER[round.round];
  return {
    id: `r${round.round}.title`,
    hurt: null,
    floatHp: 0,
    damage: 0,
    countsAsCriterionHp: false,
    hold: HOLD.title,
    create: ({ t }) => ({
      kind: "round_title",
      id: `r${round.round}.title`,
      t,
      round: round.round,
      name,
      criteria: round.criteria.map((criterion) => ({
        id: criterion.criterion,
        weight: rubric.criteria.find((item) => item.id === criterion.criterion)?.weight ?? criterion.weight,
      })),
    }),
  };
}

function scorecardDraft(round: RoundResolution, drafts: readonly Draft[]): Draft {
  return {
    id: `r${round.round}.scorecard`,
    hurt: null,
    floatHp: 0,
    damage: 0,
    countsAsCriterionHp: false,
    hold: HOLD.scorecard,
    create: ({ t }) => ({
      kind: "scorecard",
      id: `r${round.round}.scorecard`,
      t,
      round: round.round,
      agreement: agreement(round.criteria),
      rows: round.criteria.map((criterion) => {
        const points = Math.max(criterion.damageTo.A, criterion.damageTo.B);
        const hp = drafts
          .filter((draft) => draft.countsAsCriterionHp && draft.criterion === criterion.criterion)
          .reduce((sum, draft) => sum + draft.damage, 0);
        const to = criterion.damageTo.A > 0 ? "A" : criterion.damageTo.B > 0 ? "B" : null;
        return { criterion: criterion.criterion, A: criterion.scores.A.final, B: criterion.scores.B.final, points, hp, to };
      }),
    }),
  };
}

function outcomeDraft(resolution: MatchResolution): Draft {
  return {
    id: "outcome",
    hurt: null,
    floatHp: 0,
    damage: 0,
    countsAsCriterionHp: false,
    hold: HOLD.outcome,
    create: ({ t }) => ({
      kind: "outcome",
      id: "outcome",
      t,
      outcome: resolution.outcome,
      ...(resolution.decisionType ? { decisionType: resolution.decisionType } : {}),
      perfect: resolution.perfect,
      pyrrhic: resolution.pyrrhic === true,
    }),
  };
}

function suddenDeathDraft(log: ComputeLog, resolution: MatchResolution): Draft {
  const event = log.events.filter((item) => item.type === "suddendeath.completed").at(-1);
  const tally = { A: 0, B: 0 };
  const record = resolution.tiebreak?.find((entry) => entry.strategy === "sudden_death_judge");
  if (record && record.strategy === "sudden_death_judge") {
    for (const vote of record.votes) tally[vote.winner] += 1;
  }
  const closings = {
    A: event && event.type === "suddendeath.completed" ? closingText(event.closings.A) : "",
    B: event && event.type === "suddendeath.completed" ? closingText(event.closings.B) : "",
  };
  return {
    id: "sudden-death",
    hurt: null,
    floatHp: 0,
    damage: 0,
    countsAsCriterionHp: false,
    hold: HOLD.suddenDeath,
    create: ({ t }) => ({
      kind: "sudden_death",
      id: "sudden-death",
      t,
      closings,
      tally,
    }),
  };
}

function introDraft(log: ComputeLog, corners: { left: Slot; right: Slot }): Draft {
  if (corners.left === corners.right) {
    throw new EngineError("bad_corners", "the two corners must be different slots");
  }
  const cornerOf = (slot: Slot): "left" | "right" => (corners.left === slot ? "left" : "right");
  return {
    id: "intro",
    hurt: null,
    floatHp: 0,
    damage: 0,
    countsAsCriterionHp: false,
    hold: HOLD.intro,
    create: ({ t }) => ({
      kind: "intro",
      id: "intro",
      t,
      fighters: {
        A: { ...log.fighters.A, corner: cornerOf("A") },
        B: { ...log.fighters.B, corner: cornerOf("B") },
      },
    }),
  };
}

function assignIntegers(
  roundDrafts: { resolution: RoundResolution; drafts: Draft[] }[],
  hpAfterRound: { A: [number, number, number]; B: [number, number, number] },
): void {
  for (const fighter of ["A", "B"] as const) {
    let previous = 100;
    roundDrafts.forEach((round, index) => {
      const target = hpAfterRound[fighter][index];
      if (target === undefined) throw new EngineError("bad_hp", "HP path is missing a round");
      const loss = previous - target;
      const bucket = round.drafts.filter((draft) => draft.hurt === fighter && draft.floatHp > 0);
      if (loss < 0) {
        throw new EngineError("hp_increased", `displayed HP for ${fighter} went up in round ${index + 1}`);
      }
      if (loss === 0) {
        for (const draft of bucket) draft.damage = 0;
      } else if (bucket.length === 0) {
        throw new EngineError("hp_unallocated", `round ${index + 1} ${fighter} loses ${loss} HP with no cue to carry it`);
      } else {
        const shares = largestRemainder(
          bucket.map((draft) => draft.floatHp),
          loss,
        );
        bucket.forEach((draft, shareIndex) => {
          draft.damage = shares[shareIndex] ?? 0;
        });
      }
      previous = target;
    });
  }
}

function shotVisual(input: {
  fabricated: boolean;
  neutralized: boolean;
  verdict: ShotVerdict["verdict"] | undefined;
  impact: number;
  damage: number;
  supported: boolean;
}): "hit" | "crit" | "partial" | "parried" | "glancing" | "whiff" | "backfire" {
  if (input.fabricated) return "backfire";
  if (input.neutralized || input.verdict === "parried") return "parried";
  if (input.verdict === "whiff" || input.verdict === undefined) return "whiff";
  if (input.verdict === "glancing") return "glancing";
  if (input.damage <= 0) return "glancing";
  if (input.verdict === "partial") return "partial";
  if (input.impact === 3 && input.supported) return "crit";
  return "hit";
}

function parryFor(
  attack: Shot,
  defenses: readonly { shot: Shot }[],
  verdicts: Map<string, ShotVerdict>,
): { defenseShotId: string; headline: string } | undefined {
  const attackParried = verdicts.get(attack.id)?.verdict === "parried";
  const defense = defenses.find((entry) => {
    if (entry.shot.respondsTo !== attack.id) return false;
    return attackParried || verdicts.get(entry.shot.id)?.verdict === "landed";
  });
  if (!defense) return undefined;
  return { defenseShotId: defense.shot.id, headline: defense.shot.headline };
}

function carrierShots(
  shots: readonly { shot: Shot; shooter: Slot }[],
  defenses: readonly { shot: Shot }[],
  verdicts: Map<string, ShotVerdict>,
  fabricated: Set<string>,
): CarrierShot[] {
  return shots.map((entry) => {
    const verdict = verdicts.get(entry.shot.id);
    const neutralized = verdict?.verdict === "parried" || parryFor(entry.shot, defenses, verdicts) !== undefined;
    return {
      id: entry.shot.id,
      type: entry.shot.type,
      shooter: entry.shooter,
      criterion: entry.shot.criterion,
      verdict: neutralized ? "parried" : (verdict?.verdict ?? "whiff"),
      impact: verdict?.impact ?? 0,
      fabricated: fabricated.has(entry.shot.id),
    };
  });
}

function evidenceChips(
  shot: Shot,
  checks: readonly ShotFactCheck[],
  fabricated: boolean,
): { id: string; status: "supported" | "partial" | "estimate" | "fabricated" }[] {
  const check = checks.find((item) => item.shotId === shot.id);
  return shot.evidence.map((id) => {
    if (fabricated && (check?.missingIds.includes(id) || check?.numberContradicted || check === undefined)) {
      return { id, status: "fabricated" as const };
    }
    const verdict = check?.perEvidence.find((item) => item.evidenceId === id)?.verdict;
    if (verdict === "supported") return { id, status: "supported" as const };
    if (verdict === "partial") return { id, status: "partial" as const };
    return { id, status: "estimate" as const };
  });
}

function offensiveShots(
  volleys: Map<string, Volley>,
  round: RoundNumber,
  kind: "pitch_strike" | "counter",
  fighter: Slot,
): { shot: Shot; shooter: Slot }[] {
  const volley = volleys.get(`${round}:${kind}:${fighter}`);
  return (volley?.shots ?? [])
    .filter((shot) => shot.type === "pitch" || shot.type === "attack")
    .map((shot) => ({ shot, shooter: fighter }));
}

function defensesFrom(volleys: Map<string, Volley>, round: RoundNumber, fighter: Slot): { shot: Shot; shooter: Slot }[] {
  const second = volleys.get(`${round}:counter:${fighter}`)?.shots ?? [];
  return second.filter((shot) => shot.type === "defense").map((shot) => ({ shot, shooter: fighter }));
}

function interleave<T>(left: readonly T[], right: readonly T[]): T[] {
  const out: T[] = [];
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (a !== undefined) out.push(a);
    if (b !== undefined) out.push(b);
  }
  return out;
}

function agreement(criteria: readonly CriterionResult[]): number {
  if (criteria.length === 0) return 1;
  let same = 0;
  for (const criterion of criteria) {
    const ab = Math.sign(criterion.scores.A.AB - criterion.scores.B.AB);
    const ba = Math.sign(criterion.scores.A.BA - criterion.scores.B.BA);
    if (ab === ba) same += 1;
  }
  return same / criteria.length;
}

function closingText(volley: Volley): string {
  return volley.shots.map((shot) => shot.headline).join(" ");
}

function other(slot: Slot): Slot {
  return slot === "A" ? "B" : "A";
}

function matchResolution(log: ComputeLog): MatchResolution {
  const found = log.events.filter((event) => event.type === "match.resolved").at(-1);
  if (!found || found.type !== "match.resolved") {
    throw new EngineError("missing_resolution", "the compute log has no match.resolved event");
  }
  return found.resolution;
}

function roundResolutions(log: ComputeLog): [RoundResolution, RoundResolution, RoundResolution] {
  const byRound = new Map<RoundNumber, RoundResolution>();
  for (const event of log.events) {
    if (event.type !== "round.resolved") continue;
    byRound.set(event.resolution.round, event.resolution);
  }
  const first = byRound.get(1);
  const second = byRound.get(2);
  const third = byRound.get(3);
  if (!first || !second || !third) throw new EngineError("missing_round", "the compute log is missing a round resolution");
  return [first, second, third];
}

function lockEvent(log: ComputeLog): Extract<MatchEvent, { type: "match.locked" }> {
  const found = log.events.find((event) => event.type === "match.locked");
  if (!found || found.type !== "match.locked") {
    throw new EngineError("missing_lock", "the compute log has no match.locked event");
  }
  if (found.matchId !== log.matchId) {
    throw new EngineError("match_id", "lock event match id does not match the compute log");
  }
  return found;
}

function indexVolleys(events: readonly MatchEvent[]): Map<string, Volley> {
  const map = new Map<string, { volley: Volley; seq: number }>();
  for (const event of events) {
    if (event.type !== "volley.submitted") continue;
    if (event.volley.round === "sudden_death") continue;
    const key = `${event.volley.round}:${event.volley.kind}:${event.volley.fighter}`;
    const previous = map.get(key);
    if (!previous || event.seq >= previous.seq) map.set(key, { volley: event.volley, seq: event.seq });
  }
  return new Map([...map].map(([key, value]) => [key, value.volley]));
}

function indexChecks(events: readonly MatchEvent[]): Map<string, ShotFactCheck[]> {
  const map = new Map<string, ShotFactCheck[]>();
  const ordered = events.filter((event) => event.type === "factcheck.completed").slice().sort((left, right) => left.seq - right.seq);
  for (const event of ordered) {
    if (event.type !== "factcheck.completed" || event.round === "sudden_death") continue;
    const key = `${event.round}:${event.fighter}`;
    map.set(key, [...(map.get(key) ?? []), ...event.checks]);
  }
  return map;
}
