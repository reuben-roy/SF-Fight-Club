import { clamp } from "./color.js";

const BLUR_KERNEL = [1, 2, 1] as const;

function blurPass(
  source: Float64Array,
  size: number,
  horizontal: boolean,
): Float64Array {
  const out = new Float64Array(source.length);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        let sum = 0;
        let weightSum = 0;
        for (let k = -1; k <= 1; k += 1) {
          const nx = horizontal ? clamp(x + k, 0, size - 1) : x;
          const ny = horizontal ? y : clamp(y + k, 0, size - 1);
          const weight = BLUR_KERNEL[k + 1] ?? 0;
          sum += (source[(ny * size + nx) * 3 + channel] ?? 0) * weight;
          weightSum += weight;
        }
        out[(y * size + x) * 3 + channel] = sum / weightSum;
      }
    }
  }
  return out;
}

/**
 * Unsharp mask on the 24x24 grid. The downsampler averages away eyelid and
 * mouth edges; a mild sharpen puts them back without ringing.
 */
export function unsharp(
  rgb: Float64Array,
  size: number,
  strength: number,
): Float64Array {
  const blurred = blurPass(blurPass(rgb, size, true), size, false);
  const out = new Float64Array(rgb.length);
  for (let i = 0; i < rgb.length; i += 1) {
    const value = rgb[i] ?? 0;
    out[i] = clamp(value + (value - (blurred[i] ?? value)) * strength, 0, 255);
  }
  return out;
}

/** Contrast about mid-grey, with a soft toe so highlights and shadows keep detail. */
export function liftContrast(rgb: Float64Array, amount: number): Float64Array {
  const out = new Float64Array(rgb.length);
  for (let i = 0; i < rgb.length; i += 1) {
    const value = (rgb[i] ?? 0) / 255;
    const curved = value + amount * Math.sin(Math.PI * 2 * (value - 0.5)) * 0.5;
    out[i] = clamp(curved * 255, 0, 255);
  }
  return out;
}

/**
 * Stretch the tones the image actually uses to the full range. A high-key
 * studio photo and a dark available-light photo both arrive squashed; without
 * this the quantizer spends its palette on two greys.
 */
export function normalizeLevels(input: {
  readonly rgb: Float64Array;
  readonly lowPercentile: number;
  readonly highPercentile: number;
  readonly minRange: number;
}): Float64Array {
  const { rgb, lowPercentile, highPercentile, minRange } = input;
  const histogram = new Array<number>(256).fill(0);
  const lumaOf = (i: number): number =>
    0.2126 * (rgb[i] ?? 0) + 0.7152 * (rgb[i + 1] ?? 0) + 0.0722 * (rgb[i + 2] ?? 0);
  let counted = 0;
  for (let i = 0; i < rgb.length; i += 3) {
    const bin = clamp(Math.round(lumaOf(i)), 0, 255);
    histogram[bin] = (histogram[bin] ?? 0) + 1;
    counted += 1;
  }
  const percentile = (share: number): number => {
    const target = counted * share;
    let running = 0;
    for (let bin = 0; bin < 256; bin += 1) {
      running += histogram[bin] ?? 0;
      if (running >= target) return bin;
    }
    return 255;
  };
  const low = percentile(lowPercentile);
  const high = percentile(highPercentile);
  const range = high - low;
  if (range < minRange) return new Float64Array(rgb);
  const gain = 255 / range;
  const median = percentile(0.5);
  // A blown-out face and an underexposed one both lose their features; pull the
  // overall exposure toward mid-grey before the palette is spent.
  const gamma = clamp(Math.log(0.5) / Math.log(clamp(median / 255, 0.05, 0.95)), 0.8, 1.25);
  const out = new Float64Array(rgb.length);
  for (let i = 0; i < rgb.length; i += 1) {
    const stretched = clamp(((rgb[i] ?? 0) - low) * gain, 0, 255) / 255;
    out[i] = 255 * stretched ** gamma;
  }
  return out;
}

/** Spread of the grid, used to reject a blank image. */
export function toneSpread(rgb: Float64Array): number {
  let min = 255;
  let max = 0;
  for (let i = 0; i < rgb.length; i += 1) {
    const value = rgb[i] ?? 0;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return max - min;
}
