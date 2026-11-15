import { clamp, oklabToSrgb, srgbToOklab, type Lab } from "./color.js";

function pixelLab(rgb: Float64Array, cell: number): Lab {
  return srgbToOklab([
    rgb[cell * 3] ?? 0,
    rgb[cell * 3 + 1] ?? 0,
    rgb[cell * 3 + 2] ?? 0,
  ]);
}

function percentileOf(histogram: ArrayLike<number>, counted: number, share: number): number {
  const target = counted * share;
  let running = 0;
  for (let bin = 0; bin < histogram.length; bin += 1) {
    running += histogram[bin] ?? 0;
    if (running >= target) return bin;
  }
  return histogram.length - 1;
}

export interface ToneMapInput {
  readonly rgb: Float64Array;
  readonly size: number;
  /** Low and high percentiles of the lightness histogram that map to the output range. */
  readonly lowPercentile: number;
  readonly highPercentile: number;
  /** Below this lightness spread the image is flat and left alone. */
  readonly minRange: number;
  readonly outputLow: number;
  readonly outputHigh: number;
  /** Extra contrast about the median, 1 leaves the curve alone. */
  readonly gain: number;
  /**
   * Weight of the central band when measuring the tone range. The crop is
   * centred on the face, so the frame is mostly shoulders and backdrop, and
   * letting a white suit set the top of the range flattens the face.
   */
  readonly centreWeight?: number;
  /** Half-width of the central band, as a share of the frame. */
  readonly centreShare?: number;
}

export interface ToneMapResult {
  readonly rgb: Float64Array;
  /** Mean OKLab chroma, so the caller knows whether it is looking at a colour photo. */
  readonly chroma: number;
}

const DEFAULT_CENTRE_WEIGHT = 3;
const DEFAULT_CENTRE_SHARE = 0.3;

function cellWeight(cell: number, size: number, centreWeight: number, centreShare: number): number {
  const x = cell % size;
  const y = (cell - x) / size;
  const middle = (size - 1) / 2;
  const band = size * centreShare;
  return Math.abs(x - middle) <= band && Math.abs(y - middle) <= band ? centreWeight : 1;
}

/**
 * Stretch the lightness the image actually uses into a usable band, on OKLab L
 * alone. Contrast that runs per sRGB channel (the old code) rotates hue, which
 * is what turned one skin into red, salmon and white patches; lightness-only
 * curves move tone without touching the hue the face was photographed in.
 */
export function toneMap(input: ToneMapInput): ToneMapResult {
  const { rgb, size } = input;
  const cells = size * size;
  const bins = 128;
  const centreWeight = input.centreWeight ?? DEFAULT_CENTRE_WEIGHT;
  const centreShare = input.centreShare ?? DEFAULT_CENTRE_SHARE;
  const histogram = new Float64Array(bins);
  const labs: Lab[] = [];
  let chromaSum = 0;
  let weightSum = 0;
  for (let cell = 0; cell < cells; cell += 1) {
    const lab = pixelLab(rgb, cell);
    labs.push(lab);
    const weight = cellWeight(cell, size, centreWeight, centreShare);
    chromaSum += Math.hypot(lab.a, lab.b) * weight;
    weightSum += weight;
    const bin = clamp(Math.round(lab.L * (bins - 1)), 0, bins - 1);
    histogram[bin] = (histogram[bin] ?? 0) + weight;
  }
  const chroma = weightSum === 0 ? 0 : chromaSum / weightSum;

  const low = percentileOf(histogram, weightSum, input.lowPercentile) / (bins - 1);
  const high = percentileOf(histogram, weightSum, input.highPercentile) / (bins - 1);
  const range = high - low;
  const out = new Float64Array(rgb.length);

  if (range < input.minRange) {
    for (let cell = 0; cell < cells; cell += 1) {
      const color = oklabToSrgb(labs[cell] ?? { L: 0, a: 0, b: 0 });
      out[cell * 3] = color[0];
      out[cell * 3 + 1] = color[1];
      out[cell * 3 + 2] = color[2];
    }
    return { rgb: out, chroma };
  }

  const span = input.outputHigh - input.outputLow;
  for (let cell = 0; cell < cells; cell += 1) {
    const lab = labs[cell];
    if (lab === undefined) continue;
    const stretched = clamp((lab.L - low) / range, 0, 1);
    const contrasted = 0.5 + (stretched - 0.5) * input.gain;
    const lightness = clamp(
      input.outputLow + clamp(contrasted, 0, 1) * span,
      input.outputLow,
      input.outputHigh,
    );
    const color = oklabToSrgb({ L: lightness, a: lab.a, b: lab.b });
    out[cell * 3] = color[0];
    out[cell * 3 + 1] = color[1];
    out[cell * 3 + 2] = color[2];
  }
  return { rgb: out, chroma };
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
