import { describe, expect, it } from "vitest";

import { FxSystem, WEAPON_IDS } from "../src/art/fx.js";

describe("FxSystem", () => {
  it("never exceeds the 400 particle cap", () => {
    const fx = new FxSystem("pool");
    for (let index = 0; index < 60; index += 1) {
      fx.impactBurst({ at: { x: 100, y: 100 }, impact: 3 });
    }
    expect(fx.particleCount).toBeLessThanOrEqual(400);
    fx.update(16);
    expect(fx.particleCount).toBeLessThanOrEqual(400);
  });

  it("fires every weapon without throwing", () => {
    const fx = new FxSystem("weapons");
    for (const weapon of WEAPON_IDS) {
      expect(() =>
        fx.fireWeapon({ weapon, from: { x: 10, y: 10 }, to: { x: 200, y: 100 }, impact: 2 }),
      ).not.toThrow();
    }
    for (let index = 0; index < 60; index += 1) fx.update(16);
    expect(fx.particleCount).toBeLessThanOrEqual(400);
  });

  it("honours reduced motion by suppressing shake and flashes", () => {
    const fx = new FxSystem("motion");
    fx.setReducedMotion(true);
    fx.requestShake(8);
    fx.requestFlash(0.8);
    fx.update(16);
    expect(fx.shakeOffset()).toEqual({ x: 0, y: 0 });
    expect(fx.hitStopRemaining()).toBe(0);
  });
});
