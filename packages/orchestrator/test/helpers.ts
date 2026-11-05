import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  loadVcDefaultRubric,
  type EvidenceItem,
  type FighterBuild,
  type StandardBrief,
} from "@sf-fight-club/schemas";

import { permitVsFogcastTape, type RunMatchInput } from "../src/index.js";

export const AT = "2026-11-05T20:00:00.000Z";
export const MATCH_ID = "m_permit";
export const MATCH_SEED = "permit-seed-9f3a";
export const WEIGH_A = 41.25;
export const WEIGH_B = 18.75;
export const SPRITE_A = "sprite-permit-9f3a";
export const SPRITE_B = "sprite-fog-9f3a";

export function rubric() {
  return loadVcDefaultRubric();
}

export function build(): FighterBuild {
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

export function brief(title: string, category: string): StandardBrief {
  return {
    title,
    oneLiner: `${title} in one line.`,
    problem: "A named customer loses time every week.",
    customer: "A specific local operator.",
    solution: "Software that does the tedious chase.",
    businessModel: "Subscription.",
    whyNow: "The workaround already costs money.",
    category,
    strippedContent: [],
  };
}

export function dossierEvidence(): EvidenceItem[] {
  return [
    {
      id: "E1",
      url: "https://example.com/permits",
      title: "SF permit backlog",
      snippet: "Residential permits often take months.",
      retrievedAt: "2026-11-01T00:00:00.000Z",
      foundBy: { kind: "dossier", ideaId: "idea_permit" },
    },
    {
      id: "E2",
      url: "https://example.com/fog",
      title: "Mission weather",
      snippet: "Outdoor businesses watch the microclimate.",
      retrievedAt: "2026-11-01T00:00:00.000Z",
      foundBy: { kind: "dossier", ideaId: "idea_fog" },
    },
  ];
}

export function matchInput(overrides: Partial<RunMatchInput> = {}): RunMatchInput {
  return {
    matchId: MATCH_ID,
    matchSeed: MATCH_SEED,
    status: "locked",
    at: AT,
    build: build(),
    rubric: rubric(),
    fighters: {
      A: {
        name: "PermitPilot",
        seed: 2,
        tier: "B",
        spriteSeed: SPRITE_A,
        ideaId: "idea_permit",
        weighinTotal: WEIGH_A,
        brief: brief("PermitPilot", "proptech"),
        dossierSummary: "A permit-chasing agent for contractors.",
      },
      B: {
        name: "Fogcast",
        seed: 5,
        tier: "A",
        spriteSeed: SPRITE_B,
        ideaId: "idea_fog",
        weighinTotal: WEIGH_B,
        brief: brief("Fogcast", "climate"),
        dossierSummary: "Microclimate forecasts for outdoor businesses.",
      },
    },
    dossierEvidence: dossierEvidence(),
    fixtures: permitVsFogcastTape(),
    ...overrides,
  };
}

export function loadFixture(name: string): unknown {
  const path = fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8"));
}
