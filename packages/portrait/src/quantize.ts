import { clamp, distanceSq, isSkinTone, nearestIndex, type Rgb } from "./color.js";

const MERGE_DISTANCE = 20;
const MERGE_DISTANCE_SQ = MERGE_DISTANCE * MERGE_DISTANCE;
const LLOYD_ITERATIONS = 6;
const SKIN_MIN_PIXELS = 24;
const SKIN_DOMINANCE = 0.6;
const MIN_ENTRY_CELLS = 10;
const BAYER_4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;
const DITHER_SPREAD = 30;

export interface QuantizeResult {
  readonly palette: Rgb[];
  readonly indices: number[];
}

interface PaletteFit {
  readonly palette: Rgb[];
  readonly indices: number[];
  readonly counts: number[];
}

function pixelAt(rgb: Float64Array, cell: number): Rgb {
  const offset = cell * 3;
  return [rgb[offset] ?? 0, rgb[offset + 1] ?? 0, rgb[offset + 2] ?? 0];
}

function centroidOf(points: readonly Rgb[]): Rgb {
  let r = 0;
  let g = 0;
  let b = 0;
  for (const point of points) {
    r += point[0];
    g += point[1];
    b += point[2];
  }
  const n = Math.max(1, points.length);
  return [r / n, g / n, b / n];
}

function widestChannel(points: readonly Rgb[]): { channel: 0 | 1 | 2; range: number } {
  let minR = 255;
  let maxR = 0;
  let minG = 255;
  let maxG = 0;
  let minB = 255;
  let maxB = 0;
  for (const point of points) {
    if (point[0] < minR) minR = point[0];
    if (point[0] > maxR) maxR = point[0];
    if (point[1] < minG) minG = point[1];
    if (point[1] > maxG) maxG = point[1];
    if (point[2] < minB) minB = point[2];
    if (point[2] > maxB) maxB = point[2];
  }
  const ranges: [number, number, number] = [maxR - minR, maxG - minG, maxB - minB];
  let channel: 0 | 1 | 2 = 0;
  for (const candidate of [1, 2] as const) {
    if ((ranges[candidate] ?? 0) > (ranges[channel] ?? 0)) channel = candidate;
  }
  return { channel, range: ranges[channel] ?? 0 };
}

/** Weighted median cut in sRGB. Deterministic: ties split at the lower index. */
function medianCut(points: readonly Rgb[], target: number): Rgb[] {
  const buckets: Rgb[][] = [[...points]];
  while (buckets.length < target) {
    let bestIndex = -1;
    let bestScore = 0;
    for (let i = 0; i < buckets.length; i += 1) {
      const bucket = buckets[i];
      if (bucket === undefined || bucket.length < 2) continue;
      const score = widestChannel(bucket).range * bucket.length;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    if (bestIndex < 0 || bestScore < 1) break;
    const bucket = buckets[bestIndex];
    if (bucket === undefined) break;
    const { channel } = widestChannel(bucket);
    const sorted = [...bucket].sort((a, b) => a[channel] - b[channel] || a[0] - b[0] || a[1] - b[1]);
    const half = Math.floor(sorted.length / 2);
    buckets.splice(bestIndex, 1, sorted.slice(0, half), sorted.slice(half));
  }
  return buckets.map((bucket) => centroidOf(bucket));
}

function assignAll(points: readonly Rgb[], palette: readonly Rgb[]): PaletteFit {
  const indices: number[] = [];
  const counts = new Array<number>(palette.length).fill(0);
  for (const point of points) {
    const index = nearestIndex(palette, point);
    indices.push(index);
    counts[index] = (counts[index] ?? 0) + 1;
  }
  return { palette: [...palette], indices, counts };
}

function refine(points: readonly Rgb[], palette: readonly Rgb[], iterations: number): PaletteFit {
  let current: PaletteFit = assignAll(points, palette);
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const sums = current.palette.map(() => [0, 0, 0, 0] as [number, number, number, number]);
    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];
      const index = current.indices[i];
      if (point === undefined || index === undefined) continue;
      const entry = sums[index];
      if (entry === undefined) continue;
      entry[0] += point[0];
      entry[1] += point[1];
      entry[2] += point[2];
      entry[3] += 1;
    }
    const next = current.palette.map((color, index): Rgb => {
      const entry = sums[index];
      if (entry === undefined || entry[3] === 0) return color;
      return [entry[0] / entry[3], entry[1] / entry[3], entry[2] / entry[3]];
    });
    const nextFit = assignAll(points, next);
    const stable = nextFit.indices.every((value, i) => value === current.indices[i]);
    current = nextFit;
    if (stable) break;
  }
  return current;
}

