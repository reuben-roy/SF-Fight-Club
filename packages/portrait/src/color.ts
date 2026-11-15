export type Rgb = readonly [number, number, number];

/** OKLab: perceptual lightness `L` in 0..1, opponent axes `a` (green/red) and `b` (blue/yellow). */
export interface Lab {
  readonly L: number;
  readonly a: number;
  readonly b: number;
}

const LINEAR_TABLE = (() => {
  const table = new Float64Array(256);
  for (let i = 0; i < 256; i += 1) {
    const c = i / 255;
    table[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }
  return table;
})();

/** sRGB byte to linear light, 0 to 1. */
export function toLinear(value: number): number {
  const index = clamp(Math.round(value), 0, 255);
  return LINEAR_TABLE[index] ?? 0;
}

/** Linear light, 0 to 1, to an sRGB byte. */
export function toSrgbByte(value: number): number {
  const c = clamp(value, 0, 1);
  const encoded = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  return clamp(Math.round(encoded * 255), 0, 255);
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Rec. 709 luma on sRGB bytes, 0 to 255. */
export function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

export function rgbToHex(rgb: Rgb): string {
  const toHex = (channel: number) =>
    clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0");
  return `#${toHex(rgb[0])}${toHex(rgb[1])}${toHex(rgb[2])}`;
}

/** sRGB bytes to OKLab. Everything downstream clusters and compares here, not in sRGB. */
export function srgbToOklab(rgb: Rgb): Lab {
  const r = toLinear(rgb[0]);
  const g = toLinear(rgb[1]);
  const b = toLinear(rgb[2]);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

export function oklabToSrgb(lab: Lab): Rgb {
  const l = (lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b) ** 3;
  const m = (lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b) ** 3;
  const s = (lab.L - 0.0894841775 * lab.a - 1.291485548 * lab.b) ** 3;

  return [
    toSrgbByte(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toSrgbByte(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toSrgbByte(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

export const LIGHTNESS_WEIGHT = 2.2;

/**
 * Squared OKLab distance, with lightness weighted up. Two tones that differ only
 * in lightness are far more distinguishable at 24x24 than two that differ only
 * in hue, so the palette should spend its entries on lightness.
 */
export function labDistanceSq(x: Lab, y: Lab): number {
  const dl = x.L - y.L;
  const da = x.a - y.a;
  const db = x.b - y.b;
  return LIGHTNESS_WEIGHT * dl * dl + da * da + db * db;
}

export function labDistance(x: Lab, y: Lab): number {
  return Math.sqrt(labDistanceSq(x, y));
}

export function nearestLabIndex(palette: readonly Lab[], color: Lab): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < palette.length; i += 1) {
    const candidate = palette[i];
    if (candidate === undefined) continue;
    const d = labDistanceSq(color, candidate);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return best;
}

export function labChroma(lab: Lab): number {
  return Math.hypot(lab.a, lab.b);
}

export function labHue(lab: Lab): number {
  return Math.atan2(lab.b, lab.a);
}

/**
 * Skin classifier in OKLab. Works across the whole tonal range, where an sRGB
 * rule ("red above 60, red leads green") drops deep skin tones into the
 * background. Warm hue, some chroma, not crushed and not blown out.
 *
 * The chroma ceiling is what keeps a red shirt or a saturated wall out of the
 * face: skin is warm but never vivid, and clothing is the thing that most often
 * merges with a face in a head-and-shoulders photo.
 */
export function isSkinLab(lab: Lab): boolean {
  const chroma = labChroma(lab);
  if (chroma < 0.012 || chroma > 0.105) return false;
  if (lab.L < 0.12 || lab.L > 0.96) return false;
  const hue = labHue(lab);
  return hue > 0.42 && hue < 1.32;
}

/** Scale OKLab lightness, keeping hue and chroma, for a derived shadow tone. */
export function scaleLightness(lab: Lab, factor: number): Lab {
  return { L: clamp(lab.L * factor, 0, 1), a: lab.a, b: lab.b };
}
