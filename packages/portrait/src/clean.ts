import { srgbToOklab, type Lab, type Rgb } from "./color.js";

const PROTECTED_ENTRIES = 2;

function neighbours(cell: number, size: number): number[] {
  const x = cell % size;
  const y = (cell - x) / size;
  const out: number[] = [];
  if (x > 0) out.push(cell - 1);
  if (x + 1 < size) out.push(cell + 1);
  if (y > 0) out.push(cell - size);
  if (y + 1 < size) out.push(cell + size);
  return out;
}

function lightLab(labs: readonly Lab[], index: number): number {
  return labs[index]?.L ?? 0;
}

export interface DespeckleInput {
  readonly palette: readonly Rgb[];
  readonly indices: readonly number[];
  readonly size: number;
}

/**
 * One pass. A pixel changes only when all four neighbours differ from it and
 * its entry is not one of the two darkest or two lightest in the palette: that
 * keeps eyes, brows, glasses and highlights, which are exactly the isolated
 * dark and light pixels a stronger pass would eat.
 */
export function despeckle(input: DespeckleInput): number[] {
  const { palette, size } = input;
  const labs = palette.map((entry) => srgbToOklab(entry));
  const order = palette.map((_, index) => index).sort((left, right) => lightLab(labs, left) - lightLab(labs, right) || left - right);
  const protectedIndices = new Set<number>([
    ...order.slice(0, PROTECTED_ENTRIES),
    ...order.slice(Math.max(0, order.length - PROTECTED_ENTRIES)),
  ]);
  const source = input.indices;
  const result = [...source];
  for (let cell = 0; cell < source.length; cell += 1) {
    const x = cell % size;
    const y = (cell - x) / size;
    if (x === 0 || y === 0 || x === size - 1 || y === size - 1) continue;
    const own = result[cell] ?? 0;
    if (protectedIndices.has(own)) continue;
    const around = neighbours(cell, size);
    if (around.length !== 4) continue;
    if (around.some((neighbour) => result[neighbour] === own)) continue;

    const tally = new Map<number, number>();
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const index = result[ny * size + nx] ?? 0;
        tally.set(index, (tally.get(index) ?? 0) + 1);
      }
    }
    let maxCount = 0;
    for (const count of tally.values()) maxCount = Math.max(maxCount, count);
    let replacement = own;
    let bestCount = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    const ownLab = labs[own];
    for (const [index, count] of tally) {
      if (count < maxCount - 1) continue;
      const lab = labs[index];
      const distance =
        ownLab === undefined || lab === undefined
          ? Number.POSITIVE_INFINITY
          : (lab.L - ownLab.L) ** 2 + (lab.a - ownLab.a) ** 2 + (lab.b - ownLab.b) ** 2;
      if (distance < bestDistance || (distance === bestDistance && count > bestCount)) {
        replacement = index;
        bestCount = count;
        bestDistance = distance;
      }
    }
    result[cell] = replacement;
  }
  return result;
}

export interface OutlineInput {
  readonly palette: readonly Rgb[];
  readonly indices: readonly number[];
  readonly size: number;
  readonly backgroundIndex: number | null;
}

/** One-pixel contour on the subject side of the silhouette, in the darkest entry. */
export function outlineSubject(input: OutlineInput): number[] {
  const { size, backgroundIndex } = input;
  if (backgroundIndex === null) return [...input.indices];
  const labs = input.palette.map((entry) => srgbToOklab(entry));
  let darkest = -1;
  let darkestLightness = Number.POSITIVE_INFINITY;
  for (let index = 0; index < labs.length; index += 1) {
    if (index === backgroundIndex) continue;
    const entry = labs[index];
    if (entry === undefined) continue;
    if (entry.L < darkestLightness) {
      darkestLightness = entry.L;
      darkest = index;
    }
  }
  if (darkest < 0) return [...input.indices];

  const result = [...input.indices];
  const edge: number[] = [];
  for (let cell = 0; cell < result.length; cell += 1) {
    if (result[cell] === backgroundIndex || result[cell] === darkest) continue;
    if (neighbours(cell, size).some((neighbour) => result[neighbour] === backgroundIndex)) {
      edge.push(cell);
    }
  }
  for (const cell of edge) result[cell] = darkest;
  return result;
}
