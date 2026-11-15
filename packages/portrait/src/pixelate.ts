import type { PixelPortrait } from "@sf-fight-club/schemas";

import {
  containBackground,
  despeckle,
  outlineSubject,
  pruneRareEntries,
  pushBackgroundApart,
  removeSmallComponents,
  settleBackground,
} from "./clean.js";
import { nearestLabIndex, rgbToHex, srgbToOklab, type Rgb } from "./color.js";
import { toneMap, toneSpread } from "./enhance.js";
import { flattenBackground } from "./flatten.js";
import { resolveTightCrop } from "./frame.js";
import { downsample, transparentShare } from "./image.js";
import { portraitMetrics } from "./metrics.js";
import { MIN_ENTRY_CELLS, quantize } from "./quantize.js";
import type { PixelateInput, PortraitNoneReason, PortraitResult } from "./types.js";

export const PORTRAIT_SIZE = 24;
const MAX_SOURCE_SIDE = 8192;
const MAX_TRANSPARENT_SHARE = 0.6;
const MIN_TONE_SPREAD = 10;
const MAX_PALETTE = 8;
const MIN_PALETTE = 2;
/** Mean OKLab chroma below which the photo has no usable colour and gets a narrower tone band. */
const MONO_CHROMA = 0.012;
/** OKLab distance within which a colour still counts as the backdrop. */
const BACKGROUND_TOLERANCE = 0.035;
/** Subject share the framing aims for; a head at 70-80% of the width covers this much area. */
const MIN_SUBJECT_SHARE = 0.45;
const MAX_SUBJECT_SHARE = 0.9;
/** Crop scales tried in order: as framed, then tighter, then looser. */
const FRAMING_SCALES = [1, 0.86, 0.74, 1.15];

const COLOR_TONES = {
  lowPercentile: 0.02,
  highPercentile: 0.98,
  minRange: 0.03,
  outputLow: 0.13,
  outputHigh: 0.92,
  gain: 1.3,
} as const;

/** Black and white keeps its midtones: the old per-channel stretch crushed it to two values. */
const MONO_TONES = {
  lowPercentile: 0.02,
  highPercentile: 0.98,
  minRange: 0.03,
  outputLow: 0.2,
  outputHigh: 0.86,
  gain: 1.15,
} as const;

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

function backgroundIndexOf(palette: readonly Rgb[], background: Rgb | null): number | null {
  if (background === null) return null;
  return nearestLabIndex(palette.map((entry) => srgbToOklab(entry)), srgbToOklab(background));
}

/**
 * Turn a decoded RGBA image into a 24x24 indexed portrait.
 *
 * Pure and deterministic: no clock, no randomness, no I/O. The same bytes always
 * give the same portrait. Anything that cannot make a recognisable face returns
 * `kind: "none"` and the founder keeps a generated figure.
 *
 * Order matters. Crop to the head, average down once, move tone in OKLab,
 * flatten the wall, quantise, and only then clean the 24x24 grid. Sharpening the
 * 24x24 image (the old pipeline) is what turned skin into static: there is no
 * detail left at that size to sharpen, only noise to amplify.
 */
