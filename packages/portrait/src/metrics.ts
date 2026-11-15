import type { PixelPortrait } from "@sf-fight-club/schemas";
import { hexToRgb, isSkinLab, srgbToOklab } from "./color.js";

export interface PortraitMetrics {
  /** Share of pixels whose every 4-neighbour differs from them. */
  readonly speckleRatio: number;
  /** Fewest pixels covered by any palette entry, zero entries included. */
  readonly paletteMinCoverage: number;
  /**
   * 4-connected background regions. A tight crop lets the head split the
   * backdrop into several pieces, so more than one is expected; what matters is
   * that every piece reaches the border.
   */
  readonly backgroundComponents: number;
  /** Background regions cut off from the border, i.e. holes inside the subject. */
  readonly backgroundLeaks: number;
  readonly backgroundTouchesBorder: boolean;
  /** Share of the frame that is not background. */
  readonly subjectShare: number;
  readonly backgroundIndex: number | null;
}

function neighboursOf(cell: number, size: number): number[] {
  const x = cell % size;
  const y = (cell - x) / size;
  const out: number[] = [];
  if (x > 0) out.push(cell - 1);
  if (x + 1 < size) out.push(cell + 1);
  if (y > 0) out.push(cell - size);
  if (y + 1 < size) out.push(cell + size);
  return out;
}

/**
 * The backdrop is the entry the frame corners agree on, matching how the
 * pipeline settles it. The plain border is a poor witness: on a tight crop the
 * shoulders run along the bottom and sides and would outvote the backdrop.
 *
 * Skin-toned corner entries are skipped for the same reason the pipeline skips
 * them: a warm wall or curtain behind the head is not the backdrop, and reading
 * it as one would disagree with the background the cleanup actually painted.
 */
function cornerIndex(portrait: PixelPortrait): number | null {
  const { size, pixels, palette } = portrait;
  const side = Math.max(2, Math.floor(size * 0.22));
  const tally = new Map<number, number>();
  for (let cell = 0; cell < pixels.length; cell += 1) {
    const x = cell % size;
    const y = (cell - x) / size;
    const inCorner = (x < side || x >= size - side) && (y < side || y >= size - side);
    if (!inCorner) continue;
    const index = pixels[cell] ?? 0;
    tally.set(index, (tally.get(index) ?? 0) + 1);
  }
  const ranked = [...tally.entries()].sort(
    (left, right) => right[1] - left[1] || left[0] - right[0],
  );
  for (const [index] of ranked) {
    const hex = palette[index];
    if (hex === undefined) continue;
    if (isSkinLab(srgbToOklab(hexToRgb(hex)))) continue;
    return index;
  }
  return ranked[0]?.[0] ?? null;
}

function touchesBorder(portrait: PixelPortrait, index: number): boolean {
  const { size, pixels } = portrait;
  for (let cell = 0; cell < pixels.length; cell += 1) {
    const x = cell % size;
    const y = (cell - x) / size;
    if (x !== 0 && y !== 0 && x !== size - 1 && y !== size - 1) continue;
    if (pixels[cell] === index) return true;
  }
  return false;
}

interface Components {
  readonly total: number;
  readonly leaks: number;
}

function backgroundComponents(portrait: PixelPortrait, index: number): Components {
  const { size, pixels } = portrait;
  const seen = new Uint8Array(pixels.length);
  let total = 0;
  let leaks = 0;
  const stack: number[] = [];
  for (let start = 0; start < pixels.length; start += 1) {
    if (pixels[start] !== index || seen[start] === 1) continue;
    total += 1;
    seen[start] = 1;
    stack.push(start);
    let onBorder = false;
    while (stack.length > 0) {
      const cell = stack.pop();
      if (cell === undefined) break;
      const x = cell % size;
      const y = (cell - x) / size;
      if (x === 0 || y === 0 || x === size - 1 || y === size - 1) onBorder = true;
      for (const neighbour of neighboursOf(cell, size)) {
        if (seen[neighbour] === 1 || pixels[neighbour] !== index) continue;
        seen[neighbour] = 1;
        stack.push(neighbour);
      }
    }
    if (!onBorder) leaks += 1;
  }
  return { total, leaks };
}

/** The numbers the contact sheet prints and the tests assert, from one place. */
export function portraitMetrics(portrait: PixelPortrait): PortraitMetrics {
  const { size, pixels, palette } = portrait;
  const total = pixels.length;
  let speckled = 0;
  for (let cell = 0; cell < total; cell += 1) {
    const around = neighboursOf(cell, size);
    if (around.length === 0) continue;
    const own = pixels[cell] ?? 0;
    if (around.every((neighbour) => pixels[neighbour] !== own)) speckled += 1;
  }

  const counts = new Array<number>(palette.length).fill(0);
  for (const index of pixels) counts[index] = (counts[index] ?? 0) + 1;

  const backgroundIndex = cornerIndex(portrait);
  const backgroundCells = backgroundIndex === null ? 0 : (counts[backgroundIndex] ?? 0);
  const components =
    backgroundIndex === null ? { total: 0, leaks: 0 } : backgroundComponents(portrait, backgroundIndex);

  return {
    speckleRatio: total === 0 ? 0 : speckled / total,
    paletteMinCoverage: counts.length === 0 ? 0 : Math.min(...counts),
    backgroundComponents: components.total,
    backgroundLeaks: components.leaks,
    backgroundTouchesBorder:
      backgroundIndex === null ? false : touchesBorder(portrait, backgroundIndex),
    subjectShare: total === 0 ? 0 : 1 - backgroundCells / total,
    backgroundIndex,
  };
}
