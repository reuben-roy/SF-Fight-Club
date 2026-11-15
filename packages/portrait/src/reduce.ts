import type { PixelPortrait } from "@sf-fight-club/schemas";

import { hexToRgb, nearestIndex, type Rgb } from "./color.js";
import { spans } from "./image.js";
import type { PortraitGrid } from "./types.js";

/**
 * Box-reduce a portrait to `size` x `size`, for the 10x10 head of a crew figure.
 * Colours are averaged in sRGB and snapped back to the portrait's own palette,
 * so hair and skin keep the tones the 24x24 portrait chose.
 */
export function reducePortrait(portrait: PixelPortrait, size: number): PortraitGrid {
  if (!Number.isInteger(size) || size < 1 || size > portrait.size) {
    throw new RangeError(`reducePortrait: size must be an integer from 1 to ${portrait.size}`);
  }
  const palette: Rgb[] = portrait.palette.map((hex) => hexToRgb(hex));
  const source = portrait.size;
  const xSpans = spans(source, size);
  const ySpans = spans(source, size);
  const cells = size * size;
  const accum = new Float64Array(cells * 3);
  const weights = new Float64Array(cells);

  for (let sy = 0; sy < source; sy += 1) {
    const rowSpans = ySpans[sy];
    if (rowSpans === undefined) continue;
    for (let sx = 0; sx < source; sx += 1) {
      const colSpans = xSpans[sx];
      if (colSpans === undefined) continue;
      const index = portrait.pixels[sy * source + sx];
      const color = index === undefined ? undefined : palette[index];
      if (color === undefined) continue;
      for (const rowSpan of rowSpans) {
        for (const colSpan of colSpans) {
          const cell = rowSpan.cell * size + colSpan.cell;
          const weight = rowSpan.weight * colSpan.weight;
          accum[cell * 3] = (accum[cell * 3] ?? 0) + color[0] * weight;
          accum[cell * 3 + 1] = (accum[cell * 3 + 1] ?? 0) + color[1] * weight;
          accum[cell * 3 + 2] = (accum[cell * 3 + 2] ?? 0) + color[2] * weight;
          weights[cell] = (weights[cell] ?? 0) + weight;
        }
      }
    }
  }

  const pixels: number[] = [];
  for (let cell = 0; cell < cells; cell += 1) {
    const weight = weights[cell] ?? 0;
    const mean: Rgb =
      weight === 0
        ? [0, 0, 0]
        : [
            (accum[cell * 3] ?? 0) / weight,
            (accum[cell * 3 + 1] ?? 0) / weight,
            (accum[cell * 3 + 2] ?? 0) / weight,
          ];
    pixels.push(nearestIndex(palette, mean));
  }

  return { size, palette: [...portrait.palette], pixels };
}
