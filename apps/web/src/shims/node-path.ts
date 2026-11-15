/**
 * Browser shim for node:path. The engine and schema packages import path helpers
 * for Node-only loaders. The web app must not call those loaders, but Rollup
 * still has to resolve the module when it pulls the engine's public entry.
 */

export function dirname(value: string): string {
  const index = value.lastIndexOf("/");
  if (index <= 0) return "/";
  return value.slice(0, index);
}

export function resolve(...parts: string[]): string {
  return parts
    .filter((part) => part.length > 0)
    .join("/")
    .replace(/\/+/g, "/");
}

export function join(...parts: string[]): string {
  return resolve(...parts);
}

export function basename(value: string): string {
  const index = value.lastIndexOf("/");
  return index < 0 ? value : value.slice(index + 1);
}
