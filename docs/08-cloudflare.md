# 08. Cloudflare deploy

This is the deploy path. [04-architecture.md](04-architecture.md) keeps the logical model, the pipeline, and the API. This file is how that model sits on Cloudflare: Workers, D1, Durable Objects, the Agents SDK, Better Auth.

An earlier sketch put the UI on Next.js and Vercel, the match runner on Fly.io or Railway, and the database on Supabase. That sketch is retired. Fight rules in [02-fight-system.md](02-fight-system.md) are unchanged. `@sf-fight-club/engine` stays pure and is called from the orchestrator.

Nothing in `apps/` is scaffolded yet. The layout below is the plan for that work.

## Workers app

One Cloudflare Worker.

| Piece | Where it lives |
|---|---|
| HTTP API | The Worker. Same paths as [04 API](04-architecture.md#api). |
| Client | React, Tailwind, PixiJS, Motion, built to static files and served as [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/) on that Worker. |
| Auth handler | Better Auth, mounted at `/api/auth/*`. |
| Broadcast | The match Durable Object. SSE from the Worker is the fallback for clients that only speak HTTP. |

The browser talks to the Worker. The Worker does not call a model. Model calls happen inside the match and weigh-in agents.

## Data: D1

One D1 database per environment (`dev`, `prod`). SQLite dialect. The logical tables in [04 Data model](04-architecture.md#data-model) are the source for columns and meaning. Physical types follow the rules below.

Better Auth's own tables (`user`, `session`, `account`, `verification`) live in the same database. Generate them from Better Auth. Do not hand-fork that schema.

### Dialect rules

- Identifiers are `TEXT`. The app generates the id (uuid string). SQLite has no `uuid` type.
- Timestamps are `INTEGER` unix milliseconds. No `timestamptz`.
- JSON payloads (`build`, `brief`, `outcome`, `script`, `payload`, `request`, `response`, …) are `TEXT` holding canonical JSON. No `jsonb`. Hot filters use real columns (`status`, `type`, `step_key`), not `json_extract` on the payload.
- Booleans are `INTEGER` 0 or 1 (`injection_flag`, `recused`).
- Seed Bucks (`wallets.balance`, `ledger.delta`, `bets.stake`, `bets.payout`) are `INTEGER`.
- `match_seed` and `sprite_seed` are `TEXT` decimal. SQLite integers are signed 64-bit, and a full-width seed does not fit safely in a JS number either.
- `links`, `research_call_ids`, and `tiebreakers` are JSON arrays in `TEXT`.
- Cached scores such as `weighin_total` are `REAL`. The compute-log payload is the score of record. If a cache disagrees with the log, the log wins.
- Foreign keys are declared. D1 enforces them on every query and migration.
- Uniques stay: `(match_id, seq)`, `(match_id, step_key)`, `ledger.idempotency_key`, `bets.idempotency_key`.
- Index the columns public reads filter on: `matches(tournament_id, status)`, `match_events(match_id, seq)`, `ideas(tournament_id, status)`, `bets(market_id)`, `ledger(user_id)`, `llm_calls(match_id, step_key)`. A filter on an unindexed column counts every scanned row toward the rows-read quota.

Wallet writes are one `db.batch()`: update `wallets`, insert the `ledger` row, and insert or update the `bets` row. D1 runs a single database's queries one at a time, so a second batch sees the balance the first batch committed. The balance can still be rebuilt from `ledger`.

The whole `llm_calls` row, including both bodies, must stay under D1's 2 MB limit. A body that would cross it goes to R2, and the row keeps the object key plus token counts, latency, cost, and error.

### Table mapping

Types below are the D1 column types. Nullability matches the logical model: a column with no marker is required.

```sql
tournaments (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  size INTEGER NOT NULL,
  rubric_preset TEXT NOT NULL,
  rubric_hash TEXT NOT NULL,
  build TEXT NOT NULL,             -- JSON
  build_hash TEXT NOT NULL,
  seeding_mode TEXT NOT NULL,
  tiebreakers TEXT NOT NULL,       -- JSON array
  starts_at INTEGER,
  budget_usd REAL NOT NULL,
  spent_usd REAL NOT NULL
)

ideas (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  submitter_id TEXT NOT NULL,      -- Better Auth user id
  title TEXT NOT NULL,
  one_liner TEXT NOT NULL,
  description TEXT NOT NULL,
  customer TEXT,
  business_model TEXT,
  links TEXT NOT NULL,             -- JSON array
  status TEXT NOT NULL,
  moderation TEXT,                 -- JSON
  injection_flag INTEGER NOT NULL, -- 0 or 1
  brief TEXT,                      -- JSON
  brief_approved_at INTEGER
)

dossiers (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  idea_id TEXT NOT NULL REFERENCES ideas(id),
  summary TEXT NOT NULL,           -- JSON
  evidence TEXT NOT NULL,          -- JSON
  research_call_ids TEXT NOT NULL  -- JSON array
)

fighters (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  idea_id TEXT NOT NULL REFERENCES ideas(id),
  seed INTEGER,
  sprite_seed TEXT NOT NULL,
  archetype TEXT,
  tier TEXT,
  weighin TEXT,                    -- JSON
  weighin_total REAL,
  status TEXT NOT NULL             -- active | eliminated | champion | withdrawn
)

matches (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  round_index INTEGER NOT NULL,
  slot_index INTEGER NOT NULL,
  fighter_a_id TEXT REFERENCES fighters(id),
  fighter_b_id TEXT REFERENCES fighters(id),
  feeder_a_match_id TEXT REFERENCES matches(id),
  feeder_b_match_id TEXT REFERENCES matches(id),
  status TEXT NOT NULL,
  match_seed TEXT,
  outcome TEXT,                    -- JSON, public only when complete
  winner_id TEXT,
  locked_at INTEGER,
  sealed_at INTEGER,
  air_started_at INTEGER,
  completed_at INTEGER,
  director_version TEXT,
  script TEXT                      -- JSON, public only when complete
)

match_events (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  match_id TEXT NOT NULL REFERENCES matches(id),
  seq INTEGER NOT NULL,
  step_key TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,           -- JSON
  UNIQUE (match_id, seq),
  UNIQUE (match_id, step_key)
)

llm_calls (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  match_id TEXT REFERENCES matches(id),
  idea_id TEXT REFERENCES ideas(id),
  step_key TEXT NOT NULL,
  role TEXT NOT NULL,
  model TEXT NOT NULL,
  params TEXT NOT NULL,            -- JSON
  request TEXT,                    -- JSON, or NULL when the body is in R2
  response TEXT,
  request_r2_key TEXT,
  response_r2_key TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  latency_ms INTEGER,
  cost_usd REAL,
  error TEXT
)

jobs (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  kind TEXT NOT NULL,              -- weigh-in | match
  ref_id TEXT NOT NULL,
  status TEXT NOT NULL,            -- queued | running | done | failed
  attempts INTEGER NOT NULL,
  last_error TEXT,
  scheduled_at INTEGER
)

profiles (
  user_id TEXT PRIMARY KEY,        -- Better Auth user.id
  created_at INTEGER NOT NULL,
  handle TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL               -- spectator | founder | host | vc
)

wallets (
  user_id TEXT PRIMARY KEY REFERENCES profiles(user_id),
  created_at INTEGER NOT NULL,
  balance INTEGER NOT NULL
)

ledger (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  user_id TEXT NOT NULL REFERENCES wallets(user_id),
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ref_type TEXT,
  ref_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE
)

markets (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  match_id TEXT REFERENCES matches(id),
  kind TEXT NOT NULL,              -- match | outright | prop
  status TEXT NOT NULL,
  house_seed TEXT NOT NULL         -- JSON
)

bets (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  market_id TEXT NOT NULL REFERENCES markets(id),
  user_id TEXT NOT NULL REFERENCES profiles(user_id),
  selection TEXT NOT NULL,
  stake INTEGER NOT NULL,
  status TEXT NOT NULL,
  payout INTEGER,
  idempotency_key TEXT NOT NULL UNIQUE,
  placed_at INTEGER NOT NULL
)

vc_votes (                         -- v2
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  match_id TEXT NOT NULL REFERENCES matches(id),
  vc_user_id TEXT NOT NULL REFERENCES profiles(user_id),
  pick TEXT,
  reason TEXT,
  recused INTEGER NOT NULL
)

hot_takes (                        -- v2
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  fighter_id TEXT NOT NULL REFERENCES fighters(id),
  vc_user_id TEXT NOT NULL REFERENCES profiles(user_id),
  text TEXT NOT NULL
)
```

`jobs` records work the host requested: kind, ref id, status, attempts, last error, scheduled time. The Durable Object named by `ref_id` is the lock.

### Free tier, briefly

Figures from the D1 docs as of October 2026. Re-check [limits](https://developers.cloudflare.com/d1/platform/limits/) and [pricing](https://developers.cloudflare.com/d1/platform/pricing/) before a production tournament. A hackathon demo fits in the free allowance. A public tournament that stores full model traces should plan on Workers Paid, because of rows written and the 2 MB row cap more than because of storage.

| | Workers Free |
|---|---|
| Databases | 10 per account |
| Database size | 500 MB |
| Account storage | 5 GB |
| Rows read | 5 million / day |
| Rows written | 100,000 / day |
| Queries per Worker invocation | 50 (a `db.batch()` counts as one) |
| Time Travel | 7 days |
| Max row | 2 MB |
| Query duration | 30 seconds |

One database is single-threaded. Parallel matches queue behind each other. A 16-idea bracket is fine. Batch event inserts so a match does not spend the 50-query invocation cap one row at a time.

## Match runtime

Long matches run on Durable Objects through the [Agents SDK](https://developers.cloudflare.com/agents/) (`agents`).

| Object | Name | Owns |
|---|---|---|
| `MatchAgent` | `match_id` | One match. Pipeline, compute log, seal, broadcast socket. |
| `WeighInAgent` | `idea_id` | Research, dossier fact-check, weigh-in judge. |
| `TournamentAgent` | `tournament_id` | In-flight model-call count, budget gate, bracket seed once every weigh-in has a dossier. |

Each agent calls `packages/orchestrator` for a model step and `@sf-fight-club/engine` for resolution, tiebreak, and the director. The engine never sees a binding, a clock, or a socket.

The compute log in D1 is the truth. Agents SDK state and the DO's local SQLite are a checkpoint and a socket hibernation store. On resume, the agent reads `match_events` and continues at the first missing step key. If DO state and D1 disagree, D1 wins. A completed step is never sent to a model again.

Client-synced agent state holds the checkpoint only. `outcome`, `winner_id`, `script`, and raw events stay in D1. The public broadcast is the cue socket.

### Jobs

Chosen pattern: the owning Durable Object runs the work, a DO alarm resumes it, and a Queue only fans out.

1. Host action (`weigh-in`, `lock`) writes a `jobs` row and publishes one Queue message per idea or match: `{ kind, refId }`.
2. The consumer calls `MatchAgent` or `WeighInAgent` for that id and acks. The agent runs the pipeline.
3. The agent writes each finished step to D1, then starts the next step. Parallel volleys and the AB/BA judge pair are concurrent fetches inside that one object. The object is the single writer.
4. On provider backoff, isolate eviction, or a step that should wait, the agent sets a DO alarm (Agents SDK `schedule`). The alarm reads the log and continues. Attempts stop at 5, matching [07 FE-1](07-edge-cases.md).
5. A second start for the same id hits the same object. `UNIQUE (match_id, step_key)` rejects a duplicate insert if a write races.

The daily Seed Bucks bridge (accounts under S$100 topped up to S$100) is a Cron Trigger on the Worker. It writes ledger rows. It does not start matches.

`TournamentAgent` holds the concurrency cap: 6 in-flight model calls to start, then tune to the provider. The cap lives on the object so each isolate does not take its own 6.

## Realtime

Public playback uses the match object.

- Viewers open a WebSocket to `MatchAgent`. Hibernation is on, so idle sockets do not keep the object hot.
- The first message is a `snapshot` at the current broadcast time. Later messages are cues.
- The object sends cue `n` only once `now >= air_started_at + cue.t_ms - 3000`. Same lead as [04](04-architecture.md#not-leaking-sealed-results).
- Reconnect sends the last cue id. Missed cues apply with no animation. SSE from the Worker does the same job with `Last-Event-ID` for clients that cannot hold a socket. The Worker asks the match object for the snapshot. It does not read `script` or `match_events` on behalf of an anonymous client.
- Results stay sealed until `status = 'complete'`. Public SQL lists columns and returns `winner_id` and `outcome` only in that state. `GET /trace` stays 404 until then. Push and the Tower wait for `complete`.

The browser never receives a D1 binding. Every public handler is an explicit column list. That list is what keeps sealed columns private.

## Auth and profiles

Product accounts are [Better Auth](https://www.better-auth.com/) on the D1 binding (`database: env.DB`). That covers public sign-up, sessions, and email verification for founders and spectators. Better Auth 1.5 and later accept the binding directly and use `batch()` because D1 has no interactive transactions.

`profiles.user_id` is the Better Auth user id. Roles are `spectator`, `founder`, `host`, `vc`. A sign-up hook inserts `profiles`, then `wallets` at S$1,000, in one batch so the wallet's foreign key holds. The hook is idempotent on `user_id`, so a retried batch grants the starting balance once. One account per verified email.

Host routes check `profiles.role`. Cloudflare Access may sit in front of the host console as a second gate for operators. Access is not how the public signs up, and it is not the session store.

## Models

A tournament pins one fighter build. The build records a provider and a dated model id for the fighter, the judge, the utility model, moderation, and embeddings. Every fighter in that tournament uses that pin. Demos and tests do not.

| Path | When |
|---|---|
| Fixture replay | Demos, UI work, engine tests. `packages/orchestrator` returns canned outputs keyed by step. No model spend. |
| Workers AI | A real fight whose build names a Workers AI model id on the `AI` binding. |
| External provider | A real fight whose build names a hosted model. Mistral is the hackathon default (Large 4, Small 4, Moderation 2, Embed, Conversations `web_search`). |

[02 Fighter build](02-fight-system.md#the-fighter-build) is the default pin, including the Mistral model ids and the rule that a model retiring before the tournament ends is refused. A Workers AI pin uses the same build slot and the Workers AI catalog for that retirement check. The `$0.25` match estimate in [02](02-fight-system.md#cost-and-time-budget-per-match) is the Mistral Large 4 price. Workers AI prices differ. The budget gate still uses `spent_usd` from `llm_calls`.

Structured outputs use the JSON Schema already generated in `packages/schemas`. The Mistral response-format helper in that package stays. Other providers get the same schema and the same zod check. Schema failure still retries once.

Prompt files in [prompts/](../prompts/) stay. They are the templates the real orchestrator hashes into the build. They were written for the Mistral roles and remain valid for a Workers AI build. Search, moderation, and embeddings are build fields:

- Search caps stay 8 at weigh-in and 3 while scouting. The Mistral path uses built-in `web_search`. A Workers AI path supplies a search tool with the same caps. The researcher template does not change.
- Moderation stays a build field. The hackathon moderator is Mistral Moderation 2.
- Duplicate detection stays cosine similarity above 0.92. The hackathon embedder is Mistral Embed. A Workers AI build names its embedding model. A field is at most 64 ideas, so the Worker computes cosine over stored vectors. Vectorize can come later for search across many tournaments.

External calls may pass through AI Gateway for logs. The build hash covers the model id. The gateway is only the transport.

## Repo layout (planned)

```
apps/
  web/              Worker: API, Better Auth, assets, cron bridge
packages/
  schemas/          Zod and generated JSON Schema (already in the repo)
  engine/           Pure bracket, scoring, HP, tiebreak, director (already in the repo)
  orchestrator/     Model steps, plus fixture replay for demos and tests
  prompts/          Templates loaded by content hash (today: /prompts)
  arena/            PixiJS renderer. Input: broadcast script.
evals/
  suites/
  reports/
```

`packages/orchestrator` fixture replay is the path that lets the UI and the harness run with no provider configured. A recorded step is the same shape as `llm_calls` plus the compute-log event. The agent writes it under the step key and moves on.

## Not built yet

Deferred until a later change, on purpose:

- The Worker, wrangler config, D1 migrations, and the React client.
- `packages/orchestrator` itself, including the fixture player.
- Better Auth wiring, Access on the host console, Queues, Cron, and the three agent classes.
- CI deploy.
- A real model call. Until that exists, stage demos run on fixtures.
