/**
 * Builds the committed demo bundle for the web app.
 *
 * Runs the canned 8-entrant tournament through runDemoTournament, reads the
 * eight intake profiles from fixtures, assembles the DemoBundle, parses it
 * once through demoBundleSchema, and writes it to src/data/generated/demo.ts.
 * Deterministic: same DEMO_SEED in, same bundle out.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEMO_AT_DEFAULT,
  DEMO_SEED,
  runDemoTournament,
  type DemoEntrant,
  type DemoMatchResult,
} from "@sf-fight-club/orchestrator";
import {
  entrantProfileSchema,
  loadVcDefaultRubric,
  type EntrantProfile,
  type EvidenceItem,
  type FighterBuild,
  type Shot,
  type ShotFactCheck,
  type ShotVerdict,
  type VolleyKind,
} from "@sf-fight-club/schemas";

import {
  demoBundleSchema,
  type BundleMatch,
  type DemoBundle,
  type FilmData,
  type FilmRound,
  type FilmShot,
} from "../src/data/demo-bundle.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..");
const PROFILES_DIR = join(REPO_ROOT, "packages", "intake", "fixtures", "demo", "profiles");
const OUT_DIR = join(HERE, "..", "src", "data", "generated");
const OUT_FILE = join(OUT_DIR, "demo.ts");

const PROFILE_FILES = [
  "permitpilot.profile.json",
  "dermalens.profile.json",
  "flakehunter.profile.json",
  "tabclear.profile.json",
  "paperroute.profile.json",
  "curbbot.profile.json",
  "looproom.profile.json",
  "fogcast.profile.json",
] as const;

/** Dated model IDs, as frozen in the fighter build. Never -latest aliases. */
function demoBuild(): FighterBuild {
  return {
    models: {
      fighter: "fighter-model-dated",
      judge: "judge-model-dated",
      utility: "utility-model-dated",
      moderation: "moderation-model-dated",
      embed: "embed-model-dated",
    },
    params: {
      fighterTemperature: 0.6,
      judgeTemperature: 0,
      weighinSamples: 3,
      weighinTemperature: 0.3,
      suddenDeathSamplesPerOrder: 2,
      suddenDeathTemperature: 0.5,
    },
    budgets: {
      researchSearches: 8,
      researchEvidenceKept: 12,
      scoutingSearches: 3,
      scoutingEvidenceKept: 4,
      volleyMaxWords: 180,
      shotMaxWords: 60,
      shotsPerVolley: [2, 4],
      headlineMaxWords: 12,
      closingMaxWords: 120,
    },
    promptHashes: { "fighter.md": "prompt-hash" },
    rubricHash: "rubric-vc-default",
    engineVersion: "1",
    tiebreakers: ["sudden_death_judge", "vc_panel", "weighin_total", "seed"],
    disabledTiebreakers: ["vc_panel"],
  };
}

function loadProfiles(): EntrantProfile[] {
  return PROFILE_FILES.map((file) => {
    const raw: unknown = JSON.parse(readFileSync(join(PROFILES_DIR, file), "utf8"));
    return entrantProfileSchema.parse(raw);
  });
}

function volleyNumberOf(kind: VolleyKind): 1 | 2 | 3 {
  switch (kind) {
    case "pitch_strike":
      return 1;
    case "counter":
      return 2;
    case "closing":
      return 3;
  }
}

function roundRank(round: FilmShot["round"]): number {
  return round === "sudden_death" ? 3 : round - 1;
}

interface PendingShot {
  order: number;
  round: FilmShot["round"];
  volley: 1 | 2 | 3;
  fighter: "A" | "B";
  shot: Shot;
}

/**
 * Project the compute log into the film room's data: judge scorecards,
 * every shot with its fact-check and verdict, the shared evidence locker,
 * and the sudden-death tiebreak record.
 */
