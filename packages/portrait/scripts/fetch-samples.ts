import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { encode as encodeJpeg } from "jpeg-js";
import { PNG } from "pngjs";

import { decodeImage } from "../src/decode.js";
import { spans } from "../src/image.js";
import type { RgbaImage } from "../src/types.js";

const SAMPLES_DIR = fileURLToPath(new URL("../fixtures/samples/", import.meta.url));
const USER_AGENT =
  "SF-Fight-Club-portrait-fixtures/0.1 (https://github.com/reuben-roy/SF-Fight-Club)";
const RETRIEVED = "15 November 2026";
const MAX_SIDE = 400;
const MAX_BYTES = 100_000;
const REQUEST_GAP_MS = 3000;

interface Source {
  readonly slug: string;
  readonly title: string;
  readonly subject: string;
  readonly author: string;
  readonly license: string;
  readonly format: "jpeg" | "png";
  readonly note: string;
}

const SOURCES: readonly Source[] = [
  {
    slug: "armstrong",
    title: "Neil Armstrong pose.jpg",
    subject: "Neil Armstrong",
    author: "NASA (S69-31741)",
    license: "Public domain (PD-USGov-NASA)",
    format: "jpeg",
    note: "Light skin, short hair, plain backdrop",
  },
  {
    slug: "obama",
    title: "President Barack Obama.jpg",
    subject: "Barack Obama",
    author: "Pete Souza, Official White House Photo",
    license: "Public domain (PD-USGov)",
    format: "jpeg",
    note: "Medium skin, short hair, plain backdrop",
  },
  {
    slug: "sally-ride",
    title: "Sally Ride (1984).jpg",
    subject: "Sally Ride",
    author: "NASA, retouched by Coffeeandcrumbs",
    license: "Public domain (PD-USGov-NASA)",
    format: "jpeg",
    note: "Light skin, shoulder-length hair",
  },
  {
    slug: "mae-jemison",
    title: "Mae Carol Jemison.jpg",
    subject: "Mae Jemison",
    author: "NASA",
    license: "Public domain (PD-USGov-NASA)",
    format: "jpeg",
    note: "Dark skin, short hair",
  },
  {
    slug: "guion-bluford",
    title: "Guion Bluford.jpg",
    subject: "Guion Bluford",
    author: "NASA, retouched by Cofeeandcrumbs",
    license: "Public domain (PD-USGov-NASA)",
    format: "jpeg",
    note: "Dark skin, short hair",
  },
  {
    slug: "buzz-aldrin",
    title: "Buzz Aldrin.jpg",
    subject: "Buzz Aldrin",
    author: "NASA",
    license: "Public domain (PD-USGov-NASA)",
    format: "jpeg",
    note: "Light skin, grey hair, plain backdrop",
  },
  {
    slug: "ellen-ochoa",
    title: "Ellen Ochoa, official portrait.jpg",
    subject: "Ellen Ochoa",
    author: "Bill Stafford, NASA",
    license: "Public domain (PD-USGov-NASA)",
    format: "jpeg",
    note: "Medium skin, dark hair, busy badge lanyard",
  },
  {
    slug: "anil-menon",
    title: "Anil Menon portrait.jpg",
    subject: "Anil Menon",
    author: "Robert Markowitz, NASA",
    license: "Public domain (PD-USGov-NASA)",
    format: "jpeg",
    note: "Medium skin, short hair, busy backdrop",
  },
  {
    slug: "jessica-meir",
    title: "Jessica Meir official portrait in an EMU.jpg",
    subject: "Jessica Meir",
    author: "Josh Valcarcel, NASA",
    license: "Public domain (PD-USGov-NASA)",
    format: "jpeg",
    note: "Helmet and visor, face inside the suit",
  },
  {
    slug: "janet-yellen",
    title: "Janet Yellen official portrait.jpg",
    subject: "Janet Yellen",
    author: "Federal Reserve",
    license: "Public domain (PD-USGov)",
    format: "jpeg",
    note: "Light skin, grey hair, glasses",
  },
  {
    slug: "lincoln",
    title: "Abraham Lincoln O-77 matte collodion print.jpg",
    subject: "Abraham Lincoln",
    author: "Alexander Gardner",
    license: "Public domain (PD-old-100)",
    format: "jpeg",
    note: "Black and white, beard",
  },
  {
    slug: "tubman",
    title: "Harriet Tubman (circa 1885).jpg",
    subject: "Harriet Tubman",
    author: "Horatio Seymour Squyer",
    license: "Public domain (PD-old-100)",
    format: "png",
    note: "Black and white, headwrap",
  },
];

function commonsPage(title: string): string {
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(title.replace(/ /g, "_"))}`;
}

function filePath(title: string): string {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(title)}?width=800`;
}

