# 06. Betting and the VC panel

Betting ships in the MVP. The VC panel ships in v2, but the engine reserves its hooks now so adding it doesn't touch the scoring code.

## Betting

### Ground rules

- Play money only. The currency is **Seed Bucks** (`S$`), stored as integers.
- Every account starts with S$1,000.
- **Bridge round**: once a day, an account below S$100 gets topped up to S$100.
- No purchases, no cash-out, nothing with cash value. Free to play with no money in means there's no "consideration", which keeps us out of California gambling and lottery rules. If anyone wants prizes for top bettors, keep them to swag and get the hackathon organizers to sign off.

### Markets

| Market | Selections | Opens | Locks |
|---|---|---|---|
| Match winner (MVP) | A or B | Host opens betting, or when both fighters are known | The bell, before compute |
| Champion (v1) | Every fighter still in | Bracket published | First match of Floor 1 locks |
| Props (v1) | Yes or No: "Ends in K.O.?", "Anyone fact-checked?", "Goes to sudden death?" | With the match market | With the match market |

No market exists for byes or walkovers.

### Parimutuel pools

All stakes on a market go into one pool. Winners split the pool in proportion to their stakes. There's no rake.

```
P     = total pool (user stakes + house seed)
P_i   = amount on selection i
odds_i = P / P_i                       (decimal odds shown in the UI)
payout(bet on winner i, stake s) = floor(s * P / P_i)
```

Remainders from flooring are burned.

**House seed.** An empty pool shows nonsense odds, and the first bettor on the favorite would get almost nothing back. So every match market opens with S$500 of house money split by a prior from the weigh-in:

```
p_A = 1 / (1 + 10 ^ (-(W_A - W_B) / 15))     W = weigh-in total, 0 to 100
house on A = round(500 * p_A), house on B = 500 - house on A
```

The house seed is in `P` and `P_i` but belongs to no one. When it sits on the winning side, its share of the payout is burned. When it sits on the losing side, it gets paid out to winners. Over a tournament this adds a little money to the economy. That's fine for play money.

Props use a 50/50 house seed. The champion market seeds by `p` from each fighter's weigh-in total, normalized.

### Lifecycle

```
open -> locked -> settled
           \-> void (refund every stake)
```

- **Placing**: `POST /api/bets` with an idempotency key. Server time decides. Stake must be an integer from 10 up to the current balance. The wallet row gets locked, a ledger row debits the stake, and the bet row is inserted, all in one transaction.
- **Odds move** until the bell. The slip shows an estimate. The real payout uses the final pool at lock.
- **Locking** happens at the bell, before the match computes. Bets with a server timestamp after `locked_at` are rejected with a clear error.
- **Settlement** happens when the match is `complete` (after it airs, so nobody's balance spoils the result).
- **Void**: host void, walkover, or a failed match the host gives up on. Every stake comes back through a ledger row.
- **Nobody backed the winner**: refund every user stake. The house seed is discarded.

### Leaderboard

- Ranked by net profit: balance minus everything granted (starting balance plus bridge rounds).
- Ties broken by ROI on settled bets, then by earliest account.
- Badges: "Oracle" for the best hit rate with at least 5 settled bets, "Degenerate" for the most all-in bets.

### Who can bet

- Spectators and founders can bet. Founders can bet on their own idea, which shows a FOUNDER badge on the live bet ticker. They can't influence the result, since judges see no betting data and bets lock before compute.
- Hosts can't bet in a tournament they run.
- VCs on a tournament's tiebreak panel can't bet in that tournament.

## The VC panel (v2)

VCs give the room a human voice and settle the matches agents can't.

### Roles

- Invite-only `vc` role, set by the host.
- Each VC has a short bio and a conflicts list (portfolio companies, relationships with founders). They can recuse from any match.

### Hot takes

- After weigh-in, a VC can leave one take of up to 280 characters per fighter.
- Hot takes appear on fighter cards, in the tale of the tape and in the film room.
- **Hot takes never go into any prompt.** The agent verdict stays independent. VCs are commentary, except in tiebreaks.

### VC tiebreaks

The cascade in [02-fight-system.md](02-fight-system.md#tiebreak-cascade) is:

```ts
tiebreakers: ["sudden_death_judge", "vc_panel", "weighin_total", "seed"]
```

When `vc_panel` is enabled and the sudden-death judge splits 2 to 2:

1. The match moves to `awaiting_vc`. It stays sealed from the public.
2. Every non-recused VC on the panel gets a review packet: both briefs, both dossiers, the scorecard, the full transcript and the sudden-death closings. The packet hides seeds, odds and bet volume.
3. Each VC picks a winner and writes a reason of up to 280 characters within the deadline (default 10 minutes).
4. A strict majority of votes cast wins, as long as at least 2 VCs voted.
5. A tie in votes cast, fewer than 2 votes, or the deadline passing falls through to `weighin_total`.
6. The match seals. On air, the sudden-death sequence ends with VC silhouettes on a balcony raising paddles, then the reasons scroll by.

Votes and reasons are public in the film room, with names. Accountability is the price of a vote.

### Hooks to build now

So v2 needs no engine changes:

- `tiebreakers` is a config list frozen into the build, and the engine runs it as an ordered list of strategies with one interface: `decide(context) => { winner, detail } | { abstain, reason }`.
- `awaiting_vc` is in the match status enum from day one, unused in the MVP.
- `vc_votes` and `hot_takes` tables exist (empty) so the schema doesn't migrate mid-event.
- The film room renders a `tiebreak.applied` event generically. The VC version adds a list of votes.

### Open questions for v2

- Should VC advisory opinions on non-tied matches show up live during the broadcast, or only in the film room? Default: film room only, so the broadcast stays about the agents.
- Panel size. Default 3 for a hackathon, 5 for anything bigger.
- Should a VC majority ever override a clear agent verdict? Default no. VCs only decide when agents can't.
