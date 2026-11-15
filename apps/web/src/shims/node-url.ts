/** Browser shim for node:url. See node-path.ts. */
export function fileURLToPath(value: string | URL): string {
  if (typeof value === "string") return value.replace(/^file:\/\//, "");
  return value.pathname;
}

export function pathToFileURL(value: string): URL {
  return new URL(`file://${value}`);
}
