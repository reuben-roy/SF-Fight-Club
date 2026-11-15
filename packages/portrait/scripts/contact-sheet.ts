import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { PNG } from "pngjs";

import { decodeImage } from "../src/decode.js";
import { resolveTightCrop } from "../src/frame.js";
import { spans } from "../src/image.js";
import { portraitMetrics } from "../src/metrics.js";
import { pixelatePortrait } from "../src/pixelate.js";
import { paintGrid } from "../src/png.js";
import { portraitTraits, traitHead } from "../src/traits.js";
import type { RgbaImage } from "../src/types.js";

const SAMPLES_DIR = fileURLToPath(new URL("../fixtures/samples/", import.meta.url));
const OUTPUT = fileURLToPath(new URL("../fixtures/contact-sheet.png", import.meta.url));

const PAPER: Rgb = [250, 250, 244];
const LINE: Rgb = [228, 226, 214];
const INK: Rgb = [21, 21, 36];
const MUTED: Rgb = [139, 136, 121];
const MISSING: Rgb = [236, 232, 224];

const MARGIN = 10;
const ROW_HEIGHT = 104;
const LABEL_WIDTH = 22;
const PHOTO = 96;
const HEAD = 80;
const SWATCH = 22;
const GAP = 8;

type Rgb = readonly [number, number, number];

interface Canvas {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

const DIGITS: readonly (readonly string[])[] = [
  ["111", "101", "101", "101", "111"],
  ["010", "010", "010", "010", "010"],
  ["111", "001", "111", "100", "111"],
  ["111", "001", "111", "001", "111"],
  ["101", "101", "111", "001", "001"],
  ["111", "100", "111", "001", "111"],
  ["111", "100", "111", "101", "111"],
  ["111", "001", "001", "001", "001"],
  ["111", "101", "111", "101", "111"],
  ["111", "101", "111", "001", "111"],
];

function canvas(width: number, height: number): Canvas {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    rgba[i * 4] = PAPER[0];
    rgba[i * 4 + 1] = PAPER[1];
    rgba[i * 4 + 2] = PAPER[2];
    rgba[i * 4 + 3] = 255;
  }
  return { width, height, rgba };
}

function fill(target: Canvas, x: number, y: number, width: number, height: number, color: Rgb): void {
  for (let row = y; row < y + height; row += 1) {
    if (row < 0 || row >= target.height) continue;
    for (let column = x; column < x + width; column += 1) {
      if (column < 0 || column >= target.width) continue;
      const offset = (row * target.width + column) * 4;
      target.rgba[offset] = color[0];
      target.rgba[offset + 1] = color[1];
      target.rgba[offset + 2] = color[2];
      target.rgba[offset + 3] = 255;
    }
  }
}

function blit(target: Canvas, image: RgbaImage, x: number, y: number): void {
  for (let row = 0; row < image.height; row += 1) {
    const targetRow = y + row;
    if (targetRow < 0 || targetRow >= target.height) continue;
    for (let column = 0; column < image.width; column += 1) {
      const targetColumn = x + column;
      if (targetColumn < 0 || targetColumn >= target.width) continue;
      const source = (row * image.width + column) * 4;
      const destination = (targetRow * target.width + targetColumn) * 4;
      target.rgba[destination] = image.rgba[source] ?? 0;
      target.rgba[destination + 1] = image.rgba[source + 1] ?? 0;
      target.rgba[destination + 2] = image.rgba[source + 2] ?? 0;
      target.rgba[destination + 3] = 255;
    }
  }
}

function drawNumber(target: Canvas, value: number, x: number, y: number, scale: number): void {
  const text = String(value);
  for (let digit = 0; digit < text.length; digit += 1) {
    const glyph = DIGITS[Number(text[digit] ?? "0")] ?? DIGITS[0] ?? [];
    for (let row = 0; row < glyph.length; row += 1) {
      const line = glyph[row] ?? "";
      for (let column = 0; column < line.length; column += 1) {
        if (line[column] !== "1") continue;
        fill(
          target,
          x + (digit * 4 + column) * scale,
          y + row * scale,
          scale,
          scale,
          INK,
        );
      }
    }
  }
}

