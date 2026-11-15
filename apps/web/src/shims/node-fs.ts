/**
 * Browser shim for node:fs. Generated JSON Schema loaders are Node-only helpers.
 * If a screen reaches one, fail loudly rather than pretending the file exists.
 */

export function readFileSync(path: string): never {
  throw new Error(`Filesystem access is not available in the browser: ${path}`);
}

export function existsSync(): boolean {
  return false;
}

export function readdirSync(): never[] {
  return [];
}
