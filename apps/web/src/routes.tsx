import { lazy, type ComponentType, type LazyExoticComponent } from "react";

export interface RouteDefinition {
  path: string;
  Component: LazyExoticComponent<ComponentType>;
}

/**
 * The one route registry. Feature tasks replace their own stub and never edit
 * this file, so every screen is registered here from the start.
 */
export const ROUTES: readonly RouteDefinition[] = [
  { path: "/", Component: lazy(() => import("./app/index.js")) },
  { path: "/tower", Component: lazy(() => import("./tower/index.js")) },
  { path: "/match/:matchId", Component: lazy(() => import("./arena/index.js")) },
  { path: "/film/:matchId", Component: lazy(() => import("./film/index.js")) },
  { path: "/dev/arena", Component: lazy(() => import("./arena/dev.js")) },
  { path: "/dev/tower", Component: lazy(() => import("./tower/dev.js")) },
  { path: "/dev/cards", Component: lazy(() => import("./cards/dev.js")) },
  { path: "/dev/art", Component: lazy(() => import("./art/dev.js")) },
  { path: "/dev/portraits", Component: lazy(() => import("./art/portraits-dev.js")) },
];
