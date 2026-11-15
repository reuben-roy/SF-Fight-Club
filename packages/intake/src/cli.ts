import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildProfile } from "./build.js";
import { DEMO_ENTRANTS, fetchDemoEntrant } from "./demo.js";
import { fetchHn } from "./hn.js";
import type { NetworkDeps } from "./types.js";
import { fetchWeb } from "./web.js";
import { fetchX } from "./x.js";

function usage(): string {
  return [
    "Usage:",
    "  intake --hn <item id or url> --x <handle> --url <site> --out <file>",
    "         [--id <entrant-id>] [--name <company>] [--tagline <text>]",
    "         [--founder <name[,xHandle[,hnUser[,role]]]>] (repeatable)",
    "  intake --from-fixtures [--out-dir <dir>]",
    "",
    "Single mode builds one EntrantProfile from live APIs. Fixture mode",
    "writes the eight demo profiles offline from recorded responses.",
  ].join("\n");
}

function takeFlag(argv: string[], names: string[]): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    if (names.includes(argv[index] ?? "")) {
      const value = argv[index + 1];
      argv.splice(index, 2);
      return value;
    }
  }
  return undefined;
}

function takeAll(argv: string[], names: string[]): string[] {
  const values: string[] = [];
  for (let index = argv.length - 1; index >= 0; index -= 1) {
    if (names.includes(argv[index] ?? "")) {
      const value = argv[index + 1];
      argv.splice(index, 2);
      if (value !== undefined) values.unshift(value);
    }
  }
  return values;
}

interface FounderFlag {
  name: string;
  role?: string;
  xHandle?: string;
  hnUser?: string;
}

function parseFounder(flag: string): FounderFlag {
  const [name = "", xHandle = "", hnUser = "", role = ""] = flag.split(",").map((part) => part.trim());
  if (name === "") throw new Error(`--founder needs at least a name: ${flag}`);
  const founder: FounderFlag = { name };
  if (xHandle !== "") founder.xHandle = xHandle;
  if (hnUser !== "") founder.hnUser = hnUser;
  if (role !== "") founder.role = role;
  return founder;
}

function liveDeps(): NetworkDeps & { bearerToken?: string } {
  const fetchFn: NetworkDeps["fetch"] = async (url, init) => {
    const response = await fetch(url, { headers: init?.headers });
    return {
      status: response.status,
      headers: { get: (name: string) => response.headers.get(name) },
      text: () => response.text(),
    };
  };
  return {
    fetch: fetchFn,
    now: () => new Date().toISOString(),
    sleep: (ms: number) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)),
    bearerToken: process.env["X_BEARER_TOKEN"],
  };
}

export async function run(argv: string[]): Promise<{ exitCode: number }> {
  const args = [...argv];
  const fromFixtures = args.includes("--from-fixtures");
  if (fromFixtures) args.splice(args.indexOf("--from-fixtures"), 1);

  if (fromFixtures) {
    const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
    const outDir =
      takeFlag(args, ["--out-dir"]) ?? resolve(packageDir, "fixtures/demo/profiles");
    if (args.includes("--help") || args.includes("-h") || args.length > 0) {
      console.error(usage());
      return { exitCode: args.length > 0 ? 2 : 0 };
    }
    const dir = resolve(outDir);
    await mkdir(dir, { recursive: true });
    for (const entrant of DEMO_ENTRANTS) {
      const { profile, warnings } = await fetchDemoEntrant(entrant.entrantId);
      for (const warning of warnings) console.error(`[${entrant.entrantId}] ${warning}`);
      await writeFile(resolve(dir, `${entrant.entrantId}.profile.json`), `${JSON.stringify(profile, null, 2)}\n`);
      console.log(`wrote ${entrant.entrantId}.profile.json`);
    }
    return { exitCode: 0 };
  }

  if (args.includes("--help") || args.includes("-h")) {
    console.log(usage());
    return { exitCode: 0 };
  }

  const hn = takeFlag(args, ["--hn"]);
  const x = takeFlag(args, ["--x"]);
  const url = takeFlag(args, ["--url"]);
  const out = takeFlag(args, ["--out"]);
  const tagline = takeFlag(args, ["--tagline"]);
  const id = takeFlag(args, ["--id"]);
  const name = takeFlag(args, ["--name"]);
  const founderFlags = takeAll(args, ["--founder"]);
  if (out === undefined) {
    console.error(usage());
    console.error("\n--out is required.");
    return { exitCode: 2 };
  }
  if (args.length > 0) {
    console.error(usage());
    console.error(`\nUnknown arguments: ${args.join(" ")}`);
    return { exitCode: 2 };
  }

  const entrantId = id ?? "entrant";
  const companyName = name ?? "Untitled entrant";
  const founders = founderFlags.map(parseFounder);
  const deps = liveDeps();

  const hnResult =
    hn !== undefined || founders.some((founder) => founder.hnUser !== undefined)
      ? await fetchHn(
          { item: hn, users: founders.map((founder) => founder.hnUser).filter((user) => user !== undefined) },
          deps,
        )
      : null;
  const xResult =
    x !== undefined
      ? await fetchX({ handle: x }, deps)
      : founders.find((founder) => founder.xHandle !== undefined) !== undefined
        ? await fetchX(
            { handle: founders.find((founder) => founder.xHandle !== undefined)?.xHandle ?? "" },
            deps,
          )
        : null;
  const webResult = url !== undefined ? await fetchWeb({ url }, deps) : null;

  const { profile, warnings } = buildProfile({
    entrantId,
    company: { name: companyName, url, tagline },
    founders,
    hn: hnResult,
    x: xResult,
    web: webResult,
  });
  for (const warning of warnings) console.error(`warning: ${warning}`);

  const path = resolve(out);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(profile, null, 2)}\n`);
  console.log(`wrote ${out} (clout ${profile.clout.score} tier ${profile.clout.tier})`);
  return { exitCode: 0 };
}

const invokedAsScript =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("src/cli.ts") || process.argv[1].endsWith("dist/cli.js"));

if (invokedAsScript) {
  const { exitCode } = await run(process.argv.slice(2));
  process.exit(exitCode);
}
