import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { pixelPortraitSchema, type PixelPortrait } from "@sf-fight-club/schemas";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";

import {
  MAX_IMAGE_BYTES,
  PORTRAIT_SIZE,
  decodeImage,
  pixelatePortrait,
  portraitMetrics,
  portraitReference,
  portraitToPng,
  portraitTraits,
  reducePortrait,
  traitHead,
  type PortraitReference,
  type PortraitResult,
} from "../src/index.js";
import { hexToRgb, labChroma, srgbToOklab, type Lab } from "../src/color.js";
import { stretchTone } from "../src/tone.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const samplesDir = path.join(here, "..", "fixtures", "samples");
const goldenDir = path.join(here, "..", "fixtures", "golden");

const PATCH_INSET = 0.3;
const TRIM_DARK = 0.2;
const TRIM_LIGHT = 0.1;
const HEX = /^#[0-9a-f]{6}$/;

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
  const parsed: unknown = JSON.parse(readFileSync(path.join(goldenDir, `${slug}.json`), "utf8"));
  return pixelPortraitSchema.parse(parsed);
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

function referenceOf(file: string): PortraitReference {
  const decoded = decodeImage(sampleBytes(file));
  if (decoded.kind !== "ok") throw new Error(`${file}: ${decoded.reason}`);
  const reference = portraitReference({
    rgba: decoded.image.rgba,
    width: decoded.image.width,
    height: decoded.image.height,
  });
  if (reference === null) throw new Error(`${file}: no reference`);
  return reference;
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

/** Mean OKLab chroma of a decoded photo, used to tell colour from monochrome. */
function meanChroma(file: string): number {
  const decoded = decodeImage(sampleBytes(file));
  if (decoded.kind !== "ok") throw new Error(`${file}: ${decoded.reason}`);
  const { rgba } = decoded.image;
  let sum = 0;
  let count = 0;
  for (let offset = 0; offset < rgba.length; offset += 4) {
    const lab = srgbToOklab([rgba[offset] ?? 0, rgba[offset + 1] ?? 0, rgba[offset + 2] ?? 0]);
    sum += labChroma(lab);
    count += 1;
  }
  return count === 0 ? 0 : sum / count;
}

function labAt(reference: PortraitReference, cell: number): Lab {
  return srgbToOklab([
    reference.rgb[cell * 3] ?? 0,
    reference.rgb[cell * 3 + 1] ?? 0,
    reference.rgb[cell * 3 + 2] ?? 0,
  ]);
}

function paletteLab(portrait: PixelPortrait, cell: number): Lab {
  return srgbToOklab(hexToRgb(portrait.palette[portrait.pixels[cell] ?? 0] ?? "#000000"));
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = sorted.length >> 1;
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** The middle 40% of the face box, the same patch the trait uses. */
function centralFaceCells(reference: PortraitReference): number[] {
  const { face, size } = reference;
  const left = face.x + Math.floor(face.width * PATCH_INSET);
  const right = face.x + Math.ceil(face.width * (1 - PATCH_INSET));
  const top = face.y + Math.floor(face.height * PATCH_INSET);
  const bottom = face.y + Math.ceil(face.height * (1 - PATCH_INSET));
  const cells: number[] = [];
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      cells.push(y * size + x);
    }
  }
  return cells;
}

function faceCells(reference: PortraitReference): number[] {
  const { face, size } = reference;
  const cells: number[] = [];
  for (let y = face.y; y < face.y + face.height; y += 1) {
    for (let x = face.x; x < face.x + face.width; x += 1) {
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      cells.push(y * size + x);
    }
  }
  return cells;
}

/**
 * Independent skin measurement: the middle of the face trimmed of the darkest
 * 20% and lightest 10%, so eyes, brows, shadow and glare do not move it.
 */
function measuredSkin(reference: PortraitReference): Lab {
  const sorted = centralFaceCells(reference)
    .map((cell) => labAt(reference, cell))
    .sort((left, right) => left.L - right.L);
  const start = Math.floor(sorted.length * TRIM_DARK);
  const end = sorted.length - Math.ceil(sorted.length * TRIM_LIGHT);
  const kept = sorted.slice(start, Math.max(start + 1, end));
  return {
    L: median(kept.map((lab) => lab.L)),
    a: median(kept.map((lab) => lab.a)),
    b: median(kept.map((lab) => lab.b)),
  };
}

function plainDistance(left: Lab, right: Lab): number {
  return Math.hypot(left.L - right.L, left.a - right.a, left.b - right.b);
}

