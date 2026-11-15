import type { PixelPortrait } from "@sf-fight-club/schemas";

export interface PortraitMetrics {
  /** Share of interior pixels whose every 4-neighbour differs from them. */
  readonly speckleRatio: number;
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

/** The numbers the contact sheet prints and the tests assert. */
export function portraitMetrics(portrait: PixelPortrait): PortraitMetrics {
  const { size, pixels } = portrait;
  let candidates = 0;
  let speckled = 0;
  for (let cell = 0; cell < pixels.length; cell += 1) {
    const x = cell % size;
    const y = (cell - x) / size;
    if (x === 0 || y === 0 || x === size - 1 || y === size - 1) continue;
    candidates += 1;
    const own = pixels[cell] ?? 0;
    if (neighboursOf(cell, size).every((neighbour) => pixels[neighbour] !== own)) speckled += 1;
  }
  return { speckleRatio: candidates === 0 ? 0 : speckled / candidates };
}
