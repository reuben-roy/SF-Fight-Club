import { expect, test } from "@playwright/test";

import { DEMO_BUNDLE } from "../src/data/generated/demo.js";

/**
 * Full-tournament walkthrough on the committed demo bundle.
 *
 * Covers: home progress and the five house rules, opening betting, wallet
 * accounting, the post-bell bet lock, playing every match to completion, the
 * champion being crowned CEO, film sealing (sealed before completion, report
 * after), the film scorecard and timeline, and reload persistence.
 */

const MATCH_IDS = [
  "demo-r0s0",
  "demo-r0s1",
  "demo-r0s2",
  "demo-r0s3",
  "demo-r1s0",
  "demo-r1s1",
  "demo-r2s0",
] as const;

const HOUSE_RULES = [
  "Every fighter is the same agent. Only the idea fights.",
  "No source, no damage. Claims without evidence hit softer. Made-up evidence blows up in your own hands.",
  "Every hit has a receipt.",
  "Nobody sees the result before the bell. Bets lock before the match is computed.",
  "The judges never see seeds, odds, names of submitters, or who the crowd likes.",
] as const;

test("full tournament: bets, bells, champion, film, reload", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/?reset=1");
  await expect(page.getByRole("heading", { name: "SF FIGHT CLUB" })).toBeVisible();
  await expect(page.getByText("Wallet: S$1000")).toBeVisible();
  await expect(page.getByText("Tournament: 0 of 7 fights complete")).toBeVisible();
  for (const rule of HOUSE_RULES) {
    await expect(page.getByText(rule)).toBeVisible();
  }

  // Film of an unplayed match is sealed.
  await page.goto("/film/demo-r2s0");
  await expect(page.getByText("Sealed until this fight completes.")).toBeVisible();

  // Tower shows no winner before any match is played.
  await page.goto("/tower");
  await expect(page.getByText("THE ORG CHART")).toBeVisible();
  await expect(page.getByTestId("tower-champion")).toHaveCount(0);

  // Open betting on the first opener and place a bet on PermitPilot.
  await page.goto("/match/demo-r0s0");
  await expect(page.getByText("Status: Betting open")).toBeVisible();
  const sideA = page.getByRole("radio", { name: /PermitPilot/ });
  await sideA.check();
  await page.getByRole("button", { name: "S$100", exact: true }).click();
  await expect(page.getByText("wallet S$900")).toBeVisible();

  // Ring the bell: betting locks.
  await page.getByRole("button", { name: "Ring the bell" }).click();
  await expect(page.getByText("Status: Bets locked")).toBeVisible();
  await expect(page.getByText("Betting is closed for this match.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Place S\$/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Open betting" })).toHaveCount(0);
  // Ring it again: the fight goes live.
  await page.getByRole("button", { name: "Ring the bell" }).click();

  // Play the opener on the real arena to the finish. Receipts start empty.
  await expect(page.locator(".arena")).toBeVisible();
  await expect(page.locator(".arena-receipt")).toHaveCount(0);
  await page.getByRole("button", { name: "4x", exact: true }).click();
  await expect(page.locator(".arena-deck").getByText(/used /).first()).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => page.locator(".arena-receipt").count(), { timeout: 20_000 }).toBeGreaterThan(0);
  const firstReceipts = await page.locator(".arena-receipt").count();
  await expect.poll(async () => page.locator(".arena-receipt").count(), { timeout: 20_000 }).toBeGreaterThan(firstReceipts);
  const firstHp = await page.locator(".arena-plate__hp").allTextContents();
  await expect
    .poll(async () => (await page.locator(".arena-plate__hp").allTextContents()).join("/"), { timeout: 30_000 })
    .not.toBe(firstHp.join("/"));
  await expect(page.getByRole("heading", { name: "PermitPilot wins" })).toBeVisible({ timeout: 90_000 });
  // Winner-backed bet pays out: the wallet moves off the post-stake 900.
  await expect(page.getByText("wallet S$900")).toHaveCount(0);

  // Semis and final are not available before their feeders complete.
  await page.goto("/match/demo-r2s0");
  await expect(page.getByText("This fight is not on the card until its feeders complete.")).toBeVisible();

  // Finish the remaining matches (open, skip, no bets for speed).
  for (const id of MATCH_IDS.slice(1)) {
    await page.goto(`/match/${id}`);
    // Betting opens on arrival for available fights.
    await expect(page.getByText(/Status: (Scheduled|Betting open)/)).toBeVisible();
    const lock = page.getByRole("button", { name: "Ring the bell (lock bets)" });
    await lock.waitFor();
    await lock.click();
    await page.getByRole("button", { name: "Ring the bell (start the fight)" }).click();
    await page.getByRole("button", { name: "Skip to result" }).click();
  }

  // Champion crowned on tower and home.
  await page.goto("/tower");
  await expect(page.getByTestId("tower-champion")).toContainText("PermitPilot");
  await expect(page.getByTestId("tower-champion")).toContainText("CEO / RUNS A COMPANY OF 8");
  await page.goto("/");
  await expect(page.getByText("Tournament: 7 of 7 fights complete")).toBeVisible();
  await expect(page.getByText("Champion: PermitPilot")).toBeVisible();

  // Film unlocked after completion, with the full scorecard and timeline.
  await page.goto("/film/demo-r2s0");
  await expect(page.getByText("SEALED")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /PermitPilot v CurbBot/ })).toBeVisible();
  await expect(page.locator("[data-criterion]")).toHaveCount(9);
  const finalFilm = DEMO_BUNDLE.matches.find((match) => match.matchId === "demo-r2s0")?.film;
  await expect(page.locator("[data-shot]")).toHaveCount(finalFilm?.shots.length ?? 0);

  // Reload keeps tournament state.
  await page.reload();
  await expect(page.getByRole("heading", { name: /PermitPilot v CurbBot/ })).toBeVisible();
  await page.goto("/");
  await expect(page.getByText("Tournament: 7 of 7 fights complete")).toBeVisible();
});

test("final: sudden death tally and the ACQUIRED moment", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/?reset=1");

  for (const id of MATCH_IDS.slice(0, 6)) {
    await page.goto(`/match/${id}`);
    await expect(page.getByText(/Status: (Scheduled|Betting open)/)).toBeVisible();
    await page.getByRole("button", { name: "Ring the bell (lock bets)" }).click();
    await page.getByRole("button", { name: "Ring the bell (start the fight)" }).click();
    await page.getByRole("button", { name: "Skip to result" }).click();
  }

  await page.goto("/match/demo-r2s0");
  await expect(page.getByText("Status: Betting open")).toBeVisible();
  await page.getByRole("button", { name: "Ring the bell (lock bets)" }).click();
  await page.getByRole("button", { name: "Ring the bell (start the fight)" }).click();
  await expect(page.locator(".arena")).toBeVisible();

  await page.getByRole("button", { name: "2x", exact: true }).click();
  const pips = page.locator(".arena-pip");
  await expect(pips.last()).toBeVisible();
  await pips.last().click();

  await expect(page.locator(".arena-death")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".arena-death")).toContainText("SUDDEN DEATH");
  await expect(page.locator(".arena-death__tally")).toBeVisible();
  await expect(page.locator(".arena-winner__acquired")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".arena-winner__acquired")).toContainText("ACQUIRED");
});
