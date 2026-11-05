import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const sourceDir = join(dirname(fileURLToPath(import.meta.url)), "../src");

const forbidden = [
  /\bMath\.random\b/,
  /\bDate\.now\b/,
  /\bnew Date\b/,
  /\bfetch\s*\(/,
  /node:fs/,
  /node:http/,
  /node:crypto/,
  /from ["']fs["']/,
  /\bprocess\.env\b/,
  /mistral/i,
  /setTimeout\s*\(/,
];

describe("engine purity", () => {
  it("has no I/O, clock, LLM client, or unseeded randomness", () => {
    const files = readdirSync(sourceDir).filter((file) => file.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(join(sourceDir, file), "utf8");
      for (const pattern of forbidden) {
        expect(source, `${file} matches ${pattern}`).not.toMatch(pattern);
      }
    }
  });
});
