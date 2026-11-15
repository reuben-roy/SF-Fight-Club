import { expect, test } from "@playwright/test";

/**
 * Full-tournament walkthrough on the committed demo bundle.
 *
 * Covers: home progress, opening betting, wallet accounting, the post-bell
 * bet lock, playing every match to completion, the champion being crowned
 * CEO, film sealing (sealed before completion, report after), and reload
 * persistence mid-tournament.
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

test("full tournament: bets, bells, champion, film, reload", async ({ page }) => {
  await page.goto("/?reset=1");
  await expect(page.getByRole("heading", { name: "SF FIGHT CLUB" })).toBeVisible();
  await expect(page.getByText("Wallet: S$1000")).toBeVisible();
  await expect(page.getByText("Tournament: 0 of 7 fights complete")).toBeVisible();

  // Film of an unplayed match is sealed.
  await page.goto("/film/demo-r2s0");
  await expect(page.getByText("Sealed until this fight completes.")).toBeVisible();

  // Tower shows no winner before any match is played.
  await page.goto("/tower");
  await expect(page.getByText("Champion: TBD")).toBeVisible();
  await expect(page.getByText("CEO headcount")).toHaveCount(0);

  // Open betting on the first opener and place a bet on PermitPilot.
  await page.goto("/match/demo-r0s0");
  await expect(page.getByText("Status: betting_open")).toBeVisible();
  const sideA = page.getByRole("radio", { name: /PermitPilot/ });
  await sideA.check();
  await page.getByRole("button", { name: "S$100", exact: true }).click();
  await expect(page.getByText("wallet S$900")).toBeVisible();

  // Ring the bell: betting locks.
  await page.getByRole("button", { name: "Ring the bell" }).click();
  await expect(page.getByText("Status: locked")).toBeVisible();
  await expect(page.getByText("Betting is closed for this match.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Place S\$/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Open betting" })).toHaveCount(0);
  // Ring it again: the fight goes live.
  await page.getByRole("button", { name: "Ring the bell" }).click();

  // Play through the script to the result.
  await page.getByRole("button", { name: "Skip to result" }).click();
  await expect(page.getByRole("heading", { name: "PermitPilot wins" })).toBeVisible();
  // Winner-backed bet pays out: the wallet moves off the post-stake 900.
  await expect(page.getByText("wallet S$900")).toHaveCount(0);

  // Semis and final are not available before their feeders complete.
  await page.goto("/match/demo-r2s0");
  await expect(page.getByText("This fight is not on the card until its feeders complete.")).toBeVisible();

  // Finish the remaining matches (open, skip, no bets for speed).
  for (const id of MATCH_IDS.slice(1)) {
    await page.goto(`/match/${id}`);
    // Wait for the pre-fight view to render before probing for buttons.
    await page.getByText(/Status: (scheduled|betting_open)/).waitFor();
    const openBtn = page.getByRole("button", { name: "Open betting" });
    if (await openBtn.count()) await openBtn.click();
    await page.getByRole("button", { name: "Ring the bell (lock bets)" }).click();
    await page.getByRole("button", { name: "Ring the bell (start the fight)" }).click();
    await page.getByRole("button", { name: "Skip to result" }).click();
  }

  // Champion crowned on tower and home.
  await page.goto("/tower");
  await expect(page.getByText("Champion: PermitPilot")).toBeVisible();
  await expect(page.getByText("CEO headcount 8 alive")).toBeVisible();
  await page.goto("/");
  await expect(page.getByText("Tournament: 7 of 7 fights complete")).toBeVisible();
  await expect(page.getByText("Champion: PermitPilot")).toBeVisible();

  // Film unlocked after completion.
  await page.goto("/film/demo-r2s0");
  await expect(page.getByText("SEALED")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /PermitPilot v CurbBot/ })).toBeVisible();

  // Reload keeps tournament state.
  await page.reload();
  await expect(page.getByRole("heading", { name: /PermitPilot v CurbBot/ })).toBeVisible();
  await page.goto("/");
  await expect(page.getByText("Tournament: 7 of 7 fights complete")).toBeVisible();
});
