# Film room

The film room (`/film/:matchId`) is sealed until its fight completes: an
unplayed match shows a sealed notice with no scores. After completion it shows
the full report — matchup heading, nine-criterion scorecard, and the
shot-by-shot timeline — and reload persistence keeps it.

## Sub-features

- `film-sealed` hides everything behind a sealed notice before completion.
- `film-scorecard` shows all nine rubric criteria after completion.
- `film-timeline` shows one entry per broadcast shot.
- `film-persist` survives a page reload.

## How to get to it (user POV)

- Choose a completed fight's film from the match result or the bracket.
- Open `/film/<matchId>` directly (`demo-r0s0`..`demo-r0s3`, `demo-r1s0`,
  `demo-r1s1`, `demo-r2s0`).

## Driving it with Playwright

Preconditions:

- App is healthy at `$BASE_URL` (`verify-doctor.sh` passes).
- Fresh state: `page.goto("$BASE_URL/?reset=1")`.

- **Sealed.** Open an unplayed final. Run
  `page.goto("$BASE_URL/film/demo-r2s0")`. Text
  `Sealed until this fight completes.` is visible and no scorecard is shown.
- **Unlock.** Complete the fight (play or skip via `match.md`; the final
  needs all six feeders first). Run
  `page.goto("$BASE_URL/film/demo-r2s0")`. The count of text `SEALED` is 0
  and heading `/PermitPilot v CurbBot/` is visible.
- **Scorecard.** On the unlocked film, run
  `page.locator("[data-criterion]")`. The count is 9 (every rubric criterion).
- **Timeline.** On the unlocked film, run `page.locator("[data-shot]")`.
  The count equals the final film's shot count in the committed demo bundle
  (`DEMO_BUNDLE.matches` entry for `demo-r2s0`, field `film.shots.length`).
- **Persistence.** Reload: run `page.reload()`. Heading
  `/PermitPilot v CurbBot/` is still visible; then
  `page.goto("$BASE_URL/")` shows `Tournament: 7 of 7 fights complete`.
- **Proof.** Capture the unlocked state. Run
  `await page.locator("body").ariaSnapshot()` writing to
  `proof/<run-id>-film/film.aria.txt` and
  `await page.screenshot({ path: "proof/<run-id>-film/film.png" })`. Both
  artifacts show the matchup heading and scorecard; `run.txt` notes the
  `[data-criterion]` and `[data-shot]` counts.

## Gotchas

- Sealing is per match: playing `demo-r0s0` does not unseal `demo-r2s0`.
  Verify the sealed notice on the exact match you will later unlock.
- Results stay sealed from every public surface until the match is
  `complete` (repo invariant). Any score leaking on the sealed page is a
  defect.
- The shot count assertion is bundle-relative; if `demo:data` regenerated
  the bundle, read the expected count from the bundle, never hardcode it.
- Reload persistence uses `localStorage`: a fresh browser context legitimately
  shows a fresh tournament. Test persistence with `page.reload()`, not a new
  context.
