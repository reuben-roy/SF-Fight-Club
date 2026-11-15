import type { CriterionId } from "@sf-fight-club/schemas";

import type { DemoPlan, DemoScore, DemoShot, DemoTapeInput } from "./builder.js";
import { buildDemoTape } from "./builder.js";

type Scores = Record<CriterionId, DemoScore>;

function even(value: number): Scores {
  return {
    problem: { A: value, B: value },
    market: { A: value, B: value },
    wtp: { A: value, B: value },
    differentiation: { A: value, B: value },
    moat: { A: value, B: value },
    timing: { A: value, B: value },
    gtm: { A: value, B: value },
    feasibility: { A: value, B: value },
    scale: { A: value, B: value },
  };
}

function p(
  criterion: CriterionId,
  headline: string,
  claim: string,
  extra?: Partial<DemoShot>,
): DemoShot {
  return { type: "pitch", criterion, headline, claim, verdict: "landed", impact: 2, note: "Scored from the claim.", ...extra };
}

function a(
  criterion: CriterionId,
  headline: string,
  claim: string,
  extra?: Partial<DemoShot>,
): DemoShot {
  return { type: "attack", criterion, headline, claim, verdict: "landed", impact: 2, note: "Scored from the claim.", ...extra };
}

function d(
  criterion: CriterionId,
  headline: string,
  claim: string,
  respondsTo: string,
  extra?: Partial<DemoShot>,
): DemoShot {
  return {
    type: "defense",
    criterion,
    headline,
    claim,
    respondsTo,
    verdict: "parried",
    impact: 1,
    note: "The answer stands.",
    ...extra,
  };
}

function rounds(
  r1: DemoTapeInput["plans"][1],
  r2: DemoTapeInput["plans"][1],
  r3: DemoTapeInput["plans"][1],
): DemoTapeInput["plans"] {
  return { 1: r1, 2: r2, 3: r3 };
}

/** Quarterfinal 2: TabClear (A, seed 4) over PaperRoute (B, seed 5). DECISION, unanimous. */
export function tabVsPaperTape(): ReturnType<typeof buildDemoTape> {
  const scores: Scores = {
    problem: { A: 7, B: 5 },
    market: { A: 6, B: 5 },
    wtp: { A: 7, B: 5 },
    differentiation: { A: 6, B: 6 },
    moat: { A: 6, B: 5 },
    timing: { A: 5, B: 6 },
    gtm: { A: 7, B: 5 },
    feasibility: { A: 5, B: 6 },
    scale: { A: 6, B: 5 },
  };
  return buildDemoTape({
    plans: rounds(
      {
        A: {
          v1: [
            p("problem", "Walkout tabs bleed bars dry", "Bars lose full tabs nightly and burn staff hours closing them out.", { evidence: ["E3"] }),
            a("market", "Dispatch fights over one zip code", "Three apps already split the same few commercial strips.", { estimate: true, verdict: "partial" }),
          ],
          v2: [
            d("problem", "Cold fries are a luxury problem", "A lukewarm order stings; an unpaid hundred-dollar tab kills.", "r1.v1.B.s1", { verdict: "glancing" }),
            p("wtp", "Bars already pay processors", "The register statement proves the budget TabClear redirects.", { evidence: ["E15"] }),
          ],
        },
        B: {
          v1: [
            p("problem", "Cold fries kill repeat orders", "Late food is the complaint shops hear every single night.", { evidence: ["E4"], verdict: "glancing", impact: 1, note: "Real pain, smaller stakes." }),
            a("market", "One street is not a market", "A handful of bars cannot carry a venture outcome.", { estimate: true, verdict: "whiff", impact: 0, note: "No bottom-up math offered." }),
          ],
          v2: [
            d("market", "Three strips run our routes", "The pilot already batches across three commercial corridors.", "r1.v1.A.s2", { evidence: ["E18"], verdict: "parried" }),
            a("wtp", "Bartenders will not push apps", "Staff ignore anything that slows a rush.", { estimate: true, verdict: "glancing", impact: 1, note: "Plausible friction, no evidence." }),
          ],
        },
      },
      {
        A: {
          v1: [
            p("differentiation", "One tap beats the card stack", "Splitting a group tab takes seconds, not a register queue.", { evidence: ["E16"], verdict: "glancing", impact: 1, note: "Better, but both sides improve on today." }),
            p("moat", "Ledger history locks venues in", "Years of tab data make switching registers painful.", { evidence: ["E16"] }),
          ],
          v2: [
            d("timing", "Subsidies do not sell software", "Cheap bikes help riders, not a dispatch app's moat.", "r2.v1.B.s1", { verdict: "parried" }),
            a("differentiation", "Riders already multi-app", "Batching loses when every courier runs three apps.", { estimate: true, verdict: "glancing", impact: 1, note: "True of the market, not of this product." }),
          ],
        },
        B: {
          v1: [
            p("timing", "E-bike subsidies just landed", "Fleet costs dropped this year, and shops already batch informally.", { evidence: ["E17"] }),
            a("differentiation", "Tabs are a processor feature", "Registers will add settlement before startups scale.", { estimate: true, verdict: "whiff", impact: 0, note: "Assertion without a source." }),
          ],
          v2: [
            d("differentiation", "Heat-aware batching is the product", "Nobody else routes around oven times and hills.", "r2.v1.A.s1", { verdict: "parried" }),
            a("moat", "Ledger data is portable", "Export laws let venues take history anywhere.", { estimate: true, verdict: "whiff", impact: 0, note: "No evidence for the lock-in break." }),
          ],
        },
      },
      {
        A: {
          v1: [
            p("gtm", "Launch with twenty register partners", "The pilot bars already settle tabs through the product.", { evidence: ["E16"] }),
            a("feasibility", "Bikes break, batteries die", "Hardware fleets miss SLAs every winter.", { estimate: true, verdict: "glancing", impact: 1, note: "Real risk, thinly argued." }),
          ],
          v2: [
            d("gtm", "Riders still need recruiting", "Twenty bars mean nothing without couriers on corners.", "r3.v1.B.s2", { verdict: "parried" }),
            p("scale", "Every checkout counter needs this", "Tabs, tables, and group bills exist in every city.", { evidence: ["E15"], verdict: "partial", impact: 2, note: "Credible expansion, lightly sourced." }),
          ],
        },
        B: {
          v1: [
            p("feasibility", "Phones and bikes ship today", "No permits, no hardware build, just an app and a fleet deal.", { evidence: ["E18"] }),
            a("gtm", "Registers gate every bar", "Two vendors own the counter and ignore startups.", { estimate: true, verdict: "glancing", impact: 1, note: "A real gate, asserted not shown." }),
          ],
          v2: [
            d("feasibility", "Software breaks too", "Register outages kill Friday nights just as fast.", "r3.v1.A.s2", { evidence: ["E18"], verdict: "parried" }),
            a("scale", "Settlement caps at nightlife", "There is no second act past bars.", { estimate: true, verdict: "whiff", impact: 0, note: "Ignores the counter expansion." }),
          ],
        },
      },
    ),
    scoresAB: scores,
    scoresBA: scores,
    rationales: {
      problem: {
        comparison: "TabClear names a nightly loss with a sourced number; PaperRoute's pain is real but smaller.",
        A: "Hair on fire for a named persona with budget on the line. 7.",
        B: "Recurring irritation, not an existential cost. 5.",
      },
      market: {
        comparison: "TabClear sizes from registers outward; PaperRoute leans on one neighborhood.",
        A: "Credible expansion path past the first strip. 6.",
        B: "Niche geography, flat story. 5.",
      },
      wtp: {
        comparison: "One side redirects money already spent; the other splits new fees.",
        A: "Payer has precedent prices on the statement. 7.",
        B: "Payer exists but the split is unproven. 5.",
      },
      differentiation: {
        comparison: "Both meaningfully improve on today, neither ten-times the other.",
        A: "Better on one dimension customers care about. 6.",
        B: "Better on one dimension customers care about. 6.",
      },
      moat: {
        comparison: "Ledger history compounds; batching know-how travels with riders.",
        A: "One plausible moat that builds over time. 6.",
        B: "Head start only. 5.",
      },
      timing: {
        comparison: "Subsidies are a datable shift for fleets, not for settlement.",
        A: "A real change, but one everyone can use. 5.",
        B: "A specific cost shift with a visible window. 6.",
      },
      gtm: {
        comparison: "Named pilot bars beat an unnamed rider fleet.",
        A: "Named first customers and a cheap channel. 7.",
        B: "A channel named but unproven. 5.",
      },
      feasibility: {
        comparison: "An app plus a fleet is buildable, but winter SLAs are a named risk.",
        A: "Buildable with real risks. 5.",
        B: "Clear build path with off-the-shelf parts. 6.",
      },
      scale: {
        comparison: "Counters everywhere beat corridors somewhere.",
        A: "A path to $100M ARR through expansion. 6.",
        B: "Past the first corridors the story thins. 5.",
      },
    },
    roundSummaries: {
      1: "TabClear takes the market round on a sourced, expensive pain.",
      2: "A split moat round: ledger lock-in against subsidy timing.",
      3: "TabClear's register beachhead beats a fleet that still needs recruiting.",
    },
    report: {
      headline: "TabClear settles PaperRoute",
      whyTheyWon: [
        "Won problem, market, and willingness to pay with sourced numbers.",
        "Won go-to-market and venture scale on named pilot bars.",
        "PaperRoute's best rounds were not enough to close the gap.",
      ],
      turningPoint: { criterion: "gtm", text: "The twenty-bar pilot made distribution concrete." },
      loserTakeaways: ["Name the first riders, not just the first shops.", "Source the market size past one neighborhood."],
      announcer: "TabClear by decision. The receipts are on the board.",
    },
    scout: {
      A: "PaperRoute leans on one neighborhood and an unbuilt rider fleet.",
      B: "TabClear depends on register vendors who have ignored startups before.",
    },
  });
}

