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
  /** A 1px dark outline between the subject and a flattened background. Default true. */
  readonly outline?: boolean;
}

export interface PixelateInput extends RgbaImage {
  readonly options?: PixelateOptions;
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
