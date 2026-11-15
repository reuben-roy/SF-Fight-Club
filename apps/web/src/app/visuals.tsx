/**
 * Small visual primitives shared by the pages: a live pixel mascot canvas, a
 * pixel skyline for the hero, and confetti. All deterministic, all decorative
 * (every use is labelled or hidden), and all motion respects reduced motion.
 */

import { useEffect, useRef, type ReactElement } from "react";

import { buildMascot, drawMascot, type MascotState } from "../art/mascot.js";
import type { Corner } from "../art/palette.js";
import { STAGE_HEIGHT, STAGE_WIDTH, drawStage } from "../art/stage.js";
import { useReducedMotion } from "../styles/app-state.js";
import { classNames } from "../styles/components.js";

const SPRITE_SCALE = 4;
const SPRITE_SIZE = 48 * SPRITE_SCALE;

export interface MascotFigureProps {
  spriteSeed: string;
  category: string;
  corner: Corner;
  state?: MascotState;
  facing?: 1 | -1;
  size?: number;
  alt?: string;
  className?: string;
}

export function MascotFigure({
  spriteSeed,
  category,
  corner,
  state = "idle",
  facing = 1,
  size = 96,
  alt,
  className,
}: MascotFigureProps): ReactElement {
  const ref = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const mascot = buildMascot({ spriteSeed, category });
    canvas.width = SPRITE_SIZE;
    canvas.height = SPRITE_SIZE;
    let frame = 0;
    const start = performance.now();
    const draw = (now: number): void => {
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawMascot(ctx, mascot, {
        x: 24 * SPRITE_SCALE,
        y: 47 * SPRITE_SCALE,
        facing,
        state,
        timeMs: reducedMotion ? 0 : now - start,
        corner,
        scale: SPRITE_SCALE,
      });
      if (!reducedMotion) frame = requestAnimationFrame(draw);
    };
    draw(start);
    return () => cancelAnimationFrame(frame);
  }, [spriteSeed, category, corner, state, facing, reducedMotion]);

  return (
    <canvas
      ref={ref}
      width={SPRITE_SIZE}
      height={SPRITE_SIZE}
      className={classNames("sfc-mascot", className)}
      style={{ width: size, height: size }}
      role={alt ? "img" : undefined}
      aria-label={alt}
      aria-hidden={alt ? undefined : true}
    />
  );
}

/** The real San Francisco stage, static under reduced motion. */
export function HeroStage(): ReactElement {
  const ref = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const draw = (timeMs: number): void => {
      drawStage(ctx, {
        timeOfDay: "sunset",
        cameraX: STAGE_WIDTH / 2,
        cameraZoom: 1,
        fog: true,
        timeMs,
        reducedMotion,
      });
    };
    draw(0);
    if (reducedMotion) return;
    let frame = 0;
    const started = performance.now();
    const tick = (now: number): void => {
      draw(now - started);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reducedMotion]);

  return (
    <div className="sfc-hero__sky" aria-hidden="true">
      <canvas ref={ref} width={STAGE_WIDTH} height={STAGE_HEIGHT} />
    </div>
  );
}

const CONFETTI_COLORS = ["var(--sun-1)", "var(--sun-2)", "var(--sun-4)", "var(--blue-light)", "var(--good)"] as const;

export interface ConfettiProps {
  count?: number;
  className?: string;
}

/** Decorative confetti. Absent under reduced motion. */
export function Confetti({ count = 26, className }: ConfettiProps): ReactElement | null {
  const reducedMotion = useReducedMotion();
  if (reducedMotion) return null;
  return (
    <div className={classNames("sfc-confetti", className)} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          className="sfc-confetti__bit"
          style={{
            left: `${(index * 37) % 100}%`,
            animationDelay: `${(index * 97) % 1400}ms`,
            background: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
          }}
        />
      ))}
    </div>
  );
}