function toFilmData(match: DemoMatchResult, entrants: ReadonlyMap<string, DemoEntrant>): FilmData {
  const rounds: FilmRound[] = [];
  const verdicts = new Map<string, ShotVerdict>();
  const checks = new Map<string, ShotFactCheck>();
  const scouted: EvidenceItem[] = [];
  const pending: PendingShot[] = [];
  let order = 0;

  for (const event of match.run.events) {
    switch (event.type) {
      case "round.resolved":
        rounds.push({ round: event.resolution.round, criteria: event.resolution.criteria });
        for (const verdict of event.resolution.shotVerdicts) verdicts.set(verdict.shotId, verdict);
        break;
      case "factcheck.completed":
        for (const check of event.checks) checks.set(check.shotId, check);
        break;
      case "scouting.completed":
        scouted.push(...event.evidence);
        break;
      case "volley.submitted":
        for (const shot of event.volley.shots) {
          pending.push({
            order: order++,
            round: event.volley.round,
            volley: volleyNumberOf(event.volley.kind),
            fighter: event.volley.fighter,
            shot,
          });
        }
        break;
      default:
        break;
    }
  }

  rounds.sort((left, right) => left.round - right.round);
  if (rounds.length !== 3) throw new Error(`${match.matchId} logged ${rounds.length} resolved rounds`);

  pending.sort(
    (left, right) =>
      roundRank(left.round) - roundRank(right.round) ||
      left.volley - right.volley ||
      left.fighter.localeCompare(right.fighter) ||
      left.order - right.order,
  );

  const shots: FilmShot[] = pending.map((entry) => ({
    id: entry.shot.id,
    round: entry.round,
    volley: entry.volley,
    fighter: entry.fighter,
    type: entry.shot.type,
    criterion: entry.shot.criterion,
    headline: entry.shot.headline,
    claim: entry.shot.claim,
    evidence: entry.shot.evidence,
    estimate: entry.shot.estimate,
    ...(entry.shot.respondsTo === undefined ? {} : { respondsTo: entry.shot.respondsTo }),
    factCheck: checks.get(entry.shot.id) ?? null,
    verdict: verdicts.get(entry.shot.id) ?? null,
  }));

  const dossier = [entrants.get(match.entrantA), entrants.get(match.entrantB)].flatMap((entrant) =>
    entrant ? entrant.dossierEvidence : [],
  );
  const seen = new Set<string>();
  const evidence = [...dossier, ...scouted].filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  return { rounds, shots, evidence, tiebreak: match.run.resolution?.tiebreak ?? [] };
}

function toBundleMatch(match: DemoMatchResult, entrants: ReadonlyMap<string, DemoEntrant>): BundleMatch {
  const resolution = match.run.resolution;
  const script = match.run.script;
  if (resolution === null) throw new Error(`${match.matchId} resolved without a resolution`);
  if (script === null) throw new Error(`${match.matchId} sealed without a script`);
  const reportEvent = match.run.events.find((event) => event.type === "report.completed");
  if (reportEvent === undefined || reportEvent.type !== "report.completed") {
    throw new Error(`${match.matchId} sealed without a fight report`);
  }
  return {
    roundIndex: match.roundIndex,
    slotIndex: match.slotIndex,
    matchId: match.matchId,
    entrantA: match.entrantA,
    entrantB: match.entrantB,
    winnerId: resolution.winner === "A" ? match.entrantA : match.entrantB,
    fighters: match.run.fighters,
    corners: match.run.corners,
    script,
    resolution,
    report: reportEvent.report,
    film: toFilmData(match, entrants),
  };
}

function main(): void {
  const tournament = runDemoTournament({ at: DEMO_AT_DEFAULT, build: demoBuild(), rubric: loadVcDefaultRubric() });
  const profiles = loadProfiles();
  const byId = new Map(profiles.map((profile) => [profile.entrantId, profile]));
  const entrantsById = new Map(tournament.entrants.map((entrant) => [entrant.id, entrant]));

  const bundle: DemoBundle = {
    version: 1,
    generatedAt: DEMO_AT_DEFAULT,
    demoSeed: DEMO_SEED,
    buildHash: tournament.matches[0]?.run.buildHash ?? "",
    bracket: tournament.bracket,
    entrants: tournament.entrants.map((entrant) => {
      const profile = byId.get(entrant.id);
      if (profile === undefined) throw new Error(`no intake profile for entrant ${entrant.id}`);
      return {
        id: entrant.id,
        name: entrant.name,
        category: entrant.category,
        oneLiner: entrant.oneLiner,
        weighinTotal: entrant.weighinTotal,
        tier: entrant.tier,
        spriteSeed: entrant.spriteSeed,
        cloutScore: profile.clout.score,
        cloutTier: profile.clout.tier,
      };
    }),
    profiles: Object.fromEntries(profiles.map((profile) => [profile.entrantId, profile])),
    matches: tournament.matches.map((match) => toBundleMatch(match, entrantsById)),
  };

  // The one parse: anything the runner or fixtures change shape on fails here.
  const parsed = demoBundleSchema.parse(bundle);

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    OUT_FILE,
    `import type { DemoBundle } from "../demo-bundle.js";\n\n/** Committed demo bundle. Regenerate with \`pnpm --filter @sf-fight-club/web demo:data\`. Do not edit by hand. */\nexport const DEMO_BUNDLE: DemoBundle = ${JSON.stringify(parsed)};\n`,
  );
}

main();
