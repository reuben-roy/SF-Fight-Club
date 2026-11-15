import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { pixelPortraitSchema, type PixelPortrait } from "@sf-fight-club/schemas";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";

import {
  MAX_IMAGE_BYTES,
  decodeImage,
  pixelatePortrait,
  portraitToPng,
  reducePortrait,
  type PortraitResult,
} from "../src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const samplesDir = path.join(here, "..", "fixtures", "samples");
const goldenDir = path.join(here, "..", "fixtures", "golden");

function sampleFiles(): string[] {
  return readdirSync(samplesDir)
    .filter((name) => /\.(jpe?g|png)$/i.test(name))
    .sort();
}

function sampleBytes(file: string): Uint8Array {
  return new Uint8Array(readFileSync(path.join(samplesDir, file)));
}

function golden(file: string): PixelPortrait {
  const slug = file.replace(/\.[^.]+$/, "");
  return JSON.parse(readFileSync(path.join(goldenDir, `${slug}.json`), "utf8")) as PixelPortrait;
}

function portraitOf(file: string): PortraitResult {
  const decoded = decodeImage(sampleBytes(file));
  if (decoded.kind !== "ok") throw new Error(`${file}: ${decoded.reason}`);
  return pixelatePortrait({
    rgba: decoded.image.rgba,
    width: decoded.image.width,
    height: decoded.image.height,
  });
}

function expectPortrait(result: PortraitResult): PixelPortrait {
  if (result.kind !== "ok") throw new Error(`expected a portrait, got ${result.reason}`);
  return result.portrait;
}

function encodePng(width: number, height: number, paint: (x: number, y: number) => number[]): Uint8Array {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = paint(x, y);
      const offset = (y * width + x) * 4;
      png.data[offset] = r ?? 0;
      png.data[offset + 1] = g ?? 0;
      png.data[offset + 2] = b ?? 0;
      png.data[offset + 3] = a ?? 255;
    }
  }
  return new Uint8Array(PNG.sync.write(png));
}

function rgbaImage(width: number, height: number, paint: (x: number, y: number) => number[]): {
  rgba: Uint8Array;
  width: number;
  height: number;
} {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = paint(x, y);
      const offset = (y * width + x) * 4;
      rgba[offset] = r ?? 0;
      rgba[offset + 1] = g ?? 0;
      rgba[offset + 2] = b ?? 0;
      rgba[offset + 3] = a ?? 255;
    }
  }
  return { rgba, width, height };
}

/** A crude face: skin field, dark hair block, eyes, mouth, on a plain wall. */
function syntheticFace(x: number, y: number): number[] {
  const head = (x - 100) ** 2 + (y - 90) ** 2 < 52 ** 2;
  const hair = head && y < 70;
  const eye = (x - 84) ** 2 + (y - 84) ** 2 < 16 || (x - 116) ** 2 + (y - 84) ** 2 < 16;
  const mouth = Math.abs(y - 112) < 3 && Math.abs(x - 100) < 16;
  if (eye || mouth) return [40, 24, 20, 255];
  if (hair) return [46, 32, 24, 255];
  if (head) return [222, 170, 134, 255];
  return [188, 188, 196, 255];
}

