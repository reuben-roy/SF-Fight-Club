/**
 * Web-app tournament store: a pure reducer plus selectors over the committed
 * demo bundle. React state lives in the provider (data/index.tsx); this
 * module never touches the DOM, the network, or the clock.
 *
 * Match lifecycle: scheduled -> betting_open -> locked -> live -> complete.
 * The bell rings twice: betting_open -> locked closes betting (bets lock
 * before compute), locked -> live starts the fight. finish settles bets and
 * reveals the result through selectors only.
 */

import { buildOrgChart, resolveBracket } from "@sf-fight-club/engine";
import type {
  BroadcastScript,
  EntrantProfile,
  FightReport,
  MatchResolution,
  OrgChart,
  OrgNode,
  OrgTitle,
} from "@sf-fight-club/schemas";
import { z } from "zod";

import type { ArenaScreenProps, CrewMember } from "../arena/types.js";
import { computePool, isValidStake, settleBets, STARTING_WALLET } from "../bets/odds.js";
import type { FighterCardProps } from "../cards/types.js";
import type { TowerEntrant, TowerMatch, TowerScreenProps } from "../tower/types.js";
import type { BundleMatch, DemoBundle } from "./demo-bundle.js";

export type AppMatchStatus = "scheduled" | "betting_open" | "locked" | "live" | "complete";

export const APP_MATCH_STATUSES = [
  "scheduled",
  "betting_open",
  "locked",
  "live",
  "complete",
] as const satisfies readonly AppMatchStatus[];

export interface BetRecord {
  id: string;
  matchId: string;
  entrantId: string;
  stake: number;
}

export interface AppState {
  version: 1;
  statuses: Record<string, AppMatchStatus>;
  bets: BetRecord[];
  wallet: number;
  completedOrder: string[];
  turnsSeen: Record<string, number>;
  nextBetId: number;
}

export type AppAction =
  | { type: "open_betting"; matchId: string }
  | { type: "place_bet"; matchId: string; entrantId: string; stake: number }
  | { type: "ring_bell"; matchId: string }
  | { type: "finish"; matchId: string }
  | { type: "mark_turn"; matchId: string; turn: number }
  | { type: "reset" };

/** Bracket slot key, for resolving winner_of sides. */
function slotKey(roundIndex: number, slotIndex: number): string {
  return `r${roundIndex}s${slotIndex}`;
}

function bracketMatchOf(bundle: DemoBundle, roundIndex: number, slotIndex: number) {
  return bundle.bracket.matches.find((m) => m.roundIndex === roundIndex && m.slotIndex === slotIndex) ?? null;
}

export function bundleMatchById(bundle: DemoBundle, matchId: string): BundleMatch | null {
  return bundle.matches.find((m) => m.matchId === matchId) ?? null;
}

/** Winners of store-complete matches, keyed by bracket slot. */
export function winnerMapOf(state: AppState, bundle: DemoBundle): Map<string, string> {
  const winners = new Map<string, string>();
  for (const match of bundle.matches) {
    if (state.statuses[match.matchId] === "complete") {
      winners.set(slotKey(match.roundIndex, match.slotIndex), match.winnerId);
    }
  }
  return winners;
}

type BracketSide = DemoBundle["bracket"]["matches"][number]["a"];

function sideResolvesTo(side: BracketSide, winners: Map<string, string>): string | null {
  switch (side.kind) {
    case "fighter":
      return side.id;
    case "bye":
      return null;
    case "winner_of":
      return winners.get(slotKey(side.roundIndex, side.slotIndex)) ?? null;
  }
}

/** Entrant ids for each side, or null while a feeder is unplayed. */
export function sidesOf(
  state: AppState,
  bundle: DemoBundle,
  matchId: string,
): { a: string | null; b: string | null } {
  const match = bundleMatchById(bundle, matchId);
  if (!match) return { a: null, b: null };
  const slot = bracketMatchOf(bundle, match.roundIndex, match.slotIndex);
  if (!slot) return { a: match.entrantA, b: match.entrantB };
  const winners = winnerMapOf(state, bundle);
  return {
    a: sideResolvesTo(slot.a, winners),
    b: sideResolvesTo(slot.b, winners),
  };
}

