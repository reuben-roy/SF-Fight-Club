import {
  CRITERIA_BY_ROUND,
  ROUND_OF_CRITERION,
  type CriterionId,
  type RoundNumber,
  type Shot,
  type ShotType,
  type ShotVerdictKind,
  type Slot,
} from "@sf-fight-club/schemas";

export interface CleanLogEntry {
  fighter: Slot;
  volley: 1 | 2;
  shotId: string;
  action: "drop" | "rewrite";
  reason: "out_of_round" | "missing_responds_to";
}

export interface CleanRoundResult {
  volley1: { A: Shot[]; B: Shot[] };
  volley2: { A: Shot[]; B: Shot[] };
  log: CleanLogEntry[];
}

/**
 * FE-6 and FE-10.
 *
 * The orchestrator calls this before fact-check and judging, then stores the
 * cleaned volleys. `resolveRound` scores the shots it is given, so those shots
 * are already cleaned. Out-of-round shots are dropped. A defense whose
 * `respondsTo` is missing or is not an opponent volley-1 shot becomes a pitch
 * on the same criterion.
 */
export function cleanRoundShots(input: {
  round: RoundNumber;
  volley1: { A: readonly Shot[]; B: readonly Shot[] };
  volley2: { A: readonly Shot[]; B: readonly Shot[] };
}): CleanRoundResult {
  const log: CleanLogEntry[] = [];
  const volley1 = {
    A: keepRound(input.volley1.A, input.round, "A", 1, log),
    B: keepRound(input.volley1.B, input.round, "B", 1, log),
  };
  const volley2 = {
    A: rewriteDefenses(keepRound(input.volley2.A, input.round, "A", 2, log), "A", 2, volley1.B, log),
    B: rewriteDefenses(keepRound(input.volley2.B, input.round, "B", 2, log), "B", 2, volley1.A, log),
  };
  return {
    volley1: {
      A: rewriteDefenses(volley1.A, "A", 1, volley1.B, log),
      B: rewriteDefenses(volley1.B, "B", 1, volley1.A, log),
    },
    volley2,
    log,
  };
}

/** FE-7. Cited ids that are not in the locker. Entailment (FE-8) stays with the utility model. */
export function mechanicalMissingIds(shot: { evidence: readonly string[] }, locker: ReadonlySet<string>): string[] {
  return shot.evidence.filter((id) => !locker.has(id));
}

export function shotTarget(
  shot: Pick<Shot, "type" | "respondsTo">,
): { kind: "self" } | { kind: "opponent" } | { kind: "shot"; shotId: string } | { kind: "missing" } {
  if (shot.type === "pitch") return { kind: "self" };
  if (shot.type === "attack") return { kind: "opponent" };
  if (shot.respondsTo) return { kind: "shot", shotId: shot.respondsTo };
  return { kind: "missing" };
}

export function criteriaForRound(round: RoundNumber): readonly CriterionId[] {
  return CRITERIA_BY_ROUND[round];
}

export interface CarrierShot {
  id: string;
  type: ShotType;
  shooter: Slot;
  criterion: CriterionId;
  verdict: ShotVerdictKind;
  impact: 0 | 1 | 2 | 3;
  fabricated: boolean;
}

export interface DamageShare {
  shotId: string;
  hp: number;
}

/**
 * Spread one criterion's HP across the opponent's landed or partial pitches
 * and attacks. Defenses never carry damage. An empty carrier set, or a set
 * whose weights sum to 0, becomes one judges' hammer.
 */
export function distributeDamage(input: {
  points: number;
  lambda: number;
  criterion: CriterionId;
  target: Slot;
  shots: readonly CarrierShot[];
}): { carriers: DamageShare[]; hammer: number | null } {
  const pool = input.points * input.lambda;
  if (!(pool > 0)) return { carriers: [], hammer: null };

  const opponent = input.target === "A" ? "B" : "A";
  const carriers = input.shots.filter(
    (shot) =>
      shot.criterion === input.criterion &&
      shot.shooter === opponent &&
      (shot.type === "pitch" || shot.type === "attack") &&
      (shot.verdict === "landed" || shot.verdict === "partial") &&
      !shot.fabricated,
  );
  const weights = carriers.map((shot) => shot.impact * (shot.verdict === "landed" ? 1 : 0.5));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  if (carriers.length === 0 || !(totalWeight > 0)) {
    return { carriers: [], hammer: pool };
  }
  return {
    carriers: carriers.map((shot, index) => ({
      shotId: shot.id,
      hp: pool * ((weights[index] ?? 0) / totalWeight),
    })),
    hammer: null,
  };
}

function keepRound(shots: readonly Shot[], round: RoundNumber, fighter: Slot, volley: 1 | 2, log: CleanLogEntry[]): Shot[] {
  const kept: Shot[] = [];
  for (const shot of shots) {
    if (ROUND_OF_CRITERION[shot.criterion] !== round) {
      log.push({ fighter, volley, shotId: shot.id, action: "drop", reason: "out_of_round" });
      continue;
    }
    kept.push(shot);
  }
  return kept;
}

function rewriteDefenses(
  shots: readonly Shot[],
  fighter: Slot,
  volley: 1 | 2,
  opponentVolley1: readonly Shot[],
  log: CleanLogEntry[],
): Shot[] {
  const valid = new Set(opponentVolley1.map((shot) => shot.id));
  return shots.map((shot) => {
    if (shot.type !== "defense") return shot;
    if (shot.respondsTo !== undefined && valid.has(shot.respondsTo)) return shot;
    log.push({ fighter, volley, shotId: shot.id, action: "rewrite", reason: "missing_responds_to" });
    return asPitch(shot);
  });
}

function asPitch(shot: Shot): Shot {
  const { respondsTo: _respondsTo, ...rest } = shot;
  return { ...rest, type: "pitch" };
}
