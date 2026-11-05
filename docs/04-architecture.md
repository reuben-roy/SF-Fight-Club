# 04. Architecture

## Stack

TypeScript end to end, so the engine, the worker and the UI share one set of types.

| Layer | Choice | Why |
|---|---|---|
| Web app | Next.js (App Router), React, TypeScript, Tailwind CSS | Fast to build, one deploy for UI and API routes |
| Arena renderer | PixiJS v8 on a canvas, GSAP timelines | WebGL sprites, particles and screen shake at 60 fps. GSAP timelines map cleanly onto broadcast cues. |
| HUD and UI motion | DOM over the canvas, Motion (framer-motion) | Health bars and text stay crisp, selectable and accessible |
| LLM | Mistral API through `@mistralai/mistralai` | Hackathon sponsor. Large 4 for fighters and judges, Small 4 for utility, Moderation 2 for intake, built-in `web_search` for research. |
| Database | Postgres (Supabase) | Event log, bets, wallets. Supabase also gives auth and realtime. |
| Realtime | Server-Sent Events from the web app, or Supabase Realtime | One-way broadcast cues. SSE resumes with `Last-Event-ID`. |
| Jobs | A worker process polling a Postgres jobs table (`FOR UPDATE SKIP LOCKED`) | Matches take minutes. Serverless timeouts would kill them. Inngest or Trigger.dev are fine swaps later. |
| Hosting | Vercel for web, Fly.io or Railway for the worker, Supabase | Or everything on one Fly machine for the demo |

Mistral model IDs change. Resolve current IDs from `GET /v1/models` when a tournament is created and pin the dated ID into the build. Don't hardcode `-latest` aliases into anything that runs during a tournament.

## Repo layout

```
apps/
  web/              Next.js app: pages, API routes, SSE broadcast
  worker/           Orchestrator: runs weigh-ins and matches, writes the compute log
packages/
  schemas/          Types and zod schemas (start from /schemas/contracts.ts)
  engine/           Pure TS. Bracket, seeding, scoring, damage, outcome, tiebreak, director. No I/O.
  orchestrator/     LLM steps: brief, research, scouting, volley, fact-check, judge, report
  prompts/          Prompt templates (start from /prompts), loaded by content hash
  arena/            PixiJS renderer. Input: broadcast script. Output: pixels and sound.
evals/
  suites/           JSONL test sets for the judge harness
  reports/          Harness output
```

`packages/engine` is the most important package to get right and the easiest to test. It never calls an LLM, never reads the clock, never touches the database. Every function takes data and returns data. Unit test it hard, especially `resolveMatch`, `scaleHp`, `distributeDamage`, `seedBracket` and `runTiebreak`.

## Components

```
            +--------------------+        +-------------------+
 browser -> | apps/web           | -----> | Postgres          |
  (SSE)  <- |  pages, API, SSE   | <----- |  events, bets ... |
            +--------------------+        +-------------------+
                                             ^      |
                                    writes   |      | jobs
                                             |      v
                                          +-------------------+      +-------------+
                                          | apps/worker       | ---> | Mistral API |
                                          |  orchestrator     | <--- |             |
                                          |  + engine         |      +-------------+
                                          +-------------------+
```

The web app never calls Mistral. The worker never serves HTTP. They meet in the database.

## The compute log

Everything the engine does for a match is an append-only list of events in `match_events`, ordered by `seq`. The result, the trace viewer and the broadcast script are all derived from it.

Event types (full payload types in [schemas/contracts.ts](../schemas/contracts.ts)):

```
match.locked              bets closed, compute starting, match_seed fixed
scouting.completed        per fighter: searches run, evidence items kept
volley.submitted          per fighter per volley: shots, speech, word count
factcheck.completed       per volley: mechanical and entailment verdicts, fabrications
judge.completed           per call: order (AB or BA), raw judgment, model, seed
round.resolved            per round: debiased scores, stability flags, shot verdicts
match.resolved            Delta, outcome kind, winner, decided_by
suddendeath.completed     closing volleys, votes
tiebreak.applied          which step decided and why
report.completed          fight report, announcer lines
match.sealed              compute finished, script built (director version)
match.failed              step key, error, retry count
```

