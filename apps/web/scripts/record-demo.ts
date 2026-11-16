/**
 * Demo video for the SF Fight Club web app. Drives the real store through a
 * full tournament in a real (headless) Chromium window at 1280x720, records
 * the run to WebM, and prints the duration. Convert to MP4 afterwards, e.g.:
 *
 *   ffmpeg -i recordings/demo.webm -c:v libx264 -pix_fmt yuv420p -r 30 \
 *     -crf 20 -movflags +faststart recordings/sf-fight-club-demo.mp4
 *
 * Run with: pnpm --filter @sf-fight-club/web demo:video
 * (Builds the production bundle first, like the screenshots:* scripts.)
 *
 * The mouse is driven through real input events and a cursor overlay with
 * click rings is injected, so the recording shows a visible cursor.
 */

import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { chromium, type Locator, type Page } from "@playwright/test";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = path.join(root, "recordings");
const baseUrl = "http://127.0.0.1:4175";

const CURSOR_SCRIPT = `
(() => {
  if (window.__demoCursor) return;
  window.__demoCursor = true;
  const cursor = document.createElement("div");
  cursor.id = "demo-cursor";
  cursor.setAttribute("aria-hidden", "true");
  cursor.innerHTML =
    '<svg width="40" height="40" viewBox="0 0 24 24">' +
    '<path d="M4.5 2.5 20 12l-7.6 1.5-2.6 7.6z" fill="#FA500F" stroke="#151524" stroke-width="2" stroke-linejoin="round"/>' +
    '<path d="M4.5 2.5 20 12l-7.6 1.5-2.6 7.6z" fill="none" stroke="#FAFAF4" stroke-width="0.7" stroke-linejoin="round"/>' +
    "</svg>";
  cursor.style.cssText =
    "position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;" +
    "transform:translate(640px,360px);will-change:transform;";
  // The init script runs before <html> exists, so attach lazily and re-attach if the app replaces the tree.
  const attach = () => {
    if (document.documentElement && !cursor.isConnected) document.documentElement.appendChild(cursor);
  };
  attach();
  document.addEventListener("DOMContentLoaded", attach);
  window.addEventListener("load", attach);
  window.addEventListener(
    "pointermove",
    (event) => {
      attach();
      cursor.style.transform = "translate(" + (event.clientX - 6) + "px," + (event.clientY - 4) + "px)";
    },
    { passive: true, capture: true },
  );
  window.addEventListener(
    "pointerdown",
    (event) => {
      attach();
      const ring = document.createElement("div");
      ring.setAttribute("aria-hidden", "true");
      ring.style.cssText =
        "position:fixed;left:" + event.clientX + "px;top:" + event.clientY + "px;" +
        "width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;box-sizing:border-box;" +
        "border:4px solid #FA500F;outline:2px solid #151524;z-index:2147483646;pointer-events:none;";
      document.documentElement.appendChild(ring);
      ring.animate(
        [
          { transform: "scale(1)", opacity: 1 },
          { transform: "scale(4.5)", opacity: 0 },
        ],
        { duration: 700, easing: "cubic-bezier(.2,.7,.3,1)" },
      ).onfinish = () => ring.remove();
    },
    { passive: true, capture: true },
  );
})();
`;

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

/** Last known cursor position, so glides start where the pointer really is. */
let pointer = { x: 640, y: 360 };

/** Glide the pointer to (x, y) like a human hand, ~0.5s. */
async function glide(page: Page, x: number, y: number, ms = 500): Promise<void> {
  const steps = Math.max(10, Math.round(ms / 40));
  const from = { ...pointer };
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    // Ease in-out so the motion starts and lands softly.
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e);
    await wait(ms / steps);
  }
  pointer = { x, y };
}

/** Move to a locator's center, pause, and click — ring shows in the video. */
async function clickOn(page: Page, locator: Locator): Promise<void> {
  await locator.scrollIntoViewIfNeeded();
  await wait(350);
  const box = await locator.boundingBox();
  if (!box) throw new Error("clickOn: element has no bounding box");
  await glide(page, box.x + box.width / 2, box.y + box.height / 2);
  await wait(320);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await wait(350);
}

/** Slow wheel scroll that reads as a human browsing the page. */
async function browse(page: Page, ticks: number, dy = 320): Promise<void> {
  for (let i = 0; i < ticks; i += 1) {
    await page.mouse.wheel(0, dy);
    await wait(900);
  }
}

async function lockAndStart(page: Page): Promise<void> {
  await clickOn(page, page.getByRole("button", { name: "Ring the bell (lock bets)" }));
  await wait(1200);
  await clickOn(page, page.getByRole("button", { name: "Ring the bell (start the fight)" }));
}

