import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { chromium, type Locator, type Page } from "@playwright/test";
import sharp from "sharp";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = path.join(root, "screenshots", "art");
const baseUrl = "http://127.0.0.1:4173";
const MAX_BYTES = 400 * 1024;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The preview server is still starting.
    }
    await wait(300);
  }
  throw new Error(`Preview server did not answer at ${url}`);
}

async function optimize(file: string, name: string): Promise<void> {
  let quality = 160;
  let width: number | undefined;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    let pipeline = sharp(file).png({ palette: true, colours: quality, compressionLevel: 9, effort: 10 });
    if (width !== undefined) pipeline = pipeline.resize({ width, withoutEnlargement: true });
    const buffer = await pipeline.toBuffer();
    if (buffer.length <= MAX_BYTES) {
      await writeFile(file, buffer);
      console.log(`${name}: ${(buffer.length / 1024).toFixed(0)} KB`);
      return;
    }
    quality = Math.max(48, Math.round(quality / 2));
    width = width === undefined ? 1200 : Math.round(width * 0.8);
  }
  throw new Error(`${name} could not be compressed under 400 KB`);
}

async function shootPage(page: Page, name: string): Promise<void> {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true, animations: "disabled" });
  await optimize(file, name);
}

async function shootElement(locator: Locator, name: string): Promise<void> {
  const file = path.join(outDir, `${name}.png`);
  await locator.screenshot({ path: file, animations: "disabled" });
  await optimize(file, name);
}

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const server = spawn("pnpm", ["exec", "vite", "preview", "--port", "4173", "--strictPort"], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverLog = "";
  server.stdout.on("data", (chunk: Buffer) => {
    serverLog += chunk.toString();
  });
  server.stderr.on("data", (chunk: Buffer) => {
    serverLog += chunk.toString();
  });

  const browser = await chromium.launch();
  try {
    await waitForServer(baseUrl);
    const context = await browser.newContext({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/dev/art`, { waitUntil: "load" });
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await page.getByTestId("art-gallery").waitFor();
    await wait(900);

    await shootPage(page, "gallery");

    await page.getByTestId("silhouette-toggle").click();
    await wait(500);
    await shootPage(page, "silhouette");
    await page.getByTestId("silhouette-toggle").click();
    await wait(300);

    const stage = page.getByTestId("stage-frame");
    for (const time of ["sunset", "dusk", "night"] as const) {
      await page.getByTestId(`tod-${time}`).click();
      await wait(450);
      await shootElement(stage, `stage-${time}`);
    }

    await page.getByTestId("tod-sunset").click();
    await wait(300);
    const flights = [
      { id: "flame", waitMs: 210 },
      { id: "ballista", waitMs: 500 },
      { id: "rocket", waitMs: 420 },
      { id: "orbital", waitMs: 560 },
      { id: "laser", waitMs: 70 },
    ] as const;
    for (const flight of flights) {
      await page.getByTestId(`weapon-${flight.id}`).click();
      await wait(flight.waitMs);
      await shootElement(stage, `weapon-${flight.id}`);
      await wait(1200);
    }

    await page.getByTestId("stage-reset").click();
    await page.getByTestId("tod-night").click();
    await page.getByTestId("fog-toggle").click();
    await page.getByTestId("spotlight-toggle").click();
    await wait(500);
    await shootElement(stage, "stage-sudden-death");
    await page.getByTestId("fog-toggle").click();
    await page.getByTestId("spotlight-toggle").click();
    await wait(350);
    await page.getByTestId("effect-parry").click();
    await wait(220);
    await shootElement(stage, "effect-parry");
    await wait(900);
    await page.getByTestId("effect-ko").click();
    await wait(240);
    await shootElement(stage, "effect-ko");

    await page.getByTestId("state-class-gale").click();
    await page.getByTestId("state-victory").click();
    await wait(300);
    await page.locator("#states").scrollIntoViewIfNeeded();
    await wait(200);
    await page.locator("#states").screenshot({ path: path.join(outDir, "states.png"), animations: "disabled" });
    await optimize(path.join(outDir, "states.png"), "states");

    await context.close();
  } finally {
    await browser.close();
    server.kill("SIGTERM");
    await wait(400);
    if (server.exitCode === null) server.kill("SIGKILL");
    if (server.exitCode !== null && server.exitCode !== 0 && serverLog.trim().length > 0) {
      console.error(serverLog);
    }
  }
}

await main();
