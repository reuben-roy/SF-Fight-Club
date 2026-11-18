# SF Fight Club verification map

This directory is the maintained source for verifying the user-facing behavior
of the SF Fight Club web app. Read this index before driving the app, then use
the matching feature file as the recipe.

## Baseline preconditions

- Serve the app locally (dev or preview) at `$BASE_URL` (default
  `http://127.0.0.1:5199`) from a server started by this verification run.
- Run `scripts/verify-doctor.sh "$BASE_URL"` and require all checks to pass.
- Start from a reset tournament: `page.goto("$BASE_URL/?reset=1")`, or a fresh
  browser context (state is versioned `localStorage` per origin).
- The committed demo bundle ends with PermitPilot as champion. If it does
  not, stop: the bundle drifted (see SKILL.md Drive).
- Never drive an instance that was not started by this verification run.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say
  otherwise.
- Prefer ARIA roles and accessible names over CSS selectors or DOM position;
  the `.arena-*`, `[data-criterion]`, `[data-shot]`, and
  `[data-testid="tower-champion"]` hooks are stable.
- Treat every command as literal. Keep quoted names, match ids, and
  `/?reset=1` unchanged.
- Run browser actions through Playwright from `apps/web`
  (`pnpm exec playwright test` or `pnpm exec tsx <script>`).
- Full arena playback takes minutes per match; prefer `Skip to result`
  except when verifying playback itself.
- Restore the reset baseline after a mutation. Do not remove proof artifacts
  during cleanup.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof includes an ARIA snapshot and a screenshot with the app identity
  visible, stored under `proof/<run-id>-<feature>/` with a `run.txt` naming
  the base URL, entry point, feature ID, and result.
- Mutation proof includes a read-only second view (reopen or reload and
  re-assert; state persists via `localStorage`).
- Record the feature ID and entry point used with every artifact.
- Report an unreachable path with the attempted command and the unmet
  precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the
user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with Playwright` starts with `Preconditions:` and uses labeled
   bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable
handles, required state, commands, and observable proof.

## Features

- [Home bracket](./home.md) covers tournament progress, house rules, wallet display, champion banner, and restart.
- [Match arena](./match.md) covers bell flow, arena playback, skip, result, and feeder gating.
- [Betting and wallet](./betting.md) covers placing bets, odds display, bet lock, and payouts.
- [Film room](./film.md) covers sealing before completion, scorecard, timeline, and reload persistence.
- [Tower](./tower.md) covers the org chart, empty state, and the crowned champion.
