import { resolveTightCrop } from "./frame.js";
import { downsample } from "./image.js";
import { PORTRAIT_SIZE, type PixelateInput, type PortraitCropBox, type PortraitReference } from "./types.js";

const FACE_LEFT = 0.25;
const FACE_TOP = 0.22;
const FACE_WIDTH = 0.5;
const FACE_HEIGHT = 0.67;

/** Face box in grid cells, from the constants the crop is built with. */
export function faceBoxOf(size: number): PortraitCropBox {
  const x = Math.round(size * FACE_LEFT);
  const y = Math.round(size * FACE_TOP);
  const width = Math.max(1, Math.round(size * FACE_WIDTH));
  const height = Math.max(1, Math.min(size - y, Math.round(size * FACE_HEIGHT)));
  return { x, y, width, height };
}

/**
 * The framed 32x32 area-average downsample, before any tone or palette work.
 * Tests and the contact sheet compare the portrait against this image, so the
 * reference stays available rather than being thrown away after quantisation.
 */
export function portraitReference(input: PixelateInput): PortraitReference | null {
  if (
    !Number.isInteger(input.width) ||
    !Number.isInteger(input.height) ||
    input.width <= 0 ||
    input.height <= 0 ||
    input.rgba.length !== input.width * input.height * 4
  ) {
    return null;
  }
  const crop = resolveTightCrop(input, input.options?.crop);
  if (crop === null) return null;
  const grid = downsample(input, crop, PORTRAIT_SIZE);
  return {
    size: PORTRAIT_SIZE,
    crop,
    face: faceBoxOf(PORTRAIT_SIZE),
    rgb: grid.rgb,
  };
}