/** A match is available once both feeders are complete (openers always are). */
export function isAvailable(state: AppState, bundle: DemoBundle, matchId: string): boolean {
  const match = bundleMatchById(bundle, matchId);
  if (!match) return false;
  if (match.roundIndex === 0) return true;
  const winners = winnerMapOf(state, bundle);
  const slot = bracketMatchOf(bundle, match.roundIndex, match.slotIndex);
  if (!slot) return false;
  return sideResolvesTo(slot.a, winners) !== null && sideResolvesTo(slot.b, winners) !== null;
}

export function initialAppState(bundle: DemoBundle): AppState {
  const statuses: Record<string, AppMatchStatus> = {};
  for (const match of bundle.matches) {
    statuses[match.matchId] = match.roundIndex === 0 ? "betting_open" : "scheduled";
  }
  return { version: 1, statuses, bets: [], wallet: STARTING_WALLET, completedOrder: [], turnsSeen: {}, nextBetId: 1 };
}

/**
 * Pure reducer. The bundle is read-only context: validation (known match,
 * known side, affordable stake) and settlement both read from it.
 */
export function reduceAppState(state: AppState, action: AppAction, bundle: DemoBundle): AppState {
  switch (action.type) {
    case "reset": {
      return initialAppState(bundle);
    }
    case "open_betting": {
      if (state.statuses[action.matchId] !== "scheduled") return state;
      if (!isAvailable(state, bundle, action.matchId)) return state;
      return {
        ...state,
        statuses: { ...state.statuses, [action.matchId]: "betting_open" },
      };
    }
    case "place_bet": {
      if (state.statuses[action.matchId] !== "betting_open") return state;
      const sides = sidesOf(state, bundle, action.matchId);
      if (action.entrantId !== sides.a && action.entrantId !== sides.b) return state;
      if (!isValidStake(action.stake, state.wallet)) return state;
      const bet: BetRecord = {
        id: `bet-${state.nextBetId}`,
        matchId: action.matchId,
        entrantId: action.entrantId,
        stake: action.stake,
      };
      return {
        ...state,
        wallet: state.wallet - action.stake,
        bets: [...state.bets, bet],
        nextBetId: state.nextBetId + 1,
      };
    }
    case "ring_bell": {
      const status = state.statuses[action.matchId];
      if (status === "betting_open") {
        return {
          ...state,
          statuses: { ...state.statuses, [action.matchId]: "locked" },
        };
      }
      if (status === "locked") {
        return {
          ...state,
          statuses: { ...state.statuses, [action.matchId]: "live" },
        };
      }
      return state;
    }
    case "mark_turn": {
      if (state.statuses[action.matchId] !== "live") return state;
      const seen = state.turnsSeen[action.matchId] ?? 0;
      if (action.turn <= seen) return state;
      return { ...state, turnsSeen: { ...state.turnsSeen, [action.matchId]: action.turn } };
    }
    case "finish": {
      if (state.statuses[action.matchId] !== "live") return state;
      const match = bundleMatchById(bundle, action.matchId);
      if (!match) return state;
      const entrantA = bundle.entrants.find((e) => e.id === match.entrantA);
      const entrantB = bundle.entrants.find((e) => e.id === match.entrantB);
      if (!entrantA || !entrantB) return state;
      const matchBets = state.bets.filter((b) => b.matchId === action.matchId);
      const payouts = settleBets(
        matchBets,
        match.winnerId,
        match.entrantA,
        match.entrantB,
        entrantA.weighinTotal,
        entrantB.weighinTotal,
      );
      const totalPaid = payouts.reduce((sum, p) => sum + p, 0);
      return {
        ...state,
        wallet: state.wallet + totalPaid,
        statuses: { ...state.statuses, [action.matchId]: "complete" },
        completedOrder: [...state.completedOrder, action.matchId],
      };
    }
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

// ---------------------------------------------------------------------------
// Org chart: resolveBracket + buildOrgChart over complete matches only.
// ---------------------------------------------------------------------------

export interface OrgCharts {
  chart: OrgChart;
  /** Chart before the latest completion. Undefined until a match completes. */
  previousChart?: OrgChart;
}

/** Org chart over complete matches only; sealed/live matches never count. */
export function selectOrgCharts(state: AppState, bundle: DemoBundle): OrgCharts {
  const results = (ids: readonly string[]) =>
    bundle.matches
      .filter((m) => ids.includes(m.matchId))
      .map((m) => ({
        roundIndex: m.roundIndex,
        slotIndex: m.slotIndex,
        winnerId: m.winnerId,
        status: "complete" as const,
      }));
  const chart = buildOrgChart({
    bracket: bundle.bracket,
    resolutions: resolveBracket({ bracket: bundle.bracket, results: results(state.completedOrder) }),
  });
  if (state.completedOrder.length === 0) return { chart };
  const previousChart = buildOrgChart({
    bracket: bundle.bracket,
    resolutions: resolveBracket({
      bracket: bundle.bracket,
      results: results(state.completedOrder.slice(0, -1)),
    }),
  });
  return { chart, previousChart };
}

function findNode(roots: readonly OrgNode[], entrantId: string): OrgNode | null {
  for (const root of roots) {
    if (root.entrantId === entrantId) return root;
    const found = findNode(root.reports, entrantId);
    if (found) return found;
  }
  return null;
}

export function titleOf(chart: OrgChart, entrantId: string): OrgTitle {
  return findNode(chart.roots, entrantId)?.title ?? "Director";
}

export function headcountOf(chart: OrgChart, entrantId: string): number {
  return findNode(chart.roots, entrantId)?.headcount ?? 1;
}

// ---------------------------------------------------------------------------
// Crew: founders plus every absorbed crew (spec 09 section 4.5).
// ---------------------------------------------------------------------------

function foundersOf(profile: EntrantProfile, entrantId: string): CrewMember[] {
  return profile.founders.map((founder) => ({
    handle: founder.xHandle ?? founder.hnUser ?? founder.name,
    name: founder.name,
    from: entrantId,
  }));
}

/**
 * A fighter's crew: their own founders plus the crews of everyone they beat,
 * transitively. The champion absorbs the whole field.
 */
export function crewOf(bundle: DemoBundle, entrantId: string): CrewMember[] {
  const beaten = new Map<string, string>();
  for (const match of bundle.matches) {
    const loser = match.winnerId === match.entrantA ? match.entrantB : match.entrantA;
    beaten.set(loser, match.winnerId);
  }
  const absorbed = new Set<string>([entrantId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [loser, winner] of beaten) {
      if (absorbed.has(winner) && !absorbed.has(loser)) {
        absorbed.add(loser);
        changed = true;
      }
    }
  }
  const crew: CrewMember[] = [];
  for (const entrant of bundle.entrants) {
    if (!absorbed.has(entrant.id)) continue;
    const profile = bundle.profiles[entrant.id];
    if (!profile) continue;
    crew.push(...foundersOf(profile, entrant.id));
  }
  return crew;
}

// ---------------------------------------------------------------------------
// Prop selectors: build the committed screen props from state + bundle.
// ---------------------------------------------------------------------------

function towerEntrants(bundle: DemoBundle): Record<string, TowerEntrant> {
  const out: Record<string, TowerEntrant> = {};
  for (const entrant of bundle.entrants) {
    out[entrant.id] = {
      entrantId: entrant.id,
      name: entrant.name,
      spriteSeed: entrant.spriteSeed,
      category: entrant.category,
      oneLiner: entrant.oneLiner,
      clout: entrant.cloutScore,
      cloutTier: entrant.cloutTier,
    };
  }
  return out;
}

function towerMatches(state: AppState, bundle: DemoBundle): TowerMatch[] {
  return bundle.matches.map((match) => {
    const sides = sidesOf(state, bundle, match.matchId);
    return {
      matchId: match.matchId,
      roundIndex: match.roundIndex,
      slotIndex: match.slotIndex,
      a: sides.a,
      b: sides.b,
      status: state.statuses[match.matchId] ?? "scheduled",
    };
  });
}

export function selectTowerProps(
  state: AppState,
  bundle: DemoBundle,
  handlers: Pick<TowerScreenProps, "onOpenMatch" | "onOpenCard">,
): TowerScreenProps {
  const { chart, previousChart } = selectOrgCharts(state, bundle);
  return {
    chart,
    previousChart,
    entrants: towerEntrants(bundle),
    matches: towerMatches(state, bundle),
    onOpenMatch: handlers.onOpenMatch,
    onOpenCard: handlers.onOpenCard,
  };
}

export interface ArenaView {
  sealed: boolean;
  props: ArenaScreenProps | null;
}

/**
 * Arena props. The script is sealed until the match is live: before the
 * second bell this returns sealed with no props, so no winner text exists.
 */
export function selectArena(state: AppState, bundle: DemoBundle, matchId: string): ArenaView {
  const status = state.statuses[matchId];
  const match = bundleMatchById(bundle, matchId);
  if (!match || (status !== "live" && status !== "complete")) {
    return { sealed: true, props: null };
  }
  const { chart } = selectOrgCharts(state, bundle);
  const toFighter = (entrantId: string, slot: "A" | "B"): ArenaScreenProps["fighters"][typeof slot] => {
    const publicFighter = match.fighters[slot];
    const entrant = bundle.entrants.find((e) => e.id === entrantId);
    return {
      entrantId,
      name: publicFighter.name,
      seed: publicFighter.seed,
      tier: publicFighter.tier,
      spriteSeed: publicFighter.spriteSeed,
      category: publicFighter.category,
      title: titleOf(chart, entrantId),
      clout: entrant?.cloutScore ?? 0,
      crew: crewOf(bundle, entrantId),
    };
  };
  return {
    sealed: false,
    props: {
      script: match.script,
      fighters: { A: toFighter(match.entrantA, "A"), B: toFighter(match.entrantB, "B") },
      autoplay: status === "live",
      initialSpeed: 1,
    },
  };
}

export function selectFighterCard(
  state: AppState,
  bundle: DemoBundle,
  entrantId: string,
): FighterCardProps | null {
  const towerEntrant = towerEntrants(bundle)[entrantId];
  const profile = bundle.profiles[entrantId];
  const seedEntry = bundle.bracket.entrants.find((e) => e.id === entrantId);
  const tierEntry = bundle.entrants.find((e) => e.id === entrantId);
  if (!towerEntrant || !profile || !seedEntry || !tierEntry) return null;
  const { chart } = selectOrgCharts(state, bundle);
  return {
    entrant: towerEntrant,
    profile,
    title: titleOf(chart, entrantId),
    headcount: headcountOf(chart, entrantId),
    seed: seedEntry.seed,
    tier: tierEntry.tier,
    buildHash: bundle.buildHash,
  };
}

export interface MatchOdds {
  poolA: number;
  poolB: number;
  poolTotal: number;
  oddsA: number;
  oddsB: number;
  stakesA: number;
  stakesB: number;
}

export interface MatchView {
  matchId: string;
  status: AppMatchStatus;
  available: boolean;
  aId: string | null;
  bId: string | null;
  aName: string | null;
  bName: string | null;
  /** Sealed until live. */
  script: BroadcastScript | null;
  /** Sealed until complete. */
  resolution: MatchResolution | null;
  /** Sealed until complete. */
  report: FightReport | null;
  winnerId: string | null;
  odds: MatchOdds | null;
  myBets: BetRecord[];
  wallet: number;
  canBet: boolean;
}

/** Everything the match page needs. Results pass through sealing. */
export function selectMatchView(state: AppState, bundle: DemoBundle, matchId: string): MatchView | null {
  const status = state.statuses[matchId];
  const match = bundleMatchById(bundle, matchId);
  if (!status || !match) return null;
  const sides = sidesOf(state, bundle, matchId);
  const nameOf = (id: string | null): string | null =>
    id ? (bundle.entrants.find((e) => e.id === id)?.name ?? null) : null;
  let odds: MatchOdds | null = null;
  if (sides.a && sides.b) {
    const entrantA = bundle.entrants.find((e) => e.id === sides.a);
    const entrantB = bundle.entrants.find((e) => e.id === sides.b);
    if (entrantA && entrantB) {
      let stakesA = 0;
      let stakesB = 0;
      for (const bet of state.bets) {
        if (bet.matchId !== matchId) continue;
        if (bet.entrantId === sides.a) stakesA += bet.stake;
        else if (bet.entrantId === sides.b) stakesB += bet.stake;
      }
      const pool = computePool(stakesA, stakesB, entrantA.weighinTotal, entrantB.weighinTotal);
      odds = { ...pool, stakesA, stakesB };
    }
  }
  return {
    matchId,
    status,
    available: isAvailable(state, bundle, matchId),
    aId: sides.a,
    bId: sides.b,
    aName: nameOf(sides.a),
    bName: nameOf(sides.b),
    script: status === "live" || status === "complete" ? match.script : null,
    resolution: status === "complete" ? match.resolution : null,
    report: status === "complete" ? match.report : null,
    winnerId: status === "complete" ? match.winnerId : null,
    odds,
    myBets: state.bets.filter((b) => b.matchId === matchId),
    wallet: state.wallet,
    canBet: status === "betting_open",
  };
}

export interface FilmView {
  matchId: string;
  status: AppMatchStatus;
  sealed: boolean;
  aName: string | null;
  bName: string | null;
  script: BroadcastScript | null;
  resolution: MatchResolution | null;
  report: FightReport | null;
}

/** Film room: sealed until the match is complete. */
export function selectFilm(state: AppState, bundle: DemoBundle, matchId: string): FilmView | null {
  const status = state.statuses[matchId];
  const match = bundleMatchById(bundle, matchId);
  if (!status || !match) return null;
  const sealed = status !== "complete";
  return {
    matchId,
    status,
    sealed,
    aName: match.fighters.A.name,
    bName: match.fighters.B.name,
    script: sealed ? null : match.script,
    resolution: sealed ? null : match.resolution,
    report: sealed ? null : match.report,
  };
}

// ---------------------------------------------------------------------------
// Persistence: versioned localStorage key, validated on load.
// ---------------------------------------------------------------------------

export const STORAGE_KEY = "sf-fight-club/web:v1";

const appStateSchema = z.strictObject({
  version: z.literal(1),
  statuses: z.record(z.string().min(1), z.enum(APP_MATCH_STATUSES)),
  bets: z.array(
    z.strictObject({
      id: z.string().min(1),
      matchId: z.string().min(1),
      entrantId: z.string().min(1),
      stake: z.number().int().positive(),
    }),
  ),
  wallet: z.number().int().min(0),
  completedOrder: z.array(z.string().min(1)),
  turnsSeen: z.record(z.string().min(1), z.number().int().min(0)),
  nextBetId: z.number().int().positive(),
});

export type PersistedState = z.infer<typeof appStateSchema>;

function storage(): Storage | null {
  if (typeof window === "undefined" || !("localStorage" in window)) return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Load persisted state. Corrupt or foreign data returns null (fresh start). */
export function loadPersistedState(bundle: DemoBundle): AppState | null {
  const store = storage();
  if (!store) return null;
  let raw: string | null;
  try {
    raw = store.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  const result = appStateSchema.safeParse(parsed);
  if (!result.success) return null;
  const data = result.data;
  const fresh = initialAppState(bundle);
  const statuses = { ...fresh.statuses };
  for (const [matchId, status] of Object.entries(data.statuses)) {
    if (matchId in statuses) statuses[matchId] = status;
  }
  const knownIds = new Set(bundle.matches.map((m) => m.matchId));
  return {
    version: 1,
    statuses,
    bets: data.bets.filter((b) => knownIds.has(b.matchId)),
    wallet: data.wallet,
    completedOrder: data.completedOrder.filter((id) => knownIds.has(id)),
    turnsSeen: data.turnsSeen,
    nextBetId: data.nextBetId,
  };
}

export function savePersistedState(state: AppState): void {
  const store = storage();
  if (!store) return;
  try {
    const payload: PersistedState = {
      version: 1,
      statuses: state.statuses,
      bets: state.bets,
      wallet: state.wallet,
      completedOrder: state.completedOrder,
      turnsSeen: state.turnsSeen,
      nextBetId: state.nextBetId,
    };
    store.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Private mode can refuse storage. The session still works in memory.
  }
}

export function clearPersistedState(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    // Ignore: in-memory state is already fresh.
  }
}

/** ?reset=1 anywhere in the query string requests a fresh tournament. */
export function resetRequested(search: string): boolean {
  try {
    return new URLSearchParams(search).get("reset") === "1";
  } catch {
    return false;
  }
}
