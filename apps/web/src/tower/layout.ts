import type { OrgChart, OrgNode } from "@sf-fight-club/schemas";

export interface TileSize {
  width: number;
  height: number;
}

export interface LayoutOptions {
  tile: TileSize;
  /** Space between two reports of the same parent. */
  siblingGap: number;
  /** Space between two root trees. Wide enough for the VS link. */
  rootGap: number;
  rowGap: number;
  padding: number;
}

export const LAYOUT_PRESETS: Readonly<Record<"eight" | "sixteen" | "many", LayoutOptions>> = {
  eight: {
    tile: { width: 152, height: 138 },
    siblingGap: 22,
    rootGap: 96,
    rowGap: 46,
    padding: 20,
  },
  sixteen: {
    tile: { width: 132, height: 122 },
    siblingGap: 18,
    rootGap: 84,
    rowGap: 38,
    padding: 18,
  },
  many: {
    tile: { width: 108, height: 106 },
    siblingGap: 14,
    rootGap: 76,
    rowGap: 30,
    padding: 14,
  },
};

export function fieldSizeOf(chart: OrgChart): number {
  return chart.roots.reduce((total, root) => total + root.headcount, 0);
}

/** Tiles shrink as the field grows; the stage scrolls instead of crowding. */
export function layoutOptionsFor(chart: OrgChart): LayoutOptions {
  const fieldSize = fieldSizeOf(chart);
  if (fieldSize > 16) return LAYOUT_PRESETS.many;
  if (fieldSize > 8) return LAYOUT_PRESETS.sixteen;
  return LAYOUT_PRESETS.eight;
}

export interface LayoutTile {
  entrantId: string;
  parentId: string | null;
  depth: number;
  rootIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  reportCount: number;
}

export interface LayoutSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface LayoutConnector {
  fromId: string;
  toId: string;
  segments: readonly LayoutSegment[];
}

export interface OrgChartLayout {
  tiles: LayoutTile[];
  connectors: LayoutConnector[];
  width: number;
  height: number;
  options: LayoutOptions;
}

export interface LayoutOrgChartInput {
  chart: OrgChart;
  options?: LayoutOptions;
}

function subtreeWidth(node: OrgNode, options: LayoutOptions): number {
  const { tile, siblingGap } = options;
  if (node.reports.length === 0) return tile.width;
  const children = node.reports.reduce(
    (total, report) => total + subtreeWidth(report, options),
    siblingGap * (node.reports.length - 1),
  );
  return Math.max(tile.width, children);
}

/**
 * Tidy tree over the org chart. Roots sit on one top row in bracket order and
 * every root's reports hang beneath it. A parent is centred over its reports and
 * no two tiles can share a cell because a subtree owns the full width it needs.
 */
export function layoutOrgChart(input: LayoutOrgChartInput): OrgChartLayout {
  const options = input.options ?? layoutOptionsFor(input.chart);
  const { tile, padding, rowGap, rootGap, siblingGap } = options;
  const tiles: LayoutTile[] = [];
  const connectors: LayoutConnector[] = [];
  const rowStride = tile.height + rowGap;
  let cursor = padding;
  let lowest = 0;

  const place = (
    node: OrgNode,
    left: number,
    depth: number,
    rootIndex: number,
    parentId: string | null,
  ): LayoutTile => {
    const width = subtreeWidth(node, options);
    const x = left + Math.round((width - tile.width) / 2);
    const y = padding + depth * rowStride;
    const placed: LayoutTile = {
      entrantId: node.entrantId,
      parentId,
      depth,
      rootIndex,
      x,
      y,
      width: tile.width,
      height: tile.height,
      reportCount: node.reports.length,
    };
    tiles.push(placed);
    lowest = Math.max(lowest, y + tile.height);

    if (node.reports.length > 0) {
      const childrenWidth = node.reports.reduce(
        (total, report) => total + subtreeWidth(report, options),
        siblingGap * (node.reports.length - 1),
      );
      let childLeft = left + Math.round((width - childrenWidth) / 2);
      const busY = y + tile.height + Math.round(rowGap / 2);
      for (const report of node.reports) {
        const child = place(report, childLeft, depth + 1, rootIndex, node.entrantId);
        connectors.push({
          fromId: node.entrantId,
          toId: report.entrantId,
          segments: elbow({
            parentX: x + Math.round(tile.width / 2),
            parentBottom: y + tile.height,
            childX: child.x + Math.round(tile.width / 2),
            childTop: child.y,
            busY,
          }),
        });
        childLeft += subtreeWidth(report, options) + siblingGap;
      }
    }
    return placed;
  };

  input.chart.roots.forEach((root, rootIndex) => {
    place(root, cursor, 0, rootIndex, null);
    cursor += subtreeWidth(root, options) + rootGap;
  });

  const right = tiles.reduce((max, entry) => Math.max(max, entry.x + entry.width), 0);
  return {
    tiles,
    connectors,
    width: tiles.length === 0 ? padding * 2 : right + padding,
    height: tiles.length === 0 ? padding * 2 : lowest + padding,
    options,
  };
}

function elbow(input: {
  parentX: number;
  parentBottom: number;
  childX: number;
  childTop: number;
  busY: number;
}): LayoutSegment[] {
  const { parentX, parentBottom, childX, childTop, busY } = input;
  if (parentX === childX) {
    return [{ x1: parentX, y1: parentBottom, x2: childX, y2: childTop }];
  }
  return [
    { x1: parentX, y1: parentBottom, x2: parentX, y2: busY },
    { x1: parentX, y1: busY, x2: childX, y2: busY },
    { x1: childX, y1: busY, x2: childX, y2: childTop },
  ];
}

export type Direction = "left" | "right" | "up" | "down";

function centre(tile: LayoutTile): { x: number; y: number } {
  return { x: tile.x + tile.width / 2, y: tile.y + tile.height / 2 };
}

/** Nearest neighbour in a direction, so arrow keys walk the chart by geometry. */
export function tileInDirection(input: {
  tiles: readonly LayoutTile[];
  fromId: string;
  direction: Direction;
}): string | null {
  const from = input.tiles.find((tile) => tile.entrantId === input.fromId);
  if (!from) return null;
  const origin = centre(from);
  let best: { id: string; score: number; along: number } | null = null;

  for (const tile of input.tiles) {
    if (tile.entrantId === from.entrantId) continue;
    const point = centre(tile);
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    const forward =
      input.direction === "left" ? -dx : input.direction === "right" ? dx : input.direction === "up" ? -dy : dy;
    if (forward <= 1) continue;
    const across = input.direction === "left" || input.direction === "right" ? Math.abs(dy) : Math.abs(dx);
    const score = forward + across * 2;
    if (best === null || score < best.score || (score === best.score && tile.entrantId < best.id)) {
      best = { id: tile.entrantId, score, along: forward };
    }
  }

  return best ? best.id : null;
}
