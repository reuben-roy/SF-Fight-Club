# 04. Architecture

Deploy detail (D1 types, free-tier limits, Durable Objects, Better Auth, model providers) lives in [08-cloudflare.md](08-cloudflare.md). This file is the logical model and the pipeline. Column meaning lives here. Physical types and Cloudflare limits live in 08.

## Stack

TypeScript end to end, so the engine, the agents, and the UI share one set of types.

| Layer | Choice | Why |
|---|---|---|
| Web app and API | Cloudflare Worker, React, TypeScript, Tailwind. Client bundle as Workers Static Assets on that Worker. | One deploy for UI and API. |
| Arena renderer | PixiJS v8 on a canvas, GSAP timelines | WebGL sprites, particles and screen shake at 60 fps. GSAP timelines map cleanly onto broadcast cues. |
| HUD and UI motion | DOM over the canvas, Motion (framer-motion) | Health bars and text stay crisp, selectable and accessible |
| Database | Cloudflare D1 | Event log, bets, wallets, Better Auth. SQL, SQLite dialect. See [08](08-cloudflare.md#data-d1). |
| Auth | Better Auth on D1 | Public founder and spectator sign-up, sessions, profile role. Access may additionally gate the host console. |
| Match runtime | Durable Objects and the Agents SDK | A match runs for minutes. One object per match calls the orchestrator and the pure engine, and resumes from the compute log. |
| Realtime | WebSocket on the match Durable Object. SSE from the Worker when the client cannot hold a socket. | One-way broadcast cues. Reconnect carries the last cue id (`Last-Event-ID` on SSE). |
| Jobs | DO alarms on the owning agent. A Queue fans out host actions. A Cron Trigger runs the daily Seed Bucks bridge. | The object is the lock. Pattern in [08 Jobs](08-cloudflare.md#jobs). |
| Models | Workers AI, an external provider, or fixture replay. Mistral is the hackathon default. | One pinned build for every fighter. Demos use fixtures and spend nothing. |

The fighter-build defaults, including Mistral model ids, are in [02](02-fight-system.md#the-fighter-build). Pin a dated model id into the build when the tournament is created. Don't hardcode `-latest` aliases into anything that runs during a tournament. Provider wiring is in [08 Models](08-cloudflare.md#models).

## Repo layout

```
apps/
  web/              Worker: API, Better Auth, static assets, broadcast upgrade
packages/
  schemas/          Types and zod schemas (start from /schemas/contracts.ts)
  engine/           Pure TS. Bracket, seeding, scoring, damage, outcome, tiebreak, director. No I/O.
  orchestrator/     Model steps, and fixture replay for demos and tests
  prompts/          Prompt templates (start from /prompts), loaded by content hash
  arena/            PixiJS renderer. Input: broadcast script. Output: pixels and sound.
evals/
  suites/           JSONL test sets for the judge harness
  reports/          Harness output
```

`apps/web` and `packages/orchestrator` are the planned homes. They are not in the repo yet. Templates today live in `/prompts`.

`packages/engine` is the most important package to get right and the easiest to test. It never calls an LLM, never reads the clock, never touches the database. Every function takes data and returns data. Unit test it hard, especially `resolveMatch`, `scaleHp`, `distributeDamage`, `seedBracket` and `runTiebreak`.

`packages/orchestrator` has two entries. The real entry calls the provider named in the fighter build. The fixture entry replays canned outputs by step key so the UI, the agents, and the harness run with no model configured. Both write the same compute-log shapes.

## Components

```
 browser --> +----------------------+ --> D1
  socket <-- | Worker (apps/web)    |     events, bets, auth
             |  API, assets, cron   |
             +----------+-----------+
                        | wake (Queue fan-out)
                        v
             +----------------------+ --> Workers AI
             | MatchAgent /         |     or external model
             | WeighInAgent (DO)    |     (Mistral by default)
             |  orchestrator        |
             |  + pure engine       |
             +----------------------+
```

The Worker serves HTTP and the client. It does not call a model. The agents do. They call `@sf-fight-club/engine` for every score, outcome, and script. The engine has no I/O. D1 holds the compute log both sides read. A Queue message only names the object that should wake up.

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

Every LLM call also writes a row to `llm_calls` with the full request, response, token counts, latency, cost and step key. Events reference calls by ID. That's what the raw view of the trace viewer shows. Failed attempts and retries are in that view, marked as retries.

### Idempotent steps

Each orchestrator step has a stable key, for example `m_91/r2/v1/A` or `m_91/r2/judge/BA`. Before running a step, the agent checks whether an event with that key exists. If it does, it reuses it. A crashed or evicted match resumes from the last completed step when its alarm fires, and steps that already succeeded never re-run. This matters because LLM outputs aren't reproducible, and a re-run step could change history that other steps already used. The compute log in D1 is the resume source. See [08 Match runtime](08-cloudflare.md#match-runtime).

## Orchestrator pipeline

### Intake (per idea, on submit)

1. Validate lengths: title up to 60 chars, one-liner up to 140, description up to 1,500.
2. Moderation with the model named in the build. The hackathon default is Mistral Moderation 2. Reject harmful categories.
3. Injection screen. A utility-model classifier plus regex for obvious patterns ("ignore previous", "you are now", "score this"). Flagged ideas go to host review, not straight to rejection. A founder might innocently write "ignore the hype".
4. Duplicate check. Embed with the model named in the build. The hackathon default is Mistral Embed. Cosine similarity above 0.92 with an existing entrant goes to host review. An idea that is an existing real company is also flagged for host review. The default is to allow it when the submission is framed as an idea, because the rubric judges the opportunity.
5. Standard Brief (`prompts/brief.md`). Same template and length for everyone. The submitter sees and approves it, or edits within the same template and limits, including claims that were not in the original idea. The model that drafts the brief still may not invent claims. If the submitter keeps rejecting the brief, the host can lock it. The brief is frozen when entrants lock.

### Weigh-in (per idea, after entrants lock)

1. Research (`prompts/researcher.md`) with the search tool named in the build. The hackathon default is the Mistral Conversations API with built-in `web_search`. At most 8 searches. The orchestrator keeps the best 12 sources as the evidence locker: URL, title, snippet up to 500 chars, retrieved_at. If the research step times out, retry up to 3 times, then build the dossier from what finished and mark that dossier partial in the weigh-in log. That mark is not the entailment verdict `partial`. The prompt template is the same for Workers AI and for Mistral.
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

Volleys go through moderation. If the speech contains slurs or harassment, regenerate that volley once. A second hit is replaced with an empty volley.

## Data model

Logical model. Every table has `id` and `created_at`. Abbreviations: `jsonb` is a JSON document, `text[]` and `uuid[]` are lists, `bigint` is an integer, `bool` is a boolean. D1 column types, indexes, and the 2 MB row rule are in [08 D1](08-cloudflare.md#data-d1). Better Auth adds `user`, `session`, `account`, and `verification` in the same database.

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
jobs          (kind, ref_id, status, attempts, last_error, scheduled_at)
              -- audit only. The Durable Object named by ref_id is the lock.

profiles      (user_id, handle, role)                              -- spectator | founder | host | vc
wallets       (user_id pk, balance bigint)                         -- integer Seed Bucks
ledger        (user_id, delta bigint, reason, ref_type, ref_id, idempotency_key unique)
markets       (tournament_id, match_id null, kind, status, house_seed jsonb)  -- match | outright | prop
bets          (market_id, user_id, selection, stake bigint, status, payout bigint,
               idempotency_key unique, placed_at)

vc_votes      (match_id, vc_user_id, pick, reason, recused bool)   -- v2
hot_takes     (fighter_id, vc_user_id, text)                       -- v2
```

Wallet balance changes only through `ledger` rows committed in the same D1 batch as the bet or payout. D1 applies one database's writes one at a time, so that batch is the serialization point. The balance can be rebuilt from the ledger at any time.

## API

Worker routes. Host routes require a Better Auth session whose `profiles.role` is `host`. Cloudflare Access may also sit in front of the host console. It does not replace the role check, and it is not the public account system.

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
GET   /api/matches/:id/broadcast                    WebSocket on the match object; SSE fallback. Cues gated by the broadcast clock.
GET   /api/matches/:id/trace                        public after complete, 404 before
POST  /api/matches/:id/retry                        host: only when failed
POST  /api/matches/:id/void                         host: refunds bets
POST  /api/bets                                     place bet (idempotency key required)
GET   /api/me/wallet
GET   /api/leaderboard
```

### Not leaking sealed results

- `GET /bracket` and `GET /matches/:id` return `winner_id` and `outcome` only when the match is `complete`. Before that, a sealed match looks the same as a computing one. Those handlers select an explicit column list.
- `GET /trace` returns 404 until `complete`.
- The broadcast (match-object WebSocket, or SSE from the Worker) sends cue `n` only once `now >= air_started_at + cue.t_ms - 3000`. The 3-second lead keeps playback smooth on slow networks.
- Notifications and push messages about results wait for `complete`.
- The browser never holds a D1 binding. Public handlers list the columns they return, omit `script`, and skip `match_events` until `complete`. The socket sends cues. Agents SDK client state stays free of sealed fields. Sealing is that query boundary.

### Late joiners and reconnects

The broadcast starts with a `snapshot` event: everything needed to render the state at the current broadcast time (HP, round, last cue). Then it streams cues. On reconnect, the client sends the last cue id (SSE uses `Last-Event-ID`) and gets the cues it missed. The arena applies missed cues instantly without animation, then resumes live.

## Determinism and replays

- `match_seed` is fixed at lock and logged. Every random choice (sprite seed, random judge order for the third call, presentation jitter) derives from it.
- LLM calls aren't reproducible even with `random_seed`, so we never re-run a completed step. The compute log is the truth.
- The director is a pure function with a version number. Re-directing an old match with a newer director gives a new script from the same log.

## Budgets and limits

- Tournament `budget_usd` with a running `spent_usd` updated from `llm_calls`. The match owner refuses to start a match if the remaining budget is below 3x the median match cost. The `$0.25` median in [02](02-fight-system.md#cost-and-time-budget-per-match) is the Mistral Large 4 estimate. A Workers AI build records its own `cost_usd`.
- A concurrency cap on `TournamentAgent` (start at 6 in-flight model calls, tune to the provider). Exponential backoff with jitter on 429 and 5xx, up to 5 attempts, waiting on a DO alarm so the isolate is not held open for the whole backoff.
- Per-step timeouts: 60s for volleys and judges, 120s for research.

## Security and privacy

- Submitter identity never goes into a prompt. Ideas are public once in the tournament. Say so on the submit form.
- Fighters must not make claims about private individuals. Real companies are fair game for competitive analysis, using sourced facts.
- Host routes behind role checks. Rate-limit submissions and bets per user and per IP.
- Store only snippets of retrieved pages, never full text.
- No real money anywhere in the system.

## Observability

- `llm_calls` is the trace store. Add a simple internal page listing calls per match with cost and latency. Workers logs cover request failures around that store.
- Log every `match.failed` with the step key and error.
- Track eval-health numbers per tournament (position consistency, draw rate, upset rate, per-category win rates) on the host console. Category and novelty rates are read across tournaments. Never retune a tournament that has already started.
