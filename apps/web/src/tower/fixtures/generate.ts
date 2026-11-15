/**
 * Builds the committed Tower fixture from the canned demo tournament.
 *
 * Run from apps/web:
 *   pnpm exec tsx src/tower/fixtures/generate.ts
 *
 * Node only. The fixture is data; browser code parses it with
 * fixtures/parse.ts and never imports the orchestrator.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildHash, DEMO_ENTRANTS, DEMO_SEED, runDemoTournament } from "@sf-fight-club/orchestrator";
import { entrantProfileSchema, loadVcDefaultRubric, type EntrantProfile, type FighterBuild } from "@sf-fight-club/schemas";

import type { FixtureDocument, FixtureEntrant, FixtureMatch } from "./schema.js";

const AT = "2026-11-05T18:00:00.000Z";
const PROFILES_DIR = new URL("../../../../../packages/intake/fixtures/demo/profiles/", import.meta.url);

function build(): FighterBuild {
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

function loadProfile(entrantId: string): EntrantProfile {
  const path = new URL(`${entrantId}.profile.json`, PROFILES_DIR);
  const parsed: unknown = JSON.parse(readFileSync(fileURLToPath(path), "utf8"));
  return entrantProfileSchema.parse(parsed);
}

export function buildTowerFixture(): FixtureDocument {
  const fighterBuild = build();
  const tournament = runDemoTournament({ at: AT, build: fighterBuild, rubric: loadVcDefaultRubric() });

  const entrants: FixtureEntrant[] = DEMO_ENTRANTS.map((entrant) => {
    const profile = loadProfile(entrant.id);
    return {
      entrantId: entrant.id,
      name: entrant.name,
      category: entrant.category,
      oneLiner: entrant.oneLiner,
      spriteSeed: entrant.spriteSeed,
      tier: entrant.tier,
      clout: { score: profile.clout.score, tier: profile.clout.tier },
      profile,
    };
  });

  const matches: FixtureMatch[] = tournament.matches.map((match) => ({
    matchId: match.matchId,
    roundIndex: match.roundIndex,
    slotIndex: match.slotIndex,
    entrantA: match.entrantA,
    entrantB: match.entrantB,
    winnerId: match.run.resolution?.winner === "A" ? match.entrantA : match.entrantB,
  }));

  const document: FixtureDocument = {
    buildHash: buildHash(fighterBuild).slice(0, 6),
    seed: DEMO_SEED,
    bracket: tournament.bracket,
    entrants,
    matches,
  };

  return document;
}

function main(): void {
  const out = new URL("./demo-tournament.json", import.meta.url);
  writeFileSync(out, `${JSON.stringify(buildTowerFixture(), null, 2)}\n`);
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
