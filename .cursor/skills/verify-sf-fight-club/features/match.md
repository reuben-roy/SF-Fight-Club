# Match arena

A match page (`/match/:matchId`) runs one fight through three phases: betting
open, bets locked, and the live arena. The user rings the bell to advance
phases, watches or skips playback, and lands on a named winner heading.
Unavailable fights (feeders incomplete) show a not-on-card notice instead.

## Sub-features

- `match-gating` blocks fights whose feeders have not completed.
- `match-bell` advances betting open to locked to live via the bell button.
- `match-playback` plays the arena to a winner heading with receipts and HP movement.
- `match-skip` jumps straight to the result.
- `match-speed` changes playback speed (2x, 4x) and sudden-death tally in the final.

## How to get to it (user POV)

- Choose a fight from the home bracket.
- Open `/match/<matchId>` directly (`demo-r0s0`..`demo-r0s3`,
  `demo-r1s0`, `demo-r1s1`, `demo-r2s0`).

## Driving it with Playwright

Preconditions:

- App is healthy at `$BASE_URL` (`verify-doctor.sh` passes).
- Fresh state: `page.goto("$BASE_URL/?reset=1")`, then the match URL.

- **Gating.** Open a fight whose feeders are incomplete. Run
  `page.goto("$BASE_URL/match/demo-r2s0")`. Text
  `This fight is not on the card until its feeders complete.` is visible and
  no bell button is present.
- **Open and lock.** Open an available fight. Run
  `page.goto("$BASE_URL/match/demo-r0s0")`. Text `Status: Betting open` is
  visible. Ring the bell: run
  `page.getByRole("button", { name: "Ring the bell" }).click()`. Text
  `Status: Bets locked` is visible.
- **Go live.** Ring the bell again: run
  `page.getByRole("button", { name: "Ring the bell" }).click()`. The
  `.arena` element is visible and `.arena-receipt` count starts at 0.
- **Playback.** Speed up and watch real damage. Run
  `page.getByRole("button", { name: "4x", exact: true }).click()`. Poll until
  `.arena-receipt` count exceeds 0, then exceeds its first value, and the
  joined `.arena-plate__hp` texts change. Heading `PermitPilot wins` becomes
  visible (up to ~90s).
- **Skip.** For speed on other fights, after going live run
  `page.getByRole("button", { name: "Skip to result" }).click()`. The winner
  heading appears without waiting for playback.
- **Sudden death (final only).** Play `demo-r2s0` at 2x, click the last
  `.arena-pip`, and the `.arena-death` element appears containing
  `SUDDEN DEATH` with a visible `.arena-death__tally`; the winner moment
  `.arena-winner__acquired` contains `ACQUIRED`.
- **Proof.** Capture the result state. Run
  `await page.locator("body").ariaSnapshot()` writing to
  `proof/<run-id>-match/match.aria.txt` and
  `await page.screenshot({ path: "proof/<run-id>-match/match.png" })`. Both
  artifacts identify the match and the winner heading.

## Gotchas

- The bell button label changes phase to phase (`Ring the bell`,
  `Ring the bell (lock bets)`, `Ring the bell (start the fight)`); match by
  the exact label for the phase you are in.
- Full playback takes minutes per match at 1x; use 4x or `Skip to result`
  unless verifying playback itself.
- Receipts (`.arena-receipt`) appear only after playback starts; zero at
  fight start is expected, not a failure.
- HP text only changes once shots land; poll with a timeout rather than
  asserting immediately.
- The final (`demo-r2s0`) is unreachable until all six feeders complete;
  drive them first (skip is fine).
