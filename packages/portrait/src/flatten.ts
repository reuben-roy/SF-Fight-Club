import { distance, isSkinTone, type Rgb } from "./color.js";

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

function borderColor(rgb: Float64Array, size: number): Rgb {
  const reds: number[] = [];
  const greens: number[] = [];
  const blues: number[] = [];
  const push = (x: number, y: number) => {
    const offset = (y * size + x) * 3;
    reds.push(rgb[offset] ?? 0);
    greens.push(rgb[offset + 1] ?? 0);
    blues.push(rgb[offset + 2] ?? 0);
  };
  for (let i = 0; i < size; i += 1) {
    push(i, 0);
    push(i, size - 1);
    push(0, i);
    push(size - 1, i);
  }
  return [median(reds), median(greens), median(blues)];
}

/**
 * Flood a near-uniform background to one colour, starting from the frame edge.
 *
 * Portraits are shot against a wall, a studio sweep or the sky; at 24x24 that
 * becomes speckle that steals palette entries from the face. Only the region
 * connected to the border within `tolerance` is touched, so a busy scene keeps
 * its colour, and a skin-toned border (a tight face crop) is left alone.
 */
export function flattenBackground(input: {
  readonly rgb: Float64Array;
  readonly size: number;
  readonly tolerance: number;
}): FlattenResult {
  const { rgb, size, tolerance } = input;
  const background = borderColor(rgb, size);
  if (isSkinTone(background[0], background[1], background[2])) {
    return { rgb, background: null };
  }

  const cells = size * size;
  const mask = new Uint8Array(cells);
  const queue: number[] = [];
  const withinTolerance = (cell: number): boolean => {
    const offset = cell * 3;
    const color: Rgb = [rgb[offset] ?? 0, rgb[offset + 1] ?? 0, rgb[offset + 2] ?? 0];
    return distance(color, background) <= tolerance;
  };

  for (let i = 0; i < size; i += 1) {
    const edge = [i, (size - 1) * size + i, i * size, i * size + size - 1];
    for (const cell of edge) {
      if (mask[cell] === 0 && withinTolerance(cell)) {
        mask[cell] = 1;
        queue.push(cell);
      }
    }
  }

  let head = 0;
  while (head < queue.length) {
    const cell = queue[head] ?? 0;
    head += 1;
    const x = cell % size;
    const y = (cell - x) / size;
    const neighbours = [
      x > 0 ? cell - 1 : -1,
      x < size - 1 ? cell + 1 : -1,
      y > 0 ? cell - size : -1,
      y < size - 1 ? cell + size : -1,
    ];
    for (const neighbour of neighbours) {
      if (neighbour < 0 || mask[neighbour] === 1) continue;
      if (!withinTolerance(neighbour)) continue;
      mask[neighbour] = 1;
      queue.push(neighbour);
    }
  }

  const share = queue.length / cells;
  if (share < 0.12 || share > 0.62) {
    return { rgb, background: null };
  }

  const out = new Float64Array(rgb);
  for (const cell of queue) {
    const offset = cell * 3;
    out[offset] = background[0];
    out[offset + 1] = background[1];
    out[offset + 2] = background[2];
  }
  return { rgb: out, background };
}
