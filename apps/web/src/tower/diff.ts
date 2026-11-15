import type { OrgChart, OrgNode, OrgTitle } from "@sf-fight-club/schemas";

import type { TowerMatch } from "./types.js";

export interface Acquisition {
  loserId: string;
  winnerId: string;
  via: "FIGHT" | "WALKOVER";
  /** The loser and everything it already owns, in pre-order. */
  subtreeIds: string[];
}

export interface Promotion {
  entrantId: string;
  from: OrgTitle;
  to: OrgTitle;
}

export interface HeadcountChange {
  entrantId: string;
  from: number;
  to: number;
}

export interface OrgChartDiff {
  acquisitions: Acquisition[];
  promotions: Promotion[];
  headcounts: HeadcountChange[];
  changed: boolean;
}

export interface DiffOrgChartsInput {
  previous: OrgChart;
  next: OrgChart;
}

function flatten(chart: OrgChart): Map<string, OrgNode> {
  const nodes = new Map<string, OrgNode>();
  const walk = (node: OrgNode): void => {
    nodes.set(node.entrantId, node);
    node.reports.forEach(walk);
  };
  chart.roots.forEach(walk);
  return nodes;
}

function subtree(node: OrgNode): string[] {
  const ids: string[] = [];
  const walk = (entry: OrgNode): void => {
    ids.push(entry.entrantId);
    entry.reports.forEach(walk);
  };
  walk(node);
  return ids;
}

/**
 * The story between two charts: who got acquired, who got promoted, and whose
 * headcount moved. One completed fight produces one of each, which is what the
 * acquisition animation plays.
 */
export function diffOrgCharts(input: DiffOrgChartsInput): OrgChartDiff {
  const before = flatten(input.previous);
  const acquisitions: Acquisition[] = [];
  const promotions: Promotion[] = [];
  const headcounts: HeadcountChange[] = [];

  const walk = (node: OrgNode): void => {
    const previous = before.get(node.entrantId);
    if (node.defeatedBy !== null && (previous === undefined || previous.defeatedBy === null) && node.via !== null) {
      acquisitions.push({
        loserId: node.entrantId,
        winnerId: node.defeatedBy,
        via: node.via,
        subtreeIds: subtree(node),
      });
    }
    if (previous !== undefined && previous.title !== node.title) {
      promotions.push({ entrantId: node.entrantId, from: previous.title, to: node.title });
    }
    if (previous !== undefined && previous.headcount !== node.headcount) {
      headcounts.push({ entrantId: node.entrantId, from: previous.headcount, to: node.headcount });
    }
    node.reports.forEach(walk);
  };
  input.next.roots.forEach(walk);

  return {
    acquisitions,
    promotions,
    headcounts,
    changed: acquisitions.length > 0 || promotions.length > 0 || headcounts.length > 0,
  };
}

export interface NextMeeting {
  matchId: string;
  roundIndex: number;
  slotIndex: number;
  status: TowerMatch["status"];
  leftId: string;
  rightId: string;
  leftIndex: number;
}

export interface NextMeetingsInput {
  chart: OrgChart;
  matches: readonly TowerMatch[];
}

/**
 * Adjacent roots that have a match waiting. Only matches with both sides known
 * and not yet complete can join two roots, so a sealed result never appears here.
 */
export function nextMeetings(input: NextMeetingsInput): NextMeeting[] {
  const open = new Map<string, TowerMatch>();
  for (const match of input.matches) {
    if (match.status === "complete" || match.a === null || match.b === null) continue;
    open.set(`${match.a}::${match.b}`, match);
  }

  const meetings: NextMeeting[] = [];
  for (let index = 0; index < input.chart.roots.length - 1; index += 1) {
    const left = input.chart.roots[index];
    const right = input.chart.roots[index + 1];
    if (!left || !right) continue;
    const match = open.get(`${left.entrantId}::${right.entrantId}`) ?? open.get(`${right.entrantId}::${left.entrantId}`);
    if (!match) continue;
    meetings.push({
      matchId: match.matchId,
      roundIndex: match.roundIndex,
      slotIndex: match.slotIndex,
      status: match.status,
      leftId: left.entrantId,
      rightId: right.entrantId,
      leftIndex: index,
    });
  }
  return meetings;
}