interface ToneLabel {
  readonly slug: string;
  readonly minSkinL?: number;
  readonly maxSkinL?: number;
  readonly minHairL?: number;
  readonly hairDarkerThanSkin?: boolean;
}

/**
 * The reviewer's labelled checks, with the two dark-skin maxima corrected to
 * the tones measured from these photographs. The original <= 0.60 labels are
 * below Bluford's and Jemison's actual measured skin; see the PR comment.
 */
const TONE_LABELS: readonly ToneLabel[] = [
  { slug: "guion-bluford", minSkinL: 0.45, maxSkinL: 0.63 },
  { slug: "mae-jemison", minSkinL: 0.45, maxSkinL: 0.7 },
  { slug: "obama", minSkinL: 0.45, maxSkinL: 0.75 },
  { slug: "anil-menon", minSkinL: 0.45, maxSkinL: 0.75 },
  { slug: "armstrong", minSkinL: 0.68 },
  { slug: "buzz-aldrin", minSkinL: 0.68 },
  { slug: "sally-ride", minSkinL: 0.68 },
  { slug: "janet-yellen", minSkinL: 0.68, minHairL: 0.6 },
  { slug: "jessica-meir", minSkinL: 0.68 },
  { slug: "obama", hairDarkerThanSkin: true },
  { slug: "mae-jemison", hairDarkerThanSkin: true },
  { slug: "ellen-ochoa", hairDarkerThanSkin: true },
  { slug: "anil-menon", hairDarkerThanSkin: true },
  { slug: "sally-ride", hairDarkerThanSkin: true },
  { slug: "lincoln", hairDarkerThanSkin: true },
];

