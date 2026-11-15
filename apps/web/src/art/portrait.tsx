import { useEffect, useMemo, useRef, type ReactElement } from "react";

import type { PixelPortrait } from "@sf-fight-club/schemas";

export interface PortraitCanvasProps {
  portrait: PixelPortrait;
  /** CSS size in pixels. The 32x32 grid is scaled by an integer factor. */
  size?: number;
  label?: string;
  className?: string;
}

/** Integer scale so every source pixel stays a crisp square. */
export function portraitScale(portraitSize: number, size: number): number {
  return Math.max(1, Math.round(size / portraitSize));
}

export function drawPortrait(
  ctx: CanvasRenderingContext2D,
  portrait: PixelPortrait,
  opts: { x: number; y: number; scale: number },
): void {
  for (let y = 0; y < portrait.size; y += 1) {
    for (let x = 0; x < portrait.size; x += 1) {
      const index = portrait.pixels[y * portrait.size + x] ?? 0;
      ctx.fillStyle = portrait.palette[index] ?? "#000000";
      ctx.fillRect(opts.x + x * opts.scale, opts.y + y * opts.scale, opts.scale, opts.scale);
    }
  }
}

/**
 * A finished pixel portrait drawn from data. The source photo is never
 * fetched or rendered; only the 32x32 palette indices reach the browser.
 */
export function PortraitCanvas({ portrait, size = 64, label, className }: PortraitCanvasProps): ReactElement {
  const ref = useRef<HTMLCanvasElement>(null);
  const scale = useMemo(() => portraitScale(portrait.size, size), [portrait.size, size]);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawPortrait(ctx, portrait, { x: 0, y: 0, scale });
  }, [portrait, scale]);

  return (
    <canvas
      ref={ref}
      width={portrait.size * scale}
      height={portrait.size * scale}
      className={className}
      style={{ width: size, height: size, imageRendering: "pixelated" }}
      role="img"
      aria-label={label ?? "Pixel portrait"}
    />
  );
}
