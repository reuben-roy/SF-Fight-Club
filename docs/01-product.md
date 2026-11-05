# 01. Product

## One line

SF Fight Club is a single-elimination tournament where San Francisco startup ideas fight each other through identical AI agents. Every hit on screen is a scored argument with a receipt you can open.

## The pitch

Hackathons and demo days pick winners in a room you can't see into. Five tired judges, three minutes per team, a gut call. We make that fight literal and public.

Each idea gets a fighter. Every fighter runs the same model, the same prompt, the same tools and the same budgets. The only thing that differs is the idea it carries into the ring. So when one fighter beats another, the idea won, not the agent.

Fights look like a fighting game: ballistas, cannons, gatling guns, shields, health bars, K.O.s. Under the animation sits a real evaluation. A judge panel scores both ideas on a nine-criterion rubric (problem, market, business model, differentiation, moat, timing, go-to-market, feasibility, scale). The health bars are a direct visual of those scores. Click any damage number and you see the argument that dealt it, the judge's reasoning, and the sources behind it.

Winners climb a vertical bracket we call the Tower. The last idea standing is champion.

## House rules

These show up in the UI on the landing page and before the first fight.

1. Every fighter is the same agent. Only the idea fights.
2. No source, no damage. Claims without evidence hit softer. Made-up evidence blows up in your own hands.
3. Every hit has a receipt.
4. Nobody sees the result before the bell. Bets lock before the match is computed.
5. The judges never see seeds, odds, names of submitters, or who the crowd likes.

## Who uses it

| Persona | What they want | What they do |
|---|---|---|
| Founder / submitter | Validation, bragging rights, honest feedback | Submits an idea, watches its fighter, reads the trace to learn why it won or lost |
| Spectator | Entertainment | Watches fights, bets play money, climbs the bettor leaderboard |
| Host | A great stage show | Creates the tournament, curates entrants, starts rounds, runs Arena Mode on the projector |
| VC (phase 2) | Deal flow, a voice in the room | Leaves hot takes on fighters, breaks ties the agents can't settle |

## Core loop

1. **Host creates a tournament.** Size (4 to 64), rubric preset, seeding mode, schedule. The fighter build (model version, prompts, tools, budgets, rubric version) is frozen and hashed at this moment.
2. **Submissions.** Ideas come in through a form or a host import. Each goes through moderation, duplicate detection and prompt-injection screening, then gets rewritten into a Standard Brief (same template and length for everyone). The submitter approves the brief.
3. **Weigh-in.** A research agent builds a dossier for each idea with a fixed web search budget and a shared evidence locker. A weigh-in judge scores each idea alone on the rubric. This produces the fighter card (stats, archetype, sprite) and the seed.
4. **Bracket published.** The Tower appears. Byes go to top seeds if the field isn't a power of two. Outright champion betting opens.
5. **Match.**
   1. Betting opens on the match.
   2. The bell rings. Betting locks.
   3. The engine computes the full match: scouting, three rounds of simultaneous volleys, fact-checks, position-swapped judging, damage resolution, tiebreaks if needed. The result is sealed server-side.
   4. The match airs. Every viewer sees the same synchronized playback, 90 to 120 seconds of fight.
   5. Bets settle. The winner climbs the Tower. The fight report and full trace unlock.
6. **Repeat** round by round until the final.
7. **Champion.** Champion card, final standings, every fighter's report card exported for founders.

## Why the fight is fair

This is the part judges and skeptics will poke at, so the product has to answer it on screen.

- **Same agent.** One fighter build per tournament. The UI shows the build hash on every fighter card ("Build a1b2c3"). Model is pinned to a dated version, never a `-latest` alias.
- **Same budgets.** Same number of web searches, same evidence locker size, same word cap per volley.
- **Same input shape.** Every idea is restated into a Standard Brief before fighting, so a polished submission doesn't beat a rough one on writing alone. The original text is kept as an appendix.
- **Simultaneous turns.** Both fighters write each volley at the same time without seeing the other's. Nobody gets the last word.
- **Debiased judging.** The judge sees "Fighter 1" and "Fighter 2", never names, corners, seeds, odds or the crowd. Every round is judged twice with positions swapped and averaged. Disagreement between the two orders is a signal, not noise. See [03-evals.md](03-evals.md).
- **Self-preference cancels.** Both fighters are the same model, so a judge's taste for its own writing style favors neither side.
- **Receipts.** Fighters can only cite evidence from their locker by ID. Fake citations are caught by code, not vibes.

## Features by phase

### MVP (hackathon demo)

The demo should run start to finish on stage with 8 ideas in about 15 minutes.

- Seed 8 ideas from a JSON file or the submission form.
- Standard Brief, weigh-in research, fighter cards with procedural pixel sprites.
- The Tower (vertical bracket) with live status per match.
- Arena playback: weapons, projectiles, shields, health bars with ghost drain, damage numbers, K.O., winner climbs the Tower.
- Receipts drawer: per-shot judge verdict, per-criterion scorecard, damage math, sources.
- Fight report ("Why Blue won") per match.
- Play-money betting on match winners with parimutuel odds and a leaderboard.
- Host console: run weigh-in, start round, Arena Mode for the projector.

### v1

- Accounts, open public submissions with a waitlist.
- Outright champion bets and prop bets ("Ends in K.O.?", "Anyone fact-checked?").
- Shareable fight clips (canvas capture to WebM) and fighter card images.
- AI ring announcer voice using Voxtral TTS.
- Multiple concurrent tournaments, tournament archive.
- Rubric presets: VC Default, Bootstrapper, Deep Tech, Hackathon.

### v2

- VC panel: hot takes on fighter cards, tiebreak votes on contested matches. The engine already has the hook (see [06-betting-and-vc.md](06-betting-and-vc.md)).
- Deck upload with Mistral OCR feeding the brief.
- Crowd meter (audience reactions, never visible to judges).
- Founder rematch requests with a revised idea.

## What we are not building

- Real-money betting. Play money only, no cash-out, no purchase. This keeps us out of gambling law.
- A general startup scoring SaaS. The rubric is good, but the product is the show.
- Founder or team evaluation. We judge ideas only. Team quality would require identity, which also invites bias.

## Success metrics

For the hackathon:

- The demo runs end to end without a manual fix on stage.
- At least one upset happens (lower seed beats higher seed). If none happen across a tournament, the fights add nothing over the weigh-in.
- The audience can answer "why did that idea win?" by opening a receipt.

For the product:

- Median watch-through rate per match above 70%.
- Share of viewers who open at least one receipt.
- Bettors per match.
- Eval health metrics from [03-evals.md](03-evals.md): position consistency above 85%, retest agreement above 80% on non-close matches, upset rate between 15% and 35%.

## Open product decisions

These are the calls I'd like a human to make. My default is listed first.

1. **Sealed broadcast vs live compute.** Default sealed: compute the whole match after betting locks, then air it with cinematic pacing. Live compute stalls on slow LLM calls and makes the health bar math harder. See [02-fight-system.md](02-fight-system.md#sealed-broadcast).
2. **Seeding.** Default seeded by weigh-in score (classic 1 vs 8). Alternative is a random draw for more chaos.
3. **Show weigh-in stats before fights?** Default show stats as coarse tiers (S, A, B, C) on the fighter card and hide the exact total until elimination. Full numbers make betting too predictable.
4. **Who can submit.** Default host-curated for the hackathon, open in v1.
5. **Mistral branding.** Default is no Mistral logo or wordmark. We borrow the palette and pixel style and add a "Built at the Mistral AI hackathon" text badge. Ask the organizers before using the logo.
