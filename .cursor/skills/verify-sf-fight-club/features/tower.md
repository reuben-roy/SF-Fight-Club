# Tower

The Tower (`/tower`) is the org-chart view of the tournament: winners climb
toward the CEO slot. Before any fight it shows the chart with no champion;
once all 7 fights complete it crowns PermitPilot as CEO of a company of 8.

## Sub-features

- `tower-empty` shows the chart with no champion before any match is played.
- `tower-champion` crowns the tournament winner after all fights complete.

## How to get to it (user POV)

- Choose the Tower link from the home page or app nav.
- Open `/tower` directly.

## Driving it with Playwright

Preconditions:

- App is healthy at `$BASE_URL` (`verify-doctor.sh` passes).
- Fresh state: `page.goto("$BASE_URL/?reset=1")`.

- **Empty chart.** Run `page.goto("$BASE_URL/tower")`. Text `THE ORG CHART`
  is visible and `page.getByTestId("tower-champion")` has count 0.
- **Crowned champion.** Complete all 7 matches (see `match.md`, skip is
  fine), then run `page.goto("$BASE_URL/tower")`.
  `page.getByTestId("tower-champion")` contains text `PermitPilot` and text
  `CEO / RUNS A COMPANY OF 8`.
- **Proof.** Capture the crowned state. Run
  `await page.locator("body").ariaSnapshot()` writing to
  `proof/<run-id>-tower/tower.aria.txt` and
  `await page.screenshot({ path: "proof/<run-id>-tower/tower.png" })`. Both
  artifacts show the champion; `run.txt` notes the empty-state count-0 check
  passed first.

## Gotchas

- The champion testid is `tower-champion` (hyphen); the page CSS class is
  `tower__champion` (double underscore). Select by the testid.
- Mid-tournament the Tower shows partial climbs but no champion; assert the
  count-0 empty state only on a fresh tournament.
- Champion identity comes from the committed demo bundle (PermitPilot). If a
  different name is crowned, the bundle drifted — see SKILL.md Drive.
