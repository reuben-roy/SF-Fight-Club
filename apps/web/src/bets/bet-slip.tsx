/**
 * Bet slip: two corner-coloured side buttons, stake chips (10/50/100/500/MAX),
 * a custom amount, and an estimated payout. Chips place immediately; the
 * reducer validates every stake. Play money only.
 *
 * After the first bell the same slip renders read-only behind a BETS LOCKED
 * stamp, so nothing on this page can place a bet once the match is locked.
 */

import { useState, type ReactElement } from "react";

import { Icon } from "../art/icons.js";
import type { MatchOdds } from "../data/store.js";
import { classNames, Stamp } from "../styles/components.js";
import { CHIP_VALUES, STARTING_WALLET } from "./odds.js";

export interface SlipBet {
  id: string;
  entrantId: string;
  stake: number;
}

export interface BetSlipProps {
  aId: string;
  bId: string;
  aName: string;
  bName: string;
  odds: MatchOdds | null;
  wallet: number;
  canBet: boolean;
  bets?: readonly SlipBet[];
  onPlace: (entrantId: string, stake: number) => void;
}

export function BetSlip(props: BetSlipProps): ReactElement {
  const [side, setSide] = useState<string>(props.aId);
  const [custom, setCustom] = useState("");
  const [preview, setPreview] = useState(0);

  const selectedIsA = side !== props.bId;
  const selectedOdds = props.odds ? (selectedIsA ? props.odds.oddsA : props.odds.oddsB) : null;
  const estimate = selectedOdds === null ? 0 : Math.floor(preview * selectedOdds);

  const place = (stake: number): void => {
    if (!props.canBet) return;
    setPreview(stake);
    props.onPlace(selectedIsA ? props.aId : props.bId, stake);
  };

  const placeMax = (): void => place(props.wallet);

  const placeCustom = (): void => {
    const stake = Number(custom);
    if (!Number.isInteger(stake)) return;
    place(stake);
  };

  const nameOf = (entrantId: string): string =>
    entrantId === props.aId ? props.aName : entrantId === props.bId ? props.bName : entrantId;

  return (
    <section
      className={classNames("sfc-slip", !props.canBet && "sfc-slip--locked")}
      aria-label="Bet slip"
      data-theme="paper"
    >
      <header className="sfc-slip__head">
        <h2>Bet slip</h2>
        <span className="sfc-slip__wallet">
          wallet S${props.wallet} of S${STARTING_WALLET}
        </span>
      </header>

      <div role="radiogroup" aria-label="Pick a side" className="sfc-slip__sides">
        <label
          className="sfc-slip__side sfc-corner--left"
          data-selected={selectedIsA}
          data-disabled={!props.canBet}
        >
          <input
            type="radio"
            name="bet-side"
            className="sfc-slip__radio"
            checked={selectedIsA}
            onChange={() => setSide(props.aId)}
            disabled={!props.canBet}
          />
          <span className="sfc-slip__pick">Left corner</span>
          <span className="sfc-slip__name">{props.aName}</span>
          <span className="sfc-slip__odds">{props.odds ? `${props.odds.oddsA.toFixed(2)}x` : "—"}</span>
        </label>
        <label
          className="sfc-slip__side sfc-corner--right"
          data-selected={!selectedIsA}
          data-disabled={!props.canBet}
        >
          <input
            type="radio"
            name="bet-side"
            className="sfc-slip__radio"
            checked={!selectedIsA}
            onChange={() => setSide(props.bId)}
            disabled={!props.canBet}
          />
          <span className="sfc-slip__pick">Right corner</span>
          <span className="sfc-slip__name">{props.bName}</span>
          <span className="sfc-slip__odds">{props.odds ? `${props.odds.oddsB.toFixed(2)}x` : "—"}</span>
        </label>
      </div>

      <div className="sfc-slip__chips" aria-label="Stake chips">
        {CHIP_VALUES.map((chip) => (
          <button
            key={chip}
            type="button"
            className="sfc-slip__chip"
            onClick={() => place(chip)}
            disabled={!props.canBet}
          >
            S${chip}
          </button>
        ))}
        <button type="button" className="sfc-slip__chip" onClick={placeMax} disabled={!props.canBet}>
          MAX
        </button>
      </div>

      <div className="sfc-slip__custom">
        <label>
          Custom amount
          <input
            type="number"
            min={1}
            step={1}
            value={custom}
            onChange={(event) => {
              setCustom(event.target.value);
              const stake = Number(event.target.value);
              setPreview(Number.isInteger(stake) && stake > 0 ? stake : 0);
            }}
            disabled={!props.canBet}
          />
        </label>
        <button
          type="button"
          className="sfc-slip__chip"
          onClick={placeCustom}
          disabled={!props.canBet}
        >
          Place S${custom || "0"}
        </button>
      </div>

      <div className="sfc-slip__estimate">
        <span>
          {preview > 0
            ? `S$${preview} on ${selectedIsA ? props.aName : props.bName}`
            : "Estimated payout"}
        </span>
        <strong>S${estimate}</strong>
      </div>
      <p className="sfc-slip__closed">Odds move until the bell. Play money only.</p>

      {props.bets && props.bets.length > 0 ? (
        <ul className="sfc-slip__bets" aria-label="My bets">
          {props.bets.map((bet) => (
            <li key={bet.id}>
              <span>{nameOf(bet.entrantId)}</span>
              <span>S${bet.stake}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {!props.canBet ? (
        <>
          <p className="sfc-slip__closed">Betting is closed for this match.</p>
          <span className="sfc-slip__locked-stamp">
            <Stamp tone="red" size="lg">
              BETS LOCKED
            </Stamp>
          </span>
        </>
      ) : null}
    </section>
  );
}

export interface BetSettlementProps {
  totalStake: number;
  totalPayout: number;
  bets: number;
}

/**
 * Settlement summary for the result page: a coin burst and the amount won, or
 * a small REKT and the amount lost. No bet means no settlement block.
 */
export function BetSettlement({ totalStake, totalPayout, bets }: BetSettlementProps): ReactElement | null {
  if (bets === 0 || totalStake === 0) return null;
  const net = totalPayout - totalStake;
  const won = net > 0;
  const push = net === 0;
  return (
    <section
      className={classNames("sfc-settle", won ? "sfc-settle--win" : push ? "sfc-settle--push" : "sfc-settle--loss")}
      aria-label="Bet settlement"
      data-theme="paper"
    >
      <div className="sfc-settle__amountwrap">
        {won ? (
          <div className="sfc-settle__coins" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <span
                key={index}
                className="sfc-coin"
                style={{ left: `${8 + index * 15}%`, animationDelay: `${index * 70}ms` }}
              >
                <Icon name="coin" size={16} />
              </span>
            ))}
          </div>
        ) : null}
        <p className="sfc-settle__label">{won ? "You won" : push ? "Push" : "REKT"}</p>
        <p className="sfc-settle__amount">
          {won ? `+S$${net}` : push ? "S$0" : `-S$${Math.abs(net)}`}
        </p>
      </div>
      <p className="sfc-settle__label">
        {push
          ? `S$${totalStake} returned. No profit, no loss.`
          : `S$${totalStake} staked, S$${totalPayout} returned.`}
      </p>
    </section>
  );
}
