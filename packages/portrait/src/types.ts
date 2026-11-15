import type { PixelPortrait } from "@sf-fight-club/schemas";

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

export interface PixelateOptions {
  /** Region of interest, for a face detector later. The largest centred square inside it is used. */
  readonly crop?: PortraitCropBox;
  /** 2 to 8. Default 8. */
  readonly paletteSize?: number;
  /** Ordered (Bayer) dithering. Off by default: it adds noise to faces. */
  readonly dither?: boolean;
  /** Flood a near-uniform background to one colour. Default true. */
  readonly flattenBackground?: boolean;
  /**
   * A 1px contour on the subject side of the silhouette, in the darkest palette entry.
   * Off by default: the portrait reads better without a hard edge at 24x24.
   */
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
