import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { decodeImage, pixelatePortrait } from "../src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const samplesDir = path.join(here, "..", "fixtures", "samples");
const goldenDir = path.join(here, "..", "fixtures", "golden");

await mkdir(goldenDir, { recursive: true });

const files = (await readdir(samplesDir))
  .filter((name) => /\.(jpe?g|png)$/i.test(name))
  .sort();

for (const file of files) {
  const bytes = new Uint8Array(await readFile(path.join(samplesDir, file)));
  const decoded = decodeImage(bytes);
  if (decoded.kind !== "ok") throw new Error(`${file}: ${decoded.reason}`);
  const result = pixelatePortrait({
    rgba: decoded.image.rgba,
    width: decoded.image.width,
    height: decoded.image.height,
  });
  if (result.kind !== "ok") throw new Error(`${file}: ${result.reason}`);
  const slug = file.replace(/\.[^.]+$/, "");
  await writeFile(
    path.join(goldenDir, `${slug}.json`),
    `${JSON.stringify(result.portrait, null, 2)}\n`,
  );
  console.log(`${slug}: ${result.portrait.palette.length} colors`);
}
