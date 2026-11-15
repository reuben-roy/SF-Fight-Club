import { rngFromSeed } from "@sf-fight-club/engine";

import { addOutline, createGrid, flashWhite, pixels, type PixelGrid } from "./grid.js";
import { drawMascotBody, type MascotBody, type MascotPose } from "./mascotClasses.js";
import {
  ACCENTS,
  classForCategory,
  colorForSlot,
  paletteFor,
  type AccentPalette,
  type Corner,
  type MascotClass,
  type MascotPalette,
} from "./palette.js";

export const MASCOT_STATES = [
  "idle",
  "windup",
  "lunge",
  "hurt",
  "guard",
  "staggered",
  "critical",
  "ko",
  "victory",
] as const;

export type MascotState = (typeof MASCOT_STATES)[number];

export const MASCOT_STATE_LABELS: Record<MascotState, string> = {
  idle: "Idle",
  windup: "Windup",
  lunge: "Lunge",
  hurt: "Hurt",
  guard: "Guard",
  staggered: "Staggered",
  critical: "Critical",
  ko: "K.O.",
  victory: "Victory",
};

export interface Mascot {
  classId: MascotClass;
  category: string;
  spriteSeed: string;
  variant: number;
  eyeStyle: number;
  accessory: number;
  accent: AccentPalette;
  palette: MascotPalette;
  frames: Record<MascotState, readonly PixelGrid[]>;
}

const POSE_BASE: MascotPose = { lean: 0, bob: 0, reach: 0, raise: 0, hop: 0, blink: false };

function frame(body: MascotBody, classId: MascotClass, pose: Partial<MascotPose>): PixelGrid {
  const grid = createGrid();
  drawMascotBody(grid, classId, body, { ...POSE_BASE, ...pose });
  return addOutline(grid);
}

export interface BuildMascotInput {
  spriteSeed: string;
  category: string;
}

export function buildMascot({ spriteSeed, category }: BuildMascotInput): Mascot {
  const rng = rngFromSeed(`mascot:${spriteSeed}:${category}`);
  const classId = classForCategory(category);
  const variant = Math.floor(rng() * 3);
  const eyeStyle = Math.floor(rng() * 4);
  const accent = ACCENTS[Math.floor(rng() * ACCENTS.length)] ?? ACCENTS[0]!;
  const accessory = Math.floor(rng() * 4);
  const body: MascotBody = { variant, eyeStyle, accessory };

  const hurt = frame(body, classId, { lean: -2, bob: 1, reach: -1, raise: 1 });
  const frames: Record<MascotState, readonly PixelGrid[]> = {
    idle: [
      frame(body, classId, {}),
      frame(body, classId, { bob: -1 }),
      frame(body, classId, {}),
      frame(body, classId, { bob: 1, blink: true }),
    ],
    windup: [frame(body, classId, { lean: -1, bob: -1, reach: -1, raise: -2 })],
    lunge: [frame(body, classId, { lean: 2, bob: 0, reach: 2, raise: 0 })],
    hurt: [hurt, flashWhite(hurt)],
    guard: [frame(body, classId, { lean: -1, bob: 1, reach: -1, raise: -2 })],
    staggered: [frame(body, classId, { lean: -1, bob: 2, reach: 0, raise: 1 })],
    critical: [frame(body, classId, { lean: 0, bob: 2, reach: 1, raise: 3 })],
    ko: [frame(body, classId, { lean: -3, bob: 3, reach: 0, raise: 3 })],
    victory: [
      frame(body, classId, { hop: -6, raise: -4 }),
      frame(body, classId, { hop: -2, raise: -4 }),
    ],
  };

  return {
    classId,
    category,
    spriteSeed,
    variant,
    eyeStyle,
    accessory,
    accent,
    palette: paletteFor(classId, accent),
    frames,
  };
}

export interface DrawMascotOptions {
  x: number;
  y: number;
  facing: 1 | -1;
  state: MascotState;
  timeMs: number;
  corner: Corner;
  scale?: number;
  silhouette?: boolean;
  reducedMotion?: boolean;
}

function stateFrame(mascot: Mascot, state: MascotState, timeMs: number, reducedMotion: boolean): PixelGrid {
  const frames = mascot.frames[state];
  if (frames.length === 0) return mascot.frames.idle[0] ?? createGrid();
  if (state === "hurt" && reducedMotion) return frames[0]!;
  if (state === "idle") return frames[Math.floor(timeMs / 160) % frames.length] ?? frames[0]!;
  if (state === "victory") return frames[Math.floor(timeMs / 220) % frames.length] ?? frames[0]!;
  if (state === "hurt") return frames[Math.floor(timeMs / 200) % frames.length] ?? frames[0]!;
  return frames[0]!;
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  grid: PixelGrid,
  mascot: Mascot,
  { x, y, facing, corner, scale, silhouette }: Required<Pick<DrawMascotOptions, "x" | "y" | "facing" | "corner" | "scale">> & {
    silhouette: boolean;
  },
): void {
  for (let gy = 0; gy < grid.length; gy += 1) {
    const row = grid[gy];
    if (!row) continue;
    let runSlot = 0;
    let runStart = 0;
    for (let gx = 0; gx <= row.length; gx += 1) {
      const slot = gx < row.length ? row[gx] ?? 0 : 0;
      if (slot !== runSlot) {
        if (runSlot !== 0 && gx > runStart) {
          const width = gx - runStart;
          const screenX = facing === 1 ? x + (runStart - 24) * scale : x - (runStart + width - 24) * scale;
          ctx.fillStyle = silhouette ? "#151524" : colorForSlot(mascot.palette, runSlot, corner);
          ctx.fillRect(screenX, y + (gy - 47) * scale, width * scale, scale);
        }
        runSlot = slot;
        runStart = gx;
      }
    }
  }
}

