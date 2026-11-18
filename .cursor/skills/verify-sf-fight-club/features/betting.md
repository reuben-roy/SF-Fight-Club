# Betting and wallet

The match page's betting panel lets the user pick a side and a Hybrid stake
with play money. The wallet starts at S$1000, drops on placement, locks at
the bell, and pays out after a win. All money is play money; there is no
deposit or cash-out anywhere.

## Sub-features

- `bet-place` picks a side and stake, reducing the wallet.
- `bet-lock` disables betting once the bell rings.
- `bet-payout` credits winnings after a backed fighter wins.
- `bet-sealed-odds` keeps judges blind: no seeds, odds, or submitter names leak.

## How to get to it (user POV)

- Open `/match/<matchId>` while betting is open (available fights show
  `Status: Betting open` on arrival).

## Driving it with Playwright

Preconditions:

- App is healthy at `$BASE_URL` (`verify-doctor.sh` passes).
- Fresh state: `page.goto("$BASE_URL/?reset=1")`, then
  `page.goto("$BASE_URL/match/demo-r0s0")` with `Status: Betting open` visible.

- **Place a bet.** Choose PermitPilot and stake S$100. Run
  `page.getByRole("radio", { name: /PermitPilot/ }).check()` then
  `page.getByRole("button", { name: "S$100", exact: true }).click()`. Text
  `wallet S$900` is visible (wallet was S$1000).
- **Lock.** Ring the bell: run
  `page.getByRole("button", { name: "Ring the bell" }).click()`. Text
  `Status: Bets locked` and text `Betting is closed for this match.` are
  visible, every `Place S$` button is disabled, and the `Open betting` button
  count is 0.
- **Payout.** Ring the bell again to go live, then play or skip to the result
  (see `match.md`): PermitPilot wins. Text `wallet S$900` is gone — the
  wallet moved off the post-stake value with the payout.
- **Proof.** Capture the locked state. Run
  `await page.locator("body").ariaSnapshot()` writing to
  `proof/<run-id>-betting/betting.aria.txt` and
  `await page.screenshot({ path: "proof/<run-id>-betting/betting.png" })`.
  Both artifacts show the locked status and the wallet line; `run.txt` notes
  the pre/post wallet values.

## Gotchas

- `Wallet: S$1000` (home, capital W) and `wallet S$900` (match, lowercase)
  are different strings; assert the exact one for the page you are on.
- After the lock, assert the disabled `Place S$` buttons, not just the
  status text — the status alone does not prove betting closed.
- Payout direction depends on the backed side winning; the e2e recipe backs
  PermitPilot in `demo-r0s0` because PermitPilot wins that fight. Backing the
  loser and expecting a payout invalidates the run.
- Bets lock before compute (repo invariant): no match computes while its
  bets are open. If a result appears with betting still open, report it as a
  defect, not a passing run.
