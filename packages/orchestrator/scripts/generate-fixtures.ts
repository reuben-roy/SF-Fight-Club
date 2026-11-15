import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  dermaVsCurbTape,
  dermaVsLoopTape,
  finalTape,
  flakeVsCurbTape,
  permitVsFogcastTape,
  permitVsTabTape,
  suddenDeathTape,
  tabVsPaperTape,
} from "../src/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
mkdirSync(root, { recursive: true });

write("permit-vs-fogcast.json", permitVsFogcastTape());
write("sudden-death.json", suddenDeathTape());
write("demo-qf2-tab-paper.json", tabVsPaperTape());
write("demo-qf3-derma-loop.json", dermaVsLoopTape());
write("demo-qf4-flake-curb.json", flakeVsCurbTape());
write("demo-sf1-permit-tab.json", permitVsTabTape());
write("demo-sf2-derma-curb.json", dermaVsCurbTape());
write("demo-final-permit-curb.json", finalTape());

function write(name: string, value: unknown): void {
  writeFileSync(join(root, name), `${JSON.stringify(value, null, 2)}\n`);
}
