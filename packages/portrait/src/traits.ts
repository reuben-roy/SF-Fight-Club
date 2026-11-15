import {
  clamp,
  hexToRgb,
  isSkinLab,
  oklabToSrgb,
  rgbToHex,
  scaleLightness,
  srgbToOklab,
  type Lab,
} from "./color.js";
import type { PortraitGrid, PortraitReference, PortraitTraits } from "./types.js";

const PATCH_INSET = 0.3;
const TRIM_DARK = 0.2;
const TRIM_LIGHT = 0.1;
const SHADOW_DROP = 0.1;
const ABOVE_FACE = 0.12;
const BESIDE_FACE = 0.4;
const BESIDE_MARGIN = 4;
const BORDER_BINS = 3;
const BORDER_TOLERANCE = 0.06;
const ACCENT_FROM = 0.82;
const BIN_L = 0.04;
const BIN_CHROMA = 0.02;
const NUDGE_FACTORS = [0.65, 1.4, 0.45, 1.7, 0.3, 2.2];

function medianOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = sorted.length >> 1;
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function medianLab(labs: readonly Lab[]): Lab {
  return {
    L: medianOf(labs.map((lab) => lab.L)),
    a: medianOf(labs.map((lab) => lab.a)),
    b: medianOf(labs.map((lab) => lab.b)),
  };
}

function labAt(reference: PortraitReference, cell: number): Lab {
  const offset = cell * 3;
  return srgbToOklab([
    reference.rgb[offset] ?? 0,
    reference.rgb[offset + 1] ?? 0,
    reference.rgb[offset + 2] ?? 0,
  ]);
}

function centralFaceCells(reference: PortraitReference): number[] {
  const { face, size } = reference;
  const left = face.x + Math.floor(face.width * PATCH_INSET);
  const right = face.x + Math.ceil(face.width * (1 - PATCH_INSET));
  const top = face.y + Math.floor(face.height * PATCH_INSET);
  const bottom = face.y + Math.ceil(face.height * (1 - PATCH_INSET));
  const cells: number[] = [];
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      cells.push(y * size + x);
    }
  }
  return cells;
}

/**
 * Skin from the reference image, not the palette: the middle of the face,
 * trimmed of the darkest 20% and lightest 10%, which removes eyes, brows,
 * shadow and specular glare without moving the tone the person actually has.
 */
export function measureSkin(reference: PortraitReference): Lab {
  const labs = centralFaceCells(reference).map((cell) => labAt(reference, cell));
  if (labs.length === 0) return { L: 0.5, a: 0, b: 0 };
  const sorted = [...labs].sort((left, right) => left.L - right.L);
  const start = Math.floor(sorted.length * TRIM_DARK);
  const end = sorted.length - Math.ceil(sorted.length * TRIM_LIGHT);
  const kept = sorted.slice(start, Math.max(start + 1, end));
  return medianLab(kept);
}

function borderLabs(reference: PortraitReference): Lab[] {
  const { size } = reference;
  const cells: number[] = [];
  for (let i = 0; i < size; i += 1) {
    cells.push(i, (size - 1) * size + i);
    if (i > 0 && i < size - 1) cells.push(i * size, i * size + size - 1);
  }
  return cells.map((cell) => labAt(reference, cell));
}

function hairBandCells(reference: PortraitReference): number[] {
  const { face, size } = reference;
  const cells: number[] = [];
  const aboveTop = Math.max(0, face.y - Math.max(1, Math.round(size * ABOVE_FACE)));
  for (let y = aboveTop; y < face.y; y += 1) {
    for (let x = face.x; x < face.x + face.width; x += 1) {
      if (x < 0 || x >= size) continue;
      cells.push(y * size + x);
    }
  }
  const besideBottom = Math.min(size, face.y + Math.ceil(face.height * BESIDE_FACE));
  for (let y = face.y; y < besideBottom; y += 1) {
    const left = Math.max(0, face.x - BESIDE_MARGIN);
    const right = Math.min(size, face.x + face.width + BESIDE_MARGIN);
    for (let x = left; x < right; x += 1) {
      if (x >= face.x && x < face.x + face.width) continue;
      cells.push(y * size + x);
    }
  }
  return cells;
}

/** Coarse histogram modes: deterministic and robust on a 32x32 band. */
function dominantLabs(labs: readonly Lab[], limit: number): Lab[] {
  interface Bin {
    readonly count: number;
    readonly sum: Lab;
  }
  const bins = new Map<string, Bin>();
  for (const lab of labs) {
    const key = [
      Math.round(lab.L / BIN_L),
      Math.round(lab.a / BIN_CHROMA),
      Math.round(lab.b / BIN_CHROMA),
    ].join(":");
    const bin = bins.get(key);
    if (bin === undefined) {
      bins.set(key, { count: 1, sum: lab });
    } else {
      bins.set(key, {
        count: bin.count + 1,
        sum: { L: bin.sum.L + lab.L, a: bin.sum.a + lab.a, b: bin.sum.b + lab.b },
      });
    }
  }
  return [...bins.entries()]
    .sort(([leftKey, left], [rightKey, right]) =>
      right.count - left.count || (leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0),
    )
    .slice(0, limit)
    .map(([, bin]) => ({
      L: bin.sum.L / bin.count,
      a: bin.sum.a / bin.count,
      b: bin.sum.b / bin.count,
    }));
}

