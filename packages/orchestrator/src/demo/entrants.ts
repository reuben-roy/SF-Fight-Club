import type { EvidenceItem, StandardBrief } from "@sf-fight-club/schemas";

import type { FighterInput } from "../types.js";

/** One of the eight fictional demo-tournament entrants. All names and numbers are invented. */
export interface DemoEntrant {
  id: string;
  name: string;
  category: string;
  oneLiner: string;
  brief: StandardBrief;
  dossierSummary: string;
  dossierEvidence: EvidenceItem[];
  weighinTotal: number;
  tier: string;
  spriteSeed: string;
}

const AT = "2026-11-01T00:00:00.000Z";

function evidence(input: {
  id: string;
  url: string;
  title: string;
  snippet: string;
  ideaId: string;
}): EvidenceItem {
  return {
    id: input.id,
    url: input.url,
    title: input.title,
    snippet: input.snippet,
    retrievedAt: AT,
    foundBy: { kind: "dossier", ideaId: input.ideaId },
  };
}

function brief(input: {
  title: string;
  oneLiner: string;
  problem: string;
  customer: string;
  solution: string;
  businessModel: string;
  whyNow: string;
  category: string;
}): StandardBrief {
  return { ...input, strippedContent: [] };
}

export const DEMO_ENTRANTS: readonly DemoEntrant[] = [
  {
    id: "permitpilot",
    name: "PermitPilot",
    category: "proptech",
    oneLiner: "AI agent that files and chases SF building permits.",
    brief: brief({
      title: "PermitPilot",
      oneLiner: "AI agent that files and chases SF building permits.",
      problem: "Contractors lose weeks waiting on permit desks and re-filing rejected forms.",
      customer: "Residential contractors in San Francisco doing remodels and additions.",
      solution: "Software that assembles the packet, files it, and chases reviewers until approval.",
      businessModel: "Subscription per contractor plus a fee per approved permit.",
      whyNow: "Backlogs are public, expediters already charge for the chase, and departments are short-staffed.",
      category: "proptech",
    }),
    dossierSummary: "A permit-chasing agent for contractors. The dossier cites a public backlog queue and expediter pricing.",
    dossierEvidence: [
      evidence({
        id: "E1",
        url: "https://example.com/sf-permit-backlog",
        title: "SF permit backlog queue",
        snippet: "Residential permits often wait months, and the public queue shows the counter backlog.",
        ideaId: "permitpilot",
      }),
      evidence({
        id: "E11",
        url: "https://example.com/expediter-pricing",
        title: "Expediter rate cards",
        snippet: "Permit expediters charge flat fees per filing plus hourly chase time, paid by contractors today.",
        ideaId: "permitpilot",
      }),
      evidence({
        id: "E12",
        url: "https://example.com/staffing-shortage",
        title: "Department staffing memo",
        snippet: "The building department reports reviewer shortages and growing application volume.",
        ideaId: "permitpilot",
      }),
    ],
    weighinTotal: 78.5,
    tier: "A",
    spriteSeed: "sprite-permit-9f3a",
  },
  {
    id: "dermalens",
    name: "Dermalens",
    category: "health",
    oneLiner: "Skin-check triage from phone photos for clinics.",
    brief: brief({
      title: "Dermalens",
      oneLiner: "Skin-check triage from phone photos for clinics.",
      problem: "Dermatology waitlists stretch for months while urgent lesions sit unseen in the queue.",
      customer: "Community clinics that need to sort skin referrals without a dermatologist on staff.",
      solution: "Phone-photo triage that ranks lesions by urgency so nurses escalate the right cases first.",
      businessModel: "Per-clinic subscription with a per-screen fee above the included volume.",
      whyNow: "Camera quality crossed the bar for close-up skin imaging and clinics accept async review.",
      category: "health",
    }),
    dossierSummary: "Phone-photo skin triage for clinics. The dossier cites waitlist data and a nurse-led pilot.",
    dossierEvidence: [
      evidence({
        id: "E5",
        url: "https://example.com/derm-waitlists",
        title: "Dermatology waitlist survey",
        snippet: "Average dermatology waits run past two months, and community clinics report the longest queues.",
        ideaId: "dermalens",
      }),
      evidence({
        id: "E19",
        url: "https://example.com/clinic-pilot",
        title: "Nurse triage pilot",
        snippet: "A three-clinic pilot found photo triage cut review time per referral by more than half.",
        ideaId: "dermalens",
      }),
      evidence({
        id: "E20",
        url: "https://example.com/camera-derm",
        title: "Phone imaging review",
        snippet: "Modern phone cameras resolve the detail dermatologists ask for in first-pass screening.",
        ideaId: "dermalens",
      }),
    ],
    weighinTotal: 74.0,
    tier: "A",
    spriteSeed: "sprite-derma-51bc",
  },
  {
    id: "flakehunter",
    name: "FlakeHunter",
    category: "devtools",
    oneLiner: "Finds and quarantines flaky tests in CI.",
    brief: brief({
      title: "FlakeHunter",
      oneLiner: "Finds and quarantines flaky tests in CI.",
      problem: "Flaky tests block merges and teach teams to ignore red builds.",
      customer: "Software teams with large CI suites and painful retry habits.",
      solution: "A quarantine layer that detects flaky tests, isolates them, and files the repro data.",
      businessModel: "Per-seat subscription priced against CI minutes saved.",
      whyNow: "Suites keep growing, and teams now pay real money for wasted CI compute.",
      category: "devtools",
    }),
    dossierSummary: "Flaky-test quarantine for CI. The dossier cites retry-cost data and a team survey on ignored builds.",
    dossierEvidence: [
      evidence({
        id: "E7",
        url: "https://example.com/ci-retry-costs",
        title: "CI retry cost report",
        snippet: "Mid-size teams rerun a large share of builds, and retries consume a visible slice of CI spend.",
        ideaId: "flakehunter",
      }),
      evidence({
        id: "E23",
        url: "https://example.com/red-build-survey",
        title: "Red build survey",
        snippet: "Most surveyed developers admit to merging past red builds they assumed were flakes.",
        ideaId: "flakehunter",
      }),
      evidence({
        id: "E24",
        url: "https://example.com/quarantine-guide",
        title: "Quarantine practice guide",
        snippet: "Teams that quarantine flakes separately ship faster, but few do it systematically today.",
        ideaId: "flakehunter",
      }),
    ],
    weighinTotal: 70.5,
    tier: "A",
    spriteSeed: "sprite-flake-a04d",
  },
  {
    id: "tabclear",
    name: "TabClear",
    category: "fintech",
    oneLiner: "Instant bill settlement for bars and group tabs.",
    brief: brief({
      title: "TabClear",
      oneLiner: "Instant bill settlement for bars and group tabs.",
      problem: "Bars lose money to walkout tabs and burn staff time splitting group bills at close.",
      customer: "Neighborhood bars with heavy card volume and late-night rushes.",
      solution: "One-tap tab opening and instant group settlement that pays the bar before patrons leave.",
      businessModel: "A small cut of settled tabs plus a flat monthly register fee.",
      whyNow: "Tap-to-pay is default, and processors already take a cut bars would rather redirect.",
      category: "fintech",
    }),
    dossierSummary: "Instant settlement for bar tabs. The dossier cites walkout losses and processor pricing.",
    dossierEvidence: [
      evidence({
        id: "E3",
        url: "https://example.com/bar-walkouts",
        title: "Bar walkout losses",
        snippet: "Bars report nightly walkout tabs and long close-out routines that eat staff hours.",
        ideaId: "tabclear",
      }),
      evidence({
        id: "E15",
        url: "https://example.com/processor-pricing",
        title: "Processor rate sheets",
        snippet: "Bars already pay percentage fees on every card tab, with statements to prove it.",
        ideaId: "tabclear",
      }),
      evidence({
        id: "E16",
        url: "https://example.com/register-pilot",
        title: "Register pilot notes",
        snippet: "A register pilot in twenty bars settled tabs faster and cut close-out time on busy nights.",
        ideaId: "tabclear",
      }),
    ],
    weighinTotal: 68.0,
    tier: "B",
    spriteSeed: "sprite-tab-77e2",
  },
  {
    id: "paperroute",
    name: "PaperRoute",
    category: "logistics",
    oneLiner: "E-bike courier dispatch for neighborhood shops.",
    brief: brief({
      title: "PaperRoute",
      oneLiner: "E-bike courier dispatch for neighborhood shops.",
      problem: "Neighborhood shops lose local orders to slow, expensive delivery options.",
      customer: "Independent shops doing same-neighborhood deliveries by bike.",
      solution: "Shared e-bike dispatch that batches nearby orders across shops.",
      businessModel: "Per-delivery fee split with the shop, plus a weekly rider subscription.",
      whyNow: "E-bike subsidies cut fleet costs and shops already batch orders informally.",
      category: "logistics",
    }),
    dossierSummary: "E-bike dispatch for local shops. The dossier cites delivery cost data and a subsidy schedule.",
    dossierEvidence: [
      evidence({
        id: "E4",
        url: "https://example.com/shop-delivery-costs",
        title: "Shop delivery costs",
        snippet: "Independent shops report delivery fees eating their margin on nearby orders.",
        ideaId: "paperroute",
      }),
      evidence({
        id: "E17",
        url: "https://example.com/ebike-subsidy",
        title: "E-bike subsidy schedule",
        snippet: "New subsidies cut commercial e-bike fleet costs for neighborhood delivery programs.",
        ideaId: "paperroute",
      }),
      evidence({
        id: "E18",
        url: "https://example.com/batch-pilot",
        title: "Batching pilot memo",
        snippet: "A batching pilot across three commercial strips raised per-rider drop counts on weekends.",
        ideaId: "paperroute",
      }),
    ],
    weighinTotal: 64.5,
    tier: "B",
    spriteSeed: "sprite-paper-c318",
  },
  {
    id: "curbbot",
    name: "CurbBot",
    category: "robotics",
    oneLiner: "Sidewalk robot that audits curb ramps for the city.",
    brief: brief({
      title: "CurbBot",
      oneLiner: "Sidewalk robot that audits curb ramps for the city.",
      problem: "Cities face lawsuits over broken curb ramps they cannot afford to survey by hand.",
      customer: "City public-works departments under consent decrees for sidewalk access.",
      solution: "A sidewalk robot that photographs and grades every curb ramp on a fixed route.",
      businessModel: "Per-mile survey contracts plus an annual monitoring subscription.",
      whyNow: "Consent-decree deadlines are binding, and manual surveys cost more than robots per mile.",
      category: "robotics",
    }),
    dossierSummary: "Curb-ramp audit robots for cities. The dossier cites decree deadlines and manual survey pricing.",
    dossierEvidence: [
      evidence({
        id: "E8",
        url: "https://example.com/decree-deadlines",
        title: "Consent decree deadlines",
        snippet: "Multiple cities face binding court deadlines to inventory and fix curb ramps.",
        ideaId: "curbbot",
      }),
      evidence({
        id: "E25",
        url: "https://example.com/survey-pricing",
        title: "Manual survey pricing",
        snippet: "Manual curb surveys price per mile with long lead times and seasonal backlogs.",
        ideaId: "curbbot",
      }),
      evidence({
        id: "E26",
        url: "https://example.com/ramp-lawsuits",
        title: "Ramp lawsuit settlements",
        snippet: "Recent settlements price each missing ramp audit far above the cost of a robot survey.",
        ideaId: "curbbot",
      }),
    ],
    weighinTotal: 58.0,
    tier: "B",
    spriteSeed: "sprite-curb-9d01",
  },
  {
    id: "looproom",
    name: "LoopRoom",
    category: "social",
    oneLiner: "Voice rooms for neighborhood groups.",
    brief: brief({
      title: "LoopRoom",
      oneLiner: "Voice rooms for neighborhood groups.",
      problem: "Neighborhood groups drown in text threads and never reach decisions.",
      customer: "Block associations and parent groups coordinating by group chat.",
      solution: "Drop-in voice rooms with notes and polls attached to each conversation.",
      businessModel: "Freemium rooms with paid moderation tools for large groups.",
      whyNow: "Group chats keep growing, and voice notes already dominate how neighbors talk.",
      category: "social",
    }),
    dossierSummary: "Voice rooms for neighbors. The dossier cites thread fatigue and a small room pilot.",
    dossierEvidence: [
      evidence({
        id: "E6",
        url: "https://example.com/thread-fatigue",
        title: "Group chat fatigue poll",
        snippet: "Most members mute their neighborhood threads, and decisions stall for days.",
        ideaId: "looproom",
      }),
      evidence({
        id: "E21",
        url: "https://example.com/room-pilot",
        title: "Voice room pilot",
        snippet: "A pilot of evening voice rooms drew a small but steady crowd of regulars.",
        ideaId: "looproom",
      }),
      evidence({
        id: "E22",
        url: "https://example.com/voice-notes",
        title: "Voice note habits",
        snippet: "Voice notes keep rising as the default way neighbors share quick updates.",
        ideaId: "looproom",
      }),
    ],
    weighinTotal: 52.5,
    tier: "C",
    spriteSeed: "sprite-loop-42f7",
  },
  {
    id: "fogcast",
    name: "Fogcast",
    category: "climate",
    oneLiner: "Microclimate forecasts for SF outdoor businesses.",
    brief: brief({
      title: "Fogcast",
      oneLiner: "Microclimate forecasts for SF outdoor businesses.",
      problem: "Outdoor businesses lose revenue to surprise fog and wind they cannot plan around.",
      customer: "Patio restaurants and outdoor venues watching the marine layer.",
      solution: "Block-level microclimate forecasts tuned for staffing and seating decisions.",
      businessModel: "Subscription per venue with a seasonal premium tier.",
      whyNow: "Cheap neighborhood sensors finally make block-level data affordable.",
      category: "climate",
    }),
    dossierSummary: "Microclimate forecasts for patios. The dossier cites marine-layer disruption and sensor costs.",
    dossierEvidence: [
      evidence({
        id: "E2",
        url: "https://example.com/marine-layer",
        title: "Marine layer disruption",
        snippet: "Outdoor businesses watch the microclimate because fog clears some blocks and not others.",
        ideaId: "fogcast",
      }),
      evidence({
        id: "E13",
        url: "https://example.com/sensor-costs",
        title: "Neighborhood sensor costs",
        snippet: "Neighborhood weather stations are finally affordable for block-level coverage.",
        ideaId: "fogcast",
      }),
      evidence({
        id: "E14",
        url: "https://example.com/patio-revenue",
        title: "Patio revenue study",
        snippet: "Patio seating drives a meaningful share of revenue on clear evenings.",
        ideaId: "fogcast",
      }),
    ],
    weighinTotal: 44.0,
    tier: "C",
    spriteSeed: "sprite-fog-9f3a",
  },
];

/** Single constructor for every FighterInput in the demo tournament. */
export function makeFighterInput(
  entrant: DemoEntrant,
  seed: number,
): FighterInput {
  return {
    name: entrant.name,
    seed,
    tier: entrant.tier,
    spriteSeed: entrant.spriteSeed,
    category: entrant.category,
    ideaId: entrant.id,
    weighinTotal: entrant.weighinTotal,
    brief: entrant.brief,
    dossierSummary: entrant.dossierSummary,
  };
}