function renderPortrait(input: PixelateInput, cropScale: number): PortraitResult {
  const crop = resolveTightCrop(input, input.options?.crop, cropScale);
  if (crop === null) return fail("invalid_input");
  if (transparentShare(input, crop) > MAX_TRANSPARENT_SHARE) return fail("transparent");

  const grid = downsample(input, crop, PORTRAIT_SIZE);
  const covered = grid.coverage.reduce((sum, value) => sum + value, 0) / grid.coverage.length;
  if (covered < 1 - MAX_TRANSPARENT_SHARE) return fail("transparent");
  if (toneSpread(grid.rgb) < MIN_TONE_SPREAD) return fail("empty");

  const wide = toneMap({ rgb: grid.rgb, size: PORTRAIT_SIZE, ...COLOR_TONES });
  const toned =
    wide.chroma < MONO_CHROMA
      ? toneMap({ rgb: grid.rgb, size: PORTRAIT_SIZE, ...MONO_TONES })
      : wide;

  const flattened =
    input.options?.flattenBackground ?? true
      ? flattenBackground({ rgb: toned.rgb, size: PORTRAIT_SIZE, tolerance: BACKGROUND_TOLERANCE })
      : { rgb: toned.rgb, background: null };

  const quantized = quantize({
    rgb: flattened.rgb,
    size: PORTRAIT_SIZE,
    paletteSize: input.options?.paletteSize ?? MAX_PALETTE,
    dither: input.options?.dither ?? false,
  });
  if (quantized.palette.length < MIN_PALETTE) return fail("empty");

  const settled = settleBackground({
    palette: quantized.palette,
    indices: quantized.indices,
    size: PORTRAIT_SIZE,
    tolerance: BACKGROUND_TOLERANCE,
  });
  const settledIndex =
    settled === null
      ? backgroundIndexOf(quantized.palette, flattened.background)
      : settled.backgroundIndex;
  let indices = settled === null ? quantized.indices : settled.indices;
  const palette = pushBackgroundApart({
    palette: quantized.palette,
    indices,
    backgroundIndex: settledIndex,
  });
  const backgroundIndex = settledIndex;
  const cleanInput = { palette, size: PORTRAIT_SIZE, backgroundIndex };
  indices = despeckle({ ...cleanInput, indices });
  indices = removeSmallComponents({ ...cleanInput, indices });
  indices = containBackground({ ...cleanInput, indices });
  indices = despeckle({ ...cleanInput, indices });
  indices = containBackground({ ...cleanInput, indices });

  const pruned = pruneRareEntries({
    palette,
    indices,
    minCells: MIN_ENTRY_CELLS,
    track: backgroundIndex ?? undefined,
  });
  const prunedBackground = pruned.tracked;
  const prunedInput = {
    palette: pruned.palette,
    size: PORTRAIT_SIZE,
    backgroundIndex: prunedBackground,
  };
  let cleaned = despeckle({ ...prunedInput, indices: pruned.indices });
  cleaned = containBackground({ ...prunedInput, indices: cleaned });
  const outlined =
    (input.options?.outline ?? false) && prunedBackground !== null
      ? outlineSubject({ ...prunedInput, indices: cleaned })
      : cleaned;

  const portrait = compact(pruned.palette, outlined);
  if (portrait === null) return fail("empty");
  return { kind: "ok", portrait };
}

function offTarget(share: number): number {
  if (share < MIN_SUBJECT_SHARE) return MIN_SUBJECT_SHARE - share;
  if (share > MAX_SUBJECT_SHARE) return share - MAX_SUBJECT_SHARE;
  return 0;
}

/**
 * A single face-width ratio cannot frame every photo: the skin region of a
 * tightly cropped face and of a full bust are the same fraction of the frame but
 * want different crops. So the crop is tried at a few scales and the first one
 * whose subject fills the frame within the accepted band wins, which is the
 * property the reviewer actually asked for.
 */
export function pixelatePortrait(input: PixelateInput): PortraitResult {
  const invalid = validate(input);
  if (invalid !== null) return fail(invalid);
  if (input.width < PORTRAIT_SIZE || input.height < PORTRAIT_SIZE) return fail("too_small");

  const first = renderPortrait(input, FRAMING_SCALES[0] ?? 1);
  if (first.kind !== "ok") return first;

  let best = first;
  let bestScore = offTarget(portraitMetrics(first.portrait).subjectShare);
  for (const scale of FRAMING_SCALES.slice(1)) {
    if (bestScore === 0) break;
    const next = renderPortrait(input, scale);
    if (next.kind !== "ok") continue;
    const score = offTarget(portraitMetrics(next.portrait).subjectShare);
    if (score < bestScore) {
      best = next;
      bestScore = score;
    }
  }
  return best;
}