function drawWear(ctx: CanvasRenderingContext2D, mascot: Mascot, state: MascotState, opts: DrawMascotOptions): void {
  if (opts.reducedMotion) return;
  const scale = opts.scale ?? 2;
  const { x, y, timeMs } = opts;
  const top = y - 46 * scale;
  if (state === "staggered" || state === "critical") {
    const puffs = state === "critical" ? 3 : 2;
    for (let index = 0; index < puffs; index += 1) {
      const cycle = (timeMs / 620 + index * 0.37) % 1;
      const px = x + Math.round((Math.sin((index + 1) * 2.1 + timeMs / 900) * 10 + index * 4 - 4) * scale);
      const py = top + Math.round((18 - cycle * 22) * scale);
      ctx.fillStyle = index % 2 === 0 ? "#8B8879" : "#BFBCAC";
      ctx.fillRect(px, py, Math.max(1, Math.round(scale * 1.5)), Math.max(1, Math.round(scale * 1.5)));
    }
    if (state === "critical") {
      for (let index = 0; index < 2; index += 1) {
        const flicker = Math.floor(timeMs / 90 + index) % 2;
        const px = x + (flicker === 0 ? -14 : 10) * scale * 0.5;
        const py = top + (24 + index * 5) * scale;
        ctx.fillStyle = flicker === 0 ? "#FF8204" : "#FFDD73";
        ctx.fillRect(px, py, scale, scale);
      }
    }
  }
}

function drawKo(ctx: CanvasRenderingContext2D, mascot: Mascot, opts: DrawMascotOptions): void {
  const scale = opts.scale ?? 2;
  const frame = mascot.frames.ko[0];
  if (!frame) return;
  const progress = Math.min(1, opts.timeMs / 1500);
  if (progress >= 1) return;
  for (const pixel of pixels(frame)) {
    const noise = ((pixel.x * 73 + pixel.y * 151) % 997) / 997;
    const delay = noise * 0.35;
    if (progress < delay) {
      const screenX = opts.facing === 1 ? opts.x + (pixel.x - 24) * scale : opts.x - (pixel.x + 1 - 24) * scale;
      const screenY = opts.y + (pixel.y - 47) * scale;
      ctx.fillStyle = colorForSlot(mascot.palette, pixel.slot, opts.corner);
      ctx.fillRect(screenX, screenY, scale, scale);
      continue;
    }
    const local = (progress - delay) / (1 - delay);
    if (local > 0.9) continue;
    const wind = -opts.facing * local * local * 150;
    const rise = -local * 24 + Math.sin(local * 9 + noise * 6) * 6;
    const screenX =
      (opts.facing === 1 ? opts.x + (pixel.x - 24) * scale : opts.x - (pixel.x + 1 - 24) * scale) + wind * scale * 0.5;
    const screenY = opts.y + (pixel.y - 47) * scale + rise * scale * 0.5;
    ctx.fillStyle = colorForSlot(mascot.palette, pixel.slot, opts.corner);
    ctx.fillRect(Math.round(screenX), Math.round(screenY), Math.max(1, Math.round(scale * (1 - local * 0.6))), Math.max(1, Math.round(scale * (1 - local * 0.6))));
  }
}

export function drawMascot(ctx: CanvasRenderingContext2D, mascot: Mascot, opts: DrawMascotOptions): void {
  const resolved = { ...opts, scale: opts.scale ?? 2, silhouette: opts.silhouette ?? false, reducedMotion: opts.reducedMotion ?? false };
  if (resolved.state === "ko") {
    if (resolved.reducedMotion) {
      drawGrid(ctx, mascot.frames.ko[0] ?? mascot.frames.idle[0] ?? createGrid(), mascot, resolved);
      return;
    }
    drawKo(ctx, mascot, resolved);
    return;
  }
  const grid = stateFrame(mascot, resolved.state, resolved.timeMs, resolved.reducedMotion);
  drawGrid(ctx, grid, mascot, resolved);
  drawWear(ctx, mascot, resolved.state, resolved);
}

/** A tiny portrait for cards and Tower rows, drawn into a fresh canvas. */
export function mascotDataUrl(mascot: Mascot, options: { corner: Corner; scale?: number; background?: string }): string {
  const scale = options.scale ?? 2;
  const canvas = document.createElement("canvas");
  canvas.width = 48 * scale;
  canvas.height = 48 * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.imageSmoothingEnabled = false;
  if (options.background) {
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  drawMascot(ctx, mascot, {
    x: 24 * scale,
    y: 47 * scale,
    facing: 1,
    state: "idle",
    timeMs: 0,
    corner: options.corner,
    scale,
  });
  return canvas.toDataURL();
}
