import {
  labDistanceSq,
  nearestLabIndex,
  oklabToSrgb,
  srgbToOklab,
  type Lab,
  type Rgb,
} from "./color.js";

const LLOYD_ITERATIONS = 8;
/** Clusters closer than this are the same colour to a viewer and are folded together. */
const MERGE_DISTANCE = 0.025;
const MIN_PALETTE_ENTRIES = 2;

export interface QuantizeInput {
  readonly rgb: Float64Array;
  readonly size: number;
  readonly paletteSize: number;
}

export interface QuantizeResult {
  readonly palette: Rgb[];
  readonly indices: number[];
}

function labsOf(rgb: Float64Array, size: number): Lab[] {
  const labs: Lab[] = [];
  for (let cell = 0; cell < size * size; cell += 1) {
    labs.push(
      srgbToOklab([
        rgb[cell * 3] ?? 0,
        rgb[cell * 3 + 1] ?? 0,
        rgb[cell * 3 + 2] ?? 0,
      ]),
    );
  }
  return labs;
}

function centroid(labs: readonly Lab[], members: readonly number[]): Lab {
  let L = 0;
  let a = 0;
  let b = 0;
  for (const cell of members) {
    const lab = labs[cell];
    if (lab === undefined) continue;
    L += lab.L;
    a += lab.a;
    b += lab.b;
  }
  const divisor = members.length === 0 ? 1 : members.length;
  return { L: L / divisor, a: a / divisor, b: b / divisor };
}

function bucketError(labs: readonly Lab[], members: readonly number[]): number {
  if (members.length < 2) return 0;
  const mean = centroid(labs, members);
  let error = 0;
  for (const cell of members) {
    const lab = labs[cell];
    if (lab !== undefined) error += labDistanceSq(lab, mean);
  }
  return error;
}

/**
 * Median cut in OKLab. Splitting the widest weighted axis in perceptual space
 * keeps adjacent skin tones instead of dividing a face on an sRGB channel.
 */
function medianCut(labs: readonly Lab[], target: number): Lab[] {
  const buckets: number[][] = [labs.map((_, cell) => cell)];
  while (buckets.length < target) {
    let pick = -1;
    let pickError = 0;
    for (let index = 0; index < buckets.length; index += 1) {
      const members = buckets[index];
      if (members === undefined) continue;
      const error = bucketError(labs, members);
      if (error > pickError) {
        pickError = error;
        pick = index;
      }
    }
    if (pick < 0 || pickError < 1e-9) break;
    const members = buckets[pick];
    if (members === undefined) break;
    const mean = centroid(labs, members);
    let spreadL = 0;
    let spreadA = 0;
    let spreadB = 0;
    for (const cell of members) {
      const lab = labs[cell];
      if (lab === undefined) continue;
      spreadL += (lab.L - mean.L) ** 2;
      spreadA += (lab.a - mean.a) ** 2;
      spreadB += (lab.b - mean.b) ** 2;
    }
    const axis: keyof Lab =
      spreadL >= spreadA && spreadL >= spreadB ? "L" : spreadA >= spreadB ? "a" : "b";
    const sorted = [...members].sort(
      (left, right) => (labs[left]?.[axis] ?? 0) - (labs[right]?.[axis] ?? 0),
    );
    const half = Math.max(1, Math.floor(sorted.length / 2));
    buckets.splice(pick, 1, sorted.slice(0, half), sorted.slice(half));
  }
  return buckets.filter((members) => members.length > 0).map((members) => centroid(labs, members));
}

function assign(labs: readonly Lab[], palette: readonly Lab[]): number[] {
  return labs.map((lab) => nearestLabIndex(palette, lab));
}

function lloyd(labs: readonly Lab[], seeds: readonly Lab[]): Lab[] {
  let palette = [...seeds];
  for (let iteration = 0; iteration < LLOYD_ITERATIONS; iteration += 1) {
    const indices = assign(labs, palette);
    const buckets: number[][] = palette.map(() => []);
    for (let cell = 0; cell < indices.length; cell += 1) {
      buckets[indices[cell] ?? 0]?.push(cell);
    }
    const next = buckets
      .filter((members) => members.length > 0)
      .map((members) => centroid(labs, members));
    if (next.length === 0) break;
    palette = next;
  }
  return palette;
}

interface Cluster {
  readonly lab: Lab;
  readonly count: number;
}

/** Fold clusters closer than MERGE_DISTANCE, keeping the larger cluster's position. */
function mergeClose(clusters: readonly Cluster[]): Cluster[] {
  const entries = clusters.map((cluster) => ({ ...cluster }));
  for (;;) {
    let bestLeft = -1;
    let bestRight = -1;
    let bestDistance = MERGE_DISTANCE;
    for (let left = 0; left < entries.length; left += 1) {
      for (let right = left + 1; right < entries.length; right += 1) {
        const x = entries[left];
        const y = entries[right];
        if (x === undefined || y === undefined) continue;
        const distance = Math.hypot(x.lab.L - y.lab.L, x.lab.a - y.lab.a, x.lab.b - y.lab.b);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestLeft = left;
          bestRight = right;
        }
      }
    }
    if (bestLeft < 0 || bestRight < 0) break;
    const left = entries[bestLeft];
    const right = entries[bestRight];
    if (left === undefined || right === undefined) break;
    const total = left.count + right.count;
    const merged: Cluster = {
      lab: {
        L: (left.lab.L * left.count + right.lab.L * right.count) / total,
        a: (left.lab.a * left.count + right.lab.a * right.count) / total,
        b: (left.lab.b * left.count + right.lab.b * right.count) / total,
      },
      count: total,
    };
    entries.splice(bestRight, 1);
    entries[bestLeft] = merged;
  }
  return entries;
}

function toRgbPalette(labs: readonly Lab[]): Rgb[] {
  const seen = new Map<string, Rgb>();
  for (const lab of labs) {
    const rgb = oklabToSrgb(lab);
    const key = rgb.join(",");
    if (!seen.has(key)) seen.set(key, rgb);
  }
  return [...seen.values()];
}

/**
 * Deterministic k-means in OKLab with median-cut seeds. Every cluster keeps its
 * pixels, down to two: an eye or a mouth is small, and dropping it is what
 * erased faces in the previous pass.
 */
export function quantize(input: QuantizeInput): QuantizeResult {
  const labs = labsOf(input.rgb, input.size);
  const target = Math.max(MIN_PALETTE_ENTRIES, Math.min(input.paletteSize, labs.length));
  const seeded = lloyd(labs, medianCut(labs, target));
  const counts = new Array<number>(seeded.length).fill(0);
  for (const index of assign(labs, seeded)) counts[index] = (counts[index] ?? 0) + 1;
  const merged = mergeClose(
    seeded.map((lab, index) => ({ lab, count: counts[index] ?? 0 })),
  ).filter((cluster) => cluster.count > 0);
  if (merged.length < MIN_PALETTE_ENTRIES) return { palette: [], indices: [] };

  const palette = toRgbPalette(merged.map((cluster) => cluster.lab));
  if (palette.length < MIN_PALETTE_ENTRIES) return { palette: [], indices: [] };
  const paletteLabs = palette.map((entry) => srgbToOklab(entry));
  const indices = assign(labs, paletteLabs);
  return { palette, indices };
}
