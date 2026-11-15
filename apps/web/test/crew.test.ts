import { describe, expect, it } from "vitest";

import { CREW_HEIGHT, CREW_STATES, CREW_WIDTH, buildCrew, type CrewMember } from "../src/art/crew.js";
import { SLOT } from "../src/art/grid.js";
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

  it("matches its committed shape without traits", () => {
    expect(buildCrew("mayabuilds")).toMatchSnapshot();
  });
});

describe("buildCrew with trait colors", () => {
  const LIGHT = { skin: "#c48e74", hair: "#959a99", shirt: "#202839" };
  const DARK = { skin: "#5d5d5d", hair: "#5a5a5a", shirt: "#1f1f1f" };

  function differingCells(plain: CrewMember, painted: CrewMember): { from: number; to: number }[] {
    const diffs: { from: number; to: number }[] = [];
    for (const state of CREW_STATES) {
      const plainFrames = plain.frames[state];
      const paintedFrames = painted.frames[state];
      expect(paintedFrames.length).toBe(plainFrames.length);
      plainFrames.forEach((frame, index) => {
        const other = paintedFrames[index];
        if (other === undefined) return;
        frame.forEach((row, y) => {
          row.forEach((slot, x) => {
            if ((other[y]?.[x] ?? -1) !== slot) diffs.push({ from: slot, to: other[y]?.[x] ?? -1 });
          });
        });
      });
    }
    return diffs;
  }

  it("uses the trait colors and is deterministic", () => {
    const first = buildCrew("mayabuilds", LIGHT);
    expect(first).toEqual(buildCrew("mayabuilds", LIGHT));
    expect(first.palette.skin).toBe(LIGHT.skin);
    expect(first.palette.hair).toBe(LIGHT.hair);
    expect(first.palette.shirt).toBe(LIGHT.shirt);
  });

  it("keeps ink eyes on light skin", () => {
    const diffs = differingCells(buildCrew("mayabuilds"), buildCrew("mayabuilds", LIGHT));
    expect(diffs).toEqual([]);
  });

  it("swaps only ink eyes for white ones on dark skin", () => {
    const diffs = differingCells(buildCrew("mayabuilds"), buildCrew("mayabuilds", DARK));
    expect(diffs.length).toBeGreaterThan(0);
    for (const diff of diffs) {
      expect(diff).toEqual({ from: SLOT.ink, to: SLOT.white });
    }
  });

  it("keeps eyes visible on the darkest committed sample skin", () => {
    const tubman = buildCrew("tubman-sample", { skin: "#6b5f4f", hair: "#a39a8c", shirt: "#7b7164" });
    const diffs = differingCells(buildCrew("tubman-sample"), tubman);
    expect(diffs.length).toBeGreaterThan(0);
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