Every LLM call also writes a row to `llm_calls` with the full request, response, token counts, latency, cost and step key. Events reference calls by ID. That's what the raw view of the trace viewer shows.

### Idempotent steps

Each orchestrator step has a stable key, for example `m_91/r2/v1/A` or `m_91/r2/judge/BA`. Before running a step, the worker checks whether an event with that key exists. If it does, it reuses it. A crashed or failed match resumes from the last completed step on retry, and steps that already succeeded never re-run. This matters because LLM outputs aren't reproducible, and a re-run step could change history that other steps already used.

## Orchestrator pipeline

### Intake (per idea, on submit)

1. Validate lengths: title up to 60 chars, one-liner up to 140, description up to 1,500.
2. Moderation with Mistral Moderation 2. Reject harmful categories.
3. Injection screen. A utility-model classifier plus regex for obvious patterns ("ignore previous", "you are now", "score this"). Flagged ideas go to host review, not straight to rejection. A founder might innocently write "ignore the hype".
4. Duplicate check. Embed with Mistral Embed. Cosine similarity above 0.92 with an existing entrant goes to host review.
5. Standard Brief (`prompts/brief.md`). Same template and length for everyone. The submitter sees and approves it, or edits within the same limits.

### Weigh-in (per idea, after entrants lock)

1. Research (`prompts/researcher.md`) through the Conversations API with the built-in `web_search` tool. At most 8 searches. The orchestrator keeps the best 12 sources as the evidence locker: URL, title, snippet up to 500 chars, retrieved_at.
2. Fact-check the dossier's own claims against its locker.
3. Weigh-in judge (`prompts/weighin_judge.md`), 3 samples, median.
4. Fighter card: stats, tier, archetype, sprite seed.
5. After all weigh-ins finish, seed the bracket.

Retrieved web pages are untrusted. The researcher prompt treats page content as data. Only snippets are stored, never full pages, which also keeps us clear of copying whole articles.

### Match

```
lock -> scouting(A) || scouting(B)
for round in 1..3:
    volley1(A) || volley1(B)        -> factcheck(v1A) || factcheck(v1B)
    volley2(A) || volley2(B)        -> factcheck(v2A) || factcheck(v2B)
    judge(AB)  || judge(BA)         -> [judge(random) if unstable]
    engine.resolveRound
engine.resolveMatch
if SUDDEN_DEATH: closing(A) || closing(B) -> 4x sd_judge -> engine.runTiebreak
report
engine.direct -> broadcast script
seal
```

All LLM outputs use structured outputs with a JSON schema generated from `packages/schemas`. On a schema failure, retry once with the validation error appended. On a second failure, mark the step failed and the match `failed`.

Fighter refusals (the model declines to argue) get one retry with a reminder that this is a fictional debate game about business ideas. A second refusal becomes an empty volley. The judge sees "Fighter 2 made no argument this volley."

## Data model

Postgres. Types abbreviated. Every table has `id uuid pk` and `created_at`.

```sql
tournaments   (name, slug, status, size, rubric_preset, rubric_hash, build jsonb, build_hash,
               seeding_mode, tiebreakers text[], starts_at, budget_usd, spent_usd)
ideas         (tournament_id, submitter_id, title, one_liner, description, customer,
               business_model, links text[], status, moderation jsonb, injection_flag bool,
               brief jsonb, brief_approved_at)
dossiers      (idea_id, summary jsonb, evidence jsonb, research_call_ids uuid[])
fighters      (tournament_id, idea_id, seed int, sprite_seed bigint, archetype, tier,
               weighin jsonb, weighin_total numeric, status)       -- active | eliminated | champion | withdrawn
matches       (tournament_id, round_index, slot_index, fighter_a_id, fighter_b_id,
               feeder_a_match_id, feeder_b_match_id, status, match_seed bigint,
               outcome jsonb, winner_id, locked_at, sealed_at, air_started_at, completed_at,
               director_version, script jsonb)
match_events  (match_id, seq int, step_key text, type text, payload jsonb,
               unique (match_id, seq), unique (match_id, step_key))
llm_calls     (match_id null, idea_id null, step_key, role, model, params jsonb,
               request jsonb, response jsonb, tokens_in, tokens_out, latency_ms, cost_usd, error)
jobs          (kind, ref_id, status, attempts, run_after, locked_by, locked_at, last_error)

profiles      (user_id, handle, role)                              -- spectator | founder | host | vc
wallets       (user_id pk, balance bigint)                         -- integer Seed Bucks
ledger        (user_id, delta bigint, reason, ref_type, ref_id, idempotency_key unique)
markets       (tournament_id, match_id null, kind, status, house_seed jsonb)  -- match | outright | prop
bets          (market_id, user_id, selection, stake bigint, status, payout bigint,
               idempotency_key unique, placed_at)

vc_votes      (match_id, vc_user_id, pick, reason, recused bool)   -- v2
hot_takes     (fighter_id, vc_user_id, text)                       -- v2
```

