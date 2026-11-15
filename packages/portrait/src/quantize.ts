import {
  isSkinLab,
  labDistance,
  labDistanceSq,
  nearestLabIndex,
  oklabToSrgb,
  srgbToOklab,
  type Lab,
  type Rgb,
} from "./color.js";

const LLOYD_ITERATIONS = 6;
/** OKLab distance under which two entries are the same colour to a viewer. */
const MERGE_DISTANCE = 0.045;
/** Every palette entry has to earn its place. */
export const MIN_ENTRY_CELLS = 6;
const MIN_SKIN_ENTRIES = 2;
const MIN_SKIN_CELLS = 12;
const MIN_PALETTE_ENTRIES = 2;
const DITHER_STRENGTH = 0.02;

const BAYER_4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

export interface QuantizeInput {
  readonly rgb: Float64Array;
  readonly size: number;
  readonly paletteSize: number;
  readonly dither: boolean;
}

export interface QuantizeResult {
  readonly palette: Rgb[];
  readonly indices: number[];
}

/**
 * Cells with their clustering weight. The crop is centred on the face, so the
 * middle of the frame is where the palette has to be spent: without this a
 * spacesuit and a backdrop take five of eight entries and the face gets two.
 */
interface Sample {
  readonly labs: readonly Lab[];
  readonly weights: ArrayLike<number>;
}

function labsOf(rgb: Float64Array, size: number): Lab[] {
  const labs: Lab[] = [];
  for (let cell = 0; cell < size * size; cell += 1) {
    labs.push(srgbToOklab([rgb[cell * 3] ?? 0, rgb[cell * 3 + 1] ?? 0, rgb[cell * 3 + 2] ?? 0]));
  }
  return labs;
}

function centroid(sample: Sample, members: readonly number[]): Lab {
  let L = 0;
  let a = 0;
  let b = 0;
  let total = 0;
  for (const cell of members) {
    const lab = sample.labs[cell];
    if (lab === undefined) continue;
    const weight = sample.weights[cell] ?? 1;
    L += lab.L * weight;
    a += lab.a * weight;
    b += lab.b * weight;
    total += weight;
  }
  const divisor = total === 0 ? 1 : total;
  return { L: L / divisor, a: a / divisor, b: b / divisor };
}

function bucketScore(sample: Sample, members: readonly number[]): number {
  if (members.length < 2) return 0;
  const mean = centroid(sample, members);
  let variance = 0;
  for (const cell of members) {
    const lab = sample.labs[cell];
    if (lab === undefined) continue;
    variance += labDistanceSq(lab, mean) * (sample.weights[cell] ?? 1);
  }
  return variance;
}

/**
 * Median cut in OKLab, splitting the bucket with the most total squared error
 * along its widest weighted axis. Splitting sRGB channels (the old code) divides
 * on red where the eye sees lightness, which is how a face ended up with three
 * palette entries that all read as the same tone.
 */
function medianCut(sample: Sample, target: number): Lab[] {
  const all = sample.labs.map((_, cell) => cell);
  const buckets: number[][] = [all];
  while (buckets.length < target) {
    let pick = -1;
    let pickScore = 0;
    for (let i = 0; i < buckets.length; i += 1) {
      const members = buckets[i];
      if (members === undefined) continue;
      const score = bucketScore(sample, members);
      if (score > pickScore) {
        pickScore = score;
        pick = i;
      }
    }
    if (pick < 0 || pickScore < 1e-9) break;
    const members = buckets[pick];
    if (members === undefined) break;
    const mean = centroid(sample, members);
    const spread = { L: 0, a: 0, b: 0 };
    for (const cell of members) {
      const lab = sample.labs[cell];
      if (lab === undefined) continue;
      const weight = sample.weights[cell] ?? 1;
      spread.L += (lab.L - mean.L) ** 2 * weight;
      spread.a += (lab.a - mean.a) ** 2 * weight;
      spread.b += (lab.b - mean.b) ** 2 * weight;
    }
    const axis: keyof Lab =
      spread.L >= spread.a && spread.L >= spread.b ? "L" : spread.a >= spread.b ? "a" : "b";
    const sorted = [...members].sort(
      (x, y) => (sample.labs[x]?.[axis] ?? 0) - (sample.labs[y]?.[axis] ?? 0),
    );
    let half = 0;
    let weightSum = 0;
    for (const cell of sorted) weightSum += sample.weights[cell] ?? 1;
    let running = 0;
    for (let index = 0; index < sorted.length - 1; index += 1) {
      running += sample.weights[sorted[index] ?? 0] ?? 1;
      if (running * 2 >= weightSum) {
        half = index + 1;
        break;
      }
    }
    if (half < 1) half = Math.max(1, Math.floor(sorted.length / 2));
    buckets.splice(pick, 1, sorted.slice(0, half), sorted.slice(half));
  }
  return buckets.filter((members) => members.length > 0).map((members) => centroid(sample, members));
}

