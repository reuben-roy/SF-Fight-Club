import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, type Page } from "@playwright/test";
import sharp from "sharp";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = path.join(root, "screenshots", "arena");
const previewUrl = "http://127.0.0.1:4173";
const devUrl = process.env.ARENA_BASE_URL;
const baseUrl = devUrl ?? previewUrl;
const MAX_BYTES = 400 * 1024;

interface Shot {
  name: string;
  query: string;
  waitMs: number;
  width?: number;
  height?: number;
  scrollToArena?: boolean;
}

const SHOTS: readonly Shot[] = [
  { name: "01-tale-of-the-tape", query: "match=demo-r0s0&t=1400&paused=1", waitMs: 2400 },
  { name: "02-turn-menu", query: "match=demo-r0s0&turn=1&at=menu&paused=1", waitMs: 1800 },
  { name: "03-callout", query: "match=demo-r0s0&turn=1&at=callout&paused=1", waitMs: 2600 },
  { name: "04-crit-impact", query: "match=demo-r0s1&turn=1&at=impact&paused=1", waitMs: 2200 },
  { name: "05-parry", query: "match=demo-r0s1&turn=2&at=impact&paused=1", waitMs: 2600 },
  { name: "06-backfire", query: "match=demo-r0s0&turn=14&at=impact&paused=1", waitMs: 2400 },
  { name: "07-round-scorecard", query: "match=demo-r0s0&t=26200&paused=1", waitMs: 2400 },
  { name: "08-ko", query: "match=demo-r0s0&t=83800&paused=1", waitMs: 1800 },
  { name: "09-sudden-death", query: "match=demo-r2s0&t=111000&paused=1", waitMs: 2400 },
  { name: "10-acquisition", query: "match=demo-r2s0&t=117000&paused=1", waitMs: 3000 },
  {
    name: "11-narrow",
    query: "match=demo-r0s0&turn=14&at=impact&paused=1",
    waitMs: 2400,
    width: 390,
    height: 844,
    scrollToArena: true,
  },
];

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
      // Still starting.
    }
    await wait(300);
  }
  throw new Error(`Preview server did not answer at ${url}`);
}

async function optimize(file: string, name: string): Promise<void> {
  let colours = 160;
  let width: number | undefined;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    let pipeline = sharp(file).png({ palette: true, colours, compressionLevel: 9, effort: 10 });
    if (width !== undefined) pipeline = pipeline.resize({ width, withoutEnlargement: true });
    const buffer = await pipeline.toBuffer();
    if (buffer.length <= MAX_BYTES) {
      await writeFile(file, buffer);
      console.log(`${name}: ${(buffer.length / 1024).toFixed(0)} KB`);
      return;
    }
    colours = Math.max(48, Math.round(colours / 2));
    width = width === undefined ? 1200 : Math.round(width * 0.8);
  }
  throw new Error(`${name} could not be compressed under 400 KB`);
}

async function shoot(page: Page, shot: Shot): Promise<void> {
  await page.goto(`${baseUrl}/dev/arena?${shot.query}`, { waitUntil: "load" });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.locator(".arena-stage canvas").waitFor();
  if (shot.scrollToArena) {
    await page.evaluate(() => {
      const hud = document.querySelector(".arena-hud");
      const bar = document.querySelector(".sfc-topbar");
      if (!hud) return;
      const offset = bar ? bar.getBoundingClientRect().height + 6 : 6;
      window.scrollTo({ top: window.scrollY + hud.getBoundingClientRect().top - offset });
    });
  }
  await wait(shot.waitMs);
  const file = path.join(outDir, `${shot.name}.png`);
  await page.screenshot({ path: file });
  await optimize(file, shot.name);
}

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const server = devUrl
    ? null
    : spawn("pnpm", ["exec", "vite", "preview", "--port", "4173", "--strictPort"], {
        cwd: root,
        stdio: ["ignore", "pipe", "pipe"],
      });
  let serverLog = "";
  server?.stdout.on("data", (chunk: Buffer) => {
    serverLog += chunk.toString();
  });
  server?.stderr.on("data", (chunk: Buffer) => {
    serverLog += chunk.toString();
  });

  const browser = await chromium.launch();
  try {
    await waitForServer(baseUrl);
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    for (const shot of SHOTS) {
      if (shot.width !== undefined && shot.height !== undefined) {
        await page.setViewportSize({ width: shot.width, height: shot.height });
      } else {
        await page.setViewportSize({ width: 1280, height: 720 });
      }
      await shoot(page, shot);
    }
    await context.close();
  } finally {
    await browser.close();
    server?.kill("SIGTERM");
    await wait(400);
    if (server && server.exitCode === null) server.kill("SIGKILL");
    if (server && server.exitCode !== null && server.exitCode !== 0 && serverLog.trim().length > 0) {
      console.error(serverLog);
    }
  }
}

await main();