/** Quarterfinal 3: Dermalens (A, seed 2) over LoopRoom (B, seed 7). KO, PERFECT. */
export function dermaVsLoopTape(): ReturnType<typeof buildDemoTape> {
  const scores: Scores = {
    problem: { A: 8, B: 4 },
    market: { A: 7, B: 4 },
    wtp: { A: 7, B: 5 },
    differentiation: { A: 7, B: 5 },
    moat: { A: 6, B: 5 },
    timing: { A: 7, B: 4 },
    gtm: { A: 8, B: 4 },
    feasibility: { A: 7, B: 5 },
    scale: { A: 7, B: 4 },
  };
  return buildDemoTape({
    plans: rounds(
      {
        A: {
          v1: [
            p("problem", "Urgent lesions wait months unseen", "Waitlists pass two months while urgent cases sit in queue.", { evidence: ["E5"] }),
            a("market", "Voice rooms monetize like a hobby", "Freemium moderation tools have no payer with budget.", { estimate: true, verdict: "partial" }),
          ],
          v2: [
            d("problem", "Muted threads are not triage", "A mute button never escalated a single lesion.", "r1.v1.B.s1", { verdict: "parried" }),
            p("wtp", "Clinics already pay per screen", "The pilot priced per-screen above included volume.", { evidence: ["E19"] }),
          ],
        },
        B: {
          v1: [
            p("problem", "Threads never reach decisions", "Neighbors stall for days in text.", { evidence: ["E6"], verdict: "whiff", impact: 0, note: "Annoyance, not a cost." }),
            a("market", "Skin AI is a crowded shelf", "Every camera app claims triage now.", { estimate: true, verdict: "whiff", impact: 0, note: "No competitor named." }),
          ],
          v2: [
            d("problem", "Anxiety is still suffering", "Health scares in threads deserve better.", "r1.v1.A.s1", { evidence: ["E6"], verdict: "glancing", impact: 0, note: "Fair point, smaller stakes." }),
            a("wtp", "Clinics will not pay startups", "Procurement takes years.", { estimate: true, verdict: "whiff", impact: 0, note: "Contradicted by the pilot." }),
          ],
        },
      },
      {
        A: {
          v1: [
            p("differentiation", "Triage ranks, chat only scrolls", "Urgency ranking is the product, not a feature.", { evidence: ["E19"] }),
            a("moat", "Clinic data compounds", "Every screened photo sharpens the next rank.", { estimate: true, verdict: "partial" }),
          ],
          v2: [
            d("differentiation", "Voice notes decide nothing", "Notes pile up without urgency or ownership.", "r2.v1.B.s1", { verdict: "parried" }),
            p("timing", "Cameras crossed the bar", "Phone detail now meets screening standards.", { evidence: ["E20"] }),
          ],
        },
        B: {
          v1: [
            p("timing", "Voice notes already won", "Neighbors default to voice.", { evidence: ["E22"], verdict: "whiff", impact: 0, note: "A habit, not a window." }),
            a("differentiation", "Triage is a phone feature", "Apple will ship this in an update.", { estimate: true, verdict: "whiff", impact: 0, note: "Platform claim with no evidence." }),
          ],
          v2: [
            d("differentiation", "Ranking can be copied", "Anyone can sort a queue.", "r2.v1.A.s1", { evidence: ["E21"], verdict: "glancing", impact: 0, note: "True and beside the point." }),
            p("timing", "Evenings belong to voice", "The pilot drew steady regulars.", { evidence: ["E21"], verdict: "glancing", impact: 0, note: "Small base, honestly reported." }),
          ],
        },
      },
      {
        A: {
          v1: [
            p("gtm", "Three clinics already screen", "The pilot cut review time per referral in half.", { evidence: ["E19"] }),
            a("scale", "Rooms cap at neighborhoods", "No payer, no expansion, no acquirer.", { estimate: true, verdict: "partial" }),
          ],
          v2: [
            d("gtm", "Regulars are not distribution", "A steady crowd of thirty is not a channel.", "r3.v1.B.s1", { verdict: "parried" }),
            p("scale", "Every clinic has a queue", "Queues exist in every city with dermatology deserts.", { evidence: ["E5"], verdict: "partial" }),
          ],
        },
        B: {
          v1: [
            p("feasibility", "Rooms ship in a weekend", "Voice plus polls is off-the-shelf.", { evidence: ["E21"], verdict: "glancing", impact: 0, note: "Easy to build, easy to copy." }),
            a("gtm", "Clinics buy nothing fast", "Pilots die in procurement.", { estimate: true, verdict: "whiff", impact: 0, note: "The pilot already cleared it." }),
          ],
          v2: [
            d("feasibility", "Approval takes years", "Clinical validation will stall the rollout.", "r3.v1.A.s1", { evidence: ["E21"], verdict: "glancing", impact: 0, note: "A real risk, overstated." }),
            a("scale", "Triage caps at skin", "One body part is not a platform.", { estimate: true, verdict: "whiff", impact: 0, note: "Ignores the referral path." }),
          ],
        },
      },
    ),
    scoresAB: scores,
    scoresBA: scores,
    rationales: {
      problem: {
        comparison: "A clinical queue with harm against a chat annoyance.",
        A: "Hair on fire for a named persona with mandated need. 8.",
        B: "Real but occasional and low stakes. 4.",
      },
      market: {
        comparison: "Clinics with budgets against rooms without a payer.",
        A: "A meeting-ready market with a bottom-up path. 7.",
        B: "Niche and flat, sized by hope. 4.",
      },
      wtp: {
        comparison: "Per-screen pricing in a pilot against freemium hope.",
        A: "Payer has budget and precedent prices. 7.",
        B: "A payer exists but price sensitivity rules. 5.",
      },
      differentiation: {
        comparison: "Urgency ranking against another room app.",
        A: "Ten times better on ranking for an underserved segment. 7.",
        B: "Nicer, not different. 5.",
      },
      moat: {
        comparison: "Screening data compounds; room habits do not.",
        A: "One plausible moat that builds over time. 6.",
        B: "Head start only. 5.",
      },
      timing: {
        comparison: "Camera capability is datable; voice habits are background.",
        A: "A specific enabling shift with a window. 7.",
        B: "A vague trend everyone cites. 4.",
      },
      gtm: {
        comparison: "Three screening clinics against thirty regulars.",
        A: "Named first customers and a short cycle. 8.",
        B: "No channel beyond regulars. 4.",
      },
      feasibility: {
        comparison: "A shipped pilot against a weekend build nobody defends.",
        A: "Clear build path with mitigations. 7.",
        B: "Buildable, but copyable in a weekend. 5.",
      },
      scale: {
        comparison: "Every queue in every desert city against every block chat.",
        A: "A credible $1B outcome with expansion paths. 7.",
        B: "Hard to see past the neighborhood. 4.",
      },
    },
    roundSummaries: {
      1: "Dermalens sweeps the market round on harm and budgets.",
      2: "Compounding data beats a habit everyone already has.",
      3: "A shipped pilot ends it; the rooms never find a channel.",
    },
    report: {
      headline: "Dermalens blanks LoopRoom",
      whyTheyWon: [
        "Won every criterion, most of them by three points or more.",
        "Took no damage at all: a perfect defensive record.",
        "The pilot receipts answered every procurement objection.",
      ],
      turningPoint: { criterion: "gtm", text: "Three screening clinics ended the distribution debate." },
      loserTakeaways: ["Name a payer with a budget.", "Bring one number that is not about vibes."],
      announcer: "Dermalens by knockout. A perfect card, and it showed.",
    },
    scout: {
      A: "LoopRoom has no payer and no channel beyond regulars.",
      B: "Dermalens leans on one pilot; test the validation timeline.",
    },
  });
}

