import { rngFromSeed } from "@sf-fight-club/engine";

import { SLOT, addOutline, ellipse, rect, type PixelGrid } from "./grid.js";

export const CREW_STATES = ["idle", "cheer", "flinch", "walk"] as const;
export type CrewState = (typeof CREW_STATES)[number];

export const CREW_WIDTH = 12;
export const CREW_HEIGHT = 16;

export interface CrewPalette {
  skin: string;
  hair: string;
  shirt: string;
  shirtShade: string;
  shoe: string;
  trim: string;
}

export interface CrewMember {
  handle: string;
  palette: CrewPalette;
  hair: number;
  frames: Record<CrewState, readonly PixelGrid[]>;
}

const SKIN_TONES = ["#F2C59B", "#D79A6A", "#A96B43", "#7A4A32", "#F7DCC4", "#C2855B"] as const;
const HAIR_COLORS = ["#151524", "#3B2A20", "#6B4A2A", "#C9A05A", "#8A8FA3", "#C4001D"] as const;
const SHIRTS = ["#FA500F", "#0082E6", "#44BA82", "#8A6EF0", "#FFAF01", "#E64C86", "#12A8B8", "#9BBB3A"] as const;
const TRIMS = ["#FFDD73", "#55B3FB", "#FAFAF4", "#FF9EC2", "#94EACC"] as const;

function emptyPeopleGrid(): PixelGrid {
  return Array.from({ length: CREW_HEIGHT }, () => new Array<number>(CREW_WIDTH).fill(SLOT.transparent));
}

interface CrewPose {
  bob: number;
  lean: number;
  arms: "down" | "up" | "back" | "stride";
  stride: number;
  glasses: boolean;
}

const BASE_POSE: CrewPose = { bob: 0, lean: 0, arms: "down", stride: 0, glasses: false };

function drawPerson(hair: number, pose: CrewPose): PixelGrid {
  const grid = emptyPeopleGrid();
  const ox = pose.lean;
  const oy = pose.bob;
  const headY = 4 + oy;

  const legA = pose.stride === 1 ? 2 : 3;
  const legB = pose.stride === 1 ? 3 : 2;
  rect(grid, 4, 13, 1, legA, SLOT.bodyShade);
  rect(grid, 7, 13, 1, legB, SLOT.bodyShade);
  rect(grid, 3, 14 + legA - 1, 3, 1, SLOT.metal);
  rect(grid, 7, 14 + legB - 1, 3, 1, SLOT.metal);

  rect(grid, 3 + ox, 7 + oy, 6, 6, SLOT.body);
  rect(grid, 3 + ox, 7 + oy, 6, 1, SLOT.bodyLight);
  rect(grid, 3 + ox, 11 + oy, 6, 2, SLOT.bodyShade);
  rect(grid, 5 + ox, 8 + oy, 2, 2, SLOT.accentLight);
  rect(grid, 3 + ox, 9 + oy, 1, 1, SLOT.trim);

  ellipse(grid, 6 + ox, headY, 3, 3, SLOT.eye);

  switch (hair % 6) {
    case 0:
      rect(grid, 3 + ox, 1 + oy, 6, 2, SLOT.accent);
      rect(grid, 3 + ox, 3 + oy, 1, 2, SLOT.accent);
      rect(grid, 8 + ox, 3 + oy, 1, 2, SLOT.accent);
      break;
    case 1:
      rect(grid, 3 + ox, 1 + oy, 6, 2, SLOT.accent);
      rect(grid, 2 + ox, 2 + oy, 2, 2, SLOT.accent);
      rect(grid, 8 + ox, 2 + oy, 2, 2, SLOT.accent);
      break;
    case 2:
      rect(grid, 3 + ox, 1 + oy, 6, 2, SLOT.accent);
      rect(grid, 2 + ox, 2 + oy, 1, 5, SLOT.accent);
      rect(grid, 9 + ox, 2 + oy, 1, 5, SLOT.accent);
      break;
    case 3:
      rect(grid, 3 + ox, 2 + oy, 6, 1, SLOT.accent);
      ellipse(grid, 6 + ox, 1 + oy, 2, 1, SLOT.accent);
      break;
    case 4:
      rect(grid, 2 + ox, 1 + oy, 8, 2, SLOT.trim);
      rect(grid, 8 + ox, 2 + oy, 3, 1, SLOT.trim);
      break;
    default:
      putHairline(grid, ox, oy);
      break;
  }

  if (pose.glasses) {
    rect(grid, 4 + ox, 4 + oy, 1, 1, SLOT.white);
    rect(grid, 7 + ox, 4 + oy, 1, 1, SLOT.white);
    rect(grid, 5 + ox, 4 + oy, 2, 1, SLOT.metalLight);
  } else {
    rect(grid, 5 + ox, 4 + oy, 1, 1, SLOT.ink);
    rect(grid, 7 + ox, 4 + oy, 1, 1, SLOT.ink);
  }
  rect(grid, 5 + ox, 6 + oy, 2, 1, SLOT.bodyShade);

  if (pose.arms === "up") {
    rect(grid, 2 + ox, 5 + oy, 1, 3, SLOT.bodyShade);
    rect(grid, 9 + ox, 5 + oy, 1, 3, SLOT.bodyShade);
    rect(grid, 2 + ox, 4 + oy, 1, 1, SLOT.accentLight);
    rect(grid, 9 + ox, 4 + oy, 1, 1, SLOT.accentLight);
  } else if (pose.arms === "back") {
    rect(grid, 2 + ox, 8 + oy, 1, 3, SLOT.bodyShade);
    rect(grid, 9 + ox, 8 + oy, 1, 3, SLOT.bodyShade);
  } else {
    rect(grid, 2 + ox, 8 + oy, 1, 3, SLOT.bodyShade);
    rect(grid, 9 + ox, 8 + oy, 1, 3, SLOT.bodyShade);
    rect(grid, 2 + ox, 10 + oy, 1, 1, SLOT.accentLight);
    rect(grid, 9 + ox, 10 + oy, 1, 1, SLOT.accentLight);
  }

  return addOutline(grid);
}

