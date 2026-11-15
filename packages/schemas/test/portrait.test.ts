import { describe, expect, it } from "vitest";

import { pixelPortraitSchema } from "../src/index.js";

const palette = ["#1a1a2e", "#f0c8a0", "#8a5a3c", "#fafaf4"];

function portrait(pixels: number[]): { size: 24; palette: string[]; pixels: number[] } {
  return { size: 24, palette, pixels };
}

describe("pixel portrait schema", () => {
  it("accepts a full 24x24 portrait", () => {
    const value = portrait(Array.from({ length: 576 }, (_, i) => i % palette.length));
    expect(pixelPortraitSchema.parse(value)).toEqual(value);
  });

  it("rejects the wrong size, palette length, and pixel count", () => {
    expect(pixelPortraitSchema.safeParse({ ...portrait(Array(576).fill(0)), size: 32 }).success).toBe(false);
    expect(pixelPortraitSchema.safeParse({ ...portrait(Array(576).fill(0)), palette: ["#000000"] }).success).toBe(false);
    expect(
      pixelPortraitSchema.safeParse({
        ...portrait(Array(576).fill(0)),
        palette: Array.from({ length: 9 }, (_, i) => `#00000${i}`),
      }).success,
    ).toBe(false);
    expect(pixelPortraitSchema.safeParse(portrait(Array(575).fill(0))).success).toBe(false);
    expect(pixelPortraitSchema.safeParse(portrait([...Array(575).fill(0), 4])).success).toBe(false);
  });

  it("rejects a pixel index outside the palette and invalid hex colors", () => {
    const pixels = Array(576).fill(0);
    pixels[17] = 4;
    expect(pixelPortraitSchema.safeParse(portrait(pixels)).success).toBe(false);
    expect(pixelPortraitSchema.safeParse({ ...portrait(Array(576).fill(0)), palette: ["#000", "#ffffff"] }).success).toBe(false);
    expect(pixelPortraitSchema.safeParse({ ...portrait(Array(576).fill(0)), palette: ["navy", "#ffffff"] }).success).toBe(false);
    expect(pixelPortraitSchema.safeParse({ ...portrait(Array(576).fill(0)), palette: ["#000000", "#000000"] }).success).toBe(false);
  });

  it("rejects extra fields", () => {
    expect(pixelPortraitSchema.safeParse({ ...portrait(Array(576).fill(0)), photo: "x" }).success).toBe(false);
  });
});
