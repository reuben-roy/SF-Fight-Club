import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DEMO_AT_DEFAULT, runDemoTournament, type DemoEntrant } from "@sf-fight-club/orchestrator";
import {
  loadVcDefaultRubric,
  type BroadcastScript,
  type FighterBuild,
  type MatchResolution,
  type OrgTitle,
  type Slot,
} from "@sf-fight-club/schemas";

import type { ArenaFighter } from "../types.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.join(here, "demo.json");

const FOUNDERS: Record<string, { handle: string; name: string }[]> = {
  permitpilot: [
    { handle: "mayabuilds", name: "Maya Okafor" },
    { handle: "devraman", name: "Dev Raman" },
  ],
  dermalens: [
    { handle: "inesvidal", name: "Ines Vidal" },
    { handle: "tomach", name: "Tom Achterberg" },
  ],
  flakehunter: [{ handle: "priyaships", name: "Priya Nandakumar" }],
  tabclear: [
    { handle: "jonaheze", name: "Jonah Eze" },
    { handle: "clarawhit", name: "Clara Whitfield" },
  ],
  paperroute: [{ handle: "samtanaka", name: "Sam Tanaka" }],
  curbbot: [
    { handle: "lenabrandt", name: "Lena Brandt" },
    { handle: "oscarmbeki", name: "Oscar Mbeki" },
    { handle: "weizhou_sf", name: "Wei Zhou" },
  ],
  looproom: [{ handle: "ravikessler", name: "Ravi Kessler" }],
  fogcast: [
    { handle: "anasorensen", name: "Ana Sorensen" },
    { handle: "bolind", name: "Bo Lindqvist" },
  ],
};

const CLOUT: Record<string, number> = {
  permitpilot: 57,
  dermalens: 75,
  flakehunter: 58,
  tabclear: 72,
  paperroute: 31,
  curbbot: 91,
  looproom: 36,
  fogcast: 53,
};

const TITLES: readonly OrgTitle[] = ["Director", "VP", "President"];
const LABEL_PREFIX: readonly string[] = ["QUARTERFINAL", "SEMIFINAL"];

function demoBuild(): FighterBuild {
  return {
    models: {
      fighter: "mistral-large-2512",
      judge: "mistral-large-2512",
      utility: "mistral-small-2512",
      moderation: "mistral-moderation-2512",
      embed: "mistral-embed-2512",
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

function foundersOf(id: string): { handle: string; name: string }[] {
  const founders = FOUNDERS[id];
  if (!founders) throw new Error(`no founders recorded for ${id}`);
  return founders;
}

function entrantById(entrants: readonly DemoEntrant[], id: string): DemoEntrant {
  const entrant = entrants.find((candidate) => candidate.id === id);
  if (!entrant) throw new Error(`unknown demo entrant ${id}`);
  return entrant;
}

function crewFor(input: {
  entrantId: string;
  beaten: readonly string[];
  entrants: readonly DemoEntrant[];
}): ArenaFighter["crew"] {
  const own = foundersOf(input.entrantId).map((founder) => ({ ...founder, from: input.entrantId }));
  const acquired = [...input.beaten]
    .reverse()
    .flatMap((loserId) => foundersOf(loserId).map((founder) => ({ ...founder, from: loserId })));
  return [...own, ...acquired].slice(0, 4);
}

function labelFor(roundIndex: number, slotIndex: number): string {
  const prefix = LABEL_PREFIX[roundIndex];
  return prefix === undefined ? "FINAL" : `${prefix} ${slotIndex + 1}`;
}

export async function buildArenaFixture(): Promise<{
  source: string;
  at: string;
  buildHash: string;
  matches: {
    matchId: string;
    roundIndex: number;
    slotIndex: number;
    label: string;
    winner: Slot;
    outcome: MatchResolution["outcome"];
    fighters: Record<Slot, ArenaFighter>;
    script: BroadcastScript;
  }[];
}> {
  const tournament = runDemoTournament({
    at: DEMO_AT_DEFAULT,
    build: demoBuild(),
    rubric: loadVcDefaultRubric(),
    publish: true,
  });
  const entrants = tournament.entrants;

  const beatenBy = new Map<string, string[]>();

  const matches = tournament.matches.map((match) => {
    if (!match.run.script) throw new Error(`${match.matchId} did not produce a broadcast script`);
    if (!match.run.resolution) throw new Error(`${match.matchId} did not resolve`);
    if (!match.run.corners) throw new Error(`${match.matchId} did not assign corners`);

    const title = TITLES[match.roundIndex];
    if (!title) throw new Error(`no org title for round ${match.roundIndex}`);

    const fighterFor = (slot: Slot, entrantId: string): ArenaFighter => {
      const publicFighter = match.run.fighters[slot];
      const entrant = entrantById(entrants, entrantId);
      return {
        entrantId,
        name: publicFighter.name,
        seed: publicFighter.seed,
        tier: publicFighter.tier,
        spriteSeed: publicFighter.spriteSeed,
        category: publicFighter.category,
        title,
        clout: CLOUT[entrantId] ?? 50,
        crew: crewFor({ entrantId, beaten: beatenBy.get(entrantId) ?? [], entrants }),
      };
    };

    const fighters = {
      A: fighterFor("A", match.entrantA),
      B: fighterFor("B", match.entrantB),
    };

    const winnerId = match.run.resolution.winner === "A" ? match.entrantA : match.entrantB;
    const loserId = match.run.resolution.winner === "A" ? match.entrantB : match.entrantA;
    beatenBy.set(winnerId, [...(beatenBy.get(winnerId) ?? []), loserId]);

    return {
      matchId: match.matchId,
      roundIndex: match.roundIndex,
      slotIndex: match.slotIndex,
      label: labelFor(match.roundIndex, match.slotIndex),
      winner: match.run.resolution.winner,
      outcome: match.run.resolution.outcome,
      fighters,
      script: match.run.script,
    };
  });

  return {
    source: "runDemoTournament",
    at: DEMO_AT_DEFAULT,
    buildHash: tournament.matches[0]?.run.buildHash ?? "",
    matches,
  };
}

async function main(): Promise<void> {
  const payload = await buildArenaFixture();
  await mkdir(here, { recursive: true });
  await writeFile(outFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`wrote ${payload.matches.length} matches to ${outFile}\n`);
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}
