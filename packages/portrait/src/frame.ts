import { isSkinLab, srgbToOklab } from "./color.js";
import { resolveSquareCrop, type SquareCrop } from "./image.js";
import type { PortraitCropBox, RgbaImage } from "./types.js";

/** Coarse cells along the short side for the skin search. Fine enough to find a face, cheap on an 8K scan. */
const COARSE_CELLS = 64;
/** The skin region must cover this share of coarse cells before its box is trusted. */
const MIN_SKIN_SHARE = 0.004;
/** A face sits above this share of the frame height, and within this share of its centre. */
const UPPER_LIMIT = 0.6;
const CENTRE_LIMIT = 0.3;
/** Face width to crop size. A head is about 1.6 faces wide, and should fill most of the frame. */
const FACE_TO_CROP = 2;
/** Hair above the hairline, as a share of the crop. */
const ABOVE_HAIRLINE = 0.22;
/** Skin rows kept when measuring face width, as a share of the region height. */
const FACE_BAND_SHARE = 0.55;
/** Column percentile trim, so stray skin pixels on ears or hands do not widen the face. */
const COLUMN_TRIM = 0.04;
const MIN_CROP_SHARE = 0.42;
const MAX_CROP_SHARE = 0.78;
const FALLBACK_SHARE = 0.7;
const FALLBACK_LIFT = 0.05;

interface CoarseMask {
  readonly width: number;
  readonly height: number;
  readonly step: number;
  readonly cells: Uint8Array;
}

function coarseSkinMask(image: RgbaImage): CoarseMask {
  const short = Math.min(image.width, image.height);
  const step = Math.max(1, Math.floor(short / COARSE_CELLS));
  const width = Math.max(1, Math.ceil(image.width / step));
  const height = Math.max(1, Math.ceil(image.height / step));
  const cells = new Uint8Array(width * height);
  for (let cy = 0; cy < height; cy += 1) {
    for (let cx = 0; cx < width; cx += 1) {
      const x = Math.min(image.width - 1, cx * step + Math.floor(step / 2));
      const y = Math.min(image.height - 1, cy * step + Math.floor(step / 2));
      const offset = (y * image.width + x) * 4;
      const alpha = image.rgba[offset + 3] ?? 0;
      if (alpha < 128) continue;
      const lab = srgbToOklab([
        image.rgba[offset] ?? 0,
        image.rgba[offset + 1] ?? 0,
        image.rgba[offset + 2] ?? 0,
      ]);
      cells[cy * width + cx] = isSkinLab(lab) ? 1 : 0;
    }
  }
  return { width, height, step, cells };
}

interface Box {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly count: number;
  readonly onBorder: boolean;
}

/**
 * Largest 4-connected skin region, preferring one that stays clear of the border.
 * A warm wall or sepia print floods the frame edge, but a face can also merge
 * with a warm backdrop, so a border region is only used when nothing better
 * exists rather than being thrown away.
 */
function largestSkinBox(mask: CoarseMask): Box | null {
  const { width, height, cells } = mask;
  const seen = new Uint8Array(cells.length);
  const found: Box[] = [];
  const stack: number[] = [];
  for (let start = 0; start < cells.length; start += 1) {
    if (cells[start] !== 1 || seen[start] === 1) continue;
    let count = 0;
    let minX = width;
    let maxX = -1;
    let minY = height;
    let maxY = -1;
    let onBorder = false;
    stack.push(start);
    seen[start] = 1;
    while (stack.length > 0) {
      const index = stack.pop();
      if (index === undefined) break;
      const x = index % width;
      const y = (index - x) / width;
      count += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) onBorder = true;
      const neighbours = [
        x > 0 ? index - 1 : -1,
        x + 1 < width ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y + 1 < height ? index + width : -1,
      ];
      for (const neighbour of neighbours) {
        if (neighbour < 0) continue;
        if (cells[neighbour] !== 1 || seen[neighbour] === 1) continue;
        seen[neighbour] = 1;
        stack.push(neighbour);
      }
    }
    found.push({ minX, maxX, minY, maxY, count, onBorder });
  }
  found.sort((left, right) => right.count - left.count);
  // A head-and-shoulders portrait puts the face in the upper part of the frame
  // and near the middle. Without that prior the largest warm region is sometimes
  // a hand on a spacesuit rather than the face.
  const plausible = found.find(
    (box) =>
      !box.onBorder &&
      (box.minY + box.maxY) / 2 < height * UPPER_LIMIT &&
      Math.abs((box.minX + box.maxX) / 2 - width / 2) < width * CENTRE_LIMIT,
  );
  if (plausible !== undefined) return plausible;
  const inner = found.find((box) => !box.onBorder);
  return inner ?? found[0] ?? null;
}

