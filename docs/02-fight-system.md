# 02. Fight system

This doc defines what a match is, how it runs, and how scores become health bars. The scoring rubric and judge protocol live in [03-evals.md](03-evals.md). The visuals live in [05-ui.md](05-ui.md).

The design rule that holds everything together:

> The health bars are the evaluation. The final HP gap between two fighters equals the gap in their weighted rubric scores, scaled for drama. Animation never decides anything.

## Vocabulary

| Term | Meaning |
|---|---|
| Idea | What a founder submits. Title, one-liner, description, customer, business model, links. |
| Standard Brief | The idea rewritten into a fixed template and length. Fighters and judges work from this. |
| Dossier | Neutral research on one idea, built once per tournament at weigh-in. |
| Evidence locker | The list of sources (URL, title, snippet, retrieval time) a dossier or scouting step collected. Each item has an ID like `E12`. Fighters may only cite these IDs. |
| Fighter | An idea bound to the shared fighter build for one tournament. |
| Fighter build | The frozen agent config. Same for every fighter. Hashed. |
| Match | Two fighters, three rounds, one winner. |
| Round | One cluster of three rubric criteria. |
| Volley | One fighter's turn inside a round. Each round has two volleys per fighter. |
| Shot | One argument inside a volley. A volley has 2 to 4 shots. Shots are what the arena animates. |
| Compute log | Append-only record of everything the engine did for a match. The source of truth. |
| Broadcast script | The animation timeline derived from the compute log by the director. |

## The fighter build

One build per tournament, frozen when the host creates the tournament. Its hash shows on every fighter card.

| Item | Default |
|---|---|
| Fighter model | Mistral Large 4, pinned to a dated model ID. Resolve it from `GET /v1/models` at tournament creation and refuse any model with a retirement date before the tournament ends. |
| Judge model | Same model, temperature 0. |
| Utility model | Mistral Small 4 for fact-check entailment, the announcer and summaries. |
| Fighter temperature | 0.6 |
| `random_seed` | Derived per call: `hash(match_seed, step_key, fighter_slot)`. Logged. |
| Research budget (weigh-in) | 8 web searches, keep the best 12 evidence items. |
| Scouting budget (per match) | 3 web searches, keep the best 4 evidence items. |
| Volley cap | 180 words total, 2 to 4 shots, 60 words per shot. |
| Sudden death closing cap | 120 words. |
| Tools during volleys | None. Fighters argue from the briefs, both dossiers and their own scouting. |
| Prompts | `prompts/fighter.md` and friends, by content hash. |
| Rubric | Preset ID and version, by content hash. |

`build_hash = sha256(canonical_json({models, params, budgets, prompt_hashes, rubric_hash, engine_version}))`. Show the first 6 hex chars in the UI.

Cosmetics never touch scoring. Sprite, archetype and weapon skins come from the idea and the fighter's sprite seed. Which fighter stands on the left is drawn from `match_seed`, not from seed number. Left stays orange and right stays blue.

## Match lifecycle

```
scheduled -> betting_open -> locked -> computing -> sealed -> airing -> complete
                                           |
                                           +-> failed -> (retry) computing
                                           +-> void (refund bets)
```

Special outcomes skip compute: `BYE` (no opponent) and `WALKOVER` (opponent withdrawn or disqualified).

### Sealed broadcast

We compute the whole match before anyone sees it.

1. The bell rings. The match moves to `locked`. The server rejects any bet with a server timestamp after the lock.
2. The engine computes the match (`computing`). Typical time is 60 to 120 seconds. Matches in the same Tower row compute in parallel, limited by API rate limits.
3. The result is written and the match is `sealed`. Nothing about the result is served to clients yet.
4. The host airs it (or it auto-airs on schedule). The server records `air_started_at` and streams broadcast cues to everyone on one shared clock.
5. When the script ends, the match is `complete`. Bets settle, the trace unlocks, the winner climbs.

Locking bets before compute is what protects betting. Nobody, including admins, can know a result while its bets are open. Sealing the result until air time is about spoilers, which matters for the room but not for money.

While computing, the arena plays the pre-fight: fighters walk in, the tale of the tape, the crowd. If compute finishes early, the match waits for the host. If the host airs a match that is still computing, the pre-fight loops with a "judges are deliberating" card.

On the web, more than one match may air at once. Each match page has its own clock. Arena Mode airs one match at a time.

Live compute (streaming the fight as the LLM writes it) is out of scope. It stalls on slow calls and the HP scaling below needs the final totals.

## Match phases

```
1. Scouting        (both fighters, in parallel)
2. Round 1  MARKET     volley 1 (both, blind) -> fact-check -> volley 2 (both) -> fact-check -> judge x2
3. Round 2  MOAT       same
4. Round 3  EXECUTION  same
5. Resolve         scores -> outcome -> (sudden death if drawn)
6. Report          fight report, announcer lines
7. Direct          broadcast script
```

