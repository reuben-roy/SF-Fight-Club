import type {
  BroadcastScript,
  Dossier,
  FactCheckResult,
  FightReport,
  IdeaSubmission,
  MatchEvent,
  RoundJudgment,
  StandardBrief,
  SuddenDeathVote,
  Volley,
  VolleyModelOutput,
  WeighinJudgment,
} from "../src/index.js";

export const brief: StandardBrief = {
  title: "PermitPilot",
  oneLiner: "An agent that chases building permits.",
  problem: "Not stated.",
  customer: "Not stated.",
  solution: "Not stated.",
  businessModel: "Not stated.",
  whyNow: "Not stated.",
  category: "proptech",
  strippedContent: [],
};

export const idea: IdeaSubmission = {
  title: "PermitPilot",
  oneLiner: "An agent that chases SF building permits.",
  description: "Files and follows up on permits for small contractors.",
  customer: "Residential contractors in San Francisco",
  links: ["https://example.com/permit"],
};

const claim = {
  text: "Permit delays run for months.",
  evidence: ["E1"],
  estimate: false,
};

export const dossier: Dossier = {
  ideaId: "idea_permit",
  sections: {
    problemEvidence: [claim],
    marketSizing: [{ text: "About 4,000 permits a year.", evidence: ["E2"], estimate: true }],
    competitors: [
      {
        name: "Spreadsheet",
        kind: "status_quo",
        note: "Contractors track permits by hand.",
        evidence: ["E1"],
      },
    ],
    pricingAnalogs: [],
    whyNowSignals: [],
    risks: [],
  },
  summary: "A permit-chasing agent for SF contractors.",
  gaps: ["pricingAnalogs"],
};

export const volleyModel: VolleyModelOutput = {
  shots: [
    {
      type: "pitch",
      criterion: "problem",
      headline: "Permits stall builds",
      claim: "Delays are measured in months for a named contractor.",
      evidence: ["E1"],
      estimate: false,
    },
    {
      type: "attack",
      criterion: "market",
      headline: "Niche weather spend",
      claim: "Outdoor venues are a small budget.",
      evidence: [],
      estimate: true,
    },
  ],
};

export const volley: Volley = {
  matchId: "m1",
  round: 1,
  kind: "pitch_strike",
  fighter: "A",
  shots: volleyModel.shots.map((shot, index) => ({ ...shot, id: `r1.v1.A.s${index + 1}` })),
  wordCount: 24,
  truncated: false,
  refused: false,
};

function scored(score: number) {
  return { rationale: "Anchored against the rubric.", capsApplied: [] as string[], score };
}

export const roundJudgment: RoundJudgment = {
  criteria: [
    {
      criterion: "problem",
      comparison: "Fighter 1 names a buyer with a deadline.",
      fighter_1: scored(8),
      fighter_2: scored(5),
    },
    {
      criterion: "market",
      comparison: "Fighter 1 sizes the market from permit counts.",
      fighter_1: { rationale: "Bottom-up count.", capsApplied: [], score: 7 },
      fighter_2: { rationale: "Top-down only.", capsApplied: ["top_down_only"], score: 4 },
    },
    {
      criterion: "wtp",
      comparison: "Both have a payer. Fighter 1 has a closer analog.",
      fighter_1: scored(6),
      fighter_2: scored(5),
    },
  ],
  shots: [
    { shotId: "r1.v1.A.s1", verdict: "landed", impact: 3, note: "Permit delay is supported by E1." },
  ],
  injectionSuspected: false,
  roundSummary: "Fighter 1 wins the market round on problem severity.",
};

const weighinRows = [
  ["problem", 8],
  ["market", 6],
  ["wtp", 5],
  ["differentiation", 7],
  ["moat", 4],
  ["timing", 6],
  ["gtm", 5],
  ["feasibility", 7],
  ["scale", 6],
] as const;

export const weighin: WeighinJudgment = {
  criteria: weighinRows.map(([criterion, score]) => ({
    criterion,
    rationale: `${criterion} is a real constraint.`,
    capsApplied: [],
    score,
  })),
  redFlags: [],
  injectionSuspected: false,
};

export const suddenDeath: SuddenDeathVote = {
  analysis: "Fighter 1 has the clearer payer and a dated reason the window is open.",
  winner: "fighter_1",
  confidence: 0.72,
  decidingFactor: "Willingness to pay is the gap that survives the swap.",
};

export const factCheck: FactCheckResult = {
  checks: [
    {
      shotId: "r1.v1.A.s1",
      missingIds: [],
      perEvidence: [{ evidenceId: "E1", verdict: "supported", note: "Snippet states the delay." }],
      numberContradicted: false,
      fabricated: false,
    },
  ],
};

export const fightReport: FightReport = {
  headline: "PermitPilot K.O.s Fogcast in round 3",
  whyTheyWon: [
    "Problem severity, 8 to 5, because the buyer has a deadline.",
    "Market size, 7 to 4, from a bottom-up permit count.",
    "Venture scale, 7 to 3, with a path past the first city.",
  ],
  turningPoint: { shotId: "r1.v1.A.s1", text: "The permit-delay pitch landed." },
  loserTakeaways: ["Size the market from venue counts.", "Name who pays."],
  announcerLines: [{ cueRef: "intro", text: "Two ideas. One belt." }],
};

export const lockedEvent: MatchEvent = {
  type: "match.locked",
  matchId: "m1",
  seq: 1,
  stepKey: "lock",
  at: "2026-11-05T19:05:00.000Z",
  matchSeed: "seed-1",
  buildHash: "abc123",
  corners: { left: "A", right: "B" },
};

export const broadcast: BroadcastScript = {
  matchId: "m1",
  directorVersion: "1",
  durationMs: 1200,
  cues: [
    {
      t: 0,
      id: "intro",
      kind: "intro",
      fighters: {
        A: { name: "PermitPilot", seed: 1, tier: "A", spriteSeed: "11", corner: "left" },
        B: { name: "Fogcast", seed: 2, tier: "B", spriteSeed: "22", corner: "right" },
      },
    },
    {
      t: 400,
      id: "r1",
      kind: "round_title",
      round: 1,
      name: "MARKET",
      criteria: [
        { id: "problem", weight: 15 },
        { id: "market", weight: 12 },
        { id: "wtp", weight: 8 },
      ],
    },
    {
      t: 800,
      id: "r1.v1.A.s1",
      kind: "shot",
      shooter: "A",
      shotId: "r1.v1.A.s1",
      criterion: "problem",
      weapon: "flame_lance",
      impact: 3,
      outcome: "hit",
      headline: "Permits stall builds",
      evidence: [{ id: "E1", status: "supported" }],
      damage: 12,
      hpAfter: { A: 100, B: 88 },
    },
    {
      t: 900,
      id: "card-1",
      kind: "scorecard",
      round: 1,
      rows: [{ criterion: "problem", A: 8, B: 5, points: 4.5, hp: 12, to: "B" }],
      agreement: 0.9,
    },
    {
      t: 1000,
      id: "outcome",
      kind: "outcome",
      outcome: "KO",
      perfect: false,
    },
    {
      t: 1100,
      id: "winner",
      kind: "winner",
      winner: "A",
      decidedBy: "scores",
    },
  ],
};