interface FaceWidth {
  readonly left: number;
  readonly right: number;
  readonly top: number;
}

function skinColumnProfile(image: RgbaImage, box: Box, step: number): FaceWidth | null {
  const left = Math.max(0, box.minX * step);
  const right = Math.min(image.width, (box.maxX + 1) * step);
  const top = Math.max(0, box.minY * step);
  const bottom = Math.min(image.height, Math.round(top + (box.maxY - box.minY + 1) * step * FACE_BAND_SHARE));
  const columns = new Uint32Array(Math.max(1, right - left));
  let total = 0;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const offset = (y * image.width + x) * 4;
      if ((image.rgba[offset + 3] ?? 0) < 128) continue;
      const lab = srgbToOklab([
        image.rgba[offset] ?? 0,
        image.rgba[offset + 1] ?? 0,
        image.rgba[offset + 2] ?? 0,
      ]);
      if (!isSkinLab(lab)) continue;
      columns[x - left] = (columns[x - left] ?? 0) + 1;
      total += 1;
    }
  }
  if (total === 0) return null;
  const lowCount = total * COLUMN_TRIM;
  const highCount = total * (1 - COLUMN_TRIM);
  let seen = 0;
  let firstX = -1;
  let lastX = -1;
  for (let index = 0; index < columns.length; index += 1) {
    const count = columns[index] ?? 0;
    if (count === 0) continue;
    if (seen < lowCount) {
      seen += count;
      continue;
    }
    if (firstX < 0) firstX = index;
    seen += count;
    if (seen <= highCount) lastX = index;
  }
  if (firstX < 0) return null;
  if (lastX < firstX) lastX = firstX;
  return { left: left + firstX, right: left + lastX + 1, top };
}

function clampCrop(x: number, y: number, size: number, image: RgbaImage): SquareCrop {
  const side = Math.max(1, Math.min(Math.round(size), Math.min(image.width, image.height)));
  const left = Math.max(0, Math.min(Math.round(x), image.width - side));
  const top = Math.max(0, Math.min(Math.round(y), image.height - side));
  return { x: left, y: top, size: side };
}

function fallbackCrop(image: RgbaImage): SquareCrop {
  const short = Math.min(image.width, image.height);
  const size = short * FALLBACK_SHARE;
  const centreX = image.width / 2;
  const centreY = image.height / 2 - short * FALLBACK_LIFT;
  return clampCrop(centreX - size / 2, centreY - size / 2, size, image);
}

/**
 * Head-and-shoulders crop. With no face detector, the face is found as the
 * largest warm-chroma region and the crop is sized from its width, because a
 * centred square on a portrait spends most of a 24x24 frame on shoulders.
 * An explicit crop box always wins, for a future detector.
 */
export function resolveTightCrop(
  image: RgbaImage,
  crop?: PortraitCropBox,
  scale = 1,
): SquareCrop | null {
  if (crop !== undefined) {
    return resolveSquareCrop({ width: image.width, height: image.height, crop });
  }
  const mask = coarseSkinMask(image);
  const box = largestSkinBox(mask);
  if (box === null || box.count < mask.cells.length * MIN_SKIN_SHARE) {
    return fallbackCrop(image);
  }
  const face = skinColumnProfile(image, box, mask.step);
  if (face === null) return fallbackCrop(image);
  const short = Math.min(image.width, image.height);
  const faceWidth = Math.max(mask.step, face.right - face.left);
  const size = Math.max(
    short * MIN_CROP_SHARE,
    Math.min(short * MAX_CROP_SHARE, faceWidth * FACE_TO_CROP * scale),
  );
  const centreX = (face.left + face.right) / 2;
  const top = face.top - size * ABOVE_HAIRLINE;
  return clampCrop(centreX - size / 2, top, size, image);
}
