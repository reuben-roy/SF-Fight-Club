import { describe, expect, it } from "vitest";

import { MASCOT_STATES, buildMascot, type Mascot } from "../src/art/mascot.js";
import {
  MASCOT_CLASSES,
  MASCOT_CLASS_INFO,
  classForCategory,
  type MascotClass,
} from "../src/art/palette.js";
import { silhouette, type PixelGrid } from "../src/art/grid.js";

const CATEGORIES = [
  "proptech",
  "civic",
  "govtech",
  "legal",
  "climate",
  "energy",
  "weather",
  "fintech",
  "payments",
  "insurance",
  "devtools",
  "infra",
  "ai",
  "security",
  "marketplace",
  "logistics",
  "commerce",
  "health",
  "bio",
  "wellness",
  "hardware",
  "robotics",
  "mobility",
  "consumer",
  "social",
  "media",
  "education",
] as const;

function mascotFor(classId: MascotClass, index: number): Mascot {
  const category = MASCOT_CLASS_INFO[classId].categories[0] ?? "unknown";
  return buildMascot({ spriteSeed: `${classId}-${index}`, category });
}

function idleFrame(mascot: Mascot): PixelGrid {
  const frame = mascot.frames.idle[0];
  if (!frame) throw new Error("mascot has no idle frame");
  return frame;
}

function visual(mascot: Mascot): unknown {
  return {
    classId: mascot.classId,
    variant: mascot.variant,
    eyeStyle: mascot.eyeStyle,
    accessory: mascot.accessory,
    accent: mascot.accent,
    palette: mascot.palette,
    frames: mascot.frames,
  };
}

function differentPixels(left: boolean[][], right: boolean[][]): number {
  let count = 0;
  for (let y = 0; y < Math.max(left.length, right.length); y += 1) {
    const leftRow = left[y] ?? [];
    const rightRow = right[y] ?? [];
    for (let x = 0; x < Math.max(leftRow.length, rightRow.length); x += 1) {
      if ((leftRow[x] ?? false) !== (rightRow[x] ?? false)) count += 1;
    }
  }
  return count;
}

describe("buildMascot", () => {
  it("is deterministic for the same input", () => {
    const input = { spriteSeed: "permitpilot", category: "proptech" };
    expect(buildMascot(input)).toEqual(buildMascot(input));
  });

  it("gives different seeds of the same class different sprites", () => {
    const seeds = ["mayabuilds", "devraman", "clarawhit", "oscarmbeki", "priyaships", "lenabrandt"];
    const mascots = seeds.map((spriteSeed) => buildMascot({ spriteSeed, category: "proptech" }));
    for (let left = 0; left < mascots.length; left += 1) {
      for (let right = left + 1; right < mascots.length; right += 1) {
        const leftMascot = mascots[left];
        const rightMascot = mascots[right];
        if (!leftMascot || !rightMascot) continue;
        expect(visual(leftMascot)).not.toEqual(visual(rightMascot));
      }
    }
  });

  it("keeps every frame of every class inside the 48x48 grid", () => {
    for (const classId of MASCOT_CLASSES) {
      for (let index = 0; index < 3; index += 1) {
        const mascot = mascotFor(classId, index);
        for (const state of MASCOT_STATES) {
          const frames = mascot.frames[state];
          expect(frames.length, `${classId} ${state} has frames`).toBeGreaterThan(0);
          for (const frame of frames) {
            expect(frame.length).toBe(48);
            for (const row of frame) {
              expect(row.length).toBe(48);
            }
          }
        }
      }
    }
  });

  it("draws every class as a non-empty silhouette", () => {
    for (const classId of MASCOT_CLASSES) {
      const frame = idleFrame(mascotFor(classId, 0));
      const filled = silhouette(frame).flat().filter(Boolean).length;
      expect(filled, `${classId} silhouette`).toBeGreaterThan(220);
    }
  });

  it("keeps class silhouettes meaningfully apart", () => {
    // The grid has 2304 cells. A mascot fills roughly 500 to 900 of them, so a
    // pair one accessory apart still differs by 10 to 30 cells. We require 110
    // (about 5% of the grid, or a 10x11 block), which is larger than any single
    // accessory and smaller than the smallest real silhouette gap measured
    // here. That keeps the test honest without making it brittle.
    const MIN_DIFFERENT = 110;
    for (let left = 0; left < MASCOT_CLASSES.length; left += 1) {
      for (let right = left + 1; right < MASCOT_CLASSES.length; right += 1) {
        const leftClass = MASCOT_CLASSES[left];
        const rightClass = MASCOT_CLASSES[right];
        if (!leftClass || !rightClass) continue;
        const leftFrame = idleFrame(mascotFor(leftClass, 0));
        const rightFrame = idleFrame(mascotFor(rightClass, 0));
        const different = differentPixels(silhouette(leftFrame), silhouette(rightFrame));
        expect(different, `${leftClass} vs ${rightClass}`).toBeGreaterThanOrEqual(MIN_DIFFERENT);
      }
    }
  });
});

describe("classForCategory", () => {
  it("covers every category in the spec", () => {
    for (const category of CATEGORIES) {
      const classId = classForCategory(category);
      expect(MASCOT_CLASS_INFO[classId].categories).toContain(category);
    }
  });

  it("is case and whitespace tolerant", () => {
    expect(classForCategory(" FinTech ")).toBe("vault");
    expect(classForCategory("PROPTECH")).toBe("clerk");
  });

  it("maps an unknown category to a stable class", () => {
    const first = classForCategory("quantum basket weaving");
    expect(classForCategory("quantum basket weaving")).toBe(first);
    expect(MASCOT_CLASSES).toContain(first);
  });
});
