import { isSkinLab, labDistance, srgbToOklab, type Rgb } from "./color.js";

/** OKLab distance a wall has to stay within to count as one background. */
const BACKGROUND_TOLERANCE = 0.1;
const MIN_BACKGROUND_SHARE = 0.05;
const MAX_BACKGROUND_SHARE = 0.85;

export interface FlattenResult {
  readonly rgb: Float64Array;
  readonly background: Rgb | null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  if (sorted.length === 0) return 0;
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function medianColor(rgb: Float64Array, cells: readonly number[]): Rgb {
  const reds: number[] = [];
  const greens: number[] = [];
  const blues: number[] = [];
  for (const cell of cells) {
    reds.push(rgb[cell * 3] ?? 0);
    greens.push(rgb[cell * 3 + 1] ?? 0);
    blues.push(rgb[cell * 3 + 2] ?? 0);
  }
  return [median(reds), median(greens), median(blues)];
}

function borderCells(size: number): number[] {
  const cells: number[] = [];
  for (let i = 0; i < size; i += 1) {
    cells.push(i, (size - 1) * size + i);
    if (i > 0 && i < size - 1) cells.push(i * size, i * size + size - 1);
  }
  return cells;
}

function flood(rgb: Float64Array, size: number, reference: Rgb): number[] {
  const cells = size * size;
  const referenceLab = srgbToOklab(reference);
  const seen = new Uint8Array(cells);
  const queue: number[] = [];
  const matches = (cell: number): boolean => {
    const lab = srgbToOklab([
      rgb[cell * 3] ?? 0,
      rgb[cell * 3 + 1] ?? 0,
      rgb[cell * 3 + 2] ?? 0,
    ]);
    return labDistance(lab, referenceLab) <= BACKGROUND_TOLERANCE;
  };
  for (const cell of borderCells(size)) {
    if (seen[cell] === 1 || !matches(cell)) continue;
    seen[cell] = 1;
    queue.push(cell);
  }
  let head = 0;
  while (head < queue.length) {
    const cell = queue[head] ?? 0;
    head += 1;
    const x = cell % size;
    const y = (cell - x) / size;
    const neighbours = [
      x > 0 ? cell - 1 : -1,
      x + 1 < size ? cell + 1 : -1,
      y > 0 ? cell - size : -1,
      y + 1 < size ? cell + size : -1,
    ];
    for (const neighbour of neighbours) {
      if (neighbour < 0 || seen[neighbour] === 1) continue;
      if (!matches(neighbour)) continue;
      seen[neighbour] = 1;
      queue.push(neighbour);
    }
  }
  return queue;
}

/**
 * Flood a near-uniform background to one colour, starting from the frame edge.
 *
 * Portraits are shot against a wall, a studio sweep or the sky; at 32x32 that
 * becomes speckle that steals palette entries from the face. Only the region
 * connected to the border within tolerance is touched, so a busy scene keeps
 * its colour, and a skin-toned border (a tight face crop) is left alone.
 */
export function flattenBackground(input: {
  readonly rgb: Float64Array;
  readonly size: number;
  readonly tolerance: number;
}): FlattenResult {
  const { rgb, size, tolerance } = input;
  const seed = medianColor(rgb, borderCells(size));
  if (isSkinLab(srgbToOklab(seed))) {
    return { rgb, background: null };
  }

  let region = flood(rgb, size, seed);
  if (region.length === 0) return { rgb, background: null };
  const refined = medianColor(rgb, region);
  if (labDistance(srgbToOklab(refined), srgbToOklab(seed)) > tolerance / 2) {
    region = flood(rgb, size, refined);
  }
  const share = region.length / (size * size);
  if (share < MIN_BACKGROUND_SHARE || share > MAX_BACKGROUND_SHARE) {
    return { rgb, background: null };
  }

  const background = medianColor(rgb, region);
  const out = new Float64Array(rgb);
  for (const cell of region) {
    out[cell * 3] = background[0];
    out[cell * 3 + 1] = background[1];
    out[cell * 3 + 2] = background[2];
  }
  return { rgb: out, background };
}
