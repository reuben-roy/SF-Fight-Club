import type { PixelPortrait } from "@sf-fight-club/schemas";

import { clamp, distanceSq, luma, nearestIndex, rgbToHex, type Rgb } from "./color.js";
import { liftContrast, normalizeLevels, toneSpread, unsharp } from "./enhance.js";
import { flattenBackground } from "./flatten.js";
import { downsample, resolveSquareCrop, transparentShare } from "./image.js";
import { quantize } from "./quantize.js";
import type {
  PixelateInput,
  PortraitNoneReason,
  PortraitResult,
} from "./types.js";

export const PORTRAIT_SIZE = 24;
const MAX_SOURCE_SIDE = 8192;
const MAX_TRANSPARENT_SHARE = 0.6;
const MIN_TONE_SPREAD = 10;
const SHARPEN_STRENGTH = 0.6;
const CONTRAST_AMOUNT = 0.08;
const LEVELS_LOW = 0.03;
const LEVELS_HIGH = 0.97;
const LEVELS_MIN_RANGE = 18;
const BACKGROUND_TOLERANCE = 46;
const MAX_PALETTE = 8;
const MIN_PALETTE = 2;

function fail(reason: PortraitNoneReason): PortraitResult {
  return { kind: "none", reason };
}

function validate(input: PixelateInput): PortraitNoneReason | null {
  const { width, height, rgba, options } = input;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    return "invalid_input";
  }
  if (width > MAX_SOURCE_SIDE || height > MAX_SOURCE_SIDE) return "too_large";
  if (rgba.length !== width * height * 4) return "invalid_input";
  if (options?.paletteSize !== undefined) {
    const { paletteSize } = options;
    if (!Number.isInteger(paletteSize) || paletteSize < MIN_PALETTE || paletteSize > MAX_PALETTE) {
      return "invalid_input";
    }
  }
  if (options?.crop !== undefined) {
    const { x, y, width: cropWidth, height: cropHeight } = options.crop;
    const finite = [x, y, cropWidth, cropHeight].every((value) => Number.isFinite(value));
    if (!finite || cropWidth <= 0 || cropHeight <= 0) return "invalid_input";
  }
  return null;
}

/** Drop unused and duplicate entries so the stored palette is exactly what the pixels use. */
function compact(palette: readonly Rgb[], indices: readonly number[]): PixelPortrait | null {
  const used = new Set(indices);
  const order = [...used].sort((a, b) => a - b);
  const hexes: string[] = [];
  const remap = new Map<number, number>();
  for (const index of order) {
    const color = palette[index];
    if (color === undefined) continue;
    const hex = rgbToHex(color);
    let target = hexes.indexOf(hex);
    if (target === -1) {
      hexes.push(hex);
      target = hexes.length - 1;
    }
    remap.set(index, target);
  }
  if (hexes.length < MIN_PALETTE || hexes.length > MAX_PALETTE) return null;
  const pixels = indices.map((index) => remap.get(index) ?? 0);
  return { size: PORTRAIT_SIZE, palette: hexes, pixels };
}

