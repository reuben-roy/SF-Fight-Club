import { rngFromSeed } from "@sf-fight-club/engine";

export const STAGE_WIDTH = 480;
export const STAGE_HEIGHT = 270;
export const HORIZON = 158;
export const GROUND = 205;
const LAYER_WIDTH = 560;
const LAYER_OFFSET = 40;

export const TIMES_OF_DAY = ["sunset", "dusk", "night"] as const;
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];

export const TIME_OF_DAY_LABELS: Record<TimeOfDay, string> = {
  sunset: "Sunset",
  dusk: "Dusk",
  night: "Night",
};

interface StagePalette {
  bands: readonly string[];
  sun: string;
  sunCore: string;
  sunY: number;
  sunRadius: number;
  moon: boolean;
  hillFar: string;
  hillNear: string;
  bridge: string;
  skyline: string;
  skylineFar: string;
  window: string;
  windowWarm: string;
  water: string;
  reflection: readonly string[];
  pier: string;
  pierTop: string;
  lamp: string;
  mist: string;
}

const PALETTES: Record<TimeOfDay, StagePalette> = {
  sunset: {
    bands: ["#FFF4D2", "#FFDD73", "#FEC63A", "#FFAF01", "#FF8204", "#FA500F", "#E51300"],
    sun: "#FAFAF4",
    sunCore: "#FFF4D2",
    sunY: 126,
    sunRadius: 44,
    moon: false,
    hillFar: "#4A3F55",
    hillNear: "#343446",
    bridge: "#242433",
    skyline: "#151524",
    skylineFar: "#3A3450",
    window: "#FFDD73",
    windowWarm: "#FFAF01",
    water: "#242433",
    reflection: ["#FFDD73", "#FFAF01", "#FF8204", "#FA500F", "#E51300"],
    pier: "#343446",
    pierTop: "#56566C",
    lamp: "#FFDD73",
    mist: "#FFD9B8",
  },
  dusk: {
    bands: ["#2A2440", "#3C2C52", "#5E3B60", "#8A4A5A", "#C25A3F", "#E86A32", "#F58A3D"],
    sun: "#FFAF01",
    sunCore: "#FFDD73",
    sunY: 148,
    sunRadius: 30,
    moon: false,
    hillFar: "#2A2438",
    hillNear: "#211C30",
    bridge: "#332C48",
    skyline: "#1B1830",
    skylineFar: "#282340",
    window: "#FFDD73",
    windowWarm: "#FF8204",
    water: "#1C1830",
    reflection: ["#C25A3F", "#E86A32", "#FFAF01", "#FFDD73"],
    pier: "#272036",
    pierTop: "#4A3F60",
    lamp: "#FFAF01",
    mist: "#D9C7E0",
  },
  night: {
    bands: ["#080A15", "#0D1020", "#12162B", "#181D36", "#1F2441", "#272C4B", "#303354"],
    sun: "#FAFAF4",
    sunCore: "#DCDCE8",
    sunY: 58,
    sunRadius: 15,
    moon: true,
    hillFar: "#141628",
    hillNear: "#0E1020",
    bridge: "#262A44",
    skyline: "#0D0F1E",
    skylineFar: "#191B30",
    window: "#FFDD73",
    windowWarm: "#FFAF01",
    water: "#0A0C17",
    reflection: ["#FFDD73", "#FFAF01", "#55B3FB", "#2A3358"],
    pier: "#12141F",
    pierTop: "#2C3048",
    lamp: "#FFDD73",
    mist: "#8FA3B8",
  },
};

interface StageLayers {
  far: HTMLCanvasElement;
  mid: HTMLCanvasElement;
  near: HTMLCanvasElement;
  reflections: { x: number; y: number; length: number; color: string }[];
}

function canvas(width: number, height: number): HTMLCanvasElement {
  const element = document.createElement("canvas");
  element.width = width;
  element.height = height;
  return element;
}

function contextOf(element: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = element.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable");
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

function pixelLine(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  thickness = 1,
): void {
  ctx.fillStyle = color;
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let index = 0; index <= steps; index += 1) {
    const x = Math.round(x0 + ((x1 - x0) * index) / steps);
    const y = Math.round(y0 + ((y1 - y0) * index) / steps);
    ctx.fillRect(x, y, thickness, thickness);
  }
}