function assign(labs: readonly Lab[], palette: readonly Lab[]): number[] {
  return labs.map((lab) => nearestLabIndex(palette, lab));
}

function countsOf(indices: readonly number[], entries: number): number[] {
  const counts = new Array<number>(entries).fill(0);
  for (const index of indices) counts[index] = (counts[index] ?? 0) + 1;
  return counts;
}

function lloyd(sample: Sample, seeds: readonly Lab[]): Lab[] {
  let palette = [...seeds];
  for (let iteration = 0; iteration < LLOYD_ITERATIONS; iteration += 1) {
    const indices = assign(sample.labs, palette);
    const buckets: number[][] = palette.map(() => []);
    for (let cell = 0; cell < indices.length; cell += 1) {
      buckets[indices[cell] ?? 0]?.push(cell);
    }
    const next = buckets
      .filter((members) => members.length > 0)
      .map((members) => centroid(sample, members));
    if (next.length === 0) break;
    palette = next;
  }
  return palette;
}

function mergeNearDuplicates(palette: readonly Lab[]): Lab[] {
  const entries = [...palette];
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const x = entries[i];
        const y = entries[j];
        if (x === undefined || y === undefined) continue;
        if (labDistance(x, y) >= MERGE_DISTANCE) continue;
        entries.splice(j, 1);
        merged = true;
        break outer;
      }
    }
  }
  return entries;
}

/**
 * Keep at least two skin entries when the photo is mostly skin. One entry per
 * tone turns a face into a flat blob; two or three related tones keep the
 * shadow under the brow and the cheek reading as one face.
 */
function protectSkin(sample: Sample, palette: readonly Lab[]): Lab[] {
  const skinCells: number[] = [];
  for (let cell = 0; cell < sample.labs.length; cell += 1) {
    const lab = sample.labs[cell];
    if (lab !== undefined && isSkinLab(lab)) skinCells.push(cell);
  }
  if (skinCells.length < MIN_SKIN_CELLS) return [...palette];
  const indices = assign(sample.labs, palette);
  const dominant = countsOf(indices, palette.length).map((count, index) => ({ index, count }));
  let skinEntries = 0;
  for (const entry of dominant) {
    if (entry.count === 0) continue;
    let skin = 0;
    for (let cell = 0; cell < indices.length; cell += 1) {
      if (indices[cell] !== entry.index) continue;
      const lab = sample.labs[cell];
      if (lab !== undefined && isSkinLab(lab)) skin += 1;
    }
    if (skin * 2 > entry.count) skinEntries += 1;
  }
  if (skinEntries >= MIN_SKIN_ENTRIES) return [...palette];

  const sorted = [...skinCells].sort(
    (x, y) => (sample.labs[x]?.L ?? 0) - (sample.labs[y]?.L ?? 0),
  );
  const half = Math.max(1, Math.floor(sorted.length / 2));
  const shadow = centroid(sample, sorted.slice(0, half));
  const light = centroid(sample, sorted.slice(half));
  const entries = [...palette];
  for (const candidate of [shadow, light]) {
    const clash = entries.some((entry) => labDistance(entry, candidate) < MERGE_DISTANCE);
    if (clash) continue;
    if (entries.length >= palette.length) {
      entries.splice(entries.length - 1, 1);
    }
    entries.push(candidate);
  }
  return entries;
}

