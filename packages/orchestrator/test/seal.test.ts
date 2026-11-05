import { describe, expect, it } from "vitest";

import { OrchestratorError, markComplete, runMatch, toPublicMatch } from "../src/index.js";
import { MATCH_SEED, WEIGH_A, loadFixture, matchInput } from "./helpers.js";

describe("sealing", () => {
  it("hides the script, events, and winner until the match is complete", () => {
    const run = runMatch(matchInput({ fixtures: loadFixture("permit-vs-fogcast.json") }));
    expect(run.status).toBe("sealed");
    expect(run.script).not.toBeNull();
    expect(run.resolution?.winner).toBe("A");

    const hidden = toPublicMatch(run);
    expect(hidden.winner).toBeNull();
    expect(hidden.outcome).toBeNull();
    expect(hidden.decidedBy).toBeNull();
    expect(hidden.script).toBeNull();
    expect(hidden.events).toBeNull();
    expect(hidden.calls).toBeNull();
    expect(hidden.fighters.A.name).toBe("PermitPilot");
    expect(hidden.corners).not.toBeNull();

    const revealed = toPublicMatch(markComplete(run));
    expect(revealed.status).toBe("complete");
    expect(revealed.winner).toBe("A");
    expect(revealed.outcome).toBe("KO");
    expect(revealed.script).toEqual(run.script);
    expect(revealed.events).toEqual(run.events);
    expect(JSON.stringify(hidden)).not.toContain(String(WEIGH_A));
    expect(JSON.stringify(hidden)).not.toContain(MATCH_SEED);
  });

  it("refuses to compute while bets are open and does not read fixtures", () => {
    let touched = false;
    const fixtures = {
      steps: new Proxy(
        {},
        {
          get() {
            touched = true;
            return undefined;
          },
        },
      ),
    };
    expect(() => runMatch(matchInput({ status: "betting_open", fixtures }))).toThrow(OrchestratorError);
    try {
      runMatch(matchInput({ status: "betting_open", fixtures }));
    } catch (error) {
      expect(error).toMatchObject({ code: "bets_open" });
    }
    expect(touched).toBe(false);
    expect(() => runMatch(matchInput({ status: "sealed" }))).toThrow(OrchestratorError);
  });

  it("refuses a new match below the budget floor and still resumes one already started", () => {
    const budget = { remainingUsd: 1, medianMatchUsd: 1 };
    expect(() => runMatch(matchInput({ budget }))).toThrow(OrchestratorError);
    const started = runMatch(matchInput());
    const resumed = runMatch(
      matchInput({
        status: "computing",
        budget,
        prior: { events: started.events, calls: started.calls },
      }),
    );
    expect(resumed.status).toBe("sealed");
    expect(resumed.fixtureReads).toEqual([]);
  });

  it("does not mark a failed match complete", () => {
    const run = runMatch(
      matchInput({
        fixtures: {
          steps: {
            [ "scout/A" ]: { attempts: [{ kind: "output", output: { nope: true } }, { kind: "output", output: { nope: true } }] },
          },
        },
      }),
    );
    expect(run.status).toBe("failed");
    expect(toPublicMatch(run).events).toBeNull();
    expect(() => markComplete(run)).toThrow(OrchestratorError);
  });
});
