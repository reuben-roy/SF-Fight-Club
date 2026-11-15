export type CloutTier = "S" | "A" | "B" | "C";

export interface CloutInput {
  /** Sum of founder follower counts. */
  followers: number;
  /** Sum of HN karma across founders. */
  hnKarma: number;
  /** Likes plus reposts plus replies across collected posts. */
  engagement: number;
  /** Sum of HN points across collected posts. */
  hnPoints: number;
}

export interface CloutScore {
  score: number;
  tier: CloutTier;
  x: number;
  hn: number;
}

/**
 * Clout is presentation only. It never seeds, scores, or reaches a prompt.
 *
 * Each sub-score maps its raw signal through log10(1 + signal) onto 0 to 100
 * against a fixed reference, so ten times the audience adds a fixed number of
 * points instead of a multiple. The final score is a 60/40 blend of the x and
 * hn sub-scores, rounded to an integer. Tiers: S from 80, A from 60, B from
 * 40, otherwise C.
 */
const X_REFERENCE = 100000;
const HN_REFERENCE = 50000;
const X_SCALE = Math.log10(1 + X_REFERENCE);
const HN_SCALE = Math.log10(1 + HN_REFERENCE);

function subScore(signal: number, scale: number): number {
  const clamped = Math.max(0, signal);
  return Math.min(100, (100 * Math.log10(1 + clamped)) / scale);
}

export function tierFor(score: number): CloutTier {
  if (score >= 80) return "S";
  if (score >= 60) return "A";
  if (score >= 40) return "B";
  return "C";
}

export function scoreClout(input: CloutInput): CloutScore {
  const xSignal = Math.max(0, input.followers) + Math.max(0, input.engagement);
  const hnSignal = Math.max(0, input.hnKarma) * 10 + Math.max(0, input.hnPoints);
  const x = subScore(xSignal, X_SCALE);
  const hn = subScore(hnSignal, HN_SCALE);
  const score = Math.round(0.6 * x + 0.4 * hn);
  return { score, tier: tierFor(score), x: Math.round(x), hn: Math.round(hn) };
}
