import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { decodeImage, paintGrid, pixelatePortrait, reducePortrait } from "../src/index.js";
import { encodePng, type PaintedImage } from "../src/png.js";
import { downsample, resolveSquareCrop } from "../src/image.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const samplesDir = path.join(here, "..", "fixtures", "samples");
const outFile = path.join(here, "..", "fixtures", "contact-sheet.png");

const PAPER = [250, 250, 244] as const;
const LINE = [228, 226, 214] as const;
const INK = [21, 21, 36] as const;
const MUTED = [139, 136, 121] as const;

const DIGITS: Record<string, readonly string[]> = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "001", "001", "001"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
};

const ROW_HEIGHT = 108;
const MARGIN = 10;
const ORIGINAL_SIZE = 96;
const PORTRAIT_SCALE = 4;
const REDUCTION_SCALE = 8;
const SWATCH = 20;

function canvas(width: number, height: number): PaintedImage {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    rgba[i * 4] = PAPER[0];
    rgba[i * 4 + 1] = PAPER[1];
    rgba[i * 4 + 2] = PAPER[2];
    rgba[i * 4 + 3] = 255;
  }
  return { width, height, rgba };
}

function fill(
  target: PaintedImage,
  x0: number,
  y0: number,
  width: number,
  height: number,
  color: readonly [number, number, number],
): void {
  for (let y = y0; y < y0 + height; y += 1) {
    if (y < 0 || y >= target.height) continue;
    for (let x = x0; x < x0 + width; x += 1) {
      if (x < 0 || x >= target.width) continue;
      const offset = (y * target.width + x) * 4;
      target.rgba[offset] = color[0];
      target.rgba[offset + 1] = color[1];
      target.rgba[offset + 2] = color[2];
      target.rgba[offset + 3] = 255;
    }
  }
}

function blit(source: PaintedImage, target: PaintedImage, x0: number, y0: number): void {
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const from = (y * source.width + x) * 4;
      const to = ((y0 + y) * target.width + x0 + x) * 4;
      if (y0 + y >= target.height || x0 + x >= target.width) continue;
      target.rgba[to] = source.rgba[from] ?? 0;
      target.rgba[to + 1] = source.rgba[from + 1] ?? 0;
      target.rgba[to + 2] = source.rgba[from + 2] ?? 0;
      target.rgba[to + 3] = 255;
    }
  }
}

function drawNumber(target: PaintedImage, value: number, x0: number, y0: number, scale: number): void {
  const text = String(value);
  let cursor = x0;
  for (const character of text) {
    const glyph = DIGITS[character];
    if (glyph === undefined) continue;
    for (let row = 0; row < 5; row += 1) {
      const bits = glyph[row] ?? "";
      for (let column = 0; column < 3; column += 1) {
        if (bits[column] !== "1") continue;
        fill(target, cursor + column * scale, y0 + row * scale, scale, scale, INK);
      }
    }
    cursor += 4 * scale;
  }
}

/** Area-average thumbnail of the decoded image, cropped square, for a fair side-by-side. */
function thumbnail(image: { rgba: Uint8Array; width: number; height: number }): PaintedImage {
  const crop = resolveSquareCrop({ width: image.width, height: image.height });
  if (crop === null) throw new Error("thumbnail: empty image");
  const grid = downsample(image, crop, ORIGINAL_SIZE);
  const rgba = new Uint8Array(ORIGINAL_SIZE * ORIGINAL_SIZE * 4);
  for (let cell = 0; cell < ORIGINAL_SIZE * ORIGINAL_SIZE; cell += 1) {
    rgba[cell * 4] = Math.round(grid.rgb[cell * 3] ?? 0);
    rgba[cell * 4 + 1] = Math.round(grid.rgb[cell * 3 + 1] ?? 0);
    rgba[cell * 4 + 2] = Math.round(grid.rgb[cell * 3 + 2] ?? 0);
    rgba[cell * 4 + 3] = 255;
  }
  return { width: ORIGINAL_SIZE, height: ORIGINAL_SIZE, rgba };
}

const files = (await readdir(samplesDir))
  .filter((name) => /\.(jpe?g|png)$/i.test(name))
  .sort();

const portraitWidth = 24 * PORTRAIT_SCALE;
const reductionWidth = 10 * REDUCTION_SCALE;
const width = MARGIN + 16 + ORIGINAL_SIZE + 10 + portraitWidth + 10 + reductionWidth + 10 + SWATCH * 4 + MARGIN;
const height = MARGIN + files.length * ROW_HEIGHT + MARGIN;
const sheet = canvas(width, height);

let row = 0;
for (const file of files) {
  const bytes = new Uint8Array(await readFile(path.join(samplesDir, file)));
  const decoded = decodeImage(bytes);
  if (decoded.kind !== "ok") {
    console.log(`${file}: no image (${decoded.reason})`);
    row += 1;
    continue;
  }
  const result = pixelatePortrait({
    rgba: decoded.image.rgba,
    width: decoded.image.width,
    height: decoded.image.height,
  });
  if (result.kind !== "ok") {
    console.log(`${file}: no portrait (${result.reason})`);
    row += 1;
    continue;
  }

  const top = MARGIN + row * ROW_HEIGHT;
  fill(sheet, MARGIN, top, width - MARGIN * 2, 1, LINE);

  const originalX = MARGIN + 16;
  blit(thumbnail(decoded.image), sheet, originalX, top + 6);

  const portraitX = originalX + ORIGINAL_SIZE + 10;
  blit(paintGrid(result.portrait, PORTRAIT_SCALE), sheet, portraitX, top + 6);

  const reductionX = portraitX + portraitWidth + 10;
  blit(paintGrid(reducePortrait(result.portrait, 10), REDUCTION_SCALE), sheet, reductionX, top + 14);

  const swatchX = reductionX + reductionWidth + 10;
  result.portrait.palette.forEach((hex, index) => {
    const value = Number.parseInt(hex.slice(1), 16);
    const color = [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff] as const;
    fill(sheet, swatchX + (index % 4) * SWATCH, top + 10 + Math.floor(index / 4) * SWATCH, SWATCH - 2, SWATCH - 2, color);
  });

  drawNumber(sheet, row + 1, MARGIN + 1, top + 10, 2);
  console.log(
    `${String(row + 1).padStart(2)}. ${file.padEnd(22)} ${result.portrait.palette.length} colors  ${decoded.image.width}x${decoded.image.height}`,
  );
  row += 1;
}

await writeFile(outFile, encodePng(sheet));
console.log(`wrote ${path.relative(process.cwd(), outFile)} (${width}x${height})`);
