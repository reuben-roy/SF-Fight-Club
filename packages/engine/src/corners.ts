import type { Slot } from "@sf-fight-club/schemas";

import { EngineError } from "./errors.js";
import { hash32 } from "./rng.js";

/**
 * FA-3. Which fighter stands on the left comes from `match_seed`, never from
 * the seed number. Left stays the orange corner and right stays blue; this
 * function only picks the slot.
 */
export function assignCorners(matchSeed: string): { left: Slot; right: Slot } {
  if (matchSeed.length === 0) {
    throw new EngineError("match_seed", "corner assignment needs a match seed");
  }
  const leftIsA = (hash32(matchSeed) & 1) === 0;
  return leftIsA ? { left: "A", right: "B" } : { left: "B", right: "A" };
}