function dropRare(labs: readonly Lab[], palette: readonly Lab[]): Lab[] {
  let entries = [...palette];
  for (let guard = 0; guard < 8; guard += 1) {
    const indices = assign(labs, entries);
    const counts = countsOf(indices, entries.length);
    const keep = entries.filter((_, index) => (counts[index] ?? 0) >= MIN_ENTRY_CELLS);
    if (keep.length === entries.length) break;
    if (keep.length < MIN_PALETTE_ENTRIES) {
      const ranked = counts
        .map((count, index) => ({ index, count }))
        .sort((x, y) => y.count - x.count)
        .slice(0, MIN_PALETTE_ENTRIES);
      entries = ranked
        .map((entry) => entries[entry.index])
        .filter((entry): entry is Lab => entry !== undefined);
      break;
    }
    entries = keep;
  }
  return entries;
}

function toRgbPalette(palette: readonly Lab[]): Rgb[] {
  const seen = new Map<string, Rgb>();
  for (const lab of palette) {
    const rgb = oklabToSrgb(lab);
    const key = rgb.join(",");
    if (!seen.has(key)) seen.set(key, rgb);
  }
  return [...seen.values()];
}

export function quantize(input: QuantizeInput): QuantizeResult {
  const { size } = input;
  const labs = labsOf(input.rgb, size);
  const sample: Sample = { labs, weights: cellWeights(size) };
  const target = Math.max(MIN_PALETTE_ENTRIES, Math.min(input.paletteSize, labs.length));
  const seeds = lloyd(sample, medianCut(sample, target));
  const protectedSeeds = protectSkin(sample, mergeNearDuplicates(seeds));
  const trimmed = dropRare(labs, protectedSeeds);
  let palette = toRgbPalette(trimmed);
  if (palette.length < MIN_PALETTE_ENTRIES) {
    palette = toRgbPalette(trimmed).slice(0, MIN_PALETTE_ENTRIES);
    while (palette.length < MIN_PALETTE_ENTRIES) palette.push(palette[0] ?? [0, 0, 0]);
  }

  const paletteLabs = palette.map((entry) => srgbToOklab(entry));
  let indices = assign(labs, paletteLabs);

  if (input.dither) {
    const dithered = labs.map((lab, cell) => {
      const x = cell % size;
      const y = (cell - x) / size;
      const threshold = ((BAYER_4[y % 4]?.[x % 4] ?? 0) / 16 - 0.5) * 2;
      return { L: lab.L + threshold * DITHER_STRENGTH, a: lab.a, b: lab.b };
    });
    indices = assign(dithered, paletteLabs);
  }

  const counts = countsOf(indices, palette.length);
  const used = counts.filter((count) => count > 0).length;
  if (used < MIN_PALETTE_ENTRIES) {
    const ranked = counts
      .map((count, index) => ({ index, count }))
      .sort((x, y) => y.count - x.count)
      .slice(0, MIN_PALETTE_ENTRIES);
    const remap = new Map<number, number>();
    const nextPalette: Rgb[] = [];
    for (const entry of ranked) {
      remap.set(entry.index, nextPalette.length);
      nextPalette.push(palette[entry.index] ?? [0, 0, 0]);
    }
    palette = nextPalette;
    indices = indices.map((index) => remap.get(index) ?? 0);
  }

  return { palette, indices };
}

/** Central band of the frame, which the crop guarantees holds the face. */
const CENTRE_BAND = 0.3;
const CENTRE_WEIGHT = 2.5;

function cellWeights(size: number): Float64Array {
  const weights = new Float64Array(size * size);
  const middle = (size - 1) / 2;
  const band = size * CENTRE_BAND;
  for (let cell = 0; cell < weights.length; cell += 1) {
    const x = cell % size;
    const y = (cell - x) / size;
    const inside = Math.abs(x - middle) <= band && Math.abs(y - middle) <= band;
    weights[cell] = inside ? CENTRE_WEIGHT : 1;
  }
  return weights;
}
