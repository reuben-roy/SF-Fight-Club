import type { ReactElement } from "react";

import type { OrgChart, OrgNode, OrgTitle } from "@sf-fight-club/schemas";
import { ORG_TITLES, classNames } from "../styles/components.js";

export function titleLadder(chart: OrgChart): OrgTitle[] {
  const rungs = Math.max(1, chart.rounds + 1);
  return ORG_TITLES.slice(ORG_TITLES.length - rungs);
}

function walk(chart: OrgChart, visit: (node: OrgNode) => void): void {
  const step = (node: OrgNode): void => {
    visit(node);
    node.reports.forEach(step);
  };
  chart.roots.forEach(step);
}

export function titleCounts(chart: OrgChart): Map<OrgTitle, number> {
  const counts = new Map<OrgTitle, number>();
  walk(chart, (node) => counts.set(node.title, (counts.get(node.title) ?? 0) + 1));
  return counts;
}

export function highestEarnedTitle(chart: OrgChart): OrgTitle {
  let highest = 0;
  walk(chart, (node) => {
    highest = Math.max(highest, ORG_TITLES.indexOf(node.title));
  });
  return ORG_TITLES[highest] ?? "Intern";
}

export interface FloorsRailProps {
  chart: OrgChart;
}

/**
 * The ladder for this tournament, highest rung first. Every rung below the top
 * one is a floor a company can still hold; the highest earned rung is lit.
 */
export function FloorsRail({ chart }: FloorsRailProps): ReactElement {
  const ladder = titleLadder(chart);
  const counts = titleCounts(chart);
  const highest = highestEarnedTitle(chart);
  const highestIndex = ORG_TITLES.indexOf(highest);

  return (
    <nav className="floors" aria-label="Title ladder">
      <span className="floors__label">Floors</span>
      <ol className="floors__list">
        {ladder
          .slice()
          .reverse()
          .map((title) => {
            const index = ORG_TITLES.indexOf(title);
            const reached = index <= highestIndex;
            return (
              <li
                key={title}
                className={classNames(
                  "floors__rung",
                  reached && "floors__rung--reached",
                  title === highest && "floors__rung--current",
                )}
              >
                <span className="floors__name">{title}</span>
                <span className="floors__count">{counts.get(title) ?? 0}</span>
              </li>
            );
          })}
      </ol>
      <span className="floors__note">{chart.rounds} rounds</span>
    </nav>
  );
}
