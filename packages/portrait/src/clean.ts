import {
  isSkinLab,
  labDistance,
  nearestLabIndex,
  oklabToSrgb,
  srgbToOklab,
  type Lab,
  type Rgb,
} from "./color.js";

const MAX_DESPECKLE_PASSES = 6;
const MAX_COMPONENT_PASSES = 3;
const MAX_BACKGROUND_PASSES = 4;
const MAX_COMPONENT_CELLS = 2;
/** A cell this much darker than all four neighbours is a drawn feature, not noise. */
const DARK_FEATURE_MARGIN = 0.05;
/** A feature needs a neighbour this close in lightness; a lone dark dot is a speckle. */
const FEATURE_PARTNER = 0.12;
/** Share of the frame the background may take before it is implausible. */
const MIN_BACKGROUND_SHARE = 0.05;
const MAX_BACKGROUND_SHARE = 0.92;
/** Side of the corner patch, as a share of the frame, that nominates the background. */
const CORNER_SHARE = 0.22;

export interface SettleResult {
  readonly indices: number[];
  readonly backgroundIndex: number;
}

export interface CleanInput {
  readonly palette: readonly Rgb[];
  readonly indices: number[];
  readonly size: number;
  /** Palette index of the flat background, or null when the background was left alone. */
  readonly backgroundIndex: number | null;
}

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

function lightnessOf(palette: readonly Lab[]): (index: number) => number {
  return (index: number) => palette[index]?.L ?? 0;
}

function labPalette(palette: readonly Rgb[]): Lab[] {
  return palette.map((entry) => srgbToOklab(entry));
}

/**
 * True when every neighbour is lighter and one of them is dark too: eyes, brows,
 * nostrils and mouth lines. At 24x24 a feature that matters is at least two
 * cells long, so a dark dot with no dark partner is a speckle and gets smoothed.
 */
function isDarkFeature(
  cell: number,
  indices: readonly number[],
  size: number,
  lightness: (index: number) => number,
): boolean {
  const own = lightness(indices[cell] ?? 0);
  const around = neighbours(cell, size);
  if (around.length === 0) return false;
  let partner = false;
  for (const neighbour of around) {
    const other = lightness(indices[neighbour] ?? 0);
    if (own >= other - DARK_FEATURE_MARGIN) return false;
    if (other - own <= FEATURE_PARTNER) partner = true;
  }
  return partner;
}

