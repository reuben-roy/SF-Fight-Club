import type { JSX } from "react";

import { iconRuns, type IconColors, type IconName } from "./iconArt.js";

const CSS_COLORS: Record<keyof IconColors, string> = {
  ink: "var(--icon-ink, #151524)",
  primary: "var(--icon-primary, #FFAF01)",
  secondary: "var(--icon-secondary, #FA500F)",
  light: "var(--icon-light, #FFDD73)",
  white: "var(--icon-white, #FAFAF4)",
};

export interface IconProps {
  name: IconName;
  size?: number;
  title?: string;
  colors?: Partial<IconColors>;
  className?: string;
}

export function Icon({ name, size = 16, title, colors, className }: IconProps): JSX.Element {
  const runs = iconRuns(name);
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      {runs.map((run) => (
        <rect
          key={`${run.x}-${run.y}-${run.width}-${run.color}`}
          x={run.x}
          y={run.y}
          width={run.width}
          height={1}
          fill={colors?.[run.color] ?? CSS_COLORS[run.color]}
        />
      ))}
    </svg>
  );
}