/** Quarterfinal 4: CurbBot (B, seed 6) over FlakeHunter (A, seed 3). DECISION, majority. */
export function flakeVsCurbTape(): ReturnType<typeof buildDemoTape> {
  const scoresAB: Scores = {
    problem: { A: 5, B: 6 },
    market: { A: 5, B: 6 },
    wtp: { A: 5, B: 5 },
    differentiation: { A: 5, B: 6 },
    moat: { A: 5, B: 5 },
    timing: { A: 6, B: 6 },
    gtm: { A: 5, B: 6 },
    feasibility: { A: 6, B: 6 },
    scale: { A: 6, B: 6 },
  };
  const scoresBA: Scores = {
    problem: { A: 6, B: 6 },
    market: { A: 5, B: 5 },
    wtp: { A: 6, B: 5 },
    differentiation: { A: 6, B: 6 },
    moat: { A: 6, B: 5 },
    timing: { A: 6, B: 7 },
    gtm: { A: 5, B: 6 },
    feasibility: { A: 6, B: 6 },
    scale: { A: 6, B: 7 },
  };
  return buildDemoTape({
    plans: rounds(
      {
        A: {
          v1: [
            p("problem", "Red builds teach teams apathy", "Most developers admit merging past red they assumed were flakes.", { evidence: ["E23"], verdict: "glancing", impact: 1, note: "Real pain, softer than lawsuits." }),
            a("market", "Curb budgets need councils", "One election can freeze every survey contract.", { estimate: true, verdict: "glancing", impact: 1, note: "True of budgets, thinly tied." }),
          ],
          v2: [
            d("problem", "Decrees do not buy software", "A court order is not a purchase order.", "r1.v1.B.s1", { verdict: "parried" }),
            p("wtp", "CI minutes already burn cash", "Retries eat a visible slice of CI spend today.", { evidence: ["E7"] }),
          ],
        },
        B: {
          v1: [
            p("problem", "Missing ramps bring lawsuits", "Settlements price each missing audit far above a survey.", { evidence: ["E26"] }),
            a("market", "CI tools crowd the shelf", "Flake detection ships inside every platform now.", { evidence: ["E25"], verdict: "partial", impact: 2, note: "Crowded shelf, sourced." }),
          ],
          v2: [
            d("market", "Surveys are not shelfware", "No platform photographs a curb.", "r1.v1.A.s2", { verdict: "parried" }),
            a("wtp", "Seats do not save minutes", "Per-seat pricing ignores the actual savings.", { estimate: true, verdict: "glancing", impact: 1, note: "Fair pricing question." }),
          ],
        },
      },
      {
        A: {
          v1: [
            p("differentiation", "Quarantine is the product", "Isolation plus repro data beats another dashboard.", { evidence: ["E24"], verdict: "glancing", impact: 1, note: "Better, not ten times." }),
            a("moat", "Robots rust, software compounds", "Every quarantine rule improves every customer.", { estimate: true, verdict: "partial" }),
          ],
          v2: [
            d("differentiation", "A photo is not ten times", "Clipboards with cameras already exist.", "r2.v1.B.s1", { verdict: "parried" }),
            p("moat", "Quarantine rules travel", "One team's flake pattern saves the next team.", { evidence: ["E24"] }),
          ],
        },
        B: {
          v1: [
            a("differentiation", "Robot survey is ten times", "A route grades in hours what crews take weeks to walk.", { evidence: ["E25"], verdict: "partial", impact: 2, note: "Sourced speed gap." }),
            p("timing", "Decree deadlines are binding", "Courts set dates; cities must inventory now.", { evidence: ["E8"] }),
          ],
          v2: [
            d("moat", "Rules are copyable configs", "Quarantine playbooks leak with every job hop.", "r2.v1.A.s2", { verdict: "parried" }),
            a("timing", "CI waste is eternal", "Flakes pained teams a decade ago too.", { estimate: true, verdict: "glancing", impact: 1, note: "Weakens the why-now." }),
          ],
        },
      },
      {
        A: {
          v1: [
            p("gtm", "Land in the CI config", "One config line quarantines the whole suite.", { evidence: ["E7"], verdict: "glancing", impact: 1, note: "Neat entry, crowded channel." }),
            a("feasibility", "Sidewalks fight robots", "Rain, vandals, and permits stall every route.", { estimate: true, verdict: "glancing", impact: 1, note: "Real friction, asserted." }),
          ],
          v2: [
            d("gtm", "Mile contracts crawl too", "Public procurement is slower than any config review.", "r3.v1.B.s1", { verdict: "parried" }),
            p("scale", "Every suite flakes eventually", "The pattern repeats in every large repo.", { evidence: ["E23"], verdict: "glancing", impact: 1, note: "True, capped by seat math." }),
          ],
        },
        B: {
          v1: [
            p("gtm", "Sell the mile, keep the monitor", "Survey contracts convert to annual monitoring.", { evidence: ["E26"] }),
            a("feasibility", "Quarantine needs no science", "Detection is statistics, not research.", { estimate: true, verdict: "glancing", impact: 1, note: "Concedes buildability." }),
          ],
          v2: [
            d("feasibility", "Routes already roll", "The robot photographs real blocks today.", "r3.v1.A.s2", { evidence: ["E25"], verdict: "parried" }),
            p("scale", "Every sidewalk in America", "Decrees stack city by city into a national map.", { evidence: ["E26"], verdict: "partial", impact: 2, note: "Expansion with a payer attached." }),
          ],
        },
      },
    ),
    scoresAB,
    scoresBA,
    rationales: {
      problem: {
        comparison: "One order sees lawsuits dwarf apathy; the other calls both mid-tier pains.",
        A: "Recurring pain for a definable group. 5.",
        B: "Mandated need with buyers facing penalties. 6.",
      },
      market: {
        comparison: "A crowded shelf against a budgeted mandate; orders disagree on the gap.",
        A: "Niche tooling spend, flat. 5.",
        B: "Per-mile budgets with deadlines attached. 6.",
      },
      wtp: {
        comparison: "Both redirect money already spent; neither dominates.",
        A: "Plausible margins on saved compute. 5.",
        B: "Plausible margins on survey spend. 5.",
      },
      differentiation: {
        comparison: "A robot route against a config line; both beat today modestly.",
        A: "Meaningfully better on one dimension. 5.",
        B: "Ten times faster on the survey dimension. 6.",
      },
      moat: {
        comparison: "Both claim compounding; neither convinces fully.",
        A: "One plausible moat over time. 5.",
        B: "Head start with physical routes. 5.",
      },
      timing: {
        comparison: "Binding deadlines beat eternal waste.",
        A: "A real change everyone can use. 6.",
        B: "A datable window that is already open. 6.",
      },
      gtm: {
        comparison: "Mile contracts with monitoring beat a config line in a crowd.",
        A: "A plausible channel, crowded. 5.",
        B: "A named buyer with a renewal path. 6.",
      },
      feasibility: {
        comparison: "Both ship; sidewalks and suites each add friction.",
        A: "Buildable with real risks. 6.",
        B: "Buildable with real risks. 6.",
      },
      scale: {
        comparison: "A national sidewalk map edges out seat-math caps.",
        A: "A path to $100M ARR through expansion. 6.",
        B: "Several expansion paths with the same payer. 6.",
      },
    },
    roundSummaries: {
      1: "CurbBot edges the market round; one order calls it close.",
      2: "Robot speed against quarantine rules, nearly even.",
      3: "The monitoring renewal tips a tight execution round.",
    },
    report: {
      headline: "CurbBot upsets FlakeHunter",
      whyTheyWon: [
        "Won problem, market, and differentiation on mandated money.",
        "Won go-to-market on contracts that renew into monitoring.",
        "FlakeHunter kept every round close but never led one.",
      ],
      turningPoint: { criterion: "gtm", text: "The monitoring renewal turned a contract into a stream." },
      loserTakeaways: ["Price against saved CI minutes, not seats.", "Name the buyer who signs this quarter."],
      announcer: "CurbBot by majority decision. The lower seed takes it.",
    },
    scout: {
      A: "CurbBot needs council budgets that elections can freeze.",
      B: "FlakeHunter sells into a shelf every platform already stocks.",
    },
  });
}

