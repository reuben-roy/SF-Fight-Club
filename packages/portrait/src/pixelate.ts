import type { PixelPortrait } from "@sf-fight-club/schemas";

import { despeckle, outlineSubject } from "./clean.js";
import { nearestLabIndex, rgbToHex, srgbToOklab, type Rgb } from "./color.js";
import { flattenBackground } from "./flatten.js";
import { transparentShare } from "./image.js";
import { quantize } from "./quantize.js";
import { portraitReference } from "./reference.js";
import { stretchTone } from "./tone.js";
import {
  PORTRAIT_SIZE,
  type PixelateInput,
  type PortraitNoneReason,
  type PortraitResult,
} from "./types.js";

const MAX_SOURCE_SIDE = 8192;
const MAX_TRANSPARENT_SHARE = 0.6;
const MIN_TONE_SPREAD = 10;
const MAX_PALETTE = 12;
const MIN_PALETTE = 2;
const BACKGROUND_TOLERANCE = 0.035;

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

function spreadOf(rgb: Float64Array): number {
  let min = 255;
  let max = 0;
  for (let index = 0; index < rgb.length; index += 1) {
    const value = rgb[index] ?? 0;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return max - min;
}

/** Drop unused and duplicate entries so the stored palette is exactly what the pixels use. */
function compact(palette: readonly Rgb[], indices: readonly number[]): PixelPortrait | null {
  const used = new Set(indices);
  const order = [...used].sort((left, right) => left - right);
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

function borderPaletteIndex(
  palette: readonly Rgb[],
  indices: readonly number[],
  size: number,
): number | null {
  const tally = new Map<number, number>();
  for (let cell = 0; cell < indices.length; cell += 1) {
    const x = cell % size;
    const y = (cell - x) / size;
    if (x !== 0 && y !== 0 && x !== size - 1 && y !== size - 1) continue;
    const index = indices[cell] ?? 0;
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
  return best !== null && palette[best] !== undefined ? best : null;
}

/**
 * Turn a decoded RGBA image into a 32x32 indexed portrait.
 *
 * Pure and deterministic: no clock, no randomness, no I/O. The same bytes always
 * give the same portrait. The pipeline after framing is deliberately short:
 * area-average downsample, a mild monotonic lightness stretch, and k-means in
 * OKLab. Every extra cleanup step moves the result further from the photo.
 */
function renderPortrait(input: PixelateInput): PortraitResult {
  const reference = portraitReference(input);
  if (reference === null) return fail("invalid_input");
  if (transparentShare(input, reference.crop) > MAX_TRANSPARENT_SHARE) {
    return fail("transparent");
  }
  if (spreadOf(reference.rgb) < MIN_TONE_SPREAD) return fail("empty");

  const flattened =
    input.options?.flattenBackground === true
      ? flattenBackground({
          rgb: reference.rgb,
          size: PORTRAIT_SIZE,
          tolerance: BACKGROUND_TOLERANCE,
        })
      : { rgb: reference.rgb, background: null };

  const tone = stretchTone(flattened.rgb, PORTRAIT_SIZE);
  const quantized = quantize({
    rgb: tone.rgb,
    size: PORTRAIT_SIZE,
    paletteSize: input.options?.paletteSize ?? MAX_PALETTE,
  });
  if (quantized.palette.length < MIN_PALETTE) return fail("empty");

  const cleaned = despeckle({
    palette: quantized.palette,
    indices: quantized.indices,
    size: PORTRAIT_SIZE,
  });

  let indices = cleaned;
  if (input.options?.outline === true) {
    const backgroundIndex =
      flattened.background === null
        ? borderPaletteIndex(quantized.palette, cleaned, PORTRAIT_SIZE)
        : nearestLabIndex(
            quantized.palette.map((entry) => srgbToOklab(entry)),
            srgbToOklab(flattened.background),
          );
    indices = outlineSubject({
      palette: quantized.palette,
      indices: cleaned,
      size: PORTRAIT_SIZE,
      backgroundIndex,
    });
  }

  const portrait = compact(quantized.palette, indices);
  if (portrait === null) return fail("empty");
  return { kind: "ok", portrait };
}

export function pixelatePortrait(input: PixelateInput): PortraitResult {
  const invalid = validate(input);
  if (invalid !== null) return fail(invalid);
  if (input.width < PORTRAIT_SIZE || input.height < PORTRAIT_SIZE) return fail("too_small");
  return renderPortrait(input);
}

export { PORTRAIT_SIZE };
