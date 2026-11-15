# 09. Battle revamp

The prototype is hard to watch. Two 30-pixel mechs stand at opposite edges of the screen and trade projectiles. Nothing tells you whose turn it is, what was just argued or why the bar moved. The bracket is a plain bracket. Entrants have no identity.

This doc is the design for fixing that. It covers five things: turn-based battles, characters, the org chart, entrant intake from X and Hacker News, and the first real web app. It ends with the work split.

Where this doc and [schemas/contracts.ts](../schemas/contracts.ts) disagree, contracts win. Every task below lands its contract changes first.

## What does not change

Every invariant in [AGENTS.md](../AGENTS.md) holds. Three matter most here.

- The health bars are the evaluation. Turns, moves, statuses, crews and clout are presentation. None of them changes a damage number.
- Judges never see identity. Founder names, handles, follower counts, posts and clout never enter a fighter or judge prompt.
- Results stay sealed until a match is `complete`. The org chart only moves on complete matches.

## 1. Turn-based battles

People already know how a turn-based battle reads. One side picks a move, the move plays, the game says how well it worked, the bar drops, the other side goes. We present each shot as one turn in that shape, with our own moves, text and look.

The match format in [02-fight-system.md](02-fight-system.md) stays as it is. Volleys are still written blind and simultaneously. The director already alternates shots between A and B. A turn is one `shot` cue.

### Moves

Every shot is a named move. The name comes from the shot's criterion and type, from a fixed table in the engine.

| Criterion | Element | Pitch | Attack | Defense |
|---|---|---|---|---|
| problem | market | Hair on Fire | Nice to Have | Pain Receipt |
| market | market | Bottom-Up TAM | Niche Trap | Adjacent Market |
| wtp | market | Signed LOI | Free Alternative | Budget Line |
| differentiation | moat | Ten Times Better | Feature Not Product | Side by Side |
| moat | moat | Compounding Data | Weekend Clone | Switching Cost |
| timing | moat | Why Now | Too Early | Tailwind |
| gtm | execution | First Hundred | CAC Spiral | Channel Lock |
| feasibility | execution | Shipped Demo | Science Project | Proof of Build |
| scale | execution | Platform Play | Lifestyle Business | Second Act |

