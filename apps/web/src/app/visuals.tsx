/**
 * Small visual primitives shared by the pages: a live pixel mascot canvas, a
 * pixel skyline for the hero, and confetti. All deterministic, all decorative
 * (every use is labelled or hidden), and all motion respects reduced motion.
 */

import { useEffect, useRef, type ReactElement } from "react";

import { buildMascot, drawMascot, type MascotState } from "../art/mascot.js";
import type { Corner } from "../art/palette.js";
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

const BUILDINGS = [
  { x: 0, w: 74, h: 92, windows: 3 },
  { x: 82, w: 54, h: 132, windows: 4 },
  { x: 144, w: 88, h: 74, windows: 2 },
  { x: 240, w: 48, h: 166, windows: 5 },
  { x: 296, w: 96, h: 108, windows: 3 },
  { x: 400, w: 62, h: 140, windows: 4 },
  { x: 470, w: 110, h: 86, windows: 2 },
  { x: 588, w: 52, h: 178, windows: 6 },
  { x: 648, w: 84, h: 120, windows: 3 },
  { x: 740, w: 66, h: 96, windows: 2 },
  { x: 814, w: 104, h: 150, windows: 4 },
  { x: 926, w: 58, h: 112, windows: 3 },
  { x: 992, w: 82, h: 172, windows: 5 },
  { x: 1082, w: 118, h: 102, windows: 3 },
] as const;

function windowsFor(building: (typeof BUILDINGS)[number]): ReactElement[] {
  const out: ReactElement[] = [];
  for (let row = 0; row < building.windows; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const lit = (row * 3 + col + building.x) % 5 !== 0;
      out.push(
        <rect
          key={`${row}-${col}`}
          x={building.x + 8 + col * 14}
          y={196 - building.h + 12 + row * 18}
          width={6}
          height={8}
          fill={lit ? "var(--sun-1)" : "var(--night-4)"}
        />,
      );
    }
  }
  return out;
}

/** Pixel skyline behind the hero title. */
export function Skyline(): ReactElement {
  return (
    <div className="sfc-hero__sky" aria-hidden="true">
      <div className="sfc-hero__sun" />
      <svg viewBox="0 0 1200 200" preserveAspectRatio="none" shapeRendering="crispEdges">
        <rect x="0" y="190" width="1200" height="10" fill="var(--night-4)" />
        {BUILDINGS.map((building) => (
          <g key={building.x}>
            <rect
              x={building.x}
              y={196 - building.h}
              width={building.w}
              height={building.h}
              fill="var(--night-2)"
              stroke="var(--night-4)"
              strokeWidth="2"
            />
            {windowsFor(building)}
          </g>
        ))}
        <rect x="150" y="196" width="6" height="4" fill="var(--sun-4)" />
        <rect x="520" y="196" width="6" height="4" fill="var(--sun-4)" />
        <rect x="900" y="196" width="6" height="4" fill="var(--sun-4)" />
      </svg>
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