/** Semifinal 1: PermitPilot (A, seed 1) over TabClear (B, seed 4). KO; B leads round 1. */
export function permitVsTabTape(): ReturnType<typeof buildDemoTape> {
  const scores: Scores = {
    problem: { A: 6, B: 8 },
    market: { A: 6, B: 7 },
    wtp: { A: 6, B: 7 },
    differentiation: { A: 8, B: 5 },
    moat: { A: 7, B: 5 },
    timing: { A: 7, B: 6 },
    gtm: { A: 8, B: 5 },
    feasibility: { A: 6, B: 5 },
    scale: { A: 8, B: 4 },
  };
  return buildDemoTape({
    plans: rounds(
      {
        A: {
          v1: [
            p("problem", "Permits stall real builds", "Contractors wait months while crews sit idle.", { evidence: ["E1"], verdict: "glancing", impact: 1, note: "True, but tonight's pain is louder." }),
            a("market", "Bars are one street", "Nightlife cannot carry a venture outcome.", { estimate: true, verdict: "whiff", impact: 0, note: "Dismisses a real market." }),
          ],
          v2: [
            d("problem", "Walkouts still get paid", "Most tabs settle; stalled builds kill projects.", "r1.v1.B.s1", { evidence: ["E1"], verdict: "glancing", impact: 0, note: "Answered, not rebutted." }),
            p("wtp", "Contractors pay expediters", "Chase fees prove the budget exists.", { evidence: ["E11"], verdict: "glancing", impact: 1, note: "Budget shown, urgency lost." }),
          ],
        },
        B: {
          v1: [
            p("problem", "Friday night pays tonight", "Walkouts and slow closes bleed cash every weekend.", { evidence: ["E3"] }),
            a("market", "Permits are one city", "A single desk is a narrow beachhead.", { evidence: ["E15"], verdict: "partial", impact: 2, note: "Narrow today, sourced." }),
          ],
          v2: [
            d("market", "Registers are everywhere", "Every city has bars with the same rush.", "r1.v1.A.s2", { evidence: ["E16"], verdict: "parried" }),
            p("wtp", "Processors proved the cut", "Bars already surrender a cut of every tab.", { evidence: ["E15"] }),
          ],
        },
      },
      {
        A: {
          v1: [
            p("differentiation", "We file, then we chase", "The product does the follow-up, not just the form.", { evidence: ["E11"] }),
            a("moat", "Permit history compounds", "Every filing trains the next chase.", { estimate: true, verdict: "partial" }),
          ],
          v2: [
            d("differentiation", "Settlement is a feature", "Registers add tabs before startups scale.", "r2.v1.B.s1", { verdict: "parried" }),
            p("timing", "Desks are empty now", "Reviewer shortages open the window this year.", { evidence: ["E12"] }),
          ],
        },
        B: {
          v1: [
            p("differentiation", "Settlement at the table", "Nobody splits a group tab in seconds today.", { evidence: ["E16"], verdict: "glancing", impact: 1, note: "Better, not ten times." }),
            a("moat", "Chase playbooks leak", "Expediters carry the know-how door to door.", { estimate: true, verdict: "whiff", impact: 0, note: "Asserts away the data moat." }),
          ],
          v2: [
            d("moat", "Ledger exports exist", "Venues can take history anywhere.", "r2.v1.A.s2", { estimate: true, verdict: "glancing", impact: 0, note: "Heard, not proven." }),
            a("timing", "Shortages always existed", "Desks were slow a decade ago.", { estimate: true, verdict: "whiff", impact: 0, note: "Ignores the staffing memo." }),
          ],
        },
      },
      {
        A: {
          v1: [
            p("gtm", "Sell where fees already flow", "Sell to the shops that already charge for permits.", { evidence: ["E11"] }),
            p("scale", "Every city has a desk", "The backlog is not unique to San Francisco.", { evidence: ["E12"], verdict: "partial", impact: 2, note: "Expansion with receipts." }),
          ],
          v2: [
            d("gtm", "Registers gatekeep bars", "Two vendors own the counter.", "r3.v1.B.s2", { estimate: true, verdict: "parried" }),
            a("feasibility", "Hardware needs no permits", "Software files; robots wait on routes.", { estimate: true, verdict: "partial", impact: 2, note: "Build path is clearer." }),
          ],
        },
        B: {
          v1: [
            p("feasibility", "Settlement ships now", "Tabs settle through live registers today.", { evidence: ["E16"], verdict: "glancing", impact: 1, note: "Shipped, but capped." }),
            a("gtm", "Desks sell to nobody", "Governments buy software at glacial pace.", { estimate: true, verdict: "whiff", impact: 0, note: "Expediters are the buyer." }),
          ],
          v2: [
            d("feasibility", "Filings get rejected", "One bad packet burns weeks.", "r3.v1.A.s1", { evidence: ["E16"], verdict: "glancing", impact: 0, note: "A risk, not a verdict." }),
            a("scale", "Permits cap at housing", "One desk, one city, one ceiling.", { estimate: true, verdict: "whiff", impact: 0, note: "Ignores every other desk." }),
          ],
        },
      },
    ),
    scoresAB: scores,
    scoresBA: scores,
    rationales: {
      problem: {
        comparison: "Tonight's bleeding cash beats this quarter's stalled builds.",
        A: "Recurring pain for a definable group. 6.",
        B: "Hair on fire with nightly losses. 8.",
      },
      market: {
        comparison: "Bars everywhere today against desks everywhere tomorrow.",
        A: "Credible path, narrower today. 6.",
        B: "Broad nightlife spend with growth. 7.",
      },
      wtp: {
        comparison: "A cut of every tab tonight beats chase fees someday.",
        A: "Clear payer with an analog. 6.",
        B: "Payer has budget and precedent prices. 7.",
      },
      differentiation: {
        comparison: "Doing the follow-up is ten times the form.",
        A: "Ten times better on the chase dimension. 8.",
        B: "Meaningfully better on one dimension. 5.",
      },
      moat: {
        comparison: "Filing history compounds; ledger exports travel.",
        A: "A compounding moat with a path to it. 7.",
        B: "One plausible moat at best. 5.",
      },
      timing: {
        comparison: "Empty desks now against eternal nightlife.",
        A: "A specific staffing shift with a window. 7.",
        B: "A real change everyone can use. 6.",
      },
      gtm: {
        comparison: "Expediters who already charge beat registers that gatekeep.",
        A: "Named first customers and a cheap channel. 8.",
        B: "A plausible channel with a gate. 5.",
      },
      feasibility: {
        comparison: "Both ship; filings risk rejection, registers risk vendors.",
        A: "Clear build path with mitigations. 6.",
        B: "Buildable with real risks. 5.",
      },
      scale: {
        comparison: "Every desk in every city dwarfs every bar tab.",
        A: "A credible $1B outcome with expansion. 8.",
        B: "Past nightlife the story thins. 4.",
      },
    },
    roundSummaries: {
      1: "TabClear stuns the favorite and leads after round 1.",
      2: "PermitPilot answers with the chase and the compounding file.",
      3: "Every desk in every city closes the show.",
    },
    report: {
      headline: "PermitPilot rallies past TabClear",
      whyTheyWon: [
        "Lost round 1, then swept moat and execution by wide margins.",
        "Won differentiation and scale by a combined seven points.",
        "The expediter channel answered every distribution doubt.",
      ],
      turningPoint: { criterion: "differentiation", text: "Doing the follow-up turned the fight in round 2." },
      loserTakeaways: ["Answer the data moat, not the form.", "Bring a second act past nightlife."],
      announcer: "PermitPilot by knockout, after trailing early. What a rally.",
    },
    scout: {
      A: "TabClear leans on register vendors and one street of bars.",
      B: "PermitPilot sells patience to contractors who need speed.",
    },
  });
}

