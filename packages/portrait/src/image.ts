import { toLinear, toSrgbByte } from "./color.js";
import type { PortraitCropBox, RgbaImage } from "./types.js";

export interface SquareCrop {
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

export interface GridRaster {
  readonly size: number;
  /** sRGB bytes as floats, row-major, 3 channels. */
  readonly rgb: Float64Array;
  /** Fraction of opaque coverage per cell, 0 to 1. */
  readonly coverage: Float64Array;
}

export interface Span {
  readonly cell: number;
  readonly weight: number;
}

/** Overlap of each source pixel with the target cells, for area resampling. */
export function spans(sourceLength: number, targetLength: number): Span[][] {
  const result: Span[][] = [];
  const scale = targetLength / sourceLength;
  for (let i = 0; i < sourceLength; i += 1) {
    const start = i * scale;
    const end = (i + 1) * scale;
    const firstCell = Math.floor(start);
    const lastCell = Math.min(targetLength - 1, Math.ceil(end) - 1);
    const weights: Span[] = [];
    for (let cell = firstCell; cell <= lastCell; cell += 1) {
      const overlap = Math.min(end, cell + 1) - Math.max(start, cell);
      if (overlap > 0) weights.push({ cell, weight: overlap });
    }
    result.push(weights);
  }
  return result;
}

/** Largest centred square inside the image, or inside `crop` when given. */
export function resolveSquareCrop(input: {
  readonly width: number;
  readonly height: number;
  readonly crop?: PortraitCropBox;
}): SquareCrop | null {
  const box = input.crop ?? { x: 0, y: 0, width: input.width, height: input.height };
  const left = Math.max(0, Math.min(box.x, input.width - 1));
  const top = Math.max(0, Math.min(box.y, input.height - 1));
  const boxWidth = Math.min(box.width, input.width - left);
  const boxHeight = Math.min(box.height, input.height - top);
  const size = Math.floor(Math.min(boxWidth, boxHeight));
  if (!Number.isFinite(size) || size <= 0) return null;
  return {
    x: left + Math.floor((boxWidth - size) / 2),
    y: top + Math.floor((boxHeight - size) / 2),
    size,
  };
}

/** Fraction of pixels inside the crop whose alpha is below 32. */
export function transparentShare(image: RgbaImage, crop: SquareCrop): number {
  const step = Math.max(1, Math.floor(crop.size / 96));
  let counted = 0;
  let transparent = 0;
  for (let y = crop.y; y < crop.y + crop.size; y += step) {
    for (let x = crop.x; x < crop.x + crop.size; x += step) {
      const alpha = image.rgba[(y * image.width + x) * 4 + 3] ?? 0;
      counted += 1;
      if (alpha < 32) transparent += 1;
    }
  }
  return counted === 0 ? 1 : transparent / counted;
}

/**
 * Area-average the crop into a size x size grid in linear light, weighted by
 * alpha, so downsampling does not darken or blur the result.
 */
export function downsample(image: RgbaImage, crop: SquareCrop, size: number): GridRaster {
  const xSpans = spans(crop.size, size);
  const ySpans = spans(crop.size, size);
  const cells = size * size;
  const accumR = new Float64Array(cells);
  const accumG = new Float64Array(cells);
  const accumB = new Float64Array(cells);
  const accumAlpha = new Float64Array(cells);

  for (let sy = 0; sy < crop.size; sy += 1) {
    const rowSpans = ySpans[sy];
    if (rowSpans === undefined) continue;
    const sourceY = crop.y + sy;
    for (let sx = 0; sx < crop.size; sx += 1) {
      const colSpans = xSpans[sx];
      if (colSpans === undefined) continue;
      const offset = (sourceY * image.width + crop.x + sx) * 4;
      const alpha = (image.rgba[offset + 3] ?? 0) / 255;
      if (alpha === 0) continue;
      const r = toLinear(image.rgba[offset] ?? 0) * alpha;
      const g = toLinear(image.rgba[offset + 1] ?? 0) * alpha;
      const b = toLinear(image.rgba[offset + 2] ?? 0) * alpha;
      for (const rowSpan of rowSpans) {
        const rowBase = rowSpan.cell * size;
        const wy = rowSpan.weight;
        for (const colSpan of colSpans) {
          const cell = rowBase + colSpan.cell;
          const weight = wy * colSpan.weight;
          accumR[cell] = (accumR[cell] ?? 0) + r * weight;
          accumG[cell] = (accumG[cell] ?? 0) + g * weight;
          accumB[cell] = (accumB[cell] ?? 0) + b * weight;
          accumAlpha[cell] = (accumAlpha[cell] ?? 0) + alpha * weight;
        }
      }
    }
  }

  const rgb = new Float64Array(cells * 3);
  const coverage = new Float64Array(cells);
  let lastR = 0;
  let lastG = 0;
  let lastB = 0;
  for (let cell = 0; cell < cells; cell += 1) {
    const alpha = accumAlpha[cell] ?? 0;
    coverage[cell] = alpha;
    if (alpha > 0) {
      lastR = toSrgbByte((accumR[cell] ?? 0) / alpha);
      lastG = toSrgbByte((accumG[cell] ?? 0) / alpha);
      lastB = toSrgbByte((accumB[cell] ?? 0) / alpha);
    }
    // A fully transparent cell borrows the last filled colour: a hole in a
    // cut-out PNG should not become a black square.
    rgb[cell * 3] = lastR;
    rgb[cell * 3 + 1] = lastG;
    rgb[cell * 3 + 2] = lastB;
  }
  return { size, rgb, coverage };
}