function majorityNeighbour(
  cell: number,
  indices: readonly number[],
  size: number,
  exclude: number,
): number | null {
  const tally = new Map<number, number>();
  for (const neighbour of neighbours(cell, size)) {
    const index = indices[neighbour] ?? 0;
    if (index === exclude) continue;
    tally.set(index, (tally.get(index) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestCount = 0;
  for (const [index, count] of tally) {
    if (count > bestCount || (count === bestCount && best !== null && index < best)) {
      best = index;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Replace cells whose four neighbours all disagree with them. A single stray
 * pixel of a contrasting colour is what made skin read as static; smoothing it
 * away before anything else runs keeps the palette honest about the face.
 */
export function despeckle(input: CleanInput): number[] {
  const { size } = input;
  const indices = [...input.indices];
  const lightness = lightnessOf(labPalette(input.palette));
  for (let pass = 0; pass < MAX_DESPECKLE_PASSES; pass += 1) {
    let changed = false;
    for (let cell = 0; cell < indices.length; cell += 1) {
      const own = indices[cell] ?? 0;
      const around = neighbours(cell, size);
      if (around.length === 0) continue;
      if (around.some((neighbour) => indices[neighbour] === own)) continue;
      if (isDarkFeature(cell, indices, size, lightness)) continue;
      const replacement = majorityNeighbour(cell, indices, size, own);
      if (replacement === null) continue;
      indices[cell] = replacement;
      changed = true;
    }
    if (!changed) break;
  }
  return indices;
}

interface Component {
  readonly index: number;
  readonly members: number[];
}

function componentsOf(indices: readonly number[], size: number): Component[] {
  const seen = new Uint8Array(indices.length);
  const out: Component[] = [];
  const stack: number[] = [];
  for (let start = 0; start < indices.length; start += 1) {
    if (seen[start] === 1) continue;
    const index = indices[start] ?? 0;
    const members: number[] = [];
    seen[start] = 1;
    stack.push(start);
    while (stack.length > 0) {
      const cell = stack.pop();
      if (cell === undefined) break;
      members.push(cell);
      for (const neighbour of neighbours(cell, size)) {
        if (seen[neighbour] === 1) continue;
        if (indices[neighbour] !== index) continue;
        seen[neighbour] = 1;
        stack.push(neighbour);
      }
    }
    out.push({ index, members });
  }
  return out;
}

/** Fold one- and two-pixel islands back into their surroundings, leaving protected features alone. */
export function removeSmallComponents(input: CleanInput): number[] {
  const { size } = input;
  const indices = [...input.indices];
  const lightness = lightnessOf(labPalette(input.palette));
  for (let pass = 0; pass < MAX_COMPONENT_PASSES; pass += 1) {
    let changed = false;
    for (const component of componentsOf(indices, size)) {
      if (component.members.length > MAX_COMPONENT_CELLS) continue;
      if (component.index === input.backgroundIndex) continue;
      if (component.members.some((cell) => isDarkFeature(cell, indices, size, lightness))) continue;
      const tally = new Map<number, number>();
      for (const cell of component.members) {
        for (const neighbour of neighbours(cell, size)) {
          const index = indices[neighbour] ?? 0;
          if (index === component.index) continue;
          tally.set(index, (tally.get(index) ?? 0) + 1);
        }
      }
      let replacement: number | null = null;
      let bestCount = 0;
      for (const [index, count] of tally) {
        if (count > bestCount) {
          replacement = index;
          bestCount = count;
        }
      }
      if (replacement === null) continue;
      for (const cell of component.members) indices[cell] = replacement;
      changed = true;
    }
    if (!changed) break;
  }
  return indices;
}

/**
 * One flat background, chosen from the quantised grid. Flattening before
 * quantisation cannot see the palette, so on a busy backdrop it bails and the
 * frame keeps a dozen near-background colours. Here the frame corners pick the
 * entry, since a tight head crop leaves backdrop in the corners, and the flood
 * runs inward through colours close to it. Only the border region can become
 * background, so a wall can never be sealed off inside the face.
 *
 * The mask is opened before it is painted. A 24x24 downsample of a busy backdrop
 * leaves one-pixel fingers reaching into the face, and a finger is exactly the
 * "background pixel inside the face" the reviewer flagged.
 */
export function settleBackground(input: {
  readonly palette: readonly Rgb[];
  readonly indices: readonly number[];
  readonly size: number;
  readonly tolerance: number;
}): SettleResult | null {
  const { palette, size } = input;
  const indices = [...input.indices];
  const labs = labPalette(palette);
  const onBorder = (cell: number): boolean => {
    const x = cell % size;
    const y = (cell - x) / size;
    return x === 0 || y === 0 || x === size - 1 || y === size - 1;
  };
  const corner = Math.max(2, Math.floor(size * CORNER_SHARE));
  const cornerCounts = new Array<number>(palette.length).fill(0);
  for (let cell = 0; cell < indices.length; cell += 1) {
    const x = cell % size;
    const y = (cell - x) / size;
    const inCorner =
      (x < corner || x >= size - corner) && (y < corner || y >= size - corner);
    if (!inCorner) continue;
    const index = indices[cell] ?? 0;
    cornerCounts[index] = (cornerCounts[index] ?? 0) + 1;
  }
  const ranked: number[] = [];
  for (let index = 0; index < cornerCounts.length; index += 1) {
    if ((cornerCounts[index] ?? 0) > 0) ranked.push(index);
  }
  ranked.sort((left, right) => (cornerCounts[right] ?? 0) - (cornerCounts[left] ?? 0) || left - right);
  let seed = -1;
  for (const index of ranked) {
    const lab = labs[index];
    if (lab === undefined) continue;
    if (isSkinLab(lab)) continue;
    seed = index;
    break;
  }
  if (seed < 0) seed = ranked[0] ?? -1;
  const seedLab = labs[seed];
  if (seedLab === undefined) return null;

  const reaches = (cell: number): boolean => {
    const index = indices[cell] ?? 0;
    if (index === seed) return true;
    const lab = labs[index];
    return lab !== undefined && labDistance(lab, seedLab) <= input.tolerance;
  };
  let outside = new Uint8Array(indices.length);
  let queue: number[] = [];
  for (let cell = 0; cell < indices.length; cell += 1) {
    if (!onBorder(cell) || !reaches(cell)) continue;
    outside[cell] = 1;
    queue.push(cell);
  }
  while (queue.length > 0) {
    const cell = queue.pop();
    if (cell === undefined) break;
    for (const neighbour of neighbours(cell, size)) {
      if (outside[neighbour] === 1 || !reaches(neighbour)) continue;
      outside[neighbour] = 1;
      queue.push(neighbour);
    }
  }
  let flooded = 0;
  for (let cell = 0; cell < outside.length; cell += 1) if (outside[cell] === 1) flooded += 1;
  if (flooded < indices.length * MIN_BACKGROUND_SHARE) {
    outside = new Uint8Array(indices.length);
    for (let cell = 0; cell < outside.length; cell += 1) {
      if (onBorder(cell)) outside[cell] = 1;
    }
    flooded = 0;
    for (let cell = 0; cell < outside.length; cell += 1) if (outside[cell] === 1) flooded += 1;
  }
  if (flooded > indices.length * MAX_BACKGROUND_SHARE) return null;

  const opened = openMask(outside, size);
  for (let cell = 0; cell < indices.length; cell += 1) {
    if (opened[cell] === 1) indices[cell] = seed;
  }
  return { indices, backgroundIndex: seed };
}

/** Erode then dilate: cuts one-pixel fingers of background and fills one-pixel bites out of the subject. */
function openMask(mask: Uint8Array, size: number): Uint8Array {
  const eroded = new Uint8Array(mask.length);
  for (let cell = 0; cell < mask.length; cell += 1) {
    if (mask[cell] !== 1) continue;
    const x = cell % size;
    const y = (cell - x) / size;
    if (x === 0 || y === 0 || x === size - 1 || y === size - 1) {
      eroded[cell] = 1;
      continue;
    }
    const around = neighbours(cell, size);
    if (around.every((neighbour) => mask[neighbour] === 1)) eroded[cell] = 1;
  }
  const kept = new Uint8Array(mask.length);
  const queue: number[] = [];
  for (let cell = 0; cell < eroded.length; cell += 1) {
    const x = cell % size;
    const y = (cell - x) / size;
    const onBorder = x === 0 || y === 0 || x === size - 1 || y === size - 1;
    if (!onBorder || eroded[cell] !== 1) continue;
    kept[cell] = 1;
    queue.push(cell);
  }
  while (queue.length > 0) {
    const cell = queue.pop();
    if (cell === undefined) break;
    for (const neighbour of neighbours(cell, size)) {
      if (kept[neighbour] === 1 || eroded[neighbour] !== 1) continue;
      kept[neighbour] = 1;
      queue.push(neighbour);
    }
  }
  const dilated = new Uint8Array(mask.length);
  for (let cell = 0; cell < kept.length; cell += 1) {
    if (kept[cell] === 1) {
      dilated[cell] = 1;
      continue;
    }
    if (neighbours(cell, size).some((neighbour) => kept[neighbour] === 1)) dilated[cell] = 1;
  }
  return dilated;
}

/** Background that leaked inside the subject becomes subject; only the border region stays background. */
export function containBackground(input: CleanInput): number[] {
  const { size, backgroundIndex } = input;
  const indices = [...input.indices];
  if (backgroundIndex === null) return indices;
  for (let pass = 0; pass < MAX_BACKGROUND_PASSES; pass += 1) {
    const outside = new Uint8Array(indices.length);
    const queue: number[] = [];
    for (let cell = 0; cell < indices.length; cell += 1) {
      const x = cell % size;
      const y = (cell - x) / size;
      const onBorder = x === 0 || y === 0 || x === size - 1 || y === size - 1;
      if (!onBorder) continue;
      if (indices[cell] !== backgroundIndex) continue;
      outside[cell] = 1;
      queue.push(cell);
    }
    while (queue.length > 0) {
      const cell = queue.pop();
      if (cell === undefined) break;
      for (const neighbour of neighbours(cell, size)) {
        if (outside[neighbour] === 1) continue;
        if (indices[neighbour] !== backgroundIndex) continue;
        outside[neighbour] = 1;
        queue.push(neighbour);
      }
    }
    let changed = false;
    for (let cell = 0; cell < indices.length; cell += 1) {
      if (indices[cell] !== backgroundIndex || outside[cell] === 1) continue;
      const replacement = majorityNeighbour(cell, indices, size, backgroundIndex);
      if (replacement === null) continue;
      indices[cell] = replacement;
      changed = true;
    }
    if (!changed) break;
  }
  return indices;
}

/**
 * One-pixel contour on the subject's outer edge, in the darkest palette entry.
 * The subject's boundary is a closed curve, so every edge cell takes the same
 * colour and the line cannot break; the old outline painted the *background*
 * side, which read as a ring of loose black pixels wherever the mask was ragged.
 */
export function outlineSubject(input: CleanInput): number[] {
  const { size, backgroundIndex } = input;
  const indices = [...input.indices];
  const labs = labPalette(input.palette);
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
  if (darkest < 0) return indices;
  const edge: number[] = [];
  for (let cell = 0; cell < indices.length; cell += 1) {
    if (indices[cell] === backgroundIndex) continue;
    if (indices[cell] === darkest) continue;
    if (neighbours(cell, size).some((neighbour) => indices[neighbour] === backgroundIndex)) {
      edge.push(cell);
    }
  }
  for (const cell of edge) indices[cell] = darkest;
  return indices;
}

export interface PruneResult {
  readonly palette: Rgb[];
  readonly indices: number[];
  /** Where the tracked entry (the background) ended up, or null when it was folded away. */
  readonly tracked: number | null;
}

/**
 * Fold entries that cleanup left with almost no pixels into their nearest
 * neighbour, so no palette slot is spent on a colour the eye never finds.
 */
export function pruneRareEntries(input: {
  readonly palette: readonly Rgb[];
  readonly indices: readonly number[];
  readonly minCells: number;
  readonly track?: number;
}): PruneResult {
  const palette = [...input.palette];
  let indices = [...input.indices];
  let tracked = input.track ?? null;
  for (let guard = 0; guard < 8; guard += 1) {
    const labs = labPalette(palette);
    const counts = new Array<number>(palette.length).fill(0);
    for (const index of indices) counts[index] = (counts[index] ?? 0) + 1;
    const kept: number[] = [];
    const remap = new Map<number, number>();
    for (let index = 0; index < palette.length; index += 1) {
      if ((counts[index] ?? 0) >= input.minCells) {
        remap.set(index, kept.length);
        kept.push(index);
      }
    }
    if (kept.length === palette.length) break;
    if (kept.length < 2) break;
    const previous = tracked;
    tracked = previous === null ? null : (remap.get(previous) ?? null);
    indices = indices.map((index) => {
      const mapped = remap.get(index);
      if (mapped !== undefined) return mapped;
      const lab = labs[index];
      const source = lab === undefined ? { L: 0, a: 0, b: 0 } : lab;
      const candidates = kept.map((entry) => labs[entry] ?? { L: 0, a: 0, b: 0 });
      const nearest = kept[nearestLabIndex(candidates, source)] ?? kept[0] ?? 0;
      return remap.get(nearest) ?? 0;
    });
    for (let index = palette.length - 1; index >= 0; index -= 1) {
      if (!kept.includes(index)) palette.splice(index, 1);
    }
  }
  return { palette, indices, tracked };
}

/** Backdrop lightness must sit at least this far from the subject's to read as a silhouette. */
const MIN_SEPARATION = 0.18;
/** How far the backdrop is pushed from the subject when it is too close. */
const SEPARATION_PUSH = 0.3;

/**
 * A grey wall behind a white suit, or a dark room behind dark hair, leaves the
 * face with no edge to read against at 24x24. When the backdrop lands too close
 * to the subject's tone it is pushed away from it, keeping its own hue: light
 * faces get a darker backdrop, dark faces a lighter one.
 */
export function pushBackgroundApart(input: {
  readonly palette: readonly Rgb[];
  readonly indices: readonly number[];
  readonly backgroundIndex: number | null;
}): Rgb[] {
  const palette = [...input.palette];
  const { backgroundIndex } = input;
  if (backgroundIndex === null) return palette;
  const background = palette[backgroundIndex];
  if (background === undefined) return palette;

  let subjectSum = 0;
  let subjectCells = 0;
  const labs = labPalette(palette);
  for (const index of input.indices) {
    if (index === backgroundIndex) continue;
    subjectSum += labs[index]?.L ?? 0;
    subjectCells += 1;
  }
  if (subjectCells === 0) return palette;

  const backgroundLab = labs[backgroundIndex];
  if (backgroundLab === undefined) return palette;

  const subjectLightness = subjectSum / subjectCells;
  if (Math.abs(backgroundLab.L - subjectLightness) >= MIN_SEPARATION) return palette;

  const target =
    subjectLightness > 0.55
      ? Math.max(0.06, subjectLightness - SEPARATION_PUSH)
      : Math.min(0.94, subjectLightness + SEPARATION_PUSH);
  palette[backgroundIndex] = oklabToSrgb({ L: target, a: backgroundLab.a, b: backgroundLab.b });
  return palette;
}

