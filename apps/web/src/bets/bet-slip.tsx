/**
 * Bet slip: side selection, chips (10/50/100/500/MAX) plus a custom amount.
 * Play money only. Dispatches place_bet; the reducer validates the stake.
 */

import { useState, type ReactElement } from "react";

import type { MatchOdds } from "../data/store.js";
import { CHIP_VALUES, STARTING_WALLET } from "./odds.js";

export interface BetSlipProps {
  aId: string;
  bId: string;
  aName: string;
  bName: string;
  odds: MatchOdds | null;
  wallet: number;
  canBet: boolean;
  onPlace: (entrantId: string, stake: number) => void;
}

export function BetSlip(props: BetSlipProps): ReactElement {
  const [side, setSide] = useState<string>(props.aId);
  const [custom, setCustom] = useState("");

  const place = (stake: number): void => {
    if (!props.canBet) return;
    props.onPlace(side === props.bId ? props.bId : props.aId, stake);
  };

  const placeMax = (): void => place(props.wallet);

  const placeCustom = (): void => {
    const stake = Number(custom);
    if (!Number.isInteger(stake)) return;
    place(stake);
  };

  return (
    <section aria-label="Bet slip">
      <h3>Bet slip (wallet S${props.wallet} of S${STARTING_WALLET})</h3>
      <div role="radiogroup" aria-label="Pick a side">
        <label>
          <input
            type="radio"
            name="bet-side"
            checked={side !== props.bId}
            onChange={() => setSide(props.aId)}
            disabled={!props.canBet}
          />
          {props.aName}
          {props.odds ? ` pays ${props.odds.oddsA.toFixed(2)}x` : ""}
        </label>
        <label>
          <input
            type="radio"
            name="bet-side"
            checked={side === props.bId}
            onChange={() => setSide(props.bId)}
            disabled={!props.canBet}
          />
          {props.bName}
          {props.odds ? ` pays ${props.odds.oddsB.toFixed(2)}x` : ""}
        </label>
      </div>
      <div>
        {CHIP_VALUES.map((chip) => (
          <button key={chip} type="button" onClick={() => place(chip)} disabled={!props.canBet}>
            S${chip}
          </button>
        ))}
        <button type="button" onClick={placeMax} disabled={!props.canBet}>
          MAX
        </button>
      </div>
      <div>
        <label>
          Custom amount{" "}
          <input
            type="number"
            min={1}
            step={1}
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            disabled={!props.canBet}
          />
        </label>
        <button type="button" onClick={placeCustom} disabled={!props.canBet}>
          Place S${custom || "0"}
        </button>
      </div>
      {!props.canBet ? <p>Betting is closed for this match.</p> : null}
    </section>
  );
}
