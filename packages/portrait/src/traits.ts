import { hexToRgb, isSkinLab, labChroma, labHue, oklabToSrgb, rgbToHex, scaleLightness, srgbToOklab, type Lab } from "./color.js";
import type { PixelPortrait } from "@sf-fight-club/schemas";

import type { PortraitGrid, PortraitTraits } from "./types.js";

const HAIR_BAND = 0.3;
const HAIR_BAND_WIDE = 0.46;
const SKIN_BAND_FROM = 0.32;
const SKIN_BAND_TO = 0.78;
const ACCENT_BAND_FROM = 0.8;
const SHADOW_LIGHTNESS_GAP = 0.03;
const SHADOW_HUE_TOLERANCE = 0.4;
const MIN_BAND_CELLS = 2;
const NUDGE_FACTORS = [0.65, 1.4, 0.45, 1.7, 0.3, 2.2];

interface Geometry {
  readonly top: number;
  readonly bottom: number;
  readonly backgroundIndex: number | null;
}

function borderBackground(indices: readonly number[], size: number): number | null {
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
    if (count > bestCount) {
      best = index;
      bestCount = count;
    }
  }
  return best;
}

function subjectGeometry(portrait: PixelPortrait): Geometry {
  const { size, pixels } = portrait;
  const backgroundIndex = borderBackground(pixels, size);
  let top: number = size;
  let bottom = -1;
  let subject = 0;
  for (let cell = 0; cell < pixels.length; cell += 1) {
    if (pixels[cell] === backgroundIndex) continue;
    subject += 1;
    const y = Math.floor(cell / size);
    if (y < top) top = y;
    if (y > bottom) bottom = y;
  }
  if (subject < MIN_BAND_CELLS || bottom < top) {
    return { top: 0, bottom: size - 1, backgroundIndex };
  }
  return { top, bottom, backgroundIndex };
}

function bandTally(
  portrait: PixelPortrait,
  fromRow: number,
  toRow: number,
  backgroundIndex: number | null,
): Map<number, number> {
  const { size, pixels } = portrait;
  const tally = new Map<number, number>();
  const from = Math.max(0, fromRow);
  const to = Math.min(size - 1, toRow);
  for (let y = from; y <= to; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = pixels[y * size + x];
      if (index === undefined) continue;
      if (index === backgroundIndex) continue;
      tally.set(index, (tally.get(index) ?? 0) + 1);
    }
  }
  return tally;
}

function mostCommon(tally: ReadonlyMap<number, number>): number | null {
  let best: number | null = null;
  let bestCount = 0;
  for (const [index, count] of tally) {
    if (count > bestCount) {
      best = index;
      bestCount = count;
    }
  }
  return best;
}

function darkestOf(tally: ReadonlyMap<number, number>, labs: readonly Lab[]): number | null {
  let best: number | null = null;
  let bestLightness = Number.POSITIVE_INFINITY;
  for (const [index, count] of tally) {
    if (count < MIN_BAND_CELLS) continue;
    const lab = labs[index];
    if (lab === undefined) continue;
    if (lab.L < bestLightness) {
      bestLightness = lab.L;
      best = index;
    }
  }
  return best;
}

function hexAt(portrait: PixelPortrait, index: number | null): string {
  const fallback = portrait.palette[0] ?? "#000000";
  if (index === null) return fallback;
  return portrait.palette[index] ?? fallback;
}

function nudgeApart(hex: string, avoid: readonly string[]): string {
  if (!avoid.includes(hex)) return hex;
  const lab = srgbToOklab(hexToRgb(hex));
  for (const factor of NUDGE_FACTORS) {
    const candidate = rgbToHex(oklabToSrgb(scaleLightness(lab, factor)));
    if (!avoid.includes(candidate)) return candidate;
  }
  return hex;
}

/**
 * Four colours that describe a face well enough to repaint it as a tiny
 * templated head: the skin tone a viewer remembers, its shadow, what sits on
 * the head, and what the person is wearing. Shrinking the 24x24 image to 10x10
 * destroyed the face; four colours plus a template survive at that size.
 */
