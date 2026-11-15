import { describe, expect, it } from "vitest";

import { CREW_HEIGHT, CREW_STATES, CREW_WIDTH, buildCrew } from "../src/art/crew.js";
import { ICON_NAMES, iconRuns } from "../src/art/iconArt.js";

describe("buildCrew", () => {
  it("is deterministic for the same handle", () => {
    expect(buildCrew("mayabuilds")).toEqual(buildCrew("mayabuilds"));
  });

  it("gives different handles different people", () => {
    const people = ["mayabuilds", "devraman", "inesvidal", "anasorensen"].map((handle) => buildCrew(handle));
    for (let left = 0; left < people.length; left += 1) {
      for (let right = left + 1; right < people.length; right += 1) {
        const leftPerson = people[left];
        const rightPerson = people[right];
        if (!leftPerson || !rightPerson) continue;
        expect({ palette: leftPerson.palette, hair: leftPerson.hair, frames: leftPerson.frames }).not.toEqual({
          palette: rightPerson.palette,
          hair: rightPerson.hair,
          frames: rightPerson.frames,
        });
      }
    }
  });

  it("keeps every crew frame at 12x16", () => {
    const member = buildCrew("mayabuilds");
    for (const state of CREW_STATES) {
      expect(member.frames[state].length).toBeGreaterThan(0);
      for (const frame of member.frames[state]) {
        expect(frame.length).toBe(CREW_HEIGHT);
        for (const row of frame) expect(row.length).toBe(CREW_WIDTH);
      }
    }
  });
});

describe("icons", () => {
  it("emits runs for every icon, all inside 16x16", () => {
    for (const name of ICON_NAMES) {
      const runs = iconRuns(name);
      expect(runs.length, name).toBeGreaterThan(8);
      for (const run of runs) {
        expect(run.x).toBeGreaterThanOrEqual(0);
        expect(run.y).toBeGreaterThanOrEqual(0);
        expect(run.x + run.width).toBeLessThanOrEqual(16);
        expect(run.y).toBeLessThan(16);
      }
    }
  });
});