### 1. Scouting

Each fighter reads the opponent's brief and dossier summary, then runs up to 3 web searches looking for the opponent's weak spots (failed predecessors, strong incumbents, regulatory traps). It keeps up to 4 evidence items. Those items join the match's evidence locker, tagged with who found them. Budgets are identical.

### 2 to 4. Rounds

| Round | Name | Criteria (weight) | Signature weapons |
|---|---|---|---|
| 1 | MARKET | Problem severity (15), Market size (12), Willingness to pay (8) | Flame lance, ballista, coin cannon |
| 2 | MOAT | Differentiation (12), Defensibility (10), Why now (10) | Laser rifle, trebuchet, clockwork railgun |
| 3 | EXECUTION | Go-to-market (12), Feasibility (11), Venture scale (10) | Gatling gun, rocket, orbital beam |

Weights come from the rubric preset and sum to 100. These are the VC Default weights. Round totals are 35, 32 and 33.

Each round runs two volleys per fighter, written simultaneously.

**Volley 1, pitch and strike.** Each fighter sees both briefs, both dossiers, its scouting, the round's criteria and the match so far. It does not see the other fighter's volley 1. It writes 2 to 4 shots, each one of:

- `pitch`: a claim for its own idea on one criterion.
- `attack`: a claim against the opponent on one criterion.

**Volley 2, counter.** Each fighter now sees the other's volley 1. It writes 2 to 4 shots, each one of:

- `defense`: a response to a specific opponent shot from volley 1 (`responds_to` is required).
- `attack` or `pitch`: pressing the case.

Every shot names one criterion from the current round, lists evidence IDs it relies on, or sets `estimate: true` if it is reasoning without a source. See the schema in [schemas/contracts.ts](../schemas/contracts.ts). A shot that names a criterion from another round is dropped and logged. A `defense` whose `responds_to` does not name a real volley-1 shot is treated as a `pitch` on the same criterion. If a fighter argues the wrong idea or confuses the two sides, the judge scores the ideas, not the confusion. A validator checks that every shot names a criterion and a target, and logs a warning when it does not.

Simultaneous volleys remove first-mover and last-word advantages. The arena still alternates shots for drama, but nobody wrote in response to a shot they hadn't seen.

### Fact-check

Runs after each volley, before judging. Two layers:

1. **Mechanical, in code.** Every cited evidence ID must exist in the match's locker. A citation to an ID that doesn't exist is a confirmed fabrication. No LLM needed.
2. **Entailment, utility model.** For each shot with citations, check whether the cited snippets support the claim. Verdicts are `supported`, `partial`, `unsupported`, `contradicted`. A `contradicted` verdict on a specific number (the snippet says 2M users, the shot says 20M) is a confirmed fabrication. Other verdicts are passed to the judge as evidence quality, not penalties.

Each confirmed fabrication costs the shooter a backfire penalty of 1.5 score points (on the 100-point scale), capped at 3 penalties per fighter per match. In the arena the weapon jams and blows up in the shooter's face with a "FACT-CHECKED" stamp.

### Judging