/** Semifinal 2: CurbBot (B, seed 6) over Dermalens (A, seed 2). DECISION, unanimous. */
export function dermaVsCurbTape(): ReturnType<typeof buildDemoTape> {
  const scores: Scores = {
    problem: { A: 6, B: 7 },
    market: { A: 5, B: 6 },
    wtp: { A: 6, B: 6 },
    differentiation: { A: 6, B: 7 },
    moat: { A: 6, B: 6 },
    timing: { A: 5, B: 7 },
    gtm: { A: 6, B: 7 },
    feasibility: { A: 7, B: 6 },
    scale: { A: 5, B: 6 },
  };
  return buildDemoTape({
    plans: rounds(
      {
        A: {
          v1: [
            p("problem", "Lesions wait months unseen", "Queues pass two months while urgent cases sit.", { evidence: ["E5"], verdict: "glancing", impact: 1, note: "Real harm, capped by triage limits." }),
            a("market", "Surveys need council votes", "Budgets freeze on election cycles.", { estimate: true, verdict: "whiff", impact: 0, note: "Decrees bind the budgets." }),
          ],
          v2: [
            d("problem", "Decrees are not patients", "Courts do not feel pain.", "r1.v1.B.s1", { verdict: "parried" }),
            p("wtp", "Screens already have prices", "Per-screen fees cleared the pilot.", { evidence: ["E19"], verdict: "glancing", impact: 1, note: "Priced, but capped." }),
          ],
        },
        B: {
          v1: [
            p("problem", "Settlements dwarf the survey", "Settlements dwarf every survey quote.", { evidence: ["E26"] }),
            a("market", "Triage caps at dermatology", "One specialty cannot carry the multiple.", { evidence: ["E25"], verdict: "partial", impact: 2, note: "Sourced ceiling." }),
          ],
          v2: [
            d("market", "Decrees stack city by city", "Each settlement funds the next survey.", "r1.v1.A.s2", { evidence: ["E26"], verdict: "parried" }),
            a("wtp", "Pilots are not procurement", "Three clinics do not make a budget line.", { estimate: true, verdict: "glancing", impact: 1, note: "Fair, not fatal." }),
          ],
        },
      },
      {
        A: {
          v1: [
            p("differentiation", "Urgency ranking saves visits", "Ranking beats first-come queues.", { evidence: ["E19"], verdict: "glancing", impact: 1, note: "Better, not ten times." }),
            a("moat", "Routes are just driving", "Any fleet can photograph a curb.", { estimate: true, verdict: "glancing", impact: 1, note: "Underrates the grading data." }),
          ],
          v2: [
            d("differentiation", "Photos are not grades", "A picture without a standard decides nothing.", "r2.v1.B.s1", { verdict: "parried" }),
            a("timing", "Decrees have no window", "Courts renew pressure forever.", { estimate: true, verdict: "whiff", impact: 0, note: "Deadlines are the window." }),
          ],
        },
        B: {
          v1: [
            p("differentiation", "Grades beat clipboards", "A scored ramp inventory never existed.", { evidence: ["E25"] }),
            p("timing", "Deadlines bind this year", "Inventory dates fall inside this budget cycle.", { evidence: ["E8"] }),
          ],
          v2: [
            d("moat", "Photos compound too", "Every graded mile trains the next grader.", "r2.v1.A.s2", { evidence: ["E25"], verdict: "parried" }),
            a("moat", "Models copy triage fast", "Screening papers publish yearly.", { estimate: true, verdict: "glancing", impact: 1, note: "Papers are not products." }),
          ],
        },
      },
      {
        A: {
          v1: [
            p("scale", "Ninety percent skip screening", "A national backlog waits past the pilot.", { evidence: ["E9"], verdict: "landed", impact: 2, note: "Scored from the claim." }),
            a("gtm", "Miles need mayors", "Robots wait on procurement calendars.", { estimate: true, verdict: "glancing", impact: 1, note: "Slow, but funded." }),
          ],
          v2: [
            d("gtm", "Monitors renew themselves", "Annual subscriptions beat re-bids.", "r3.v1.B.s1", { estimate: true, verdict: "glancing", impact: 0, note: "Concedes the renewal." }),
            p("feasibility", "Triage already screens", "Real clinics grade real photos today.", { evidence: ["E19"] }),
          ],
        },
        B: {
          v1: [
            p("gtm", "Surveys become monitoring", "Each mile converts to an annual subscription.", { evidence: ["E26"] }),
            a("scale", "Skin caps at one organ", "No payer funds the whole body.", { evidence: ["E8"], verdict: "partial", impact: 2, note: "Ceiling with a source." }),
          ],
          v2: [
            d("scale", "That backlog is not sourced", "No locker item counts the unscreened.", "r3.v1.A.s1", { verdict: "parried" }),
            a("feasibility", "Validation takes years", "Clinical proof slows every rollout.", { estimate: true, verdict: "glancing", impact: 1, note: "A tax, not a block." }),
          ],
        },
      },
    ),
    scoresAB: scores,
    scoresBA: scores,
    rationales: {
      problem: {
        comparison: "Lawsuits with penalties edge clinical queues.",
        A: "Recurring pain for a definable group. 6.",
        B: "Hair on fire with mandated spend. 7.",
      },
      market: {
        comparison: "Per-mile mandates beat a single specialty.",
        A: "Niche clinical spend, flat. 5.",
        B: "Budgeted surveys with growth. 6.",
      },
      wtp: {
        comparison: "Both redirect money already allocated.",
        A: "Plausible margins on screens. 6.",
        B: "Plausible margins on surveys. 6.",
      },
      differentiation: {
        comparison: "A first inventory beats a better queue.",
        A: "Meaningfully better on ranking. 6.",
        B: "Ten times faster than walking crews. 7.",
      },
      moat: {
        comparison: "Grading data and screening data both compound modestly.",
        A: "One plausible moat over time. 6.",
        B: "One plausible moat over time. 6.",
      },
      timing: {
        comparison: "This year's deadlines beat an eternal queue.",
        A: "A real change everyone can use. 5.",
        B: "A datable window already open. 7.",
      },
      gtm: {
        comparison: "Miles that renew beat clinics that pilot.",
        A: "A plausible channel, slow cycle. 6.",
        B: "A named buyer with renewals. 7.",
      },
      feasibility: {
        comparison: "Screening today beats routes in the rain.",
        A: "Clear build path, shipping now. 7.",
        B: "Buildable with weather risks. 6.",
      },
      scale: {
        comparison: "A national sidewalk map beats one specialty.",
        A: "Capped by the organ. 5.",
        B: "Several expansion paths, same payer. 6.",
      },
    },
    roundSummaries: {
      1: "CurbBot takes the market round on mandated money.",
      2: "Deadlines and first inventory keep the lead.",
      3: "A fabricated backlog number blows up in Dermalens' face.",
    },
    report: {
      headline: "CurbBot stuns Dermalens",
      whyTheyWon: [
        "Won problem, market, and timing on binding deadlines.",
        "Won go-to-market on surveys that renew into monitoring.",
        "Dermalens took a fabrication penalty on an unsourced backlog.",
      ],
      turningPoint: { criterion: "timing", text: "This year's inventory dates settled the urgency debate." },
      loserTakeaways: ["Cite a real source for the backlog.", "Answer the renewal, not just the pilot."],
      announcer: "CurbBot by unanimous decision. The decree deadlines held up.",
    },
    scout: {
      A: "CurbBot routes face weather, vandals, and procurement calendars.",
      B: "Dermalens leans on one pilot; press the validation timeline.",
    },
  });
}

