export type Rgb = readonly [number, number, number];

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

export function distanceSq(a: Rgb, b: Rgb): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

export function distance(a: Rgb, b: Rgb): number {
  return Math.sqrt(distanceSq(a, b));
}

export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
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

/**
 * Skin classifier for the tone guard. Deliberately generous across skin tones:
 * red-dominant, enough chroma, not near-black or blown out.
 */
export function isSkinTone(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const y = luma(r, g, b);
  return (
    y > 28 &&
    y < 248 &&
    r > 60 &&
    r >= g &&
    g >= b - 6 &&
    r - g > 8 &&
    max - min > 10
  );
}

export function isDarkTone(r: number, g: number, b: number): boolean {
  return luma(r, g, b) < 62;
}

export function nearestIndex(palette: readonly Rgb[], color: Rgb): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < palette.length; i += 1) {
    const candidate = palette[i];
    if (candidate === undefined) continue;
    const d = distanceSq(color, candidate);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return best;
}
