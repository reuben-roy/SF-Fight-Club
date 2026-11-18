# Home bracket

Home (`/`) shows tournament progress (`N of 7 fights complete`), the five
house rules, the play-money wallet, the bracket, and (once decided) the
champion banner, plus a restart control.

## Sub-features

- `home-progress` shows `Tournament: N of 7 fights complete`.
- `home-rules` lists all five house rules.
- `home-wallet` shows the current wallet (`Wallet: S$1000` fresh).
- `home-champion` names the champion once all 7 fights complete.
- `home-restart` resets every fight, bet, and the wallet.

## How to get to it (user POV)

- Open `/` in a browser (the app root; nav brand link also returns here).

## Driving it with Playwright

Preconditions:

- App is healthy at `$BASE_URL` (`verify-doctor.sh` passes).
- Fresh state: `page.goto("$BASE_URL/?reset=1")`.

- **Progress and identity.** Assert the landing state. No click needed after
  the reset goto. The heading `SF FIGHT CLUB`, text
  `Tournament: 0 of 7 fights complete`, and text `Wallet: S$1000` are visible.
- **House rules.** Assert all five rules with `page.getByText(rule)` for each
  of: `Every fighter is the same agent. Only the idea fights.`,
  `No source, no damage. Claims without evidence hit softer. Made-up evidence blows up in your own hands.`,
  `Every hit has a receipt.`,
  `Nobody sees the result before the bell. Bets lock before the match is computed.`,
  `The judges never see seeds, odds, names of submitters, or who the crowd likes.`
- **Champion banner (played tournament).** Complete all 7 matches (see
  `match.md`), then `page.goto("$BASE_URL/")`. Text
  `Tournament: 7 of 7 fights complete` and text `Champion: PermitPilot` are
  visible.
- **Restart.** With a played or bet-on tournament, use the restart control on
  the home screen (copy: `Restart the whole tournament? Every fight, bet and wallet resets.`).
  After confirming, `Tournament: 0 of 7 fights complete` and
  `Wallet: S$1000` are visible again.
- **Proof.** Capture the landing state. Run
  `await page.locator("body").ariaSnapshot()` writing to
  `proof/<run-id>-home/home.aria.txt` and
  `await page.screenshot({ path: "proof/<run-id>-home/home.png" })`. Both
  artifacts show `SF FIGHT CLUB`, the progress line, and the wallet.

## Gotchas

- Without `?reset=1` (or a fresh context), `localStorage` replays the last
  tournament: progress and wallet will not be zero. Always reset first.
- The champion banner appears only at 7 of 7; semifinal winners appear on
  the Tower earlier but not on home.
- The restart copy is the confirmation surface; assert the post-reset
  progress text, not just that the button existed.
