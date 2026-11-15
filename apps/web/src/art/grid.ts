/**
 * Pixel grid primitives shared by mascots, crew and icons.
 *
 * A grid cell holds a palette slot number. 0 is transparent. The ink slot is
 * added automatically around every opaque shape, which keeps every class on
 * the same crisp outline without hand-drawing it per part.
 */

export const GRID_SIZE = 48;

export const SLOT = {
  transparent: 0,
  ink: 1,
  body: 2,
  bodyShade: 3,
  bodyLight: 4,
  accent: 5,
  accentLight: 6,
  metal: 7,
  metalLight: 8,
  eye: 9,
  white: 10,
  trim: 11,
} as const;

export type Slot = (typeof SLOT)[keyof typeof SLOT];

export const PALETTE_SLOTS = 12;

export type PixelGrid = number[][];

export function createGrid(size: number = GRID_SIZE): PixelGrid {
  return Array.from({ length: size }, () => new Array<number>(size).fill(SLOT.transparent));
}

export function cloneGrid(grid: PixelGrid): PixelGrid {
  return grid.map((row) => row.slice());
}

export function put(grid: PixelGrid, x: number, y: number, slot: number): void {
  const row = grid[y];
  if (!row || x < 0 || x >= row.length) return;
  row[x] = slot;
}

export function get(grid: PixelGrid, x: number, y: number): number {
  return grid[y]?.[x] ?? SLOT.transparent;
}

export function rect(grid: PixelGrid, x: number, y: number, width: number, height: number, slot: number): void {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) put(grid, px, py, slot);
  }
}

export function ellipse(grid: PixelGrid, cx: number, cy: number, rx: number, ry: number, slot: number): void {
  for (let y = cy - ry; y <= cy + ry; y += 1) {
    const dy = (y - cy) / Math.max(1, ry);
    const span = Math.floor(rx * Math.sqrt(Math.max(0, 1 - dy * dy)));
    for (let x = cx - span; x <= cx + span; x += 1) put(grid, x, y, slot);
  }
}

export function line(grid: PixelGrid, x0: number, y0: number, x1: number, y1: number, slot: number, thickness = 1): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let index = 0; index <= steps; index += 1) {
    const x = Math.round(x0 + ((x1 - x0) * index) / steps);
    const y = Math.round(y0 + ((y1 - y0) * index) / steps);
    rect(grid, x, y, thickness, thickness, slot);
  }
}

/** Adds one ink pixel around every opaque area, then returns the grid. */
export function addOutline(grid: PixelGrid): PixelGrid {
  const size = grid.length;
  const source = cloneGrid(grid);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const slot = source[y]?.[x] ?? SLOT.transparent;
      if (slot === SLOT.ink) continue;
      if (slot !== SLOT.transparent) continue;
      const neighbour =
        (source[y - 1]?.[x] ?? 0) > SLOT.ink ||
        (source[y + 1]?.[x] ?? 0) > SLOT.ink ||
        (source[y]?.[x - 1] ?? 0) > SLOT.ink ||
        (source[y]?.[x + 1] ?? 0) > SLOT.ink;
      if (neighbour) put(grid, x, y, SLOT.ink);
    }
  }
  return grid;
}

/** All non-ink pixels become white. Used for the one-frame hit flash. */
export function flashWhite(grid: PixelGrid): PixelGrid {
  return grid.map((row) =>
    row.map((slot) => (slot === SLOT.transparent || slot === SLOT.ink ? slot : SLOT.white)),
  );
}

export interface GridPixel {
  x: number;
  y: number;
  slot: number;
}

export function pixels(grid: PixelGrid): GridPixel[] {
  const out: GridPixel[] = [];
  for (let y = 0; y < grid.length; y += 1) {
    const row = grid[y];
    if (!row) continue;
    for (let x = 0; x < row.length; x += 1) {
      const slot = row[x] ?? SLOT.transparent;
      if (slot !== SLOT.transparent) out.push({ x, y, slot });
    }
  }
  return out;
}

/** The flat silhouette used by the class-reading test and the gallery toggle. */
export function silhouette(grid: PixelGrid): boolean[][] {
  return grid.map((row) => row.map((slot) => slot !== SLOT.transparent));
}
