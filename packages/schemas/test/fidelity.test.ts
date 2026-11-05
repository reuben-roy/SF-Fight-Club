import { describe, expect, it } from "vitest";

import { WEAPON_BY_CRITERION as fromContract } from "../../../schemas/contracts.js";
import { WEAPON_BY_CRITERION as fromPackage } from "../src/index.js";

describe("contract fidelity", () => {
  it("keeps the weapon map identical to schemas/contracts.ts", () => {
    expect(fromPackage).toEqual(fromContract);
  });
});
