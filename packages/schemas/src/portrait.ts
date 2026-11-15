import * as z from "zod";

export const PORTRAIT_SIZE = 24;
export const PORTRAIT_PIXEL_COUNT = PORTRAIT_SIZE * PORTRAIT_SIZE;
export const MIN_PORTRAIT_COLORS = 2;
export const MAX_PORTRAIT_COLORS = 8;

const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "expected a 6-digit hex color such as #a1b2c3");

export const portraitPaletteSchema = z
  .array(hexColorSchema)
  .min(MIN_PORTRAIT_COLORS)
  .max(MAX_PORTRAIT_COLORS)
  .refine(
    (palette) => new Set(palette.map((color) => color.toLowerCase())).size === palette.length,
    { message: "palette colors must be distinct" },
  );

export const portraitPixelsSchema = z
  .array(z.number().int().min(0).max(MAX_PORTRAIT_COLORS - 1))
  .length(PORTRAIT_PIXEL_COUNT);

/**
 * A 24x24 indexed pixel portrait. `pixels` is row-major and every entry is an
 * index into `palette`. Produced by `@sf-fight-club/portrait`; the source photo
 * is never rendered.
 */
export const pixelPortraitSchema = z
  .strictObject({
    size: z.literal(PORTRAIT_SIZE),
    palette: portraitPaletteSchema,
    pixels: portraitPixelsSchema,
  })
  .superRefine((portrait, ctx) => {
    const badIndex = portrait.pixels.findIndex((index) => index >= portrait.palette.length);
    if (badIndex !== -1) {
      ctx.addIssue({
        code: "custom",
        message: `pixels[${badIndex}] is ${portrait.pixels[badIndex]}, palette has ${portrait.palette.length} colors`,
        path: ["pixels", badIndex],
      });
    }
  });

export type PixelPortrait = z.infer<typeof pixelPortraitSchema>;
