import { describe, expect, it } from "vitest";

import { SOUND_NAMES, createSoundKit } from "../src/art/sound.js";

describe("createSoundKit", () => {
  it("never throws without Web Audio", () => {
    const kit = createSoundKit();
    expect(kit.isMuted()).toBe(true);
    kit.setMuted(false);
    for (const name of SOUND_NAMES) {
      expect(() => kit.play(name)).not.toThrow();
    }
    kit.setMuted(true);
    kit.play("ko");
    kit.dispose();
  });
});
