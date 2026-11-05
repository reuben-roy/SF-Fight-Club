import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { permitVsFogcastTape, suddenDeathTape } from "../src/tapes.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
mkdirSync(root, { recursive: true });

write("permit-vs-fogcast.json", permitVsFogcastTape());
write("sudden-death.json", suddenDeathTape());

function write(name: string, value: unknown): void {
  writeFileSync(join(root, name), `${JSON.stringify(value, null, 2)}\n`);
}
