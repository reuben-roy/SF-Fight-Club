import type { FighterBuild, Shot, ShotModelOutput, VolleyKind } from "@sf-fight-club/schemas";
import { shotTarget } from "@sf-fight-club/engine";

import { shotId } from "./keys.js";
import { truncateAtCap, wordCount } from "./text.js";

export interface VolleyWarning {
  code: "truncated" | "shot_cap" | "shot_count" | "missing_target";
  detail: string;
}

/**
 * FE-4, FE-5, and the shot budget. Ids are assigned after the count cap so
 * `s1` is the first shot the judge will see, before out-of-round drops.
 */
export function prepareModelShots(input: {
  scope: string;
  kind: VolleyKind;
  shots: readonly ShotModelOutput[];
  budgets: FighterBuild["budgets"];
}): { shots: Shot[]; truncated: boolean; warnings: VolleyWarning[] } {
  const warnings: VolleyWarning[] = [];
  const cap = input.kind === "closing" ? 1 : input.budgets.shotsPerVolley[1];
  let incoming = input.shots;
  if (incoming.length > cap) {
    warnings.push({
      code: "shot_cap",
      detail: `${input.scope} returned ${incoming.length} shots; kept ${cap}`,
    });
    incoming = incoming.slice(0, cap);
  }

  let truncated = false;
  const capped = incoming.map((shot, index) => {
    const headline = truncateAtCap(shot.headline, input.budgets.headlineMaxWords);
    const claimCap = input.kind === "closing" ? input.budgets.closingMaxWords : input.budgets.shotMaxWords;
    const claim = truncateAtCap(shot.claim, claimCap);
    if (headline.truncated || claim.truncated) truncated = true;
    const target = shotTarget({
      type: shot.type,
      respondsTo: shot.type === "defense" ? shot.respondsTo : undefined,
    });
    if (target.kind === "missing") {
      warnings.push({ code: "missing_target", detail: `${input.scope} shot ${index + 1} has no target` });
    }
    const base = {
      id: shotId(input.scope, index + 1),
      type: shot.type,
      criterion: shot.criterion,
      headline: headline.text,
      claim: claim.text,
      evidence: shot.evidence,
      estimate: shot.estimate,
    };
    if (shot.type === "defense") return { ...base, respondsTo: shot.respondsTo };
    return base;
  });

  const wordCap = input.kind === "closing" ? input.budgets.closingMaxWords : input.budgets.volleyMaxWords;
  const budgeted = applyVolleyWordCap(capped, wordCap);
  if (budgeted.truncated) truncated = true;

  if (input.kind !== "closing" && budgeted.shots.length > 0 && budgeted.shots.length < input.budgets.shotsPerVolley[0]) {
    warnings.push({
      code: "shot_count",
      detail: `${input.scope} has ${budgeted.shots.length} shots after caps; budget is ${input.budgets.shotsPerVolley[0]} to ${input.budgets.shotsPerVolley[1]}`,
    });
  }

  return { shots: budgeted.shots, truncated, warnings };
}

export function volleyWordCount(shots: readonly { headline: string; claim: string }[]): number {
  return shots.reduce((sum, shot) => sum + wordCount(shot.headline) + wordCount(shot.claim), 0);
}

function applyVolleyWordCap(shots: readonly Shot[], cap: number): { shots: Shot[]; truncated: boolean } {
  let used = 0;
  const kept: Shot[] = [];
  let truncated = false;
  for (const shot of shots) {
    const cost = wordCount(shot.headline) + wordCount(shot.claim);
    if (used + cost <= cap) {
      kept.push(shot);
      used += cost;
      continue;
    }
    truncated = true;
    let remain = cap - used;
    if (remain <= 0) break;
    const headline = truncateAtCap(shot.headline, Math.min(wordCount(shot.headline), remain));
    remain -= wordCount(headline.text);
    const claim = truncateAtCap(shot.claim, Math.max(0, remain));
    if (wordCount(headline.text) + wordCount(claim.text) === 0) break;
    kept.push({ ...shot, headline: headline.text, claim: claim.text });
    break;
  }
  return { shots: kept, truncated };
}
