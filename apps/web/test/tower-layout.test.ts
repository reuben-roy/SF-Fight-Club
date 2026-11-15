import { describe, expect, it } from "vitest";

import { chartAt, buildSyntheticTournament } from "../src/tower/fixtures/tournament.js";
import {
  layoutOrgChart,
  layoutOptionsFor,
  tileInDirection,
  type LayoutTile,
  type OrgChartLayout,
} from "../src/tower/layout.js";
import type { OrgChart, OrgNode } from "@sf-fight-club/schemas";

const SIZES = [2, 3, 4, 5, 7, 8, 9, 12, 16, 17, 24, 32, 33, 48, 64] as const;

function nodes(chart: OrgChart): OrgNode[] {
  const out: OrgNode[] = [];
  const walk = (node: OrgNode): void => {
    out.push(node);
    node.reports.forEach(walk);
  };
  chart.roots.forEach(walk);
  return out;
}

function overlaps(left: LayoutTile, right: LayoutTile): boolean {
  return (
    left.x < right.x + right.width &&
    right.x < left.x + left.width &&
    left.y < right.y + right.height &&
    right.y < left.y + left.height
  );
}

function chartsFor(size: number): OrgChart[] {
  const data = buildSyntheticTournament({ size, seed: "layout-property" });
  const steps = new Set([0, 1, Math.floor(data.results.length / 2), data.results.length]);
  return [...steps].map((step) => chartAt(data, step));
}

describe("layoutOrgChart", () => {
  it("places every entrant exactly once with no overlapping tiles", () => {
    for (const size of SIZES) {
      for (const chart of chartsFor(size)) {
        const layout = layoutOrgChart({ chart });
        const ids = layout.tiles.map((tile) => tile.entrantId);
        expect(new Set(ids).size, `size ${size}: unique tiles`).toBe(ids.length);
        expect(new Set(ids), `size ${size}: every entrant`).toEqual(
          new Set(nodes(chart).map((node) => node.entrantId)),
        );
        for (let left = 0; left < layout.tiles.length; left += 1) {
          for (let right = left + 1; right < layout.tiles.length; right += 1) {
            const a = layout.tiles[left];
            const b = layout.tiles[right];
            if (!a || !b) continue;
            expect(overlaps(a, b), `size ${size}: ${a.entrantId} overlaps ${b.entrantId}`).toBe(false);
          }
        }
      }
    }
  });

  it("centres a parent over its reports", () => {
    for (const size of SIZES) {
      for (const chart of chartsFor(size)) {
        const layout = layoutOrgChart({ chart });
        const byId = new Map(layout.tiles.map((tile) => [tile.entrantId, tile]));
        const extent = (node: OrgNode): { left: number; right: number } => {
          const tile = byId.get(node.entrantId);
          if (!tile) throw new Error(`no tile for ${node.entrantId}`);
          let left = tile.x;
          let right = tile.x + tile.width;
          for (const report of node.reports) {
            const child = extent(report);
            left = Math.min(left, child.left);
            right = Math.max(right, child.right);
          }
          return { left, right };
        };
        const walk = (node: OrgNode): void => {
          if (node.reports.length > 0) {
            const parent = byId.get(node.entrantId);
            const first = node.reports[0];
            const last = node.reports[node.reports.length - 1];
            if (parent && first && last) {
              const group = { left: extent(first).left, right: extent(last).right };
              const parentCentre = parent.x + parent.width / 2;
              expect(Math.abs(parentCentre - (group.left + group.right) / 2), `size ${size}: ${node.entrantId}`).toBeLessThanOrEqual(1);
            }
          }
          node.reports.forEach(walk);
        };
        chart.roots.forEach(walk);
      }
    }
  });

  it("keeps roots on the top row in bracket order", () => {
    for (const size of SIZES) {
      for (const chart of chartsFor(size)) {
        const layout = layoutOrgChart({ chart });
        const roots = layout.tiles.filter((tile) => tile.depth === 0);
        expect(roots.map((tile) => tile.entrantId)).toEqual(chart.roots.map((root) => root.entrantId));
        for (let index = 1; index < roots.length; index += 1) {
          const previous = roots[index - 1];
          const current = roots[index];
          if (!previous || !current) continue;
          expect(current.x).toBeGreaterThan(previous.x + previous.width);
          expect(current.y).toBe(previous.y);
        }
      }
    }
  });

  it("draws connectors with only horizontal and vertical segments", () => {
    for (const size of SIZES) {
      for (const chart of chartsFor(size)) {
        const layout: OrgChartLayout = layoutOrgChart({ chart });
        expect(layout.connectors.length).toBe(nodes(chart).length - chart.roots.length);
        for (const connector of layout.connectors) {
          expect(connector.segments.length).toBeGreaterThan(0);
          for (const segment of connector.segments) {
            const horizontal = segment.y1 === segment.y2;
            const vertical = segment.x1 === segment.x2;
            expect(horizontal || vertical, `size ${size}: ${connector.fromId} to ${connector.toId}`).toBe(true);
          }
        }
      }
    }
  });

  it("is deterministic and reports the size it used", () => {
    const chart = chartsFor(16)[1];
    if (!chart) throw new Error("no chart");
    expect(layoutOrgChart({ chart })).toEqual(layoutOrgChart({ chart }));
    expect(layoutOrgChart({ chart }).options).toEqual(layoutOptionsFor(chart));
  });

  it("shrinks tiles as the field grows", () => {
    const small = layoutOptionsFor(chartsFor(8).at(-1) ?? chartsFor(8)[0]!);
    const large = layoutOptionsFor(chartsFor(32).at(-1) ?? chartsFor(32)[0]!);
    expect(large.tile.width).toBeLessThan(small.tile.width);
    expect(large.tile.height).toBeLessThan(small.tile.height);
  });
});

describe("tileInDirection", () => {
  it("walks to the nearest neighbour on each side", () => {
    const chart = chartAt(buildSyntheticTournament({ size: 8, seed: "keys" }), 4);
    const layout = layoutOrgChart({ chart });
    const top = layout.tiles.filter((tile) => tile.depth === 0);
    const first = top[0];
    const second = top[1];
    if (!first || !second) throw new Error("no roots");
    expect(tileInDirection({ tiles: layout.tiles, fromId: first.entrantId, direction: "right" })).toBe(second.entrantId);
    expect(tileInDirection({ tiles: layout.tiles, fromId: second.entrantId, direction: "left" })).toBe(first.entrantId);
    expect(tileInDirection({ tiles: layout.tiles, fromId: first.entrantId, direction: "left" })).toBeNull();
  });
});
