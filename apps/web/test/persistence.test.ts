import { afterEach, describe, expect, it, vi } from "vitest";

import { demoBundleSchema } from "../src/data/demo-bundle.js";
import { DEMO_BUNDLE } from "../src/data/generated/demo.js";
import {
  initialAppState,
  loadPersistedState,
  resetRequested,
  savePersistedState,
  STORAGE_KEY,
} from "../src/data/store.js";

const bundle = DEMO_BUNDLE;

describe("demo bundle drift", () => {
  it("parses the committed bundle through the zod schema", () => {
    expect(() => demoBundleSchema.parse(DEMO_BUNDLE)).not.toThrow();
  });

  it("holds the spec section 7 field", () => {
    expect(bundle.entrants.map((e) => e.id)).toEqual([
      "permitpilot",
      "dermalens",
      "flakehunter",
      "tabclear",
      "paperroute",
      "curbbot",
      "looproom",
      "fogcast",
    ]);
    expect(bundle.matches).toHaveLength(7);
    expect(bundle.buildHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("resolves the tournament exactly as specified", () => {
    const bySlot = new Map(bundle.matches.map((m) => [`r${m.roundIndex}s${m.slotIndex}`, m]));
    const winner = (slot: string): string => {
      const match = bySlot.get(slot);
      if (!match) throw new Error(`no match ${slot}`);
      return match.winnerId;
    };
    expect(winner("r0s0")).toBe("permitpilot");
    expect(winner("r0s1")).toBe("tabclear");
    expect(winner("r0s2")).toBe("dermalens");
    expect(winner("r0s3")).toBe("curbbot");
    expect(winner("r1s0")).toBe("permitpilot");
    expect(winner("r1s1")).toBe("curbbot");
    expect(winner("r2s0")).toBe("permitpilot");

    const resolution = (slot: string) => {
      const match = bySlot.get(slot);
      if (!match) throw new Error(`no match ${slot}`);
      return match.resolution;
    };
    expect(resolution("r0s0").outcome).toBe("KO");
    expect(resolution("r0s1").outcome).toBe("DECISION");
    expect(resolution("r0s1").decisionType).toBe("unanimous");
    expect(resolution("r0s2").outcome).toBe("KO");
    expect(resolution("r0s2").perfect).toBe(true);
    expect(resolution("r0s3").outcome).toBe("DECISION");
    expect(resolution("r0s3").decisionType).toBe("majority");
    expect(resolution("r1s0").outcome).toBe("KO");
    expect(resolution("r1s1").outcome).toBe("DECISION");
    expect(resolution("r1s1").decisionType).toBe("unanimous");
    expect(resolution("r2s0").outcome).toBe("SUDDEN_DEATH");
    expect(resolution("r2s0").decidedBy).toBe("sudden_death_judge");
  });
});

describe("persistence", () => {
  const store = new Map<string, string>();

  afterEach(() => {
    store.clear();
    vi.unstubAllGlobals();
  });

  function fakeWindow(): void {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string): string | null => store.get(key) ?? null,
        setItem: (key: string, value: string): void => {
          store.set(key, value);
        },
        removeItem: (key: string): void => {
          store.delete(key);
        },
      },
    });
  }

  it("round-trips state through localStorage", () => {
    fakeWindow();
    const state = { ...initialAppState(bundle), wallet: 850, nextBetId: 3 };
    savePersistedState(state);
    expect(store.has(STORAGE_KEY)).toBe(true);
    expect(loadPersistedState(bundle)).toEqual(state);
  });

  it("starts fresh on corrupt, foreign, or missing data", () => {
    fakeWindow();
    expect(loadPersistedState(bundle)).toBeNull();
    store.set(STORAGE_KEY, "not json{");
    expect(loadPersistedState(bundle)).toBeNull();
    store.set(STORAGE_KEY, JSON.stringify({ version: 2, nope: true }));
    expect(loadPersistedState(bundle)).toBeNull();
    store.set(STORAGE_KEY, JSON.stringify({ ...initialAppState(bundle), wallet: -5 }));
    expect(loadPersistedState(bundle)).toBeNull();
  });
});

describe("resetRequested", () => {
  it("detects ?reset=1", () => {
    expect(resetRequested("?reset=1")).toBe(true);
    expect(resetRequested("?foo=bar&reset=1")).toBe(true);
    expect(resetRequested("")).toBe(false);
    expect(resetRequested("?reset=0")).toBe(false);
    expect(resetRequested("?reset=10")).toBe(false);
  });
});
