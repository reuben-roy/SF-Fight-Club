# SF Fight Club

Startup ideas enter the ring. One gets the belt.

A single-elimination tournament for San Francisco startup ideas, built at the Mistral AI hackathon. Every idea gets a fighter. Every fighter is the same agent with the same model, prompt, tools and budgets, so the only thing that differs is the idea. Fighters research, then argue across three rounds (Market, Moat, Execution). A position-swapped judge panel scores both ideas on a nine-criterion rubric, and those scores drive the health bars. Ballistas fly, shields pop, somebody gets K.O.'d, and the winner climbs the Tower. Every hit links to a receipt: the argument, the judge's reasoning and the sources.

## Status

Design and groundwork. Shared contracts live in `packages/schemas`. Fight math lives in `packages/engine`. `packages/orchestrator` replays canned model fixtures into a sealed match and a broadcast script, so the arena can be built without a live model API. No app yet.

## What's here

| Path | What it is |
|---|---|
| [docs/01-product.md](docs/01-product.md) | The idea, personas, core loop, fairness story, phases, open decisions |
| [docs/02-fight-system.md](docs/02-fight-system.md) | Match format, volleys, fact-checks, scores to HP math, outcomes, tiebreaks, broadcast |
| [docs/03-evals.md](docs/03-evals.md) | The rubric with anchors and caps, judge protocol, bias controls, the judge-the-judge harness |
| [docs/04-architecture.md](docs/04-architecture.md) | Stack, repo layout, compute log, orchestrator pipeline, data model, API, sealing |
| [docs/05-ui.md](docs/05-ui.md) | Mistral-derived design tokens, the Tower, the arena, weapons, choreography, film room |
| [docs/06-betting-and-vc.md](docs/06-betting-and-vc.md) | Play-money parimutuel betting, and the v2 VC panel |
| [docs/07-edge-cases.md](docs/07-edge-cases.md) | Edge-case register with decided, proposed and open items |
| [schemas/contracts.ts](schemas/contracts.ts) | Types for every LLM output, the compute log and the broadcast script. Plain TypeScript, no dependencies. |
| [schemas/rubric.vc-default.json](schemas/rubric.vc-default.json) | The default rubric, machine-readable |
| [packages/schemas](packages/schemas) | `@sf-fight-club/schemas`. Zod parsers for those contracts, plus committed JSON Schema for Mistral structured outputs. |
| [packages/engine](packages/engine) | `@sf-fight-club/engine`. Pure bracket, scoring, HP, tiebreak, and director. No I/O. |
| [packages/orchestrator](packages/orchestrator) | `@sf-fight-club/orchestrator`. Fake orchestrator. Replays committed JSON fixtures through the match pipeline into a compute log and director script. |
| [prompts/](prompts/) | Prompt templates for every agent role |
| [prototype/arena.html](prototype/arena.html) | Standalone visual prototype of the arena and the Tower. Open it in a browser. |

## Workspace

pnpm workspaces. From the repo root:

```bash
pnpm install
pnpm test
pnpm build
```

`pnpm test` typechecks every package and runs its unit tests. `pnpm --filter @sf-fight-club/schemas generate` rewrites the committed JSON Schema in `packages/schemas/generated`.

## The one idea to keep in your head

The health bars are the evaluation. The final HP gap equals the gap in weighted rubric scores, scaled for drama. Animation never decides anything.
