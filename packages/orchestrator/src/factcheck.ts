import { mechanicalMissingIds } from "@sf-fight-club/engine";
import type { Shot, ShotFactCheck } from "@sf-fight-club/schemas";

/**
 * Mechanical missing ids win over the model. `fabricated` is true exactly when
 * an id is missing or the model marks a specific number as contradicted (FE-7, FE-8).
 */
export function mergeFactChecks(
  shots: readonly Shot[],
  modelChecks: readonly ShotFactCheck[],
  locker: ReadonlySet<string>,
): ShotFactCheck[] {
  return shots.map((shot) => {
    const fromModel = modelChecks.find((check) => check.shotId === shot.id);
    const missingIds = [...new Set(mechanicalMissingIds(shot, locker))];
    const numberContradicted = fromModel?.numberContradicted ?? false;
    const perEvidence = (fromModel?.perEvidence ?? []).filter((item) => !missingIds.includes(item.evidenceId));
    return {
      shotId: shot.id,
      missingIds,
      perEvidence,
      numberContradicted,
      fabricated: missingIds.length > 0 || numberContradicted,
    };
  });
}