/** Area-average resize in sRGB, which is what the pipeline would see from a real upload. */
function resize(image: RgbaImage, width: number, height: number): RgbaImage {
  const xSpans = spans(image.width, width);
  const ySpans = spans(image.height, height);
  const accum = new Float64Array(width * height * 4);
  const weights = new Float64Array(width * height);
  for (let sy = 0; sy < image.height; sy += 1) {
    const rows = ySpans[sy];
    if (rows === undefined) continue;
    for (let sx = 0; sx < image.width; sx += 1) {
      const columns = xSpans[sx];
      if (columns === undefined) continue;
      const offset = (sy * image.width + sx) * 4;
      const alpha = (image.rgba[offset + 3] ?? 0) / 255;
      for (const row of rows) {
        for (const column of columns) {
          const cell = row.cell * width + column.cell;
          const weight = row.weight * column.weight * alpha;
          accum[cell * 4] = (accum[cell * 4] ?? 0) + (image.rgba[offset] ?? 0) * weight;
          accum[cell * 4 + 1] = (accum[cell * 4 + 1] ?? 0) + (image.rgba[offset + 1] ?? 0) * weight;
          accum[cell * 4 + 2] = (accum[cell * 4 + 2] ?? 0) + (image.rgba[offset + 2] ?? 0) * weight;
          accum[cell * 4 + 3] = (accum[cell * 4 + 3] ?? 0) + (image.rgba[offset + 3] ?? 0) * weight;
          weights[cell] = (weights[cell] ?? 0) + weight;
        }
      }
    }
  }
  const rgba = new Uint8Array(width * height * 4);
  for (let cell = 0; cell < width * height; cell += 1) {
    const weight = weights[cell] ?? 0;
    for (let channel = 0; channel < 4; channel += 1) {
      rgba[cell * 4 + channel] =
        weight === 0 ? 0 : Math.round((accum[cell * 4 + channel] ?? 0) / weight);
    }
    rgba[cell * 4 + 3] = 255;
  }
  return { rgba, width, height };
}

function encode(image: RgbaImage, format: "jpeg" | "png"): Uint8Array {
  if (format === "jpeg") {
    const encoded = encodeJpeg(
      { data: Buffer.from(image.rgba), width: image.width, height: image.height },
      82,
    );
    return new Uint8Array(encoded.data);
  }
  const png = new PNG({ width: image.width, height: image.height });
  png.data = Buffer.from(image.rgba);
  return new Uint8Array(PNG.sync.write(png));
}

async function download(source: Source): Promise<Uint8Array> {
  const response = await fetch(filePath(source.title), {
    headers: { "User-Agent": USER_AGENT },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`${source.slug}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function fetchOne(source: Source): Promise<string> {
  const bytes = await download(source);
  const decoded = decodeImage(bytes);
  if (decoded.kind !== "ok") throw new Error(`${source.slug}: ${decoded.reason}`);
  const longSide = Math.max(decoded.image.width, decoded.image.height);
  let side = MAX_SIDE;
  let encoded: Uint8Array = new Uint8Array();
  let width = 0;
  let height = 0;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const scale = side / longSide;
    width = Math.max(1, Math.round(decoded.image.width * scale));
    height = Math.max(1, Math.round(decoded.image.height * scale));
    encoded = encode(resize(decoded.image, width, height), source.format);
    if (encoded.length < MAX_BYTES) break;
    side = Math.round(side * 0.8);
  }
  if (encoded.length >= MAX_BYTES) throw new Error(`${source.slug}: still ${encoded.length} bytes`);
  const name = `${source.slug}.${source.format === "jpeg" ? "jpg" : "png"}`;
  await writeFile(join(SAMPLES_DIR, name), encoded);
  return `| \`${name}\` | ${source.subject} | ${source.note} | ${width}x${height} | [${source.title}](${commonsPage(source.title)}) | ${source.author} | ${source.license} |`;
}

function sourcesMarkdown(rows: readonly string[]): string {
  return `# Portrait sample photos

Twelve adult public figures, all public domain. Every file is a Wikimedia Commons
original downloaded through \`Special:FilePath\`, then area-averaged so the long
side is at most ${MAX_SIDE} px and re-encoded under ${MAX_BYTES / 1000} KB. Nothing
is cropped here: framing is the portrait pipeline's job, so the fixtures show what
an upload actually looks like.

Ten are colour, because profile photos on X are colour; two are historical black
and white plates, kept to prove the pipeline does not crush a monochrome face.
No children and no private individuals.

Retrieved ${RETRIEVED}. Regenerate with \`pnpm --filter @sf-fight-club/portrait fetch-samples\`.

| File | Subject | Why it is here | Size | Source | Author | License |
| --- | --- | --- | --- | --- | --- | --- |
${rows.join("\n")}

## Licences

Public domain only: PD-USGov (works of the US federal government, including NASA
and the Federal Reserve) and PD-old-100 (published before 1931). No CC-BY, so the
fixtures carry no attribution obligation into the app.
`;
}

async function main(): Promise<void> {
  await mkdir(SAMPLES_DIR, { recursive: true });
  const rows: string[] = [];
  for (const [index, source] of SOURCES.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, REQUEST_GAP_MS));
    rows.push(await fetchOne(source));
    process.stdout.write(`${source.slug}\n`);
  }
  await writeFile(join(SAMPLES_DIR, "SOURCES.md"), sourcesMarkdown(rows));
}

await main();