describe("pixelatePortrait on the sample photos", () => {
  it("has ten samples", () => {
    expect(sampleFiles().length).toBe(10);
  });

  for (const file of sampleFiles()) {
    it(`${file} matches its committed golden portrait`, () => {
      const portrait = expectPortrait(portraitOf(file));
      expect(portrait).toEqual(golden(file));
      expect(pixelPortraitSchema.safeParse(portrait).success).toBe(true);
    });
  }

  it("gives the same portrait for the same bytes", () => {
    const first = expectPortrait(portraitOf("obama.jpg"));
    const second = expectPortrait(portraitOf("obama.jpg"));
    expect(second).toEqual(first);
  });

  it("gives different samples different portraits", () => {
    const portraits = sampleFiles().map((file) => expectPortrait(portraitOf(file)));
    const keys = new Set(portraits.map((portrait) => JSON.stringify(portrait)));
    expect(keys.size).toBe(portraits.length);
  });

  it("keeps every pixel inside the palette", () => {
    for (const file of sampleFiles()) {
      const portrait = expectPortrait(portraitOf(file));
      expect(portrait.size).toBe(24);
      expect(portrait.pixels).toHaveLength(576);
      expect(portrait.palette.length).toBeGreaterThanOrEqual(2);
      expect(portrait.palette.length).toBeLessThanOrEqual(8);
      for (const index of portrait.pixels) {
        expect(Number.isInteger(index)).toBe(true);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(portrait.palette.length);
      }
    }
  });

  it("honours paletteSize and dithering options", () => {
    const decoded = decodeImage(sampleBytes("lincoln.jpg"));
    if (decoded.kind !== "ok") throw new Error(decoded.reason);
    const four = expectPortrait(
      pixelatePortrait({
        rgba: decoded.image.rgba,
        width: decoded.image.width,
        height: decoded.image.height,
        options: { paletteSize: 4, dither: true },
      }),
    );
    expect(four.palette.length).toBeLessThanOrEqual(4);
    expect(pixelPortraitSchema.safeParse(four).success).toBe(true);
  });

  it("uses a crop box when one is given", () => {
    const decoded = decodeImage(sampleBytes("obama.jpg"));
    if (decoded.kind !== "ok") throw new Error(decoded.reason);
    const full = expectPortrait(
      pixelatePortrait({ rgba: decoded.image.rgba, width: decoded.image.width, height: decoded.image.height }),
    );
    const cropped = expectPortrait(
      pixelatePortrait({
        rgba: decoded.image.rgba,
        width: decoded.image.width,
        height: decoded.image.height,
        options: { crop: { x: 10, y: 10, width: 120, height: 120 } },
      }),
    );
    expect(cropped).not.toEqual(full);
    expect(pixelPortraitSchema.safeParse(cropped).success).toBe(true);
  });
});

describe("pixelatePortrait edge cases", () => {
  it("rejects images smaller than 24x24", () => {
    const one = encodePng(1, 1, () => [120, 90, 60, 255]);
    const decoded = decodeImage(one);
    expect(decoded.kind).toBe("ok");
    if (decoded.kind !== "ok") return;
    expect(pixelatePortrait(decoded.image)).toEqual({ kind: "none", reason: "too_small" });

    const tiny = rgbaImage(23, 40, syntheticFace);
    expect(pixelatePortrait(tiny)).toEqual({ kind: "none", reason: "too_small" });
  });

  it("rejects a fully transparent image", () => {
    const bytes = encodePng(40, 40, () => [200, 120, 90, 0]);
    const decoded = decodeImage(bytes);
    if (decoded.kind !== "ok") throw new Error(decoded.reason);
    expect(pixelatePortrait(decoded.image)).toEqual({ kind: "none", reason: "transparent" });
  });

  it("rejects a blank image", () => {
    const blank = rgbaImage(64, 64, () => [250, 250, 244, 255]);
    expect(pixelatePortrait(blank)).toEqual({ kind: "none", reason: "empty" });
  });

  it("accepts a very wide panorama without throwing", () => {
    const panorama = rgbaImage(2000, 40, (x, y) => [x % 256, y * 4, 128, 255]);
    const result = pixelatePortrait(panorama);
    expect(["ok", "none"]).toContain(result.kind);
  });

  it("refuses an image over the dimension cap", () => {
    const oversized = { rgba: new Uint8Array(4), width: 9000, height: 9000 };
    expect(pixelatePortrait(oversized)).toEqual({ kind: "none", reason: "too_large" });
  });

  it("rejects malformed input rather than guessing", () => {
    expect(pixelatePortrait({ rgba: new Uint8Array(10), width: 4, height: 4 })).toEqual({
      kind: "none",
      reason: "invalid_input",
    });
    expect(pixelatePortrait({ rgba: new Uint8Array(0), width: 0, height: 0 })).toEqual({
      kind: "none",
      reason: "invalid_input",
    });
    const valid = rgbaImage(64, 64, syntheticFace);
    expect(
      pixelatePortrait({ ...valid, options: { paletteSize: 12 } }),
    ).toEqual({ kind: "none", reason: "invalid_input" });
    expect(
      pixelatePortrait({ ...valid, options: { crop: { x: 0, y: 0, width: 0, height: 40 } } }),
    ).toEqual({ kind: "none", reason: "invalid_input" });
  });

  it("portraits a synthetic face", () => {
    const portrait = expectPortrait(pixelatePortrait(rgbaImage(200, 200, syntheticFace)));
    expect(pixelPortraitSchema.safeParse(portrait).success).toBe(true);
    expect(portrait.palette.length).toBeGreaterThanOrEqual(2);
  });
});