function resample(image: RgbaImage, width: number, height: number): RgbaImage {
  const xSpans = spans(image.width, width);
  const ySpans = spans(image.height, height);
  const accum = new Float64Array(width * height * 3);
  const weights = new Float64Array(width * height);
  for (let sy = 0; sy < image.height; sy += 1) {
    const rows = ySpans[sy];
    if (rows === undefined) continue;
    for (let sx = 0; sx < image.width; sx += 1) {
      const columns = xSpans[sx];
      if (columns === undefined) continue;
      const source = (sy * image.width + sx) * 4;
      const alpha = (image.rgba[source + 3] ?? 0) / 255;
      for (const row of rows) {
        for (const column of columns) {
          const cell = row.cell * width + column.cell;
          const weight = row.weight * column.weight * alpha;
          accum[cell * 3] = (accum[cell * 3] ?? 0) + (image.rgba[source] ?? 0) * weight;
          accum[cell * 3 + 1] = (accum[cell * 3 + 1] ?? 0) + (image.rgba[source + 1] ?? 0) * weight;
          accum[cell * 3 + 2] = (accum[cell * 3 + 2] ?? 0) + (image.rgba[source + 2] ?? 0) * weight;
          weights[cell] = (weights[cell] ?? 0) + weight;
        }
      }
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let cell = 0; cell < width * height; cell += 1) {
    const weight = weights[cell] ?? 0;
    for (let channel = 0; channel < 3; channel += 1) {
      rgba[cell * 4 + channel] =
        weight === 0 ? PAPER[channel] ?? 0 : Math.round((accum[cell * 3 + channel] ?? 0) / weight);
    }
    rgba[cell * 4 + 3] = 255;
  }
  return { rgba, width, height };
}

/** Fit the whole photo into a square, so framing can be judged against the original. */
function containThumb(image: RgbaImage, box: number): RgbaImage {
  const scale = Math.min(box / image.width, box / image.height);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const thumb = resample(image, width, height);
  const out = canvas(box, box);
  blit(out, thumb, Math.floor((box - width) / 2), Math.floor((box - height) / 2));
  return out;
}

function cropThumb(image: RgbaImage, box: { x: number; y: number; size: number }, size: number): RgbaImage {
  const out = new Uint8Array(size * size * 4);
  const xSpans = spans(box.size, size);
  const ySpans = spans(box.size, size);
  const accum = new Float64Array(size * size * 3);
  const weights = new Float64Array(size * size);
  for (let sy = 0; sy < box.size; sy += 1) {
    const rows = ySpans[sy];
    if (rows === undefined) continue;
    for (let sx = 0; sx < box.size; sx += 1) {
      const columns = xSpans[sx];
      if (columns === undefined) continue;
      const source = ((box.y + sy) * image.width + box.x + sx) * 4;
      const alpha = (image.rgba[source + 3] ?? 0) / 255;
      for (const row of rows) {
        for (const column of columns) {
          const cell = row.cell * size + column.cell;
          const weight = row.weight * column.weight * alpha;
          accum[cell * 3] = (accum[cell * 3] ?? 0) + (image.rgba[source] ?? 0) * weight;
          accum[cell * 3 + 1] = (accum[cell * 3 + 1] ?? 0) + (image.rgba[source + 1] ?? 0) * weight;
          accum[cell * 3 + 2] = (accum[cell * 3 + 2] ?? 0) + (image.rgba[source + 2] ?? 0) * weight;
          weights[cell] = (weights[cell] ?? 0) + weight;
        }
      }
    }
  }
  for (let cell = 0; cell < size * size; cell += 1) {
    const weight = weights[cell] ?? 0;
    for (let channel = 0; channel < 3; channel += 1) {
      out[cell * 4 + channel] =
        weight === 0 ? PAPER[channel] ?? 0 : Math.round((accum[cell * 3 + channel] ?? 0) / weight);
    }
    out[cell * 4 + 3] = 255;
  }
  return { rgba: out, width: size, height: size };
}

function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

async function sampleFiles(): Promise<string[]> {
  const entries = await readdir(SAMPLES_DIR);
  return entries.filter((name) => /\.(jpe?g|png)$/i.test(name)).sort();
}

async function main(): Promise<void> {
  const files = await sampleFiles();
  const rows = files.length;
  const width =
    MARGIN + LABEL_WIDTH + PHOTO + GAP + PHOTO + GAP + PHOTO + GAP + HEAD + GAP + 4 * SWATCH + MARGIN;
  const height = MARGIN * 2 + rows * ROW_HEIGHT;
  const sheet = canvas(width, height);

  const photoX = MARGIN + LABEL_WIDTH;
  const cropX = photoX + PHOTO + GAP;
  const portraitX = cropX + PHOTO + GAP;
  const headX = portraitX + PHOTO + GAP;
  const swatchX = headX + HEAD + GAP;

  process.stdout.write(
    "sample        speckle  minPx  bgParts  bgLeak  subject  colors  skin     shadow   hair     accent\n",
  );

  for (const [index, file] of files.entries()) {
    const top = MARGIN + index * ROW_HEIGHT;
    const decoded = decodeImage(await readFile(join(SAMPLES_DIR, file)));
    if (decoded.kind !== "ok") throw new Error(`${file}: ${decoded.reason}`);
    const image = decoded.image;

    fill(sheet, MARGIN, top + ROW_HEIGHT - 2, width - MARGIN * 2, 1, LINE);
    drawNumber(sheet, index + 1, MARGIN, top + 4, 2);

    blit(sheet, containThumb(image, PHOTO), photoX, top + 2);

    const crop = resolveTightCrop(image);
    if (crop === null) throw new Error(`${file}: crop failed`);
    blit(sheet, cropThumb(image, crop, PHOTO), cropX, top + 2);

    const result = pixelatePortrait(image);
    if (result.kind !== "ok") throw new Error(`${file}: ${result.reason}`);
    const portrait = result.portrait;
    const metrics = portraitMetrics(portrait);
    const traits = portraitTraits(portrait);

    blit(sheet, paintGrid({ size: portrait.size, palette: [...portrait.palette], pixels: [...portrait.pixels] }, 4), portraitX, top + 2);
    blit(sheet, paintGrid(traitHead(traits, 10, portrait.palette[metrics.backgroundIndex ?? 0] ?? "#1b1b28"), 8), headX, top + 10);

    for (const [entry, hex] of portrait.palette.entries()) {
      const column = entry % 4;
      const row = Math.floor(entry / 4);
      fill(sheet, swatchX + column * SWATCH, top + 2 + row * SWATCH, SWATCH - 1, SWATCH - 1, hexToRgb(hex));
    }
    if (portrait.palette.length === 0) {
      fill(sheet, swatchX, top + 2, SWATCH - 1, SWATCH - 1, MISSING);
    }

    process.stdout.write(
      [
        file.padEnd(13),
        percent(metrics.speckleRatio).padStart(7),
        String(metrics.paletteMinCoverage).padStart(6),
        String(metrics.backgroundComponents).padStart(8),
        String(metrics.backgroundLeaks).padStart(7),
        percent(metrics.subjectShare).padStart(8),
        String(portrait.palette.length).padStart(7),
        traits.skin,
        traits.skinShadow,
        traits.hair,
        traits.accent,
      ].join("  ") + "\n",
    );
  }

  const png = new PNG({ width, height });
  png.data = Buffer.from(sheet.rgba);
  await writeFile(OUTPUT, PNG.sync.write(png));
  process.stdout.write(`\n${OUTPUT}\n`);
}

await main();
