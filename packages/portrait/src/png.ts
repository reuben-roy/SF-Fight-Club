import { PNG } from "pngjs";
import type { PixelPortrait } from "@sf-fight-club/schemas";

import { hexToRgb } from "./color.js";
import type { PortraitGrid } from "./types.js";

export interface PaintedImage {
  readonly width: number;
  readonly height: number;
  /** RGBA, row-major, 4 bytes per pixel. */
  readonly rgba: Uint8Array;
}

/** Nearest-neighbour blow-up of an indexed grid: hard pixels, no blur. */
export function paintGrid(grid: PortraitGrid, scale: number): PaintedImage {
  if (!Number.isInteger(scale) || scale < 1 || scale > 64) {
    throw new RangeError("scale must be an integer from 1 to 64");
  }
  const palette = grid.palette.map((hex) => hexToRgb(hex));
  const width = grid.size * scale;
  const height = grid.size * scale;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = grid.pixels[Math.floor(y / scale) * grid.size + Math.floor(x / scale)] ?? 0;
      const color = palette[index] ?? [0, 0, 0];
      const offset = (y * width + x) * 4;
      rgba[offset] = color[0];
      rgba[offset + 1] = color[1];
      rgba[offset + 2] = color[2];
      rgba[offset + 3] = 255;
    }
  }
  return { width, height, rgba };
}

export function encodePng(image: PaintedImage): Uint8Array {
  const png = new PNG({ width: image.width, height: image.height });
  png.data = Buffer.from(image.rgba);
  const encoded = PNG.sync.write(png, { colorType: 6, inputHasAlpha: true });
  return new Uint8Array(encoded);
}

/** PNG bytes for a preview or a fixture. */
export function portraitToPng(portrait: PixelPortrait, scale: number): Uint8Array {
  return encodePng(paintGrid(portrait, scale));
}
