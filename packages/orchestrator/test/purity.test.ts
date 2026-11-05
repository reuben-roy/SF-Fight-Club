import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const sourceDir = fileURLToPath(new URL("../src", import.meta.url));

const forbidden = [
  /\bMath\.random\b/,
  /\bDate\.now\b/,
  /\bnew Date\b/,
  /\bfetch\s*\(/,
  /node:fs/,
  /node:http/,
  /node:https/,
  /from ["']fs["']/,
  /\bprocess\.env\b/,
  /mistral/i,
  /setTimeout\s*\(/,
  /setInterval\s*\(/,
];

describe("orchestrator replay purity", () => {
  it("has no clock, network, filesystem, or live model client", () => {
    const files = walk(sourceDir).filter((file) => file.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const pattern of forbidden) {
        expect(source, `${file} matches ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}