function addOutline(input: {
  readonly palette: readonly Rgb[];
  readonly indices: readonly number[];
  readonly size: number;
  readonly background: Rgb;
  readonly maxPalette: number;
}): { palette: Rgb[]; indices: number[] } {
  const { size, background, maxPalette } = input;
  const palette = [...input.palette];
  const indices = [...input.indices];
  const backgroundIndex = nearestIndex(palette, background);

  const outlineCells: number[] = [];
  for (let cell = 0; cell < indices.length; cell += 1) {
    if (indices[cell] !== backgroundIndex) continue;
    const x = cell % size;
    const y = (cell - x) / size;
    const neighbours = [
      x > 0 ? cell - 1 : -1,
      x < size - 1 ? cell + 1 : -1,
      y > 0 ? cell - size : -1,
      y < size - 1 ? cell + size : -1,
    ];
    if (neighbours.some((neighbour) => neighbour >= 0 && indices[neighbour] !== backgroundIndex)) {
      outlineCells.push(cell);
    }
  }
  if (outlineCells.length === 0) return { palette, indices };

  let darkest = 0;
  let darkestLuma = Number.POSITIVE_INFINITY;
  for (let i = 0; i < palette.length; i += 1) {
    const color = palette[i];
    if (color === undefined) continue;
    const value = luma(color[0], color[1], color[2]);
    if (value < darkestLuma) {
      darkestLuma = value;
      darkest = i;
    }
  }
  const base = palette[darkest] ?? [0, 0, 0];
  const outline: Rgb = [
    clamp(base[0] * 0.45, 0, 255),
    clamp(base[1] * 0.45, 0, 255),
    clamp(base[2] * 0.45, 0, 255),
  ];

  const existing = palette.findIndex((color) => distanceSq(color, outline) < 12 * 12);
  let outlineIndex: number;
  if (existing >= 0) {
    outlineIndex = existing;
  } else if (palette.length < maxPalette) {
    palette.push(outline);
    outlineIndex = palette.length - 1;
  } else {
    outlineIndex = darkest;
  }

  for (const cell of outlineCells) indices[cell] = outlineIndex;
  return { palette, indices };
}

/**
 * Turn a decoded RGBA image into a 24x24 indexed portrait.
 *
 * Pure and deterministic: no clock, no randomness, no I/O. The same bytes always
 * give the same portrait. Anything that cannot make a recognisable face returns
 * `kind: "none"` and the founder keeps a generated figure.
 */
export function pixelatePortrait(input: PixelateInput): PortraitResult {
  const invalid = validate(input);
  if (invalid !== null) return fail(invalid);
  if (input.width < PORTRAIT_SIZE || input.height < PORTRAIT_SIZE) return fail("too_small");

  const crop = resolveSquareCrop({
    width: input.width,
    height: input.height,
    ...(input.options?.crop === undefined ? {} : { crop: input.options.crop }),
  });
  if (crop === null) return fail("invalid_input");

  if (transparentShare(input, crop) > MAX_TRANSPARENT_SHARE) return fail("transparent");

  const grid = downsample(input, crop, PORTRAIT_SIZE);
  const covered = grid.coverage.reduce((sum, value) => sum + value, 0) / grid.coverage.length;
  if (covered < 1 - MAX_TRANSPARENT_SHARE) return fail("transparent");
  if (toneSpread(grid.rgb) < MIN_TONE_SPREAD) return fail("empty");

  const leveled = normalizeLevels({
    rgb: grid.rgb,
    lowPercentile: LEVELS_LOW,
    highPercentile: LEVELS_HIGH,
    minRange: LEVELS_MIN_RANGE,
  });
  const sharpened = unsharp(leveled, PORTRAIT_SIZE, SHARPEN_STRENGTH);
  const contrasted = liftContrast(sharpened, CONTRAST_AMOUNT);

  const flatten = input.options?.flattenBackground ?? true;
  const flattened = flatten
    ? flattenBackground({ rgb: contrasted, size: PORTRAIT_SIZE, tolerance: BACKGROUND_TOLERANCE })
    : { rgb: contrasted, background: null };

  const { palette, indices } = quantize({
    rgb: flattened.rgb,
    size: PORTRAIT_SIZE,
    paletteSize: input.options?.paletteSize ?? MAX_PALETTE,
    dither: input.options?.dither ?? false,
  });
  if (palette.length < MIN_PALETTE) return fail("empty");

  const outlined =
    (input.options?.outline ?? true) && flattened.background !== null
      ? addOutline({
          palette,
          indices,
          size: PORTRAIT_SIZE,
          background: flattened.background,
          maxPalette: input.options?.paletteSize ?? MAX_PALETTE,
        })
      : { palette, indices };

  const portrait = compact(outlined.palette, outlined.indices);
  if (portrait === null) return fail("empty");
  return { kind: "ok", portrait };
}