/** Final: PermitPilot (A, seed 1) over CurbBot (B, seed 6). SUDDEN_DEATH, 3 to 1. */
export function finalTape(): ReturnType<typeof buildDemoTape> {
  const scores: Scores = even(5);
  const tied = (line: string): { comparison: string; A: string; B: string } => ({
    comparison: line,
    A: "Typical of an SF pitch, honestly argued. 5.",
    B: "Typical of an SF pitch, honestly argued. 5.",
  });
  return buildDemoTape({
    plans: rounds(
      {
        A: {
          v1: [
            p("problem", "Packets stall real builds", "Crews sit idle while packets crawl.", { evidence: ["E1"], verdict: "partial", impact: 2, note: "Sourced, matched." }),
            a("market", "Surveys need councils", "Budgets move at election speed.", { estimate: true, verdict: "glancing", impact: 1, note: "True and matched." }),
          ],
          v2: [
            d("problem", "Pain is still pain", "Lawsuits and layoffs both bleed.", "r1.v1.B.s1", { verdict: "parried" }),
            p("wtp", "Chase fees prove budget", "Expediters cash the same check.", { evidence: ["E11"], verdict: "partial", impact: 2, note: "Priced, matched." }),
          ],
        },
        B: {
          v1: [
            p("problem", "Ramps block real people", "Broken access strands riders daily.", { evidence: ["E8"], verdict: "partial", impact: 2, note: "Sourced, matched." }),
            a("market", "Permits are one desk", "A single city starts narrow.", { estimate: true, verdict: "glancing", impact: 1, note: "True and matched." }),
          ],
          v2: [
            d("market", "Desks repeat everywhere", "Every city queues the same forms.", "r1.v1.A.s2", { evidence: ["E12"], verdict: "parried" }),
            p("wtp", "Miles already have prices", "Survey quotes sit in budgets.", { evidence: ["E25"], verdict: "partial", impact: 2, note: "Priced, matched." }),
          ],
        },
      },
      {
        A: {
          v1: [
            p("differentiation", "Chase is the product", "Follow-up beats another form.", { evidence: ["E11"], verdict: "partial", impact: 2, note: "Better, matched." }),
            a("moat", "Routes can be walked", "Crews already grade by hand.", { estimate: true, verdict: "glancing", impact: 1, note: "True and matched." }),
          ],
          v2: [
            d("differentiation", "Photos are table stakes", "Pictures alone decide nothing.", "r2.v1.B.s1", { verdict: "parried" }),
            p("timing", "Desks empty this year", "Shortages open the window now.", { evidence: ["E12"], verdict: "partial", impact: 2, note: "Dated, matched." }),
          ],
        },
        B: {
          v1: [
            p("differentiation", "Grades never existed", "No scored inventory came before.", { evidence: ["E25"], verdict: "partial", impact: 2, note: "Better, matched." }),
            a("moat", "Playbooks walk away", "Filing know-how travels with staff.", { estimate: true, verdict: "glancing", impact: 1, note: "True and matched." }),
          ],
          v2: [
            d("moat", "Miles train graders", "Each route sharpens the next.", "r2.v1.A.s2", { evidence: ["E25"], verdict: "parried" }),
            p("timing", "Deadlines bind now", "Inventory dates hit this cycle.", { evidence: ["E8"], verdict: "partial", impact: 2, note: "Dated, matched." }),
          ],
        },
      },
      {
        A: {
          v1: [
            p("gtm", "Expediters sell it first", "The channel already charges today.", { evidence: ["E11"], verdict: "partial", impact: 2, note: "Named, matched." }),
            a("scale", "Maps cap at sidewalks", "Concrete ends somewhere.", { estimate: true, verdict: "glancing", impact: 1, note: "True and matched." }),
          ],
          v2: [
            d("gtm", "Monitors still need mayors", "Renewals ride procurement too.", "r3.v1.B.s2", { estimate: true, verdict: "parried" }),
            p("scale", "Desks fill every city", "Housing backlogs repeat nationwide.", { evidence: ["E12"], verdict: "partial", impact: 2, note: "Broad, matched." }),
          ],
        },
        B: {
          v1: [
            p("feasibility", "Routes roll today", "The robot photographs real blocks.", { evidence: ["E25"], verdict: "partial", impact: 2, note: "Shipping, matched." }),
            a("gtm", "Desks buy slowly", "Governments deliberate for years.", { estimate: true, verdict: "glancing", impact: 1, note: "True and matched." }),
          ],
          v2: [
            d("feasibility", "Packets get rejected", "One error burns weeks.", "r3.v1.A.s1", { estimate: true, verdict: "parried" }),
            a("scale", "Desks cap at housing", "One department, one ceiling.", { estimate: true, verdict: "glancing", impact: 1, note: "True and matched." }),
          ],
        },
      },
    ),
    scoresAB: scores,
    scoresBA: scores,
    rationales: {
      problem: tied("Mandated access against stalled livelihoods; neither outranks the other."),
      market: tied("Both size bottom-up from real budgets; both start local."),
      wtp: tied("Both redirect money already spent by named payers."),
      differentiation: tied("Each ten-times one dimension the other ignores."),
      moat: tied("Each compounds data the other cannot easily copy."),
      timing: tied("Both windows are datable and open right now."),
      gtm: tied("Both name a channel with a named first buyer."),
      feasibility: tied("Both ship with off-the-shelf parts and named risks."),
      scale: tied("Both plausibly grow past the first market; neither proves it."),
    },
    roundSummaries: {
      1: "Dead even: lawsuits against layoffs, budgets against budgets.",
      2: "Dead even: first inventory against the follow-up.",
      3: "Dead even: renewals against expediters. The judges need more.",
    },
    report: {
      headline: "PermitPilot takes the belt in sudden death",
      whyTheyWon: [
        "The scoreline was a draw across all nine criteria.",
        "Three sudden-death votes picked the permit chase.",
        "The cascade stopped at the judges, 3 to 1.",
      ],
      turningPoint: { text: "The closing volley tipped a tied card." },
      loserTakeaways: ["Separate the idea on one criterion.", "Bring a sourced number next time."],
      announcer: "Sudden death. PermitPilot takes the belt, three votes to one.",
    },
    scout: {
      A: "CurbBot leans on procurement calendars and fair weather.",
      B: "PermitPilot leans on expediter goodwill and staffing gaps.",
    },
    suddenDeath: {
      closings: {
        A: { headline: "Permits bleed money today", claim: "Contractors already pay for the chase, and every desk repeats the backlog." },
        B: { headline: "A map of every curb", claim: "Decrees stack city by city, and each mile renews into monitoring." },
      },
      votes: {
        AB1: { winner: "fighter_1", analysis: "The permit chase names a buyer paying today for the exact work.", decidingFactor: "Willingness to pay is concrete now." },
        BA1: { winner: "fighter_2", analysis: "The inventory deadline forces spend this cycle, not someday.", decidingFactor: "Timing pressure is sharper." },
        AB2: { winner: "fighter_1", analysis: "Expediters prove the channel where robots still need mayors.", decidingFactor: "Go-to-market is one step shorter." },
        BA2: { winner: "fighter_1", analysis: "A national map of desks beats a national map of curbs on payer count.", decidingFactor: "Scale reaches more buyers." },
      },
    },
  });
}