function putHairline(grid: PixelGrid, ox: number, oy: number): void {
  rect(grid, 3 + ox, 1 + oy, 6, 1, SLOT.accent);
  rect(grid, 4 + ox, 2 + oy, 4, 1, SLOT.accent);
}

export function buildCrew(handle: string): CrewMember {
  const rng = rngFromSeed(`crew:${handle}`);
  const palette: CrewPalette = {
    skin: SKIN_TONES[Math.floor(rng() * SKIN_TONES.length)] ?? SKIN_TONES[0]!,
    hair: HAIR_COLORS[Math.floor(rng() * HAIR_COLORS.length)] ?? HAIR_COLORS[0]!,
    shirt: SHIRTS[Math.floor(rng() * SHIRTS.length)] ?? SHIRTS[0]!,
    shirtShade: "#242433",
    shoe: "#242433",
    trim: TRIMS[Math.floor(rng() * TRIMS.length)] ?? TRIMS[0]!,
  };
  const hair = Math.floor(rng() * 6);
  const glasses = rng() < 0.3;

  const base: CrewPose = { ...BASE_POSE, glasses };
  const frames: Record<CrewState, readonly PixelGrid[]> = {
    idle: [drawPerson(hair, { ...base, bob: 0 }), drawPerson(hair, { ...base, bob: -1 })],
    cheer: [
      drawPerson(hair, { ...base, bob: -1, arms: "up" }),
      drawPerson(hair, { ...base, bob: -2, arms: "up" }),
    ],
    flinch: [drawPerson(hair, { ...base, bob: 1, lean: -1, arms: "back" })],
    walk: [
      drawPerson(hair, { ...base, stride: 1 }),
      drawPerson(hair, { ...base, stride: 0 }),
      drawPerson(hair, { ...base, stride: 1, bob: -1 }),
      drawPerson(hair, { ...base, stride: 0, bob: -1 }),
    ],
  };

  return {
    handle,
    palette,
    hair,
    frames,
  };
}

export interface DrawCrewOptions {
  x: number;
  y: number;
  facing: 1 | -1;
  state: CrewState;
  timeMs: number;
  scale?: number;
  silhouette?: boolean;
}

export function drawCrew(ctx: CanvasRenderingContext2D, member: CrewMember, opts: DrawCrewOptions): void {
  const scale = opts.scale ?? 2;
  const frames = member.frames[opts.state];
  const frame = frames[Math.floor(opts.timeMs / (opts.state === "walk" ? 150 : 240)) % Math.max(1, frames.length)];
  if (!frame) return;
  for (let y = 0; y < frame.length; y += 1) {
    const row = frame[y];
    if (!row) continue;
    let runSlot = 0;
    let runStart = 0;
    for (let x = 0; x <= row.length; x += 1) {
      const slot = x < row.length ? row[x] ?? 0 : 0;
      if (slot !== runSlot) {
        if (runSlot !== 0 && x > runStart) {
          const width = x - runStart;
          const screenX = opts.facing === 1 ? opts.x + (runStart - 6) * scale : opts.x - (runStart + width - 6) * scale;
          ctx.fillStyle = opts.silhouette ? "#151524" : crewColor(member.palette, runSlot);
          ctx.fillRect(screenX, opts.y + (y - 15) * scale, width * scale, scale);
        }
        runSlot = slot;
        runStart = x;
      }
    }
  }
}

function crewColor(palette: CrewPalette, slot: number): string {
  switch (slot) {
    case SLOT.ink:
      return "#151524";
    case SLOT.eye:
      return palette.skin;
    case SLOT.body:
      return palette.shirt;
    case SLOT.bodyShade:
      return palette.shirtShade;
    case SLOT.bodyLight:
      return palette.skin;
    case SLOT.accent:
      return palette.hair;
    case SLOT.accentLight:
      return palette.trim;
    case SLOT.metal:
      return palette.shoe;
    case SLOT.metalLight:
      return "#FAFAF4";
    case SLOT.white:
      return "#FAFAF4";
    case SLOT.trim:
      return palette.trim;
    default:
      return palette.hair;
  }
}