Wallet balance changes only through `ledger` rows inserted in the same transaction as the bet or payout, with a row lock on the wallet. The balance can be rebuilt from the ledger at any time.

## API

Route handlers under `apps/web/app/api`. Host routes require the host role.

```
POST  /api/tournaments                              host: create, freezes build
POST  /api/tournaments/:id/ideas                    submit idea
POST  /api/ideas/:id/brief/approve                  submitter approves brief
POST  /api/tournaments/:id/lock-entrants            host
POST  /api/tournaments/:id/weigh-in                 host: enqueue weigh-ins
GET   /api/tournaments/:id/bracket                  public: Tower state, no sealed results
POST  /api/matches/:id/open-betting                 host
POST  /api/matches/:id/lock                         host: bell, enqueues compute
POST  /api/matches/:id/air                          host: start broadcast
GET   /api/matches/:id                              public: status, fighters, odds
GET   /api/matches/:id/broadcast                    SSE: cues gated by the broadcast clock
GET   /api/matches/:id/trace                        public after complete, 404 before
POST  /api/matches/:id/retry                        host: only when failed
POST  /api/matches/:id/void                         host: refunds bets
POST  /api/bets                                     place bet (idempotency key required)
GET   /api/me/wallet
GET   /api/leaderboard
```

### Not leaking sealed results

- `GET /bracket` and `GET /matches/:id` return `winner_id` and `outcome` only when the match is `complete`. Before that, a sealed match looks the same as a computing one.
- `GET /trace` returns 404 until `complete`.
- The SSE endpoint sends cue `n` only once `now >= air_started_at + cue.t_ms - 3000`. The 3-second lead keeps playback smooth on slow networks.
- Notifications and push messages about results wait for `complete`.
- Supabase row-level security must hide `outcome`, `winner_id`, `script` and `match_events` from the anon role until `complete`. If we use Supabase Realtime, don't subscribe clients to the raw tables.

### Late joiners and reconnects

The SSE stream starts with a `snapshot` event: everything needed to render the state at the current broadcast time (HP, round, last cue). Then it streams cues. On reconnect, the client sends `Last-Event-ID` and gets the cues it missed. The arena applies missed cues instantly without animation, then resumes live.

## Determinism and replays

- `match_seed` is fixed at lock and logged. Every random choice (sprite seed, random judge order for the third call, presentation jitter) derives from it.
- LLM calls aren't reproducible even with `random_seed`, so we never re-run a completed step. The compute log is the truth.
- The director is a pure function with a version number. Re-directing an old match with a newer director gives a new script from the same log.

## Budgets and limits

- Tournament `budget_usd` with a running `spent_usd` updated from `llm_calls`. The worker refuses to start a match if the remaining budget is below 3x the median match cost.
- A global concurrency limiter in the worker (start at 6 concurrent Mistral calls, tune to the workspace's rate limits). Exponential backoff with jitter on 429 and 5xx, up to 5 attempts.
- Per-step timeouts: 60s for volleys and judges, 120s for research.

## Security and privacy

- Submitter identity never goes into a prompt. Ideas are public once in the tournament. Say so on the submit form.
- Fighters must not make claims about private individuals. Real companies are fair game for competitive analysis, using sourced facts.
- Host routes behind role checks. Rate-limit submissions and bets per user and per IP.
- Store only snippets of retrieved pages, never full text.
- No real money anywhere in the system.

## Observability

- `llm_calls` is the trace store. Add a simple internal page listing calls per match with cost and latency.
- Log every `match.failed` with the step key and error.
- Track eval-health numbers per tournament (position consistency, draw rate, upset rate) on the host console.