describe("decodeImage", () => {
  it("decodes a JPEG and a PNG sample", () => {
    const jpeg = decodeImage(sampleBytes("obama.jpg"));
    const png = decodeImage(sampleBytes("tubman.png"));
    expect(jpeg.kind).toBe("ok");
    expect(png.kind).toBe("ok");
    if (jpeg.kind === "ok") expect(jpeg.image.format).toBe("jpeg");
    if (png.kind === "ok") expect(png.image.format).toBe("png");
  });

  it("rejects corrupt bytes without throwing", () => {
    const corrupt = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5]);
    expect(decodeImage(corrupt)).toEqual({ kind: "none", reason: "corrupt_image" });
    expect(decodeImage(new Uint8Array(0))).toEqual({ kind: "none", reason: "corrupt_image" });
  });

  it("rejects a truncated JPEG without throwing", () => {
    const truncated = sampleBytes("einstein.jpg").slice(0, 2500);
    const result = decodeImage(truncated);
    expect(result.kind).toBe("none");
  });

  it("rejects GIF and WebP headers", () => {
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00]);
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
    expect(decodeImage(gif)).toEqual({ kind: "none", reason: "unsupported_format" });
    expect(decodeImage(webp)).toEqual({ kind: "none", reason: "unsupported_format" });
  });

  it("rejects input over the byte cap", () => {
    const huge = new Uint8Array(MAX_IMAGE_BYTES + 1);
    huge.set([0xff, 0xd8, 0xff], 0);
    expect(decodeImage(huge)).toEqual({ kind: "none", reason: "too_large" });
  });
});

describe("reducePortrait", () => {
  it("reduces a sample portrait to 100 valid pixels", () => {
    const portrait = expectPortrait(portraitOf("lincoln.jpg"));
    const head = reducePortrait(portrait, 10);
    expect(head.size).toBe(10);
    expect(head.pixels).toHaveLength(100);
    expect(head.palette).toEqual(portrait.palette);
    for (const index of head.pixels) {
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(portrait.palette.length);
    }
  });

  it("keeps the dominant hair and skin colours", () => {
    const portrait: PixelPortrait = {
      size: 24,
      palette: ["#1b120c", "#e0b48a", "#f6efe4", "#7a4a30"],
      pixels: Array.from({ length: 576 }, (_, cell) => {
        const y = Math.floor(cell / 24);
        return y < 9 ? 0 : y < 18 ? 1 : 2;
      }),
    };
    const head = reducePortrait(portrait, 10);
    const used = new Set(head.pixels);
    expect(used.has(0)).toBe(true);
    expect(used.has(1)).toBe(true);
    expect(used.has(2)).toBe(true);
  });

  it("refuses a size that cannot be reduced", () => {
    const portrait = expectPortrait(portraitOf("gandhi.jpg"));
    expect(() => reducePortrait(portrait, 25)).toThrow(RangeError);
    expect(() => reducePortrait(portrait, 0)).toThrow(RangeError);
  });
});

describe("portraitToPng", () => {
  it("round-trips a portrait through PNG at scale", () => {
    const portrait = expectPortrait(portraitOf("tubman.png"));
    const bytes = portraitToPng(portrait, 4);
    const decoded = decodeImage(bytes);
    expect(decoded.kind).toBe("ok");
    if (decoded.kind !== "ok") return;
    expect(decoded.image.width).toBe(96);
    expect(decoded.image.height).toBe(96);
    const topLeft = portrait.palette[portrait.pixels[0] ?? 0];
    expect(topLeft).toBeDefined();
    const value = Number.parseInt((topLeft ?? "#000000").slice(1), 16);
    expect(decoded.image.rgba[0]).toBe((value >> 16) & 0xff);
    expect(decoded.image.rgba[1]).toBe((value >> 8) & 0xff);
    expect(decoded.image.rgba[2]).toBe(value & 0xff);
  });
});
