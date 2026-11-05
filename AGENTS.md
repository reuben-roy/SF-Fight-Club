# AGENTS.md

Guidance for coding agents working in this repo.

## What this is

SF Fight Club: a tournament where startup ideas fight through identical Mistral-powered agents. Read [README.md](README.md) first, then the docs in number order.

## Sources of truth

When documents disagree, this order wins:

1. [schemas/contracts.ts](schemas/contracts.ts) for data shapes.
2. [schemas/rubric.vc-default.json](schemas/rubric.vc-default.json) for criteria, weights and thresholds.
3. [docs/02-fight-system.md](docs/02-fight-system.md) for match rules and scoring math.
4. Everything else.

If you find a disagreement, fix the lower-ranked document to match, or raise it if the higher-ranked one looks wrong.

## Invariants

Don't break these without the user's explicit approval. Tests should enforce them.

- **Same build for every fighter.** One frozen, hashed fighter build per tournament. Model IDs are pinned, dated versions.
- **Delta identity.** `D_B - D_A` equals the weighted rubric gap after backfire penalties. HP is a single per-match scale factor on top. Write a property test for this.
- **Bets lock before compute.** No match computes while its bets are open.
- **Judges never see** seeds, weigh-in scores, odds, bets, crowd data, corner colors, sprites, archetypes, VC hot takes or submitter identity.
- **The engine package is pure.** No I/O, no clock, no LLM calls, no randomness except from a passed-in seed.
- **Completed steps never re-run.** The compute log is the truth. Resume from step keys.
- **Results stay sealed** from every public surface until the match is `complete`.
- **Play money only.**

## Working on edge cases

[docs/07-edge-cases.md](docs/07-edge-cases.md) is the register. Add new rows with the next ID in their section. Change status to `Decided` only when a doc or test now specifies the behavior, and link to it. Leave `Open` items for the user.

## Build order suggestion

1. `packages/schemas` from `contracts.ts`, with zod and generated JSON schemas for Mistral structured outputs.
2. `packages/engine` with unit and property tests: seeding, byes, resolve round, resolve match, HP scaling, damage distribution, tiebreak cascade, director.
3. A fake orchestrator that replays canned LLM outputs, so the UI can be built without API calls.
4. Arena renderer driven by the broadcast script. [prototype/arena.html](prototype/arena.html) shows the target look and the cue format in action.
5. Real orchestrator against Mistral, then the eval harness.
6. Betting, then host console and Arena Mode.
