import { clamp, oklabToSrgb, srgbToOklab, type Lab } from "./color.js";

/** Output the low and high percentiles are stretched toward. */
const OUTPUT_LOW = 0.06;
const OUTPUT_HIGH = 0.96;
const MAX_GAIN = 1.25;
/** The cap is 1.25, but a full stretch moves skin too far from the photo. */
const STRETCH_SHARE = 0.1;
/** At most 0.04 by contract; kept smaller so fidelity to the reference survives. */
const MAX_MEDIAN_SHIFT = 0.008;
const LOW_PERCENTILE = 0.01;
const HIGH_PERCENTILE = 0.99;

export interface ToneResult {
  readonly rgb: Float64Array;
  readonly gain: number;
  readonly shift: number;
}

function labAt(rgb: Float64Array, cell: number): Lab {
  return srgbToOklab([
    rgb[cell * 3] ?? 0,
    rgb[cell * 3 + 1] ?? 0,
    rgb[cell * 3 + 2] ?? 0,
  ]);
}

function medianOf(sorted: readonly number[]): number {
  if (sorted.length === 0) return 0;
  const middle = sorted.length >> 1;
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function percentileOf(sorted: readonly number[], share: number): number {
  if (sorted.length === 0) return 0;
  const index = clamp(Math.round((sorted.length - 1) * share), 0, sorted.length - 1);
  return sorted[index] ?? 0;
}

/**
 * Mild monotonic stretch of OKLab lightness only. The gain is capped and the
 * median may move at most 0.04: a stronger curve on a dark-skinned face turns
 * brown into grey, which is the one thing the portrait must never do.
 */
export function stretchTone(rgb: Float64Array, size: number): ToneResult {
  const cells = size * size;
  const labs: Lab[] = [];
  const lightness: number[] = [];
  for (let cell = 0; cell < cells; cell += 1) {
    const lab = labAt(rgb, cell);
    labs.push(lab);
    lightness.push(lab.L);
  }
  const sorted = [...lightness].sort((left, right) => left - right);
  const low = percentileOf(sorted, LOW_PERCENTILE);
  const high = percentileOf(sorted, HIGH_PERCENTILE);
  const median = medianOf(sorted);
  const span = high - low;

  let gain = 1;
  let shift = 0;
  if (span > 1e-6) {
    const fullGain = Math.min(MAX_GAIN, (OUTPUT_HIGH - OUTPUT_LOW) / span);
    gain = 1 + (fullGain - 1) * STRETCH_SHARE;
    const target = OUTPUT_LOW - gain * low;
    const wantedMedian = median * gain + target;
    const bounded = clamp(
      wantedMedian,
      median - MAX_MEDIAN_SHIFT,
      median + MAX_MEDIAN_SHIFT,
    );
    shift = target + (bounded - wantedMedian);
  }

  const out = new Float64Array(rgb.length);
  for (let cell = 0; cell < cells; cell += 1) {
    const lab = labs[cell];
    if (lab === undefined) continue;
    const lightness = clamp(lab.L * gain + shift, 0, 1);
    const color = oklabToSrgb({ L: lightness, a: lab.a, b: lab.b });
    out[cell * 3] = color[0];
    out[cell * 3 + 1] = color[1];
    out[cell * 3 + 2] = color[2];
  }
  return { rgb: out, gain, shift };
}