function dominantLab(labs: readonly Lab[]): Lab {
  return dominantLabs(labs, 1)[0] ?? { L: 0.5, a: 0, b: 0 };
}

function hairColor(reference: PortraitReference, skin: Lab): string {
  const background = dominantLabs(borderLabs(reference), BORDER_BINS);
  const band = hairBandCells(reference).map((cell) => labAt(reference, cell));
  const qualifying = band.filter((lab) => {
    if (isSkinLab(lab)) return false;
    return background.every(
      (entry) => Math.hypot(lab.L - entry.L, lab.a - entry.a, lab.b - entry.b) > BORDER_TOLERANCE,
    );
  });
  const chosen = qualifying.length > 0 ? medianLab(qualifying) : dominantLab(band);
  if (chosen.a === skin.a && chosen.b === skin.b && chosen.L === skin.L) {
    return rgbToHex(oklabToSrgb({ ...chosen, L: clamp(chosen.L * 0.65, 0, 1) }));
  }
  return rgbToHex(oklabToSrgb(chosen));
}

function accentColor(reference: PortraitReference): string {
  const { size } = reference;
  const top = Math.round(size * ACCENT_FROM);
  const cells: number[] = [];
  for (let y = top; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) cells.push(y * size + x);
  }
  const labs = cells.map((cell) => labAt(reference, cell));
  return rgbToHex(oklabToSrgb(dominantLab(labs)));
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
 * templated head. Everything is measured on the reference downsample and the
 * face box, so the palette never rewrites the skin tone a viewer remembers.
 */
export function portraitTraits(reference: PortraitReference): PortraitTraits {
  const skinLab = measureSkin(reference);
  const skin = rgbToHex(oklabToSrgb(skinLab));
  const skinShadow = rgbToHex(
    oklabToSrgb({ L: clamp(skinLab.L - SHADOW_DROP, 0, 1), a: skinLab.a, b: skinLab.b }),
  );
  const hair = nudgeApart(hairColor(reference, skinLab), [skin]);
  return {
    skin,
    skinShadow: nudgeApart(skinShadow, [skin]),
    hair,
    accent: accentColor(reference),
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

const DARK_SKIN_EYE_ROW = 5;
const EYE_COLUMNS = [3, 6] as const;
const SHADOW_COLUMNS = [4, 7] as const;
const OFF_WHITE = "#f2efe6";

/**
 * The 10x10 head the crew figures use. On dark skin the eyes are painted
 * off-white with the shadow colour beside them, so the face does not read as a
 * solid dark block; on light skin the eyes are the darkest entry.
 */
export function traitHead(
  traits: PortraitTraits,
  size = 10,
  background = "#1b1b28",
): PortraitGrid {
  const skinLab = srgbToOklab(hexToRgb(traits.skin));
  const hairLab = srgbToOklab(hexToRgb(traits.hair));
  const shadowLab = srgbToOklab(hexToRgb(traits.skinShadow));
  const accentLab = srgbToOklab(hexToRgb(traits.accent));
  const darkest = [hairLab, shadowLab, accentLab].reduce((best, lab) =>
    lab.L < best.L ? lab : best,
  );
  const lightEyes = skinLab.L < 0.5;
  const eyeLab = darkest.L > 0.35 ? scaleLightness(darkest, 0.45) : darkest;
  const eye = lightEyes ? OFF_WHITE : rgbToHex(oklabToSrgb(eyeLab));

  const rows = HEAD_TEMPLATE.map((row) => row.split(""));
  const eyeRow = rows[DARK_SKIN_EYE_ROW];
  if (lightEyes && eyeRow !== undefined) {
    for (const column of EYE_COLUMNS) eyeRow[column] = "E";
    for (const column of SHADOW_COLUMNS) eyeRow[column] = "T";
  }

  const palette = [
    background,
    traits.hair,
    traits.skin,
    traits.skinShadow,
    traits.accent,
    eye,
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
    const sourceY = Math.min(rows.length - 1, Math.floor((y * rows.length) / size));
    const row = rows[sourceY] ?? rows[0] ?? [];
    for (let x = 0; x < size; x += 1) {
      const sourceX = Math.min(row.length - 1, Math.floor((x * row.length) / size));
      const code = row[sourceX] ?? ".";
      pixels.push(codes.get(code) ?? 0);
    }
  }
  return { size, palette, pixels };
}
