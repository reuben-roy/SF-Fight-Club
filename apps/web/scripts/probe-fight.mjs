import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitForServer(url) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try { const res = await fetch(url); if (res.ok) return; } catch {}
    await wait(300);
  }
  throw new Error("no server");
}
const server = spawn("pnpm", ["exec", "vite", "preview", "--port", "4175", "--strictPort"], { stdio: "ignore" });
const browser = await chromium.launch();
try {
  await waitForServer("http://127.0.0.1:4175");
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  page.on("close", () => console.log("PAGE CLOSE EVENT"));
  page.on("crash", () => console.log("PAGE CRASH EVENT"));
  page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE ERROR:", m.text().slice(0, 300)); });
  page.on("pageerror", (e) => console.log("PAGEERROR:", String(e).slice(0, 300)));
  await page.goto("http://127.0.0.1:4175/match/demo-r0s0?reset=1", { waitUntil: "load" });
  await page.getByRole("button", { name: "Ring the bell (lock bets)" }).click();
  await page.getByRole("button", { name: "Ring the bell (start the fight)" }).click();
  await page.locator(".arena").waitFor({ timeout: 30000 });
  console.log("arena live, waiting for result...");
  await page.getByRole("heading", { name: /PermitPilot wins/ }).waitFor({ timeout: 180000 });
  console.log("RESULT OK, url=", page.url());
  await ctx.close();
} finally {
  await browser.close();
  server.kill("SIGTERM");
}