After both volleys, the judge scores the round. Full protocol in [03-evals.md](03-evals.md#round-judging). The short version:

- The judge sees "Fighter 1" and "Fighter 2". No names, corners, seeds, odds or crowd data.
- It runs twice per round, once with A as Fighter 1 and once with B as Fighter 1.
- For each of the round's three criteria, it scores both ideas 0 to 10 against anchored descriptions, writing the rationale before the score.
- It also gives a verdict and impact for every shot. Shot verdicts only drive animation. Criterion scores drive the result.
- The two orders are averaged per criterion. If they disagree badly, the round is flagged (see stability below).

## From scores to an outcome

All of this is plain deterministic code in `packages/engine`. No LLM involvement.

### Per-criterion damage

For each criterion `c` with weight `w_c` and debiased scores `s_A(c)`, `s_B(c)` in `[0, 10]`:

```
dmg_to_B(c) = w_c * max(0, s_A(c) - s_B(c)) / 10
dmg_to_A(c) = w_c * max(0, s_B(c) - s_A(c)) / 10
```

Only the weaker side on a criterion takes damage from it. Equal scores deal nothing ("CLASH").

Total raw damage taken:

```
D_A = sum_c dmg_to_A(c) + 1.5 * fabrications_A
D_B = sum_c dmg_to_B(c) + 1.5 * fabrications_B
Delta = D_B - D_A
```

`Delta` is exactly the difference in weighted rubric totals (on a 100-point scale) after backfire penalties. Positive means A is ahead. This identity is the reason the fight is explainable: the fighter that lost more health had the weaker idea by the rubric, and by exactly how much.

### Stability check

Compute `Delta_AB` and `Delta_BA` from each judge order on its own.

- **Stable**: both have the same sign. Use `Delta` (the mean).
- **Split**: opposite signs and both `|Delta_order| >= 1.5`. The judge changed its mind based on presentation order. Send the match to sudden death no matter how big the mean is.
- **Wobbly**: opposite signs but at least one `|Delta_order| < 1.5`. Treat as stable and use the mean.

### Outcome kinds

| Condition | Outcome | Loser ends at | Banner |
|---|---|---|---|
| Split, or `|Delta| < 1.5` | `SUDDEN_DEATH` | 0 after the final blow | "SUDDEN DEATH" |
| `1.5 <= |Delta| < 10` | `DECISION` | 12 HP | "DECISION" (unanimous if both orders agree with `|Delta_order| >= 1.5`, else majority) |
| `|Delta| >= 10` | `KO` | 0 HP | "K.O." |
| Winner took zero damage | adds `PERFECT` | | "PERFECT" |

The thresholds (`DRAW_MARGIN = 1.5`, `KO_MARGIN = 10`, `DECISION_FLOOR = 12`, `BACKFIRE = 1.5`, `BACKFIRE_CAP = 3`) live in the rubric preset so a host can tune them before the tournament. They are frozen with the build.

One fighter still advances when both ideas score badly. If both weighted rubric totals are under 30, the outcome banner also reads PYRRHIC VICTORY.

### HP scaling

Raw damage is in rubric points. HP is 100 per fighter. Scale by one factor `lambda` per match so the loser lands exactly where the outcome says.

```
KO:            lambda = 100 / D_loser
DECISION:      lambda = (100 - 12) / D_loser
SUDDEN_DEATH:  lambda = (100 - 6) / max(D_A, D_B)     (both end round 3 at >= 6 HP)
               if max(D_A, D_B) == 0: lambda = 0       (both at 100, one-hit finish)

HP_after(X) = 100 - lambda * (damage X has taken so far)
```

The winner's remaining HP is `100 * (1 - D_winner / D_loser)` in a K.O. A blowout leaves the winner near full health. A close fight leaves the winner limping. That is the fighting-game feel, and it is read straight off the scores.

`lambda` differs per match, so raw damage numbers aren't comparable across matches. The receipts show the rubric points next to the HP so nobody needs them to be.

Rounding: keep floats internally. Display integers. Assign rounding remainders with the largest-remainder method so displayed damage sums exactly to displayed HP loss, and the loser shows 0 (or 12) at the end, never 1 or -1.

### Tiebreak cascade

When the outcome is `SUDDEN_DEATH`, run the cascade. It is an ordered list in config so phase 2 can turn on the VC panel without touching code.

```ts
tiebreakers: ["sudden_death_judge", "vc_panel" /* disabled until v2 */, "weighin_total", "seed"]
```

1. **Sudden death judge.** Each fighter writes one closing volley (120 words, blind, simultaneous): why its idea should advance over the other, given the whole match. A forced-choice judge must pick one. It runs four times: both orders, two samples each (temperature 0.5, different seeds). Three or four votes for one side wins.
2. **VC panel** (v2). Two-two goes to the VC panel. See [06-betting-and-vc.md](06-betting-and-vc.md#vc-tiebreaks).
3. **Weigh-in total.** Higher absolute weigh-in score wins if the gap is at least 0.5 points.
4. **Seed.** Higher seed (lower number) wins. Seeds are unique, so this always resolves.

Every step that ran is in the trace with its reasoning. The UI says which step decided it ("Decided by: sudden death judge, 3 to 1").

## Worked example

PermitPilot (A, an AI agent that files and chases SF building permits) vs Fogcast (B, microclimate forecasts for SF outdoor businesses). Debiased scores after three rounds:

| Round | Criterion | w | A | B | to B | to A |
|---|---|---|---|---|---|---|
| 1 | Problem severity | 15 | 8.5 | 6.0 | 3.75 | |
| 1 | Market size | 12 | 7.0 | 4.5 | 3.00 | |
| 1 | Willingness to pay | 8 | 7.5 | 5.0 | 2.00 | |
| 2 | Differentiation | 12 | 6.0 | 7.0 | | 1.20 |
| 2 | Defensibility | 10 | 6.0 | 6.0 | clash | clash |
| 2 | Why now | 10 | 7.0 | 6.5 | 0.50 | |
| 3 | Go-to-market | 12 | 6.5 | 4.0 | 3.00 | |
| 3 | Feasibility | 11 | 5.0 | 7.5 | | 2.75 |
| 3 | Venture scale | 10 | 7.0 | 3.5 | 3.50 | |

Fogcast cited a "40% of Mission restaurants lose $10k a year to weather" stat in round 3 against an evidence ID that doesn't exist. One backfire, 1.5 points.

```
D_B = 3.75 + 3.00 + 2.00 + 0.50 + 3.00 + 3.50 + 1.5 = 17.25
D_A = 1.20 + 2.75 = 3.95
Delta = 13.30  -> KO (>= 10)
Check: weighted totals 67.65 vs 55.85 - 1.5 = 54.35, gap 13.30
lambda = 100 / 17.25 = 5.797
```

| After | PermitPilot HP | Fogcast HP |
|---|---|---|
| Start | 100 | 100 |
| Round 1 | 100 | 49 |
| Round 2 | 93 | 46 |
| Round 3 | 77 | 0 (K.O.) |

The story the arena tells: PermitPilot wins the market round in a landslide, Fogcast claws back differentiation and feasibility, then gets fact-checked and goes down in round 3. Every one of those beats links to a receipt.

## From an outcome to a broadcast

The director turns the compute log into cues. It is a pure function: `script = direct(compute_log, director_version, presentation_seed)`. Replays look identical. If we improve the director, old matches can be re-rendered without re-running any LLM calls.

### Distributing damage onto shots

The judge gives each shot a verdict (`landed`, `partial`, `glancing`, `parried`, `whiff`) and an impact from 0 to 3. Criterion damage gets spread over the shots that earned it:

```
for each criterion c in the round, for the side X that takes damage on c:
  carriers = pitch or attack shots by X's opponent on c
             where verdict in {landed, partial} and not fabricated
             (defense shots never carry damage)
  weight(shot) = impact * (1.0 if landed else 0.5)
  if carriers is empty or total weight is 0:
      emit one JUDGES_HAMMER cue at round end carrying all of dmg_to_X(c) * lambda
  else:
      split dmg_to_X(c) * lambda across carriers by weight
```

Shots that carry no damage still animate:

| Case | Visual | Damage |
|---|---|---|
| Opponent's defense neutralized it | Shield pops, "PARRIED" | 0 |
| Shot landed, but the shooter's side lost this criterion anyway | "GLANCING", sparks off armor | 0 |
| Judge says the point was irrelevant or wrong | Projectile sails past, "MISS" | 0 |
| Confirmed fabrication | Weapon jams and explodes on the shooter, "FACT-CHECKED" | `1.5 * lambda` to the shooter |

Defenses are written in volley 2 but answer volley 1 shots. The director plays the shield at the moment the attack it answers arrives, with the defense text as the subtitle. Volley 2 then plays only attacks and pitches. It reads better and stays true to the content.

### Cue ordering

Per round: round title card, volley 1 shots alternating A and B in shot order, volley 2 shots alternating, then judges' hammer cues, then the round scorecard (criterion by criterion, AB and BA scores). After round 3: outcome banner, sudden death if any, finisher, winner pose, climb animation.

Shot timing and weapon choice are in [05-ui.md](05-ui.md#arena-choreography).

## Brackets

- Sizes 2 to 64. A field larger than 64 is refused. Qualifiers run as separate tournaments. Round up to the next power of two. Byes go to the top seeds.
- Seeding modes: `weighin` (default, standard 1 vs N layout so seeds 1 and 2 can only meet in the final) or `random` (seeded RNG, logged). If every entrant has the same weigh-in total, `weighin` seeding falls back to a random draw from a logged seed.
- A bye is outcome `BYE`. The fighter skips a step of the Tower with no match computed and no bets offered.
- A withdrawal or disqualification after the bracket is published gives the opponent a `WALKOVER`. Bets on that match are void. That includes a match already `sealed` but not yet aired: the sealed result is not aired, the opponent gets the walkover, and bets on that match are void.
- Disqualifying a fighter who already won a `complete` match gives their next opponent a walkover. Those completed results stand, and bets on them stay settled.
- No re-seeding between rounds.
- Rounds air in order. A match can only compute once both of its feeder matches are `complete` (or `sealed`, if the host wants to precompute a whole row).

## Cost and time budget per match

Rough numbers with Mistral Large 4 at $0.70 per million input tokens and $2.10 per million output tokens.

| Step | Calls | Tokens in | Tokens out |
|---|---|---|---|
| Scouting | 2 | ~30k | ~3k |
| Volleys | 12 | ~100k | ~6k |
| Fact-check (Small 4) | ~24 | ~25k | ~3k |
| Judging | 6 | ~80k | ~10k |
| Report and announcer | 2 | ~20k | ~2k |
| **Total** | ~46 | ~255k | ~24k |

About $0.25 per match. A 16-idea tournament (15 matches plus 16 weigh-ins) costs a few dollars. Wall time per match is 60 to 120 seconds with volleys and judge orders running in parallel. Rate limits, not money, are the constraint. The orchestrator needs a concurrency limiter and backoff on 429s.
