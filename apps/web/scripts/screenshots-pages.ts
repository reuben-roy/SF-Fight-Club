/**
 * Page screenshots for the web-pages review. Runs against a local preview of
 * the production build, drives the real store through a full tournament, and
 * writes compressed PNGs under screenshots/pages/.
 */

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { chromium, type Page } from "@playwright/test";
import sharp from "sharp";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = path.join(root, "screenshots", "pages");
const baseUrl = "http://127.0.0.1:4174";
const MAX_BYTES = 400 * 1024;
const MATCH_IDS = [
  "demo-r0s1",
  "demo-r0s2",
  "demo-r0s3",
  "demo-r1s0",
  "demo-r1s1",
  "demo-r2s0",
] as const;

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

async function shoot(page: Page, name: string, allowAnimations = false): Promise<void> {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, animations: allowAnimations ? "allow" : "disabled" });
  await optimize(file, name);
}

async function top(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await wait(200);
}

async function ringAndSkip(page: Page, matchId: string): Promise<void> {
  await page.goto(`${baseUrl}/match/${matchId}`, { waitUntil: "load" });
  const lock = page.getByRole("button", { name: "Ring the bell (lock bets)" });
  await lock.waitFor();
  await lock.click();
  await page.getByRole("button", { name: "Ring the bell (start the fight)" }).click();
  await page.getByRole("button", { name: "Skip to result" }).click();
  await page.getByRole("heading", { name: /wins/ }).waitFor();
}

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const server = spawn("pnpm", ["exec", "vite", "preview", "--port", "4174", "--strictPort"], {
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
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await context.newPage();

    await page.goto(`${baseUrl}/?reset=1`, { waitUntil: "load" });
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await wait(700);
    await top(page);
    await shoot(page, "home-1280");

    await page.setViewportSize({ width: 390, height: 844 });
    await wait(500);
    await top(page);
    await shoot(page, "home-390");

    // Pre-fight with a bet placed, at both widths.
    await page.goto(`${baseUrl}/match/demo-r0s0`, { waitUntil: "load" });
    await page.getByRole("radio", { name: /PermitPilot/ }).check();
    await page.getByRole("button", { name: "S$100", exact: true }).click();
    await wait(500);
    await top(page);
    await shoot(page, "prefight-390");

    await page.setViewportSize({ width: 1280, height: 720 });
    await wait(600);
    await top(page);
    await shoot(page, "prefight-1280");

    // K.O. result.
    await page.getByRole("button", { name: "Ring the bell (lock bets)" }).click();
    await page.getByRole("button", { name: "Ring the bell (start the fight)" }).click();
    await page.getByRole("button", { name: "Skip to result" }).click();
    await page.getByRole("heading", { name: /PermitPilot wins/ }).waitFor();
    await wait(450);
    await top(page);
    await shoot(page, "result-ko-1280", true);

    // Film room: verdict header, then the scorecard.
    await page.goto(`${baseUrl}/film/demo-r0s0`, { waitUntil: "load" });
    await page.locator(".sfc-film__title").waitFor();
    await wait(400);
    await top(page);
    await shoot(page, "film-top-1280");
    await page.locator("[data-scorecard]").scrollIntoViewIfNeeded();
    await wait(300);
    await shoot(page, "film-scorecard-1280");
    await page.evaluate(() => {
      document.querySelector("[data-timeline]")?.scrollIntoView({ block: "start" });
    });
    await wait(300);
    await shoot(page, "film-timeline-1280");

    // Finish the tournament.
    for (const id of MATCH_IDS) {
      await ringAndSkip(page, id);
    }

    await page.goto(`${baseUrl}/match/demo-r2s0`, { waitUntil: "load" });
    await page.getByRole("heading", { name: /PermitPilot wins/ }).waitFor();
    await wait(450);
    await top(page);
    await shoot(page, "result-sudden-death-1280", true);

    await page.goto(`${baseUrl}/tower`, { waitUntil: "load" });
    await page.getByText("Champion: PermitPilot").waitFor();
    await wait(450);
    await top(page);
    await shoot(page, "champion-1280", true);

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