/** Fold palette entries that are too close to tell apart at 24x24. */
function mergeNearDuplicates(points: readonly Rgb[], fit: PaletteFit): PaletteFit {
  let current = fit;
  for (let pass = 0; pass < 8; pass += 1) {
    let merged = false;
    for (let i = 0; i < current.palette.length && !merged; i += 1) {
      for (let j = i + 1; j < current.palette.length; j += 1) {
        const a = current.palette[i];
        const b = current.palette[j];
        if (a === undefined || b === undefined) continue;
        if (distanceSq(a, b) > MERGE_DISTANCE_SQ) continue;
        const countA = current.counts[i] ?? 0;
        const countB = current.counts[j] ?? 0;
        const total = countA + countB;
        const weightA = total === 0 ? 0.5 : countA / total;
        const replacement: Rgb = [
          a[0] * weightA + b[0] * (1 - weightA),
          a[1] * weightA + b[1] * (1 - weightA),
          a[2] * weightA + b[2] * (1 - weightA),
        ];
        const palette = current.palette.map((color, index) =>
          index === i ? replacement : color,
        ).filter((_, index) => index !== j);
        current = assignAll(points, palette);
        merged = true;
        break;
      }
    }
    if (!merged) break;
  }
  return current;
}

/**
 * Keep skin and hair from collapsing into one brown. If almost all skin pixels
 * land on a single entry, add a dedicated skin tone (or replace the least-used
 * entry when the palette is full) and let Lloyd settle.
 */
function protectSkinTones(
  points: readonly Rgb[],
  fit: PaletteFit,
  paletteSize: number,
): PaletteFit {
  let skinTotal = 0;
  const skinPerEntry = fit.palette.map(() => 0);
  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    const index = fit.indices[i];
    if (point === undefined || index === undefined) continue;
    if (!isSkinTone(point[0], point[1], point[2])) continue;
    skinTotal += 1;
    skinPerEntry[index] = (skinPerEntry[index] ?? 0) + 1;
  }
  if (skinTotal < SKIN_MIN_PIXELS) return fit;

  const dominantSkinEntries = skinPerEntry.filter((skin, index) => {
    const count = fit.counts[index] ?? 0;
    return count > 0 && skin / count >= SKIN_DOMINANCE;
  }).length;
  if (dominantSkinEntries >= 2) return fit;

  const skinPoints = points.filter((point) => isSkinTone(point[0], point[1], point[2]));
  const skinColor = centroidOf(skinPoints);
  if (fit.palette.some((color) => distanceSq(color, skinColor) <= MERGE_DISTANCE_SQ)) return fit;

  const palette = [...fit.palette];
  if (palette.length < paletteSize) {
    palette.push(skinColor);
  } else {
    let victim = -1;
    let fewest = Number.POSITIVE_INFINITY;
    const background = fit.counts.indexOf(Math.max(...fit.counts));
    for (let i = 0; i < palette.length; i += 1) {
      const count = fit.counts[i] ?? 0;
      if (i === background) continue;
      if (count < fewest) {
        fewest = count;
        victim = i;
      }
    }
    if (victim < 0) return fit;
    palette[victim] = skinColor;
  }
  return refine(points, palette, 3);
}

/** Drop entries that cover a handful of cells: at 24x24 they read as noise. */
function dropRareEntries(points: readonly Rgb[], fit: PaletteFit): PaletteFit {
  let current = fit;
  while (current.palette.length > 2) {
    const fewest = Math.min(...current.counts);
    if (fewest >= MIN_ENTRY_CELLS) break;
    const victim = current.counts.indexOf(fewest);
    current = assignAll(
      points,
      current.palette.filter((_, index) => index !== victim),
    );
  }
  return current;
}

function bayerOffset(x: number, y: number): number {
  const value = BAYER_4[(y % 4) * 4 + (x % 4)] ?? 0;
  return ((value + 0.5) / 16 - 0.5) * DITHER_SPREAD;
}

export function quantize(input: {
  readonly rgb: Float64Array;
  readonly size: number;
  readonly paletteSize: number;
  readonly dither: boolean;
}): QuantizeResult {
  const { rgb, size, dither } = input;
  const paletteSize = clamp(Math.round(input.paletteSize), 2, 8);
  const cells = size * size;
  const points: Rgb[] = [];
  for (let cell = 0; cell < cells; cell += 1) points.push(pixelAt(rgb, cell));

  const initial = medianCut(points, paletteSize);
  let fit = refine(points, initial, LLOYD_ITERATIONS);
  fit = mergeNearDuplicates(points, fit);
  fit = protectSkinTones(points, fit, paletteSize);
  fit = mergeNearDuplicates(points, fit);
  fit = dropRareEntries(points, fit);

  if (fit.palette.length < 2) {
    return { palette: fit.palette, indices: fit.indices };
  }

  if (!dither) {
    return { palette: fit.palette, indices: fit.indices };
  }

  const indices = fit.indices.map((_, cell) => {
    const x = cell % size;
    const y = (cell - x) / size;
    const offset = bayerOffset(x, y);
    const point = points[cell];
    if (point === undefined) return 0;
    const nudged: Rgb = [
      clamp(point[0] + offset, 0, 255),
      clamp(point[1] + offset, 0, 255),
      clamp(point[2] + offset, 0, 255),
    ];
    return nearestIndex(fit.palette, nudged);
  });
  return { palette: fit.palette, indices };
}
