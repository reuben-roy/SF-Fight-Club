import type { PixelPortrait } from "@sf-fight-club/schemas";

export const PORTRAIT_SIZE = 32;

export interface RgbaImage {
  /** RGBA, row-major, 4 bytes per pixel. */
  readonly rgba: Uint8Array;
  readonly width: number;
  readonly height: number;
}

export type PortraitNoneReason =
  | "invalid_input"
  | "unsupported_format"
  | "corrupt_image"
  | "too_large"
  | "too_small"
  | "transparent"
  | "empty";

export type PortraitResult =
  | { readonly kind: "ok"; readonly portrait: PixelPortrait }
  | { readonly kind: "none"; readonly reason: PortraitNoneReason };

export interface PortraitCropBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PortraitSquare {
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

export interface PortraitReference {
  readonly size: number;
  /** The framed square in the source image. */
  readonly crop: PortraitSquare;
  /** Face box in the 32x32 grid, derived from the framing rules. */
  readonly face: PortraitCropBox;
  /** sRGB bytes as floats, row-major, 3 channels; the area-average downsample before tone. */
  readonly rgb: Float64Array;
}

export interface PixelateOptions {
  /** Region of interest, for a face detector later. The largest centred square inside it is used. */
  readonly crop?: PortraitCropBox;
  /** 2 to 12. Default 12. */
  readonly paletteSize?: number;
  /** Flood a near-uniform background to one colour. Off by default. */
  readonly flattenBackground?: boolean;
  /** A 1px contour on the subject side of the silhouette. Off by default. */
  readonly outline?: boolean;
}

export interface PixelateInput extends RgbaImage {
  readonly options?: PixelateOptions;
}

/**
 * Four colours that describe a face: the skin tone, its shadow, what sits on
 * the head and what the person is wearing.
 */
export interface PortraitTraits {
  readonly skin: string;
  readonly skinShadow: string;
  readonly hair: string;
  readonly accent: string;
}

/** An NxN indexed image that borrows the palette of the portrait it came from. */
export interface PortraitGrid {
  readonly size: number;
  readonly palette: string[];
  readonly pixels: number[];
}

export type ImageFormat = "jpeg" | "png";

export type DecodeResult =
  | { readonly kind: "ok"; readonly image: RgbaImage & { readonly format: ImageFormat } }
  | { readonly kind: "none"; readonly reason: PortraitNoneReason };
