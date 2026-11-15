import { useEffect, useMemo, useRef, type ReactElement } from "react";

import { CREW_HEIGHT, CREW_WIDTH, buildCrew, drawCrew, type CrewTraitColors } from "./crew.js";
import { buildMascot, drawMascot, type Mascot } from "./mascot.js";
import { CORNER_PALETTE, type Corner } from "./palette.js";

const SUNSET_BANDS = ["#FA500F", "#FF8204", "#FFAF01", "#FFDD73", "#FFAF01"] as const;

function paintSunset(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.fillStyle = "#242433";
  ctx.fillRect(0, 0, width, height);
  const band = Math.ceil(height / SUNSET_BANDS.length);
  SUNSET_BANDS.forEach((color, index) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, index * band, width, band);
    if (index === SUNSET_BANDS.length - 1) return;
    ctx.fillStyle = SUNSET_BANDS[index + 1] ?? color;
    for (let x = 0; x < width; x += 2) ctx.fillRect(x, (index + 1) * band - 1, 1, 1);
  });
}

export interface MascotCanvasProps {
  spriteSeed: string;
  category: string;
  corner?: Corner;
  /** CSS size in pixels. The canvas itself is drawn at 96x96 and scaled with nearest neighbour. */
  size?: number;
  backdrop?: "none" | "sunset";
  className?: string;
  label?: string;
}

/**
 * A mascot drawn on a small canvas. The sprite is procedural, so it exists
 * before any pixels are drawn and survives server rendering.
 */
export function MascotCanvas({
  spriteSeed,
  category,
  corner = "left",
  size = 64,
  backdrop = "none",
  className,
  label,
}: MascotCanvasProps): ReactElement {
  const ref = useRef<HTMLCanvasElement>(null);
  const mascot = useMemo<Mascot>(() => buildMascot({ spriteSeed, category }), [spriteSeed, category]);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (backdrop === "sunset") paintSunset(ctx, canvas.width, canvas.height);
    drawMascot(ctx, mascot, {
      x: 48,
      y: 94,
      facing: 1,
      state: "idle",
      timeMs: 0,
      corner,
      scale: 2,
      reducedMotion: true,
    });
  }, [mascot, corner, backdrop]);

  return (
    <canvas
      ref={ref}
      width={96}
      height={96}
      className={className}
      style={{ width: size, height: size, imageRendering: "pixelated" }}
      role="img"
      aria-label={label ?? `${mascot.classId} mascot`}
    />
  );
}

export interface CrewCanvasProps {
  handle: string;
  size?: number;
  className?: string;
  label?: string;
  traits?: CrewTraitColors;
  state?: "idle" | "cheer";
}

export function CrewCanvas({ handle, size = 28, className, label, traits, state = "idle" }: CrewCanvasProps): ReactElement {
  const ref = useRef<HTMLCanvasElement>(null);
  const member = useMemo(() => buildCrew(handle, traits), [handle, traits]);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawCrew(ctx, member, {
      x: CREW_WIDTH,
      y: CREW_HEIGHT * 2,
      facing: 1,
      state,
      timeMs: 0,
      scale: 2,
    });
  }, [member, state]);

  return (
    <canvas
      ref={ref}
      width={CREW_WIDTH * 2}
      height={CREW_HEIGHT * 2}
      className={className}
      style={{ width: size, height: Math.round((size * CREW_HEIGHT) / CREW_WIDTH), imageRendering: "pixelated" }}
      role="img"
      aria-label={label ?? `Generated crew figure for ${handle}`}
    />
  );
}

/** The left/right trim color, exposed for small accents that are not canvas art. */
export function cornerColor(corner: Corner): string {
  return CORNER_PALETTE[corner].color;
}