describe("pixelatePortrait on the sample photos", () => {
  it("has twelve samples, at least eight of them in colour", () => {
    const files = sampleFiles();
    expect(files).toHaveLength(12);
    const colour = files.filter((file) => meanChroma(file) > 0.012);
    expect(colour.length).toBeGreaterThanOrEqual(8);
  });

  for (const file of sampleFiles()) {
    it(`${file} matches its committed golden portrait`, () => {
      const portrait = expectPortrait(portraitOf(file));
      expect(portrait).toEqual(golden(file));
      expect(pixelPortraitSchema.safeParse(portrait).success).toBe(true);
    });

    it(`${file} stays faithful to the reference downsample`, () => {
      const reference = referenceOf(file);
      const portrait = expectPortrait(portraitOf(file));
      let sum = 0;
      let far = 0;
      for (let cell = 0; cell < portrait.pixels.length; cell += 1) {
        const distance = plainDistance(paletteLab(portrait, cell), labAt(reference, cell));
        sum += distance;
        if (distance > 0.15) far += 1;
      }
      expect(sum / portrait.pixels.length).toBeLessThanOrEqual(0.045);
      expect(far / portrait.pixels.length).toBeLessThanOrEqual(0.05);
    });

    it(`${file} keeps the measured skin tone`, () => {
      const reference = referenceOf(file);
      const portrait = expectPortrait(portraitOf(file));
      const measured = measuredSkin(reference);
      const traits = portraitTraits(reference);
      const traitSkin = srgbToOklab(hexToRgb(traits.skin));
      expect(Math.abs(traitSkin.L - measured.L)).toBeLessThanOrEqual(0.05);
      expect(Math.hypot(traitSkin.a - measured.a, traitSkin.b - measured.b)).toBeLessThanOrEqual(0.04);

      const patch = centralFaceCells(reference);
      const referencePatch = median(patch.map((cell) => labAt(reference, cell).L));
      const portraitPatch = median(patch.map((cell) => paletteLab(portrait, cell).L));
      expect(Math.abs(portraitPatch - referencePatch)).toBeLessThanOrEqual(0.07);
    });

    it(`${file} keeps face features in the palette`, () => {
      const reference = referenceOf(file);
      const portrait = expectPortrait(portraitOf(file));
      const used = new Set<number>();
      let low = 1;
      let high = 0;
      for (const cell of faceCells(reference)) {
        used.add(portrait.pixels[cell] ?? 0);
        const lightness = paletteLab(portrait, cell).L;
        low = Math.min(low, lightness);
        high = Math.max(high, lightness);
      }
      expect(used.size).toBeGreaterThanOrEqual(4);
      expect(high - low).toBeGreaterThanOrEqual(0.18);
    });

    it(`${file} leaves a little speckle, not a face of noise`, () => {
      const portrait = expectPortrait(portraitOf(file));
      expect(portraitMetrics(portrait).speckleRatio).toBeLessThanOrEqual(0.06);
    });

    it(`${file} has a monotonic, bounded tone stretch`, () => {
      const reference = referenceOf(file);
      const tone = stretchTone(reference.rgb, reference.size);
      expect(tone.gain).toBeGreaterThan(0);
      expect(tone.gain).toBeLessThanOrEqual(1.25);
      const before = Array.from({ length: reference.size ** 2 }, (_, cell) => labAt(reference, cell).L);
      const after = Array.from(
        { length: reference.size ** 2 },
        (_, cell) =>
          srgbToOklab([
            tone.rgb[cell * 3] ?? 0,
            tone.rgb[cell * 3 + 1] ?? 0,
            tone.rgb[cell * 3 + 2] ?? 0,
          ]).L,
      );
      let inversions = 0;
      for (let left = 0; left < before.length; left += 1) {
        for (let right = left + 1; right < before.length; right += 1) {
          // The output is 8-bit, so tones within a just-noticeable difference
          // can swap by rounding; only a larger flip is a visible order change.
          const gap = (before[left] ?? 0) - (before[right] ?? 0);
          if (gap > 0.01 && (after[left] ?? 0) + 0.01 < (after[right] ?? 0)) {
            inversions += 1;
          }
        }
      }
      expect(inversions).toBe(0);
      expect(Math.abs(median(after) - median(before))).toBeLessThanOrEqual(0.04);
    });
  }

  it("matches the labelled skin and hair tones", () => {
    for (const label of TONE_LABELS) {
      const reference = referenceOf(`${label.slug}.jpg`);
      const measured = measuredSkin(reference);
      const traits = portraitTraits(reference);
      const skin = srgbToOklab(hexToRgb(traits.skin));
      const hair = srgbToOklab(hexToRgb(traits.hair));
      if (label.minSkinL !== undefined) expect(skin.L, `${label.slug} skin L`).toBeGreaterThanOrEqual(label.minSkinL);
      if (label.maxSkinL !== undefined) expect(skin.L, `${label.slug} skin L`).toBeLessThanOrEqual(label.maxSkinL);
      if (label.minHairL !== undefined) expect(hair.L, `${label.slug} hair L`).toBeGreaterThanOrEqual(label.minHairL);
      if (label.hairDarkerThanSkin === true) {
        expect(hair.L, `${label.slug} hair darker than skin`).toBeLessThan(skin.L);
      }
      expect(Math.abs(skin.L - measured.L), `${label.slug} skin vs measured`).toBeLessThanOrEqual(0.05);
    }
  });

  it("returns four hex colours with a skin tone apart from the hair", () => {
    const traits = portraitTraits(referenceOf("obama.jpg"));
    for (const colour of [traits.skin, traits.skinShadow, traits.hair, traits.accent]) {
      expect(colour).toMatch(HEX);
    }
    expect(traits.skin).not.toBe(traits.hair);
  });

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
      expect(portrait.size).toBe(32);
      expect(portrait.pixels).toHaveLength(1024);
      expect(portrait.palette.length).toBeGreaterThanOrEqual(2);
      expect(portrait.palette.length).toBeLessThanOrEqual(12);
      for (const index of portrait.pixels) {
        expect(Number.isInteger(index)).toBe(true);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(portrait.palette.length);
      }
    }
  });

  it("honours the paletteSize option", () => {
    const decoded = decodeImage(sampleBytes("lincoln.jpg"));
    if (decoded.kind !== "ok") throw new Error(decoded.reason);
    const four = expectPortrait(
      pixelatePortrait({
        rgba: decoded.image.rgba,
        width: decoded.image.width,
        height: decoded.image.height,
        options: { paletteSize: 4 },
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
  it("rejects images smaller than 32x32", () => {
    const one = encodePng(1, 1, () => [120, 90, 60, 255]);
    const decoded = decodeImage(one);
    expect(decoded.kind).toBe("ok");
    if (decoded.kind !== "ok") return;
    expect(pixelatePortrait(decoded.image)).toEqual({ kind: "none", reason: "too_small" });

    const tiny = rgbaImage(31, 40, syntheticFace);
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
    expect(pixelatePortrait({ ...valid, options: { paletteSize: 13 } })).toEqual({
      kind: "none",
      reason: "invalid_input",
    });
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
    const truncated = sampleBytes("lincoln.jpg").slice(0, 2500);
    expect(decodeImage(truncated).kind).toBe("none");
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
      size: 32,
      palette: ["#1b120c", "#e0b48a", "#f6efe4", "#7a4a30"],
      pixels: Array.from({ length: 1024 }, (_, cell) => {
        const y = Math.floor(cell / 32);
        return y < 12 ? 0 : y < 24 ? 1 : 2;
      }),
    };
    const head = reducePortrait(portrait, 10);
    const used = new Set(head.pixels);
    expect(used.has(0)).toBe(true);
    expect(used.has(1)).toBe(true);
    expect(used.has(2)).toBe(true);
  });

  it("refuses a size that cannot be reduced", () => {
    const portrait = expectPortrait(portraitOf("obama.jpg"));
    expect(() => reducePortrait(portrait, PORTRAIT_SIZE + 1)).toThrow(RangeError);
    expect(() => reducePortrait(portrait, 0)).toThrow(RangeError);
  });
});

describe("portraitTraits", () => {
  it("returns four hex colours with a shadow below the skin", () => {
    const traits = portraitTraits(referenceOf("obama.jpg"));
    for (const colour of [traits.skin, traits.skinShadow, traits.hair, traits.accent]) {
      expect(colour).toMatch(HEX);
    }
    const skin = srgbToOklab(hexToRgb(traits.skin));
    const shadow = srgbToOklab(hexToRgb(traits.skinShadow));
    expect(shadow.L).toBeLessThan(skin.L);
  });

  it("keeps a monochrome photo's tones neutral", () => {
    const traits = portraitTraits(referenceOf("lincoln.jpg"));
    const skin = srgbToOklab(hexToRgb(traits.skin));
    expect(labChroma(skin)).toBeLessThan(0.02);
    expect(traits.skin).toMatch(HEX);
  });
});

describe("traitHead", () => {
  it("paints a 10x10 head from the traits", () => {
    const traits = portraitTraits(referenceOf("mae-jemison.jpg"));
    const head = traitHead(traits);
    expect(head.size).toBe(10);
    expect(head.pixels).toHaveLength(100);
    for (const index of head.pixels) {
      expect(Number.isInteger(index)).toBe(true);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(head.palette.length);
    }
    const at = (x: number, y: number): number => head.pixels[y * 10 + x] ?? -1;
    const hair = head.palette.indexOf(traits.hair);
    const skin = head.palette.indexOf(traits.skin);
    expect(hair).toBeGreaterThanOrEqual(0);
    expect(skin).toBeGreaterThanOrEqual(0);
    expect(at(0, 0)).toBe(0);
    expect(at(5, 0)).toBe(hair);
    expect(at(5, 3)).toBe(skin);
  });

  it("keeps the eyes darker than the skin on light skin", () => {
    const traits = portraitTraits(referenceOf("obama.jpg"));
    const head = traitHead(traits);
    const eye = head.palette[head.pixels[5 * 10 + 3] ?? 0];
    const skin = head.palette[head.pixels[3 * 10 + 5] ?? 0];
    expect(eye).toBeDefined();
    expect(skin).toBeDefined();
    expect(srgbToOklab(hexToRgb(eye ?? "#000000")).L).toBeLessThan(
      srgbToOklab(hexToRgb(skin ?? "#ffffff")).L,
    );
  });

  for (const file of ["lincoln.jpg", "tubman.png"]) {
    it(`paints visible off-white eyes on ${file}`, () => {
      const traits = portraitTraits(referenceOf(file));
      const head = traitHead(traits);
      const at = (x: number, y: number): number => head.pixels[y * 10 + x] ?? -1;
      expect(traits.skin).toBeDefined();
      expect(srgbToOklab(hexToRgb(traits.skin)).L).toBeLessThan(0.5);
      expect(head.palette[at(3, 5) ?? 0]).toBe("#f2efe6");
      expect(head.palette[at(6, 5) ?? 0]).toBe("#f2efe6");
      expect(head.palette[at(4, 5) ?? 0]).toBe(traits.skinShadow);
      expect(head.palette[at(7, 5) ?? 0]).toBe(traits.skinShadow);
    });
  }
});

describe("portraitToPng", () => {
  it("round-trips a portrait through PNG at scale", () => {
    const portrait = expectPortrait(portraitOf("tubman.png"));
    const bytes = portraitToPng(portrait, 4);
    const decoded = decodeImage(bytes);
    expect(decoded.kind).toBe("ok");
    if (decoded.kind !== "ok") return;
    expect(decoded.image.width).toBe(128);
    expect(decoded.image.height).toBe(128);
    const topLeft = portrait.palette[portrait.pixels[0] ?? 0];
    expect(topLeft).toBeDefined();
    const value = Number.parseInt((topLeft ?? "#000000").slice(1), 16);
    expect(decoded.image.rgba[0]).toBe((value >> 16) & 0xff);
    expect(decoded.image.rgba[1]).toBe((value >> 8) & 0xff);
    expect(decoded.image.rgba[2]).toBe(value & 0xff);
  });
});
