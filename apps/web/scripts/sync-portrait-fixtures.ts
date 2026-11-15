import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { decodeImage, portraitReference, portraitTraits } from "@sf-fight-club/portrait";
import { pixelPortraitSchema } from "@sf-fight-club/schemas";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..");
const portraitRoot = path.resolve(here, "..", "..", "..", "packages", "portrait");
const goldenDir = path.join(portraitRoot, "fixtures", "golden");
const samplesDir = path.join(portraitRoot, "fixtures", "samples");
const outFile = path.join(webRoot, "src", "art", "fixtures", "sample-portraits.ts");

interface SamplePortrait {
  slug: string;
  portrait: { size: 32; palette: string[]; pixels: number[] };
  traits: { skin: string; skinShadow: string; hair: string; accent: string };
}

/**
 * Copies the committed golden portraits into a web fixture with their trait
 * colors. Build-time only: the browser draws finished portrait data and never
 * imports the portrait package. Re-run after the golden fixtures change.
 */
async function main(): Promise<void> {
  const slugs = (await readdir(goldenDir))
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -".json".length))
    .sort();
  const samples: SamplePortrait[] = [];
  for (const slug of slugs) {
    const raw: unknown = JSON.parse(await readFile(path.join(goldenDir, `${slug}.json`), "utf8"));
    const portrait = pixelPortraitSchema.parse(raw);
    let sample: Uint8Array | null = null;
    for (const ext of ["jpg", "png"]) {
      try {
        sample = new Uint8Array(await readFile(path.join(samplesDir, `${slug}.${ext}`)));
        break;
      } catch {
        sample = null;
      }
    }
    if (sample === null) throw new Error(`no sample image for ${slug}`);
    const decoded = decodeImage(sample);
    if (decoded.kind !== "ok") throw new Error(`${slug}: ${decoded.reason}`);
    const reference = portraitReference(decoded.image);
    if (reference === null) throw new Error(`${slug}: no reference`);
    samples.push({ slug, portrait, traits: portraitTraits(reference) });
  }
  const body = [
    `import type { PixelPortrait } from "@sf-fight-club/schemas";`,
    ``,
    `export interface SamplePortraitTraits {`,
    `  skin: string;`,
    `  skinShadow: string;`,
    `  hair: string;`,
    `  accent: string;`,
    `}`,
    ``,
    `export interface SamplePortrait {`,
    `  slug: string;`,
    `  portrait: PixelPortrait;`,
    `  traits: SamplePortraitTraits;`,
    `}`,
    ``,
    `/**`,
    ` * Committed golden portraits plus their trait colors, copied from`,
    ` * packages/portrait/fixtures/golden by scripts/sync-portrait-fixtures.ts.`,
    ` * Public-domain sample photos used to test the pipeline; not entrants.`,
    ` */`,
    `export const SAMPLE_PORTRAITS: readonly SamplePortrait[] = ${JSON.stringify(samples, null, 2)};`,
    ``,
  ].join("\n");
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, body);
  console.log(`wrote ${samples.length} sample portraits to ${path.relative(webRoot, outFile)}`);
}

await main();
