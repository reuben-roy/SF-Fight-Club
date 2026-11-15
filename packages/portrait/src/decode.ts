import { decode as decodeJpegBytes } from "jpeg-js";
import { PNG } from "pngjs";

import type { DecodeResult, RgbaImage } from "./types.js";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGE_SIDE = 4096;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  if (bytes.length < prefix.length) return false;
  return prefix.every((value, index) => bytes[index] === value);
}

function checkDimensions(width: number, height: number, rgbaLength: number): DecodeResult | null {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    return { kind: "none", reason: "corrupt_image" };
  }
  if (width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE) {
    return { kind: "none", reason: "too_large" };
  }
  if (rgbaLength !== width * height * 4) {
    return { kind: "none", reason: "corrupt_image" };
  }
  return null;
}

function ok(image: RgbaImage, format: "jpeg" | "png"): DecodeResult {
  return { kind: "ok", image: { ...image, format } };
}

function decodePng(bytes: Uint8Array): DecodeResult {
  const png = PNG.sync.read(Buffer.from(bytes));
  const rgba = new Uint8Array(png.data.length);
  rgba.set(png.data);
  const invalid = checkDimensions(png.width, png.height, rgba.length);
  if (invalid !== null) return invalid;
  return ok({ rgba, width: png.width, height: png.height }, "png");
}

function decodeJpeg(bytes: Uint8Array): DecodeResult {
  const decoded = decodeJpegBytes(bytes, {
    useTArray: true,
    formatAsRGBA: true,
    tolerantDecoding: false,
    maxResolutionInMP: 64,
    maxMemoryUsageInMB: 512,
  });
  const rgba = new Uint8Array(decoded.data.length);
  rgba.set(decoded.data);
  const invalid = checkDimensions(decoded.width, decoded.height, rgba.length);
  if (invalid !== null) return invalid;
  return ok({ rgba, width: decoded.width, height: decoded.height }, "jpeg");
}

/**
 * Decode a JPEG or PNG from untrusted bytes. Pure JavaScript, no native modules.
 * Every failure path returns `kind: "none"`; nothing throws.
 */
export function decodeImage(bytes: Uint8Array): DecodeResult {
  if (bytes.length === 0) return { kind: "none", reason: "corrupt_image" };
  if (bytes.length > MAX_IMAGE_BYTES) return { kind: "none", reason: "too_large" };

  const isPng = startsWith(bytes, PNG_SIGNATURE);
  const isJpeg = startsWith(bytes, [0xff, 0xd8, 0xff]);
  if (!isPng && !isJpeg) return { kind: "none", reason: "unsupported_format" };

  try {
    return isPng ? decodePng(bytes) : decodeJpeg(bytes);
  } catch {
    return { kind: "none", reason: "corrupt_image" };
  }
}