The element is the round: `market`, `moat` or `execution`. Each element has a color and a pixel icon (coin, wall, rocket), so color is never the only cue. The nine weapons in [05-ui.md](05-ui.md#weapons-by-criterion) stay as the move's attack effect.

### Turn sequence

One turn at 1x speed takes at least 3600 ms. Captions still set the pace.

| Step | Time | What the viewer sees |
|---|---|---|
| Turn start | 300 ms | Spotlight swings to the actor. The other side dims to 55%. The turn strip advances. "TURN 7" and the actor's name in the HUD. |
| Menu | 600 ms | The command deck shows the actor's moves for this volley (2 to 4). A cursor steps to the chosen move and presses it. |
| Call-out | 900 ms | The narration box types "PermitPilot used BOTTOM-UP TAM!". The shot headline appears in a speech bubble over the actor with its evidence chips. Camera pushes in 1.15x on the actor. |
| Attack | 150 to 1100 ms | The actor winds up and lunges. The weapon effect travels. Camera follows it to the target. |
| Impact | 400 ms | Hit-stop, shake, damage number, ghost drain on the bar. The receipt row slides into the receipts panel. |
| Verdict | 900 ms | The narration box types the verdict line. |

Verdict lines, by cue outcome:

| Outcome | Line |
|---|---|
| `crit` | "DIRECT HIT. The judges bought all of it." |
| `hit` | "It landed." |
| `partial` | "Partly landed." |
| `parried` | "{target} answered with {DEFENSE MOVE}." |
| `glancing` | "Fair point. {target} still wins {criterion}." |
| `whiff` | "The judges did not move." |
| `backfire` | "FACT-CHECKED. It blew up in {actor}'s hands." |

The menu is theater and the UI says so. The match is sealed, so nobody chooses anything at air time. The menu lists the moves the fighter wrote for that volley. That is honest, and it also previews what is coming.

### Statuses

Three cosmetic statuses, derived by the director from the cue sequence.

| Status | Starts when | Ends when |
|---|---|---|
| `momentum` | A fighter deals damage on two of its turns in a row without taking damage in between | It takes damage or the round ends |
| `exposed` | A fighter is fact-checked | End of match |
| `last_stand` | A fighter's display HP is 25 or lower and it is still standing | End of match |

Statuses show as badges beside the HP bar and tint the fighter. They never touch damage. A test asserts that the `hpAfter` values of a script are identical with status cues removed.

### Contract changes

In `schemas/contracts.ts`, mirrored in `packages/schemas`:

```ts
export type MoveElement = "market" | "moat" | "execution";

export interface Move {
  name: string; // from the table above
  element: MoveElement;
  criterion: CriterionId;
  type: ShotType;
}

export type FighterStatus = "momentum" | "exposed" | "last_stand";
```

The `shot` cue gains required fields:

```ts
turn: number;        // 1-based, counts shot cues across the whole match
volley: 1 | 2;
move: Move;
menu: Move[];        // the shooter's moves in this volley, in shot order, includes `move`
verdictLine: string; // from the table above, names filled in
```

The `parry` object on a shot cue gains `move: Move` for the defense.

A new cue:

```ts
| (CueBase & { kind: "status"; target: Slot; status: FighterStatus; on: boolean })
```

The `intro` cue's fighter records gain `category: string`, copied from the Standard Brief. `DirectorFighter`, `FighterInput` and `PublicFighter` gain the same field.

`HOLD.shot` becomes 3600. `DIRECTOR_VERSION` becomes `"2"`. Version 1 is dropped, since no stored matches exist.

Pure helpers exported from the engine: `moveFor({ criterion, type })`, `elementOf(criterion)`, `verdictLine(...)`.

## 2. Characters

Each startup fights as a mascot. Mascots are procedural pixel art, built from the sprite seed and the idea's category. No image files.

### Classes

The category maps to one of eight classes. Unknown categories hash to a class.

| Class | Categories | Silhouette |
|---|---|---|
| Clerk | proptech, civic, govtech, legal | Tall figure with a visor and an oversized rubber stamp |
| Gale | climate, energy, weather | Bird-like body with turbine wings |
| Vault | fintech, payments, insurance | Squat safe on legs with a dial for an eye |
| Daemon | devtools, infra, ai, security | Small imp with a terminal for a head |
| Courier | marketplace, logistics, commerce | Lean runner with a crate backpack |
| Medic | health, bio, wellness | Rounded body with a cross antenna and scanner arm |
| Rig | hardware, robotics, mobility | Wide tracked machine with a crane arm |
| Chatter | consumer, social, media, education | Speech-bubble head on a small body with antennae |

Rules for the art:

- Native grid 48x48, drawn at 2x on the 480x270 stage. A mascot is about 96 px tall on a 270 px screen. The prototype's mechs were about 30.
- A class must read from its silhouette alone. Fill the sprite with one flat color. If you can't tell the eight apart, redraw them.
- The seed varies proportions, one of three body variants, an accent hue, eyes and one accessory. Two fighters of the same class must still look different.
- Corner color (orange left, blue right) goes on trim, the banner and a base plate. The body keeps its own accent, so identity survives a corner swap.
- States: idle (4 frames), windup, lunge, hurt (recoil plus one white frame), guard, staggered below 50 HP, critical below 25 HP, K.O. (dissolve into pixels carried off by wind), victory hop.

### Crew

The people behind the idea stand behind their mascot as a crew of 1 to 4 small pixel figures (12x16), generated from each founder's handle. They react: cheer on a hit, flinch on a backfire.

A founder with a profile photo also gets a pixel portrait made from it (section 4). The portrait is the founder's face on the fighter card and in the crew roll call at walk-in, and four colors pulled from it (`portraitTraits`) become the head of that founder's crew figure, painted from a 10x10 template. A founder with no photo keeps the fully generated figure. We never show the photo itself.

When a fighter wins, the loser's crew crosses the stage and joins the winner's side. In later matches the winner walks in with everyone it has absorbed. This is the org chart, visible in the arena.

### Clout

Each entrant has a clout score from 0 to 100, computed at intake from public follower and engagement numbers (see section 4). It appears on the fighter card and sets the crowd size on that side of the arena. It changes nothing else. It does not seed, does not score and never reaches a prompt.

## 3. The org chart

The Tower becomes an org chart. Beat a company and you acquire it. The loser reports to the winner. The champion ends as CEO with every other entrant somewhere beneath it.

### Rules

- Every entrant starts as the head of its own company.
- When a match completes, the loser becomes a direct report of the winner. The loser keeps its own reports, so whole sub-orgs move together.
- Titles come from a fixed ladder: Intern, Associate, Manager, Director, VP, President, CEO. A tournament with `k` rounds uses the top `k + 1` rungs. An 8-entrant field starts everyone at Director. Each advance moves a fighter up one rung. A fighter that loses keeps the title it held.
- A bye advances a fighter one rung and adds no report.
- A walkover advances the winner. The absent entrant is listed as its report, marked `WALKOVER`.
- Headcount is the size of a fighter's subtree, itself included.
- Only `complete` matches change the chart. A sealed, computing or airing match looks the same as an unplayed one.

In a finished 8-entrant tournament the CEO has three direct reports: the President it beat in the final, the VP it beat in the semis and the Director it beat in the openers.

### Engine

A new pure module, `packages/engine/src/orgchart.ts`.

```ts
export type OrgTitle = "Intern" | "Associate" | "Manager" | "Director" | "VP" | "President" | "CEO";

export interface OrgNode {
  entrantId: string;
  seed: number;
  title: OrgTitle;
  wins: number;             // fights won, byes excluded
  headcount: number;
  alive: boolean;
  defeatedBy: string | null;
  defeatedInRound: number | null; // roundIndex
  via: "FIGHT" | "WALKOVER" | null;
  reports: OrgNode[];       // most recent acquisition first
}

export interface OrgChart {
  rounds: number;
  roots: OrgNode[];         // alive fighters, in bracket order left to right
  championId: string | null;
}

export function buildOrgChart(input: { bracket: Bracket; resolutions: readonly SlotResolution[] }): OrgChart;
```

`resolutions` is the output of `resolveBracket`. Only `COMPLETE`, `BYE` and `WALKOVER` entries have an effect. Add these types to contracts.

Property tests, across field sizes 2 to 64 and random results:

- Every entrant appears exactly once.
- Root headcounts sum to the field size.
- A node's `wins` equals its `FIGHT` reports.
- There is a `championId` exactly when the final is complete, and that root's title is CEO.
- Changing any `SEALED` or `PENDING` resolution's winner does not change the chart.

### The Tower screen

- Roots sit on the top row in bracket order. Each root's reports hang below it as a tidy tree with stepped connectors.
- Two adjacent roots that meet next are joined by a VS link with the match status pill: `BETTING OPEN`, `LOCKED`, `LIVE`, `FINAL`.
- A tile shows the mascot, name, title badge, headcount and clout. Eliminated tiles are greyed with a small "ACQUIRED BY" line.
- When a match completes, the acquisition plays: the loser's tile and its whole subtree slide under the winner, the winner's title badge flips to the next rung, headcount counts up, stripe confetti. About 2.5 s.
- A bracket toggle shows the classic vertical bracket for people who want it.
- The champion's tile gets the belt and the full company chart under it.

## 4. Entrant intake

A new package, `packages/intake`, builds an entrant from public posts. It has network I/O, so `fetch` and the clock are passed in and tests run on recorded responses.

### Sources

| Source | How | Auth |
|---|---|---|
| Hacker News | The public Algolia HN Search API for items and search, plus its user endpoint for karma | None |
| X | The official X API v2. User lookup with public metrics, recent posts by user, single post lookup. | Bearer token from `X_BEARER_TOKEN` |
| Company site | One GET of the homepage. Read `<title>`, meta description and Open Graph tags. | None |

We use official APIs only. No scraping of X. If `X_BEARER_TOKEN` is unset, the X adapter is skipped with a warning and the rest still runs. Check the current X and Algolia docs before coding against them. Don't rely on memory for endpoints or field names.

### Output

```ts
export interface EntrantProfile {
  entrantId: string;
  company: { name: string; url?: string; tagline?: string; logoUrl?: string; location?: string };
  founders: {
    name: string;
    role?: string;
    xHandle?: string;
    hnUser?: string;
    followers?: number;
    hnKarma?: number;
    avatarUrl?: string;      // the source photo, kept for provenance, never rendered
    portrait?: PixelPortrait;
  }[];
  posts: {
    source: "x" | "hn" | "web";
    url: string;
    title?: string;
    text: string; // <= 1000 chars
    postedAt?: string;
    metrics: { likes?: number; reposts?: number; replies?: number; views?: number; points?: number; comments?: number };
  }[];
  clout: { score: number; tier: "S" | "A" | "B" | "C"; x: number; hn: number };
  sources: { source: "x" | "hn" | "web"; url: string; retrievedAt: string }[];
}
```

`posts` holds the entrant's own launch posts. They are where the idea details come from. The platform carries no advertising and has no ad support. `clout.score` is a pure function of followers, karma and post engagement on a log scale, from 0 to 100.

Two outputs per entrant, kept apart:

1. `EntrantProfile`. Shown on cards, the Tower and in the arena. Never in a prompt.
2. An `IdeaSubmission` draft built by `toSubmission(profile)`. This is the only thing that enters the existing brief pipeline. It must not contain a founder name or handle. A test asserts this on every fixture.

Post text is untrusted input. It goes through the same moderation and injection screening as a typed submission. Intake does not interpret it.

### Pixel portraits

A new pure package, `packages/portrait`, turns a profile photo into pixel art in our style. Intake runs it once and stores the result in the profile, so the web app draws a portrait from data and never fetches a photo.

```ts
export interface PixelPortrait {
  size: 24;            // square, 24x24
  palette: string[];   // 2 to 8 hex colors
  pixels: number[];    // size * size palette indices, row-major
}
```

- Input is decoded RGBA plus width and height. JPEG and PNG decode through pure-JS decoders at the edge of the package. Anything else returns a "no portrait" result and the founder keeps a generated figure.
- Steps: crop to the head, downsample to 24x24 with a box filter, tone-map in OKLab, quantize to at most 8 colors in OKLab, then clean up the grid. The same input always gives the same output.
- The crop is the pipeline's own heuristic, not a face detector. It finds the largest skin-toned region on a coarse grid, prefers one away from the frame border and near the top middle, measures the face width across that region's upper band, and cuts a square about twice that width, lifted so the forehead sits near the top edge. A crop box can be passed instead, so a face detector can be dropped in later without touching the rest. If the resulting subject covers less than 45 percent or more than 90 percent of the frame, the crop is retried at a few other scales and the closest one wins.
- Tone mapping works on OKLab lightness only, weighted toward the center of the frame where the face is, so a bright suit or a dark sky cannot eat the range the face needs. Chroma is untouched, so skin keeps its hue and a black and white photo keeps its midtones.
- Quantizing happens in OKLab with lightness weighted well above hue, which keeps skin as two or three related tones in contiguous areas instead of a patchwork of unrelated colors. Every palette entry must cover at least six pixels.
- Cleanup runs after quantizing, never before it: isolated pixels whose four neighbors all differ are replaced by the majority neighbor, except dark pixels that have a dark partner (eyes, brows, mouth) and are meant to be there; connected components of one or two pixels are folded away; the background is settled to a single palette entry from the frame corners and any background-colored hole inside the subject is repainted; and if the background tone sits too close to the subject, it is pushed apart so the silhouette reads.
- There is no outline by default. A 1px ring painted on the background side of the edge came out as a jagged black halo. The option remains and now paints a continuous contour on the subject's outer edge in the darkest existing palette entry, for anyone who wants the look.
- The result has to read as a face at 24x24 and still look like it belongs next to the mascots. Hard pixels, no blur, a limited palette.
- `portraitTraits(portrait)` distills the portrait into four colors: the dominant skin tone, a darker skin tone, the dominant hair or headwear color from the upper part of the subject, and a clothing color from the lower part. The crew figure generator paints a templated 10x10 head from those (`traitHead`), which is readable where a 10x10 box reduction of the picture is only ever a blur. `reducePortrait` stays exported for anything that genuinely wants a shrunken copy.
- X is deferred until there is an API token. Until then the pipeline is exercised on twelve public-domain sample photos. When the X adapter is live, `avatarUrl` comes from the user's profile image field and nothing else changes.

### CLI

```
pnpm intake --hn <item id or url> --x <handle> --url <site> --out data/entrants/<slug>.json
pnpm intake --from-fixtures   # offline, writes the eight demo profiles
```

## 5. Design language

Keep the Mistral-derived palette, square corners, hard shadows and stripe motif from [05-ui.md](05-ui.md). Add:

- **Element colors.** Market is `--sun-2`. Moat is stone, `#8FA3B8` on night and `#56566C` on paper. Execution is `--sun-5`. Each has a 16x16 pixel icon.
- **Night for the show, paper for reading.** The arena, the Tower and Arena Mode use the night theme. Fighter cards, receipts and the film room use paper.
- **Motion.** Screen changes use a five-band stripe wipe. UI motion uses `steps()` easing so it moves like pixel art. Buttons press into their hard shadow. Narration types out at 40 characters per second.
- **Stage time of day.** Round 1 is sunset, round 2 is dusk with fog on the bay, round 3 is night with lit windows. Sudden death brings the fog in and one spotlight.
- **Parallax.** The skyline is three layers that shift a few pixels with the camera.
- **Type scale.** Pixelify Sans at 64, 40, 28 and 20. Space Mono labels at 11 to 13. Inter body at 15 and 17.
- **Icons.** A 16x16 pixel icon set drawn in code: coin, wall, rocket, shield, gavel, receipt, crown, briefcase, megaphone.
- **Sound.** Short synthesized 8-bit effects through Web Audio, no audio files. Menu tick, select, one sound per weapon, hit, crit, parry, K.O., promotion jingle. Muted by default with a toggle.

`prefers-reduced-motion` and the flash limit in [05-ui.md](05-ui.md#accessibility) still apply to everything above.

## 6. The web app

`apps/web`, built with Vite, React and TypeScript. The arena draws on a 2D canvas at 480x270 with nearest-neighbor scaling. HUD, captions and panels are DOM. No PixiJS or GSAP yet. The prototype shows a 2D canvas is enough at this resolution, and it keeps the dependency list short. This replaces the Next.js choice in [04-architecture.md](04-architecture.md) for the client. The output is static files.

The app runs in demo mode from a JSON bundle that a build script produces by running the fake orchestrator over a canned 8-entrant tournament. The bundle holds every result, so the client plays host and reveals matches one at a time. A real deployment seals results on the server. The demo client must still gate every result behind its own `revealed` state so the screens behave the same way.

### Screens and flow

1. **Home.** Stripe hero, house rules, "Enter the Tower".
2. **Tower.** The org chart. Pick the next match.
3. **Match, pre-fight.** Tale of the tape, both fighter cards, bet slip. "Ring the bell" locks bets.
4. **Match, fight.** The battle. Receipts panel fills as turns air. Controls: play and pause, 1x, 2x, 4x, next turn, and a turn strip you can click to jump.
5. **Match, result.** Outcome banner, the acquisition, "Why did they win?" opens the film room.
6. **Back to the Tower** with the chart updated. Repeat to the champion screen.

### Directory ownership

Each phase 2 task owns its directories and does not edit the others.

| Path | Owner |
|---|---|
| `apps/web/src/art/**` (mascots, crew, icons, effects, sound), `src/styles/**` | Art task, phase 1 |
| `apps/web/src/arena/**` | Arena task |
| `apps/web/src/tower/**`, `src/cards/**` | Tower task |
| `apps/web/src/app/**`, `src/data/**`, `src/film/**`, `src/bets/**`, `scripts/**` | App task |

The scaffold registers one lazy route per directory, each pointing at an `index.tsx` stub. Nobody edits the route registry.

Two exceptions to the table. `src/arena/index.tsx` and `src/tower/index.tsx` are the route entries for `/match/:matchId` and `/tower`. The App task owns those two files and points them at its pages. The Arena and Tower tasks export `ArenaScreen`, `TowerScreen` and `FighterCard` from other files and leave the two entries alone. The prop types below are committed in `src/arena/types.ts`, `src/tower/types.ts` and `src/cards/types.ts`, and no phase 2 task changes them.

The App task builds its pages against a small `src/app/screens.tsx` registry of placeholder screens with the same props. Phase 3 swaps in the real ones.

### Component props

```ts
// src/arena/types.ts
export interface CrewMember { handle: string; name: string; from: string /* entrantId */ }
export interface ArenaFighter {
  entrantId: string; name: string; seed: number; tier: string;
  spriteSeed: string; category: string; title: OrgTitle; clout: number; crew: CrewMember[];
}
export interface ArenaScreenProps {
  script: BroadcastScript;
  fighters: Record<Slot, ArenaFighter>;
  autoplay?: boolean;
  initialSpeed?: 1 | 2 | 4;
  onTurn?: (turn: number) => void;      // fires when a turn's impact has aired
  onComplete?: () => void;              // fires after the winner cue
}

// src/tower/types.ts
export interface TowerEntrant {
  entrantId: string; name: string; spriteSeed: string; category: string;
  oneLiner: string; clout: number; cloutTier: string;
}
export interface TowerMatch {
  matchId: string; roundIndex: number; slotIndex: number;
  a: string | null; b: string | null;   // entrantIds, null until known
  status: "scheduled" | "betting_open" | "locked" | "live" | "complete";
}
export interface TowerScreenProps {
  chart: OrgChart;
  previousChart?: OrgChart;             // when set, animate the difference
  entrants: Record<string, TowerEntrant>;
  matches: TowerMatch[];
  onOpenMatch: (matchId: string) => void;
  onOpenCard: (entrantId: string) => void;
}

// src/cards/types.ts
export interface FighterCardProps {
  entrant: TowerEntrant; profile: EntrantProfile; title: OrgTitle;
  headcount: number; seed: number; tier: string; buildHash: string;
}
```

Each directory also ships a dev route (`/dev/arena`, `/dev/tower`, `/dev/cards`, `/dev/art`) that renders its screen from fixture data with no other screen involved.

## 7. Demo tournament

Eight fictional entrants. All names, founders, handles and numbers are invented. Do not use real people or companies.

| Seed | Id | Name | Category | One-liner | Founders |
|---|---|---|---|---|---|
| 1 | permitpilot | PermitPilot | proptech | AI agent that files and chases SF building permits | Maya Okafor (@mayabuilds), Dev Raman (@devraman) |
| 2 | dermalens | Dermalens | health | Skin-check triage from phone photos for clinics | Dr. Ines Vidal (@inesvidal), Tom Achterberg (@tomach) |
| 3 | flakehunter | FlakeHunter | devtools | Finds and quarantines flaky tests in CI | Priya Nandakumar (@priyaships) |
| 4 | tabclear | TabClear | fintech | Instant bill settlement for bars and group tabs | Jonah Eze (@jonaheze), Clara Whitfield (@clarawhit) |
| 5 | paperroute | PaperRoute | logistics | E-bike courier dispatch for neighborhood shops | Sam Tanaka (@samtanaka) |
| 6 | curbbot | CurbBot | robotics | Sidewalk robot that audits curb ramps for the city | Lena Brandt (@lenabrandt), Oscar Mbeki (@oscarmbeki), Wei Zhou (@weizhou_sf) |
| 7 | looproom | LoopRoom | social | Voice rooms for neighborhood groups | Ravi Kessler (@ravikessler) |
| 8 | fogcast | Fogcast | climate | Microclimate forecasts for SF outdoor businesses | Ana Sorensen (@anasorensen), Bo Lindqvist (@bolind) |

Results the tapes must produce. The engine decides the outcome from the scores, so tune the canned judge scores until each match lands here.

| Match | Winner | Outcome | Notes |
|---|---|---|---|
| Opener, 1 v 8 | PermitPilot | KO | The existing worked example, with the fact-check backfire |
| Opener, 4 v 5 | TabClear | DECISION, unanimous | |
| Opener, 2 v 7 | Dermalens | KO, PERFECT | |
| Opener, 3 v 6 | CurbBot | DECISION, majority | Upset |
| Semi | PermitPilot over TabClear | KO | PermitPilot trails after round 1 |
| Semi | CurbBot over Dermalens | DECISION, unanimous | Upset |
| Final | PermitPilot over CurbBot | SUDDEN_DEATH, 3 to 1 | |

Two upsets in seven matches is 29%, inside the 15% to 35% target.

## 8. Decisions

Settled on November 15, 2026.

1. **Only ideas fight.** Influence mechanics are deferred. Clout shows on cards and sets crowd size, and that is all. It never seeds, scores or reaches a prompt.
2. **X comes later.** The adapter is built and tested on recorded responses. It goes live when there is a bearer token.
3. **No ads.** The platform has no advertising and no ad support.
4. **Founders are pixel figures.** Where a profile photo exists, intake makes a pixel portrait from it. The photo itself is never shown. The host can turn portraits off for an entrant, which falls back to the generated figure.

Still open: whether the org chart or the classic bracket is the default tournament view. The default is the org chart with a bracket toggle.

## 9. Work split

All work lands by pull request into `feat/battle-revamp`. That branch goes to `main` in one final PR.

Phase 1, in parallel:

| Task | Branch | Scope |
|---|---|---|
| Engine | `feat/engine-turns-orgchart` | Sections 1 and 3: contracts, schemas, director v2, org chart, tests. Updates docs 02 and 07. |
| Intake | `feat/intake` | Section 4: `packages/intake`, `EntrantProfile` contract and schema, CLI, fixtures for the eight demo entrants, tests. Updates docs 01, 04 and 07. |
| Demo tournament | `feat/demo-tournament` | Section 7: five new tapes, a reskinned sudden-death final, a tournament runner in `packages/orchestrator`. |
| Art | `feat/web-art` | Sections 2 and 5: `apps/web` scaffold, tokens, mascots, crew, icons, effects, sound, `/dev/art` gallery. Updates doc 05. |
| Portrait | `feat/portrait` | Section 4, pixel portraits: `packages/portrait`, the `PixelPortrait` contract, sample images, a contact sheet. |

Phase 2, in parallel, after phase 1 merges:

| Task | Branch | Scope |
|---|---|---|
| Arena | `feat/web-arena` | Section 1 on screen: the battle, HUD, command deck, narration, receipts panel, controls |
| Tower | `feat/web-tower` | Section 3 on screen: org chart, acquisition animation, bracket toggle, fighter cards |
| App | `feat/web-app` | Demo data build script, app state and host flow, home, pre-fight, bet slip, film room |

Phase 3: wire the three together, end-to-end tests in a real browser, fix what breaks, record the demo video.

### Rules for every task

- Run `pnpm install`, `pnpm test` and `pnpm build` from the repo root before opening a PR. All three must pass. Paste the test summary in the PR body.
- One PR per task, base `feat/battle-revamp`. Conventional commit titles, like `feat(engine): org chart from bracket results`.
- PR body sections: Summary, Invariants (which ones this touches and how they hold), Edge cases, Tests.
- New edge cases go in [07-edge-cases.md](07-edge-cases.md) with the next ID in their section. Mark `Decided` only with a link to the doc or test that specifies it.
- TypeScript: discriminated unions with a literal discriminant, no `any`, no `as` casts except after validation, `unknown` at boundaries with zod parsing, exhaustive `switch` with a `never` check, object arguments over positional ones, no `console.log` in shipped code.
- Tests run real code. Mock only the network.
- Keep comments to the reasons code can't state. No commented-out code.