async function skipToResult(page: Page, winner: RegExp): Promise<void> {
  await clickOn(page, page.getByRole("button", { name: "Skip to result" }));
  await page.getByRole("heading", { name: winner }).waitFor({ timeout: 30_000 });
  await wait(1200);
}

async function main(): Promise<void> {
  await mkdir(outDir, { recursive: true });
  const server = spawn("pnpm", ["exec", "vite", "preview", "--port", "4175", "--strictPort"], {
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

  const startedAt = Date.now();
  const mark = (label: string): void => {
    console.log(`[${((Date.now() - startedAt) / 1000).toFixed(0)}s] ${label}`);
  };

  const browser = await chromium.launch();
  try {
    await waitForServer(baseUrl);
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
      recordVideo: { dir: outDir, size: { width: 1280, height: 720 } },
    });
    await context.addInitScript({ content: CURSOR_SCRIPT });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/?reset=1`, { waitUntil: "load" });
    await page.evaluate(async () => {
      await document.fonts.ready;
    });

    const airedAtLeast = async (count: number, timeout = 120_000): Promise<void> => {
      await page.waitForFunction(
        (n) => document.querySelectorAll(".arena-receipt").length >= n,
        count,
        { timeout },
      );
    };
    const speed = (label: "1x" | "2x" | "4x"): Locator => page.getByRole("button", { name: label, exact: true });
    const versus = (left: string, right: string): Locator =>
      page.getByRole("button", { name: new RegExp(`${left} versus ${right}`) }).first();
    const backToTower = async (): Promise<void> => {
      await clickOn(page, page.getByRole("link", { name: "Back to the Tower" }).first());
      await page.locator(".tower__title").waitFor();
    };
    const hover = async (locator: Locator): Promise<void> => {
      const box = await locator.boundingBox();
      if (box) await glide(page, box.x + box.width / 2, box.y + box.height / 2);
      await wait(900);
    };

    // 1. Home: the hero, the house rules, the field, one fighter card.
    mark("home");
    await glide(page, 520, 300);
    await wait(3000);
    await browse(page, 3);
    await clickOn(page, page.locator(".sfc-fieldcard").nth(5));
    await wait(3500);
    await clickOn(page, page.getByRole("button", { name: "Close card" }));
    await wait(600);
    await browse(page, 4, -400);
    await clickOn(page, page.getByRole("link", { name: "Enter the Tower" }));
    await page.locator(".tower__title").waitFor();

    // 2. The Tower before any fight.
    mark("tower, before any fight");
    await wait(2500);
    await hover(page.locator("[data-tile='curbbot']"));
    await hover(page.locator("[data-tile='permitpilot']"));
    await clickOn(page, versus("PermitPilot", "Fogcast"));
    await page.getByRole("radio", { name: /PermitPilot/ }).first().waitFor();

    // 3. Tale of the tape, a bet, the bell.
    mark("opener, pre-fight");
    await wait(3000);
    await clickOn(page, page.getByRole("radio", { name: /PermitPilot/ }).first());
    await wait(800);
    await clickOn(page, page.getByRole("button", { name: "S$100", exact: true }));
    await wait(1500);
    await lockAndStart(page);
    await page.locator(".arena").waitFor({ timeout: 30_000 });

    // 4. The fight: five turns untouched at 1x, then the controls.
    mark("opener, fight at 1x");
    await glide(page, 1180, 620);
    await airedAtLeast(5);
    mark("opener, 2x");
    await clickOn(page, speed("2x"));
    await airedAtLeast(8);
    mark("opener, jump with the turn strip");
    await clickOn(page, page.locator(".arena-pip").nth(11));
    await wait(1800);
    await clickOn(page, page.getByRole("button", { name: "NEXT TURN" }));
    await wait(1800);
    await clickOn(page, page.getByRole("button", { name: "NEXT TURN" }));
    await wait(1800);
    mark("opener, 4x to the end");
    await clickOn(page, speed("4x"));
    await page.getByRole("heading", { name: /PermitPilot wins/ }).waitFor({ timeout: 120_000 });

    // 5. Result, then the film room.
    mark("opener, result");
    await wait(4500);
    await clickOn(page, page.getByRole("link", { name: "Why did they win?" }));
    await page.locator(".sfc-film__title").waitFor();
    mark("film room");
    await wait(3000);
    await browse(page, 7, 380);
    await wait(800);
    await browse(page, 12, -600);
    await clickOn(page, page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Tower" }));
    await page.locator(".tower__title").waitFor();

    // 7. The Tower after one fight.
    mark("tower, one acquisition");
    await wait(4500);

    // 8. The other three openers, quickly, with one more bet.
    const openers: readonly { left: string; right: string; bet: string | null }[] = [
      { left: "TabClear", right: "PaperRoute", bet: null },
      { left: "Dermalens", right: "LoopRoom", bet: "Dermalens" },
      { left: "FlakeHunter", right: "CurbBot", bet: null },
    ];
    for (const opener of openers) {
      mark(`opener, ${opener.left} v ${opener.right}`);
      await clickOn(page, versus(opener.left, opener.right));
      await page.getByRole("button", { name: "Ring the bell (lock bets)" }).waitFor();
      await wait(1200);
      if (opener.bet !== null) {
        await clickOn(page, page.getByRole("radio", { name: new RegExp(opener.bet) }).first());
        await clickOn(page, page.getByRole("button", { name: "S$50", exact: true }));
        await wait(800);
      }
      await lockAndStart(page);
      await page.locator(".arena").waitFor({ timeout: 30_000 });
      await clickOn(page, speed("4x"));
      await airedAtLeast(3);
      await skipToResult(page, /wins/);
      await wait(1200);
      await backToTower();
      await wait(2800);
    }

    // 9. Semi-finals.
    mark("semi, PermitPilot v TabClear");
    await clickOn(page, versus("PermitPilot", "TabClear"));
    await page.getByRole("button", { name: "Ring the bell (lock bets)" }).waitFor();
    await wait(1500);
    await lockAndStart(page);
    await page.locator(".arena").waitFor({ timeout: 30_000 });
    await clickOn(page, speed("4x"));
    await airedAtLeast(6);
    await skipToResult(page, /PermitPilot wins/);
    await wait(1500);
    await backToTower();
    await wait(3000);

    mark("semi, Dermalens v CurbBot");
    await clickOn(page, versus("Dermalens", "CurbBot"));
    await page.getByRole("button", { name: "Ring the bell (lock bets)" }).waitFor();
    await wait(1200);
    await lockAndStart(page);
    await page.locator(".arena").waitFor({ timeout: 30_000 });
    await clickOn(page, speed("4x"));
    await airedAtLeast(3);
    await skipToResult(page, /CurbBot wins/);
    await wait(1500);
    await backToTower();
    await wait(3500);

    // 10. The final: a bet on the underdog, then the ending in full.
    mark("final, pre-fight");
    await clickOn(page, versus("PermitPilot", "CurbBot"));
    await page.getByRole("radio", { name: /CurbBot/ }).first().waitFor();
    await wait(2500);
    await clickOn(page, page.getByRole("radio", { name: /CurbBot/ }).first());
    await clickOn(page, page.getByRole("button", { name: "S$100", exact: true }));
    await wait(1200);
    await lockAndStart(page);
    await page.locator(".arena").waitFor({ timeout: 30_000 });
    mark("final, fight at 2x");
    await clickOn(page, speed("2x"));
    await airedAtLeast(4);
    mark("final, jump to the last three turns");
    const pips = page.locator(".arena-pip");
    await clickOn(page, pips.nth((await pips.count()) - 3));
    await clickOn(page, speed("1x"));
    await glide(page, 1180, 620);
    await page.locator(".arena-death").waitFor({ timeout: 120_000 });
    mark("final, sudden death");
    await page.locator(".arena-winner__acquired").waitFor({ timeout: 120_000 });
    mark("final, acquired");
    await page.getByRole("heading", { name: /PermitPilot wins/ }).waitFor({ timeout: 120_000 });

    // 11. Champion.
    mark("final, result");
    await wait(4500);
    await backToTower();
    await page.getByTestId("tower-champion").waitFor();
    mark("tower, champion");
    await wait(5500);
    await clickOn(page, page.getByRole("button", { name: "Bracket view" }));
    await wait(3500);
    await clickOn(page, page.getByRole("button", { name: "Org chart" }));
    await wait(2500);

    // 12. Portraits. There is no nav link to this dev page, so it loads by URL.
    mark("portraits");
    await page.goto(`${baseUrl}/dev/portraits`, { waitUntil: "load" });
    await wait(2500);
    await browse(page, 6, 380);
    await wait(1500);

    const video = page.video();
    await context.close();
    if (video) await video.saveAs(path.join(outDir, "demo.webm"));
  } finally {
    await browser.close();
    server.kill("SIGTERM");
    await wait(400);
    if (server.exitCode === null) server.kill("SIGKILL");
    if (server.exitCode !== null && server.exitCode !== 0 && serverLog.trim().length > 0) {
      console.error(serverLog);
    }
  }
  mark(`done — total ${((Date.now() - startedAt) / 1000).toFixed(0)}s`);
}

await main();