function drawSun(ctx: CanvasRenderingContext2D, palette: StagePalette, cx: number, cy: number, radius: number): void {
  if (palette.moon) {
    const cutX = cx + 6;
    const cutY = cy - 4;
    const cutRadius = radius - 1;
    ctx.fillStyle = palette.sun;
    for (let y = cy - radius; y <= cy + radius; y += 1) {
      for (let x = cx - radius; x <= cx + radius; x += 1) {
        const inMoon = (x - cx) ** 2 + (y - cy) ** 2 <= radius * radius;
        const inCut = (x - cutX) ** 2 + (y - cutY) ** 2 <= cutRadius * cutRadius;
        if (inMoon && !inCut) ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.fillStyle = "#B8B8CC";
    ctx.fillRect(cx - 7, cy + 2, 2, 2);
    ctx.fillRect(cx - 2, cy + 8, 2, 1);
    ctx.fillRect(cx - 9, cy - 5, 1, 2);
    return;
  }
  ctx.fillStyle = palette.sun;
  for (let y = cy - radius; y < cy + radius; y += 1) {
    const dy = cy - y;
    const span = Math.floor(Math.sqrt(Math.max(0, radius * radius - dy * dy)));
    if (y > cy && (y - cy) % 7 < 3) continue;
    ctx.fillRect(cx - span, y, span * 2, 1);
  }
  ctx.fillStyle = palette.sunCore;
  ctx.fillRect(cx - Math.floor(radius / 3), cy - Math.floor(radius / 4), Math.floor(radius / 2), 2);
}

function buildFar(palette: StagePalette): HTMLCanvasElement {
  const layer = canvas(LAYER_WIDTH, STAGE_HEIGHT);
  const ctx = contextOf(layer);
  const offset = LAYER_OFFSET;

  ctx.fillStyle = palette.hillFar;
  for (let x = 0; x < LAYER_WIDTH; x += 1) {
    const height = Math.round(
      7 + 4 * Math.sin((x - offset) / 26) + 2 * Math.sin((x - offset) / 10 + 1) + 20 * Math.exp(-Math.pow((x - offset - 405) / 44, 2)),
    );
    ctx.fillRect(x, HORIZON - height, 1, height);
  }
  ctx.fillStyle = palette.hillNear;
  for (let x = 0; x < LAYER_WIDTH; x += 1) {
    const height = Math.round(4 + 2 * Math.sin((x - offset) / 31 + 3) + 1 * Math.sin((x - offset) / 8) + 10 * Math.exp(-Math.pow((x - offset - 90) / 36, 2)));
    ctx.fillRect(x, HORIZON - height, 1, height);
  }

  const sutroX = 405 + offset;
  const sutroY = HORIZON - 20;
  pixelLine(ctx, sutroX - 7, sutroY, sutroX - 2, sutroY - 25, palette.hillNear, 1);
  pixelLine(ctx, sutroX + 7, sutroY, sutroX + 2, sutroY - 25, palette.hillNear, 1);
  ctx.fillStyle = palette.hillNear;
  ctx.fillRect(sutroX - 7, sutroY - 25, 15, 1);
  ctx.fillRect(sutroX - 5, sutroY - 14, 11, 1);
  ctx.fillRect(sutroX - 6, sutroY - 34, 1, 9);
  ctx.fillRect(sutroX, sutroY - 36, 1, 11);
  ctx.fillRect(sutroX + 6, sutroY - 34, 1, 9);
  ctx.fillStyle = palette.windowWarm;
  ctx.fillRect(sutroX, sutroY - 37, 1, 1);

  return layer;
}

function buildMid(palette: StagePalette, timeOfDay: TimeOfDay): HTMLCanvasElement {
  const layer = canvas(LAYER_WIDTH, STAGE_HEIGHT);
  const ctx = contextOf(layer);
  const offset = LAYER_OFFSET;
  const rng = rngFromSeed(`stage:${timeOfDay}`);

  ctx.fillStyle = palette.skylineFar;
  let x = offset + 210;
  while (x < LAYER_WIDTH - 20) {
    const width = 6 + Math.floor(rng() * 12);
    const height = 8 + Math.floor(rng() * 26);
    ctx.fillRect(x, HORIZON - height, width, height);
    x += width + Math.floor(rng() * 4);
  }

  ctx.fillStyle = palette.bridge;
  const tower = (tx: number): void => {
    ctx.fillRect(tx, 90, 2, HORIZON - 90);
    ctx.fillRect(tx + 7, 90, 2, HORIZON - 90);
    ctx.fillRect(tx - 1, 88, 11, 3);
    ctx.fillRect(tx, 102, 9, 2);
    ctx.fillRect(tx, 116, 9, 2);
    ctx.fillRect(tx, 130, 9, 2);
    ctx.fillStyle = palette.windowWarm;
    ctx.fillRect(tx - 1, 87, 11, 1);
    ctx.fillStyle = palette.bridge;
  };
  tower(offset + 38);
  tower(offset + 122);
  ctx.fillRect(offset, 138, 174, 4);
  const cable = (cx: number): number => {
    if (cx < offset + 41) return 90 + (offset + 41 - cx) * 0.78;
    if (cx <= offset + 125) return 134 - 42 * Math.pow((cx - (offset + 83)) / 42, 2);
    return 90 + (cx - offset - 125) * 0.86;
  };
  for (let cx = offset; cx < offset + 174; cx += 1) {
    const y = Math.round(Math.min(cable(cx), 138));
    ctx.fillStyle = palette.bridge;
    ctx.fillRect(cx, y, 1, 1);
    if (cx % 4 === 0) ctx.fillRect(cx, y, 1, 138 - y);
  }
  ctx.fillRect(offset + 50, 140, 4, 14);
  ctx.fillRect(offset + 112, 140, 4, 14);

  ctx.fillStyle = palette.skyline;
  let bx = offset + 212;
  const buildings: { x: number; y: number; width: number; height: number }[] = [];
  while (bx < LAYER_WIDTH - 24) {
    const width = 6 + Math.floor(rng() * 10);
    const height = 11 + Math.floor(rng() * 30);
    ctx.fillRect(bx, HORIZON - height, width, height);
    buildings.push({ x: bx, y: HORIZON - height, width, height });
    bx += width + Math.floor(rng() * 4);
  }

  const pyramidX = offset + 330;
  for (let y = 62; y < HORIZON; y += 1) {
    const half = Math.floor((y - 62) / 5.2);
    ctx.fillRect(pyramidX - half, y, half * 2 + 1, 1);
  }
  ctx.fillRect(pyramidX, 52, 1, 10);
  ctx.fillStyle = palette.windowWarm;
  ctx.fillRect(pyramidX, 50, 1, 1);

  ctx.fillStyle = palette.skyline;
  ctx.fillRect(offset + 356, 82, 15, HORIZON - 82);
  ctx.fillRect(offset + 357, 79, 13, 3);
  ctx.fillRect(offset + 359, 77, 9, 2);
  ctx.fillStyle = palette.window;

  const windowChance = timeOfDay === "night" ? 0.85 : timeOfDay === "dusk" ? 0.42 : 0.18;
  for (const building of buildings) {
    for (let wy = building.y + 3; wy < HORIZON - 2; wy += 4) {
      for (let wx = building.x + 2; wx < building.x + building.width - 2; wx += 3) {
        if (rng() > windowChance) continue;
        ctx.fillStyle = rng() < 0.25 ? palette.windowWarm : palette.window;
        ctx.fillRect(wx, wy, 1, 1);
      }
    }
  }
  for (let wy = 66; wy < HORIZON - 4; wy += 5) {
    const half = Math.floor((wy - 62) / 5.2) - 2;
    if (half < 1) continue;
    if (rng() < windowChance) {
      ctx.fillStyle = palette.window;
      ctx.fillRect(pyramidX - half + 1, wy, 1, 1);
      ctx.fillRect(pyramidX + half - 1, wy, 1, 1);
    }
  }
  for (let wy = 85; wy < HORIZON - 3; wy += 4) {
    for (let wx = offset + 359; wx < offset + 369; wx += 3) {
      if (rng() < windowChance) {
        ctx.fillStyle = palette.window;
        ctx.fillRect(wx, wy, 1, 1);
      }
    }
  }

  return layer;
}

function buildNear(palette: StagePalette, timeOfDay: TimeOfDay): HTMLCanvasElement {
  const layer = canvas(LAYER_WIDTH, STAGE_HEIGHT);
  const ctx = contextOf(layer);
  const offset = LAYER_OFFSET;

  const pier = (x0: number, x1: number): void => {
    ctx.fillStyle = palette.pier;
    ctx.fillRect(x0, GROUND, x1 - x0, STAGE_HEIGHT - GROUND);
    ctx.fillStyle = palette.pierTop;
    ctx.fillRect(x0, GROUND, x1 - x0, 2);
    ctx.fillStyle = palette.bridge;
    for (let x = x0 + 7; x < x1; x += 9) ctx.fillRect(x, GROUND + 3, 1, STAGE_HEIGHT - GROUND);
    ctx.fillStyle = palette.skyline;
    ctx.fillRect(x0 + 5, GROUND + 9, 4, STAGE_HEIGHT - GROUND);
    ctx.fillRect(x1 - 9, GROUND + 9, 4, STAGE_HEIGHT - GROUND);
  };
  pier(offset + 18, offset + 186);
  pier(offset + 294, offset + 462);

  ctx.fillStyle = palette.pierTop;
  for (let x = offset + 24; x < offset + 180; x += 26) {
    ctx.fillRect(x, GROUND - 4, 2, 4);
    ctx.fillRect(x - 1, GROUND - 6, 4, 2);
  }
  for (let x = offset + 300; x < offset + 456; x += 26) {
    ctx.fillRect(x, GROUND - 4, 2, 4);
    ctx.fillRect(x - 1, GROUND - 6, 4, 2);
  }

  const lamp = (x: number): void => {
    ctx.fillStyle = palette.bridge;
    ctx.fillRect(x, GROUND - 44, 2, 44);
    ctx.fillRect(x - 3, GROUND - 46, 8, 2);
    ctx.fillStyle = palette.lamp;
    ctx.fillRect(x - 2, GROUND - 43, 6, 2);
    if (timeOfDay === "night") {
      ctx.fillStyle = "rgba(255, 221, 115, 0.25)";
      ctx.fillRect(x - 4, GROUND - 42, 10, 3);
    }
  };
  lamp(offset + 28);
  lamp(offset + 452);

  return layer;
}

function buildReflections(palette: StagePalette, timeOfDay: TimeOfDay): StageLayers["reflections"] {
  const rng = rngFromSeed(`reflections:${timeOfDay}`);
  const out: StageLayers["reflections"] = [];
  for (let y = HORIZON + 3; y < GROUND; y += 3) {
    const depth = (y - HORIZON) / (GROUND - HORIZON);
    const span = 72 * (1 - depth * 0.6);
    const color = palette.reflection[Math.min(palette.reflection.length - 1, Math.floor(depth * palette.reflection.length))] ?? palette.reflection[0]!;
    for (let x = 240 - span; x < 240 + span; ) {
      const length = 3 + Math.floor(rng() * 11);
      if (rng() < 0.75) out.push({ x: Math.round(x), y, length, color });
      x += length + 2 + Math.floor(rng() * 7);
    }
  }
  return out;
}

const layerCache = new Map<TimeOfDay, StageLayers>();

function layersFor(timeOfDay: TimeOfDay): StageLayers {
  const cached = layerCache.get(timeOfDay);
  if (cached) return cached;
  const palette = PALETTES[timeOfDay];
  const built: StageLayers = {
    far: buildFar(palette),
    mid: buildMid(palette, timeOfDay),
    near: buildNear(palette, timeOfDay),
    reflections: buildReflections(palette, timeOfDay),
  };
  layerCache.set(timeOfDay, built);
  return built;
}

function drawStars(ctx: CanvasRenderingContext2D, timeMs: number): void {
  const rng = rngFromSeed("stars");
  for (let index = 0; index < 70; index += 1) {
    const x = Math.floor(rng() * STAGE_WIDTH);
    const y = Math.floor(rng() * (HORIZON - 40));
    const twinkle = Math.floor(timeMs / 900 + index) % 7;
    ctx.fillStyle = twinkle === 0 ? "#8FB8FF" : twinkle < 3 ? "#B8B8CC" : "#FAFAF4";
    ctx.fillRect(x, y, 1, 1);
  }
}

function drawFogBank(
  ctx: CanvasRenderingContext2D,
  color: string,
  timeMs: number,
  strength: number,
  yBase: number,
  speed: number,
  height: number,
  alpha: number,
): void {
  const shift = Math.floor((timeMs / 90) * speed) % 16;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (let y = yBase; y < yBase + height; y += 2) {
    for (let x = -16; x < STAGE_WIDTH + 16; x += 2) {
      const wave = Math.sin((x + y * 3) / 42 + timeMs / 2600);
      if (wave < 0.2 - strength * 0.2) continue;
      if ((Math.floor(x / 2) + Math.floor(y / 2) + shift) % 3 === 0) continue;
      ctx.fillRect(x, y, 2, 2);
    }
  }
  ctx.restore();
}

function drawSpotlight(ctx: CanvasRenderingContext2D, timeMs: number): void {
  ctx.fillStyle = "rgba(10, 10, 20, 0.52)";
  ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
  const sway = Math.round(Math.sin(timeMs / 2400) * 6);
  for (let band = 0; band < 8; band += 1) {
    const y = Math.floor((GROUND / 8) * band);
    const topWidth = 34 + band * 6;
    const bottomWidth = 46 + band * 15;
    ctx.fillStyle = band % 2 === 0 ? "rgba(250, 250, 244, 0.06)" : "rgba(250, 250, 244, 0.035)";
    ctx.fillRect(240 - Math.floor(bottomWidth / 2) + sway, y, bottomWidth, Math.ceil(GROUND / 8) + 1);
    ctx.fillStyle = "rgba(255, 221, 115, 0.05)";
    ctx.fillRect(240 - Math.floor(topWidth / 2) + sway, y, topWidth, Math.ceil(GROUND / 8) + 1);
  }
  ctx.fillStyle = "rgba(255, 221, 115, 0.12)";
  ctx.fillRect(240 - 62 + sway, GROUND - 5, 124, 5);
  ctx.fillStyle = "rgba(250, 250, 244, 0.08)";
  ctx.fillRect(240 - 30 + sway, GROUND - 2, 60, 2);
}

export interface StageOptions {
  timeOfDay: TimeOfDay;
  cameraX: number;
  cameraZoom: number;
  fog: boolean;
  timeMs: number;
  spotlight?: boolean;
  reducedMotion?: boolean;
}

export function drawStage(ctx: CanvasRenderingContext2D, options: StageOptions): void {
  const palette = PALETTES[options.timeOfDay];
  const layers = layersFor(options.timeOfDay);
  const zoom = Math.max(0.9, Math.min(1.4, options.cameraZoom || 1));
  const timeMs = options.reducedMotion ? 0 : options.timeMs;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = options.timeOfDay === "night" ? "#080A15" : "#2A2440";
  ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
  ctx.translate(STAGE_WIDTH / 2, STAGE_HEIGHT / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-STAGE_WIDTH / 2, -STAGE_HEIGHT / 2);

  const bandHeight = Math.ceil(HORIZON / palette.bands.length);
  for (let index = 0; index < palette.bands.length; index += 1) {
    const color = palette.bands[index] ?? palette.bands[0]!;
    const y = index * bandHeight;
    const next = index + 1 < palette.bands.length ? (index + 1) * bandHeight : HORIZON;
    ctx.fillStyle = color;
    ctx.fillRect(0, y, STAGE_WIDTH, next - y);
    if (index > 0) {
      const previous = palette.bands[index - 1] ?? color;
      ctx.fillStyle = previous;
      for (let x = index % 2; x < STAGE_WIDTH; x += 2) ctx.fillRect(x, y, 1, 1);
      for (let x = (index + 1) % 2; x < STAGE_WIDTH; x += 4) ctx.fillRect(x, y + 1, 1, 1);
    }
  }

  if (options.timeOfDay === "night") drawStars(ctx, timeMs);
  drawSun(ctx, palette, 240, palette.sunY, palette.sunRadius);

  const shift = (factor: number): number => Math.round(-LAYER_OFFSET - options.cameraX * factor);
  ctx.drawImage(layers.far, shift(0.05), 0);
  ctx.drawImage(layers.mid, shift(0.14), 0);

  ctx.fillStyle = palette.water;
  ctx.fillRect(0, HORIZON, STAGE_WIDTH, STAGE_HEIGHT - HORIZON);
  for (let index = 0; index < layers.reflections.length; index += 1) {
    const reflection = layers.reflections[index];
    if (!reflection) continue;
    if ((Math.floor(timeMs / 420) + index) % 5 === 0) continue;
    ctx.fillStyle = reflection.color;
    ctx.fillRect(reflection.x, reflection.y, reflection.length, 1);
  }
  ctx.fillStyle = palette.hillNear;
  for (let index = 0; index < 22; index += 1) {
    const rng = rngFromSeed(`wave:${index}`);
    const x = Math.floor(rng() * STAGE_WIDTH);
    const y = HORIZON + 4 + Math.floor(rng() * (GROUND - HORIZON - 8));
    ctx.fillRect(x, y, 3 + Math.floor(rng() * 9), 1);
  }

  ctx.drawImage(layers.near, shift(0.26), 0);

  if (options.timeOfDay === "dusk") {
    drawFogBank(ctx, palette.mist, timeMs, 0.35, HORIZON - 4, 1, 26, 0.2);
  }
  if (options.fog) {
    drawFogBank(ctx, palette.mist, timeMs, 1, HORIZON - 20, 2, 46, 0.32);
    drawFogBank(ctx, palette.mist, timeMs + 900, 0.8, HORIZON + 8, 3, 40, 0.22);
  }
  if (options.spotlight) drawSpotlight(ctx, timeMs);

  ctx.restore();
}
