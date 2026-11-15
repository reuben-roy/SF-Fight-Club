/**
 * Screen exports shared across the app shell. The arena is the real
 * broadcast renderer; links render only for http(s) targets.
 */

export { ArenaScreen } from "../arena/ArenaScreen.js";

/** Links render only for http(s) targets, always with rel=noopener. */
export function safeHref(url: string): string | null {
  return url.startsWith("https://") || url.startsWith("http://") ? url : null;
}
