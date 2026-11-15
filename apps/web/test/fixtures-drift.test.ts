import { describe, expect, it } from "vitest";

import arenaFixture from "../src/arena/fixtures/demo.json";
import { buildArenaFixture } from "../src/arena/fixtures/generate.js";
import towerFixture from "../src/tower/fixtures/demo-tournament.json";
import { buildTowerFixture } from "../src/tower/fixtures/generate.js";

describe("committed demo fixtures", () => {
  it("matches the arena builder", async () => {
    expect(arenaFixture).toEqual(await buildArenaFixture());
  });

  it("matches the Tower builder", () => {
    expect(towerFixture).toEqual(buildTowerFixture());
  });
});