export function portraitTraits(portrait: PixelPortrait): PortraitTraits {
  const { size } = portrait;
  const labs = portrait.palette.map((hex) => srgbToOklab(hexToRgb(hex)));
  const geometry = subjectGeometry(portrait);
  const height = Math.max(1, geometry.bottom - geometry.top + 1);
  const backgroundIndex = geometry.backgroundIndex;

  const hairTally = bandTally(
    portrait,
    geometry.top,
    geometry.top + Math.floor(height * HAIR_BAND) - 1,
    backgroundIndex,
  );
  const wideHairTally = bandTally(
    portrait,
    geometry.top,
    geometry.top + Math.floor(height * HAIR_BAND_WIDE) - 1,
    backgroundIndex,
  );
  const skinTally = bandTally(
    portrait,
    geometry.top + Math.floor(height * SKIN_BAND_FROM),
    geometry.top + Math.floor(height * SKIN_BAND_TO),
    backgroundIndex,
  );
  const accentTally = bandTally(
    portrait,
    geometry.top + Math.floor(height * ACCENT_BAND_FROM),
    geometry.bottom,
    backgroundIndex,
  );

  let skinIndex: number | null = null;
  let skinCount = 0;
  for (const [index, count] of skinTally) {
    const lab = labs[index];
    if (lab === undefined || !isSkinLab(lab)) continue;
    if (count > skinCount) {
      skinCount = count;
      skinIndex = index;
    }
  }
  if (skinIndex === null) skinIndex = mostCommon(skinTally);
  if (skinIndex === null) skinIndex = mostCommon(wideHairTally);

  const hairIndex =
    mostCommon(hairTally) ?? mostCommon(wideHairTally) ?? darkestOf(wideHairTally, labs);

  let accentIndex: number | null = null;
  let accentCount = 0;
  for (const [index, count] of accentTally) {
    if (index === skinIndex || index === hairIndex) continue;
    if (count > accentCount) {
      accentCount = count;
      accentIndex = index;
    }
  }
  if (accentIndex === null) accentIndex = mostCommon(accentTally);
  if (accentIndex === null) accentIndex = darkestOf(wideHairTally, labs);

  const skin = hexAt(portrait, skinIndex);
  const hair = nudgeApart(hexAt(portrait, hairIndex), [skin]);
  const accent = hexAt(portrait, accentIndex);

  const skinLab = srgbToOklab(hexToRgb(skin));
  let shadowHex: string | null = null;
  let shadowLightness = Number.POSITIVE_INFINITY;
  for (let index = 0; index < portrait.palette.length; index += 1) {
    if (index === skinIndex) continue;
    const lab = labs[index];
    if (lab === undefined) continue;
    if (lab.L >= skinLab.L - SHADOW_LIGHTNESS_GAP) continue;
    if (labChroma(lab) > 0.004) {
      const hueGap = Math.abs(labHue(lab) - labHue(skinLab));
      if (hueGap > SHADOW_HUE_TOLERANCE) continue;
    }
    if (lab.L < shadowLightness) {
      shadowLightness = lab.L;
      shadowHex = portrait.palette[index] ?? null;
    }
  }
  const skinShadow =
    shadowHex ?? rgbToHex(oklabToSrgb(scaleLightness(skinLab, 0.62)));

  return {
    skin,
    skinShadow: nudgeApart(skinShadow, [skin]),
    hair,
    accent,
  };
}

const HEAD_TEMPLATE = [
  "..HHHHHH..",
  ".HHHHHHHH.",
  ".HHHHHHHH.",
  ".SSSSSSSS.",
  ".SSSSSSSS.",
  ".SSESSESS.",
  ".SSSSSSSS.",
  ".SSSSSSSS.",
  "..TTTTTT..",
  "CCCCCCCCCC",
] as const;

/**
 * The 10x10 head the crew figures use. A template reads as a face at that size
 * where a box reduction of the 24x24 portrait only ever reads as a blur.
 */
export function traitHead(traits: PortraitTraits, size = 10, background = "#1b1b28"): PortraitGrid {
  const hairLab = srgbToOklab(hexToRgb(traits.hair));
  const shadowLab = srgbToOklab(hexToRgb(traits.skinShadow));
  const accentLab = srgbToOklab(hexToRgb(traits.accent));
  const darkest = [hairLab, shadowLab, accentLab].reduce((best, lab) =>
    lab.L < best.L ? lab : best,
  );
  const eyeLab = darkest.L > 0.35 ? scaleLightness(darkest, 0.45) : darkest;

  const palette = [
    background,
    traits.hair,
    traits.skin,
    traits.skinShadow,
    traits.accent,
    rgbToHex(oklabToSrgb(eyeLab)),
  ];
  const codes = new Map<string, number>([
    [".", 0],
    ["H", 1],
    ["S", 2],
    ["T", 3],
    ["C", 4],
    ["E", 5],
  ]);
  const pixels: number[] = [];
  for (let y = 0; y < size; y += 1) {
    const sourceY = Math.min(HEAD_TEMPLATE.length - 1, Math.floor((y * HEAD_TEMPLATE.length) / size));
    const row = HEAD_TEMPLATE[sourceY] ?? HEAD_TEMPLATE[0];
    for (let x = 0; x < size; x += 1) {
      const sourceX = Math.min(row.length - 1, Math.floor((x * row.length) / size));
      const code = row[sourceX] ?? ".";
      pixels.push(codes.get(code) ?? 0);
    }
  }
  return { size, palette, pixels };
}
