import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, type Page } from "@playwright/test";
import sharp from "sharp";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = path.join(root, "screenshots", "tower");
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
  let colours = 160;
  let width: number | undefined;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    let pipeline = sharp(file).png({ palette: true, colours, compressionLevel: 9, effort: 10 });
    if (width !== undefined) pipeline = pipeline.resize({ width, withoutEnlargement: true });
    const buffer = await pipeline.toBuffer();
    if (buffer.length <= MAX_BYTES) {
      await writeFile(file, buffer);
      process.stdout.write(`${name}: ${(buffer.length / 1024).toFixed(0)} KB\n`);
      return;
    }
    colours = Math.max(48, Math.round(colours / 2));
    width = width === undefined ? 1400 : Math.round(width * 0.8);
  }
  throw new Error(`${name} could not be compressed under 400 KB`);
}

async function shoot(page: Page, name: string, options: { fullPage?: boolean; animations?: "disabled" | "allow" } = {}): Promise<void> {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({
    path: file,
    fullPage: options.fullPage ?? false,
    animations: options.animations ?? "disabled",
  });
  await optimize(file, name);
}

async function open(page: Page, route: string, selector: string): Promise<void> {
  await page.goto(`${baseUrl}${route}`, { waitUntil: "load" });
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.locator(selector).first().waitFor();
  await wait(2800);
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
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    const page = await context.newPage();

    const wideContext = await browser.newContext({ viewport: { width: 2240, height: 1100 }, deviceScaleFactor: 1 });
    const widePage = await wideContext.newPage();
    await open(widePage, "/dev/tower?size=8&step=0", "[data-testid='tower']");
    await shoot(widePage, "tower-step-0", { fullPage: false });
    await wideContext.close();

    for (const step of [4, 6, 7]) {
      await open(page, `/dev/tower?size=8&step=${step}`, "[data-testid='tower']");
      await shoot(page, `tower-step-${step}`, { fullPage: true });
    }

    await open(page, "/dev/tower?size=8&step=6", "[data-testid='tower']");
    await page.getByTestId("play-next").click();
    await wait(800);
    await page.locator("[data-testid='tower-stage']").screenshot({
      path: path.join(outDir, "tower-acquisition.png"),
      animations: "allow",
    });
    await optimize(path.join(outDir, "tower-acquisition.png"), "tower-acquisition");
    await wait(2000);

    await open(page, "/dev/tower?size=8&step=7", "[data-testid='tower']");
    await page.getByRole("button", { name: "Bracket view" }).click();
    await wait(500);
    await shoot(page, "tower-bracket", { fullPage: true });

    await context.close();

    const wide = await browser.newContext({ viewport: { width: 2800, height: 1200 }, deviceScaleFactor: 1 });
    const big = await wide.newPage();
    await open(big, "/dev/tower?size=32&step=24", "[data-testid='tower']");
    await shoot(big, "tower-32", { fullPage: false });
    await wide.close();

    const narrow = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    const phone = await narrow.newPage();
    await open(phone, "/dev/tower?size=8&step=4", "[data-testid='tower']");
    await shoot(phone, "tower-390", { fullPage: true });
    await narrow.close();

    const small = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const laptop = await small.newPage();
    await open(laptop, "/dev/tower?size=8&step=4", "[data-testid='tower']");
    await shoot(laptop, "tower-1280", { fullPage: false });
    await small.close();

    const cards = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    const cardsPage = await cards.newPage();
    await open(cardsPage, "/dev/cards", "[data-testid='cards-dev']");
    await shoot(cardsPage, "cards", { fullPage: true });
    await cards.close();
  } finally {
    await browser.close();
    server.kill("SIGTERM");
    await wait(400);
    if (server.exitCode === null) server.kill("SIGKILL");
    if (server.exitCode !== null && server.exitCode !== 0 && serverLog.trim().length > 0) {
      process.stderr.write(serverLog);
    }
  }
}

await main();
