---
name: verify-sf-fight-club
description: Drive the SF Fight Club web UI (Vite and React demo tournament) the way a user does — launch a local server, check it with the doctor, exercise a feature with Playwright, capture proof, clean up. Reach for it to prove any web-app behavior end to end.
---

# Verify SF Fight Club

SF Fight Club's primary user surface is the web app in `apps/web`: a Vite and
React client showing a demo tournament (home bracket, match arena with
play-money betting, film room, Tower org chart). It is fully client-side: no
backend, no auth, no env vars, no network calls at runtime. State (tournament
progress, bets, wallet) lives in versioned `localStorage`; the committed demo
bundle in `apps/web/src/data/generated/demo.ts` means no model API is needed.

Secondary surfaces (pure packages, intake/orchestrator CLIs) are verified by
`pnpm test`; this skill covers the web UI only.

## Launch

From the repo root, start the dev server on a port you own (default `5199`,
the same port `apps/web/playwright.config.ts` uses):

```bash
PORT=5199
pnpm --filter @sf-fight-club/web dev --host 127.0.0.1 --port "$PORT" \
  > /tmp/sf-verify-$PORT.log 2>&1 &
echo $! > /tmp/sf-verify-$PORT.pid
BASE_URL="http://127.0.0.1:$PORT"
```

This also runs `build:deps` first, so the first launch can take a minute.
Ready means `curl` returns `200` on `/` (poll up to 120s):

```bash
for i in $(seq 1 240); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/")" = 200 ] && break
  sleep 0.5
done
```

For a production-shaped check instead, use the preview server (slower, needs
a build):

```bash
pnpm --filter @sf-fight-club/web build
pnpm --filter @sf-fight-club/web preview --host 127.0.0.1 --port "$PORT" ...
```

but prefer the dev server unless you are verifying the build itself.

Teardown is under [Cleanup](#cleanup). Never leave a server running.

## Doctor

Run the read-only check before driving, and again whenever anything looks
off. It answers "is this instance worth driving":

```bash
.cursor/skills/verify-sf-fight-club/scripts/verify-doctor.sh "$BASE_URL" \
  --pid-file /tmp/sf-verify-$PORT.pid
```

It requires HTTP 200 on `/` with the app root element, proves the response
comes from this repo's Vite dev server (`/src/main.tsx` resolving to the app
bootstrap) or its production build (`/assets/` bundle), and, with
`--pid-file`, requires the recorded server process to still be alive. Any
failure means: do not drive. Check `/tmp/sf-verify-$PORT.log`, restart via
[Launch](#launch), and run the doctor again.

Never drive a server you did not start. A teammate's dev server on port 5173
shares nothing with your run and your `localStorage` state would collide with
theirs.

## Drive

The harness is Playwright (`@playwright/test`, browsers already installed).
Run existing specs or a one-off script from `apps/web` so module resolution
works:

```bash
cd apps/web
pnpm exec playwright test                          # full tournament walkthrough (e2e/tournament.spec.ts, minutes)
pnpm exec playwright test -g "sudden death"       # second spec only
pnpm exec tsx /path/to/one-off-script.mts         # ad-hoc drive below
```

Conventions (see `features/README.md`):

- Start every recipe from a reset baseline: `page.goto("$BASE_URL/?reset=1")`
  requests a fresh tournament, or use a brand-new browser context (fresh
  `localStorage`).
- Prefer the stable handles named in the feature files (role names, headings,
  `data-testid="tower-champion"`, `[data-criterion]`, `[data-shot]`,
  `.arena-*` classes). Do not use coordinates or tab order.
- Never bypass the UI with internal setters or test-only endpoints. Ring the
  real bell, place bets with the real buttons, play or skip through the real
  arena.
- The committed demo tournament always ends with PermitPilot as champion
  (final `PermitPilot v CurbBot`, match ids `demo-r0s0`..`demo-r0s3`,
  `demo-r1s0`, `demo-r1s1`, `demo-r2s0`). If it does not, the bundle drifted:
  run `pnpm --filter @sf-fight-club/web demo:data` and the drift test
  (`apps/web/test/persistence.test.ts`, section 7 of `docs/09-battle-revamp.md`).

## Evidence

Every proof goes in `.cursor/skills/verify-sf-fight-club/proof/<run-id>-<feature>/`
(run-id like `20261118-home-5222`) with three files:

- `<feature>.aria.txt` — Playwright ARIA snapshot after the action.
- `<feature>.png` — screenshot with the app identity visible.
- `run.txt` — base URL, entry point used, feature ID, timestamp, pass/fail.

Proof standards:

- Exercise the real user path, not internals. Capture the action and the
  resulting state, not just the final screen.
- UI proof includes the ARIA snapshot and the screenshot together.
- Mutation proof (bets, wallet, results) includes a read-only second view:
  reopen the page or reload and re-assert (state persists via `localStorage`).
- Verify side effects alongside what is visible: wallet text after a bet,
  `SEALED` markers gone from film after completion, champion on both Tower
  and home.
- No mocks exist on this surface; nothing external to stub. If a run claims
  a dry-run or skip, verify what it skipped by observing (wallet unchanged,
  no new `.arena-receipt` nodes) rather than trusting the label.
- Record the feature ID and entry point with every artifact. Report an
  unreachable path with the attempted command and the unmet precondition.
  Never report a skipped entry point as verified through a different path.

## Cleanup

Kill only what you started, by PID — never by process name:

```bash
kill "$(cat /tmp/sf-verify-$PORT.pid)"
sleep 2
pkill -P "$(cat /tmp/sf-verify-$PORT.pid)" 2>/dev/null || true
rm -f /tmp/sf-verify-$PORT.pid /tmp/sf-verify-$PORT.log
curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/"  # expect 000 (refused)
```

Then reset app state only if you used a shared browser profile
(`page.goto("$BASE_URL/?reset=1")`); fresh Playwright contexts need nothing.
Run this cleanup after every failed iteration too, so broken attempts do not
strand processes and ports.

Cleanup removes instances and scratch state, never the evidence: proof
artifacts under `proof/` survive the teardown. After cleanup, confirm the
evidence still exists at the named location — a cleanup that eats the proof
fails the run.

## Helpers

- `scripts/verify-doctor.sh "$BASE_URL" [--pid-file FILE]` — the doctor
  check from [Doctor](#doctor). Exit `0` means worth driving; nonzero names
  the failed check. Read-only: it makes no requests that mutate state.
