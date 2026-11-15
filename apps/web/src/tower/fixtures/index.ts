import raw from "./demo-tournament.json?raw";

import { parseFixtureDocument } from "./parse.js";
import type { FixtureDocument } from "./schema.js";

const parsed: unknown = JSON.parse(raw);

/** The committed demo tournament. Node builds it, the browser only reads it. */
export const DEMO_FIXTURE: FixtureDocument = parseFixtureDocument(parsed);
