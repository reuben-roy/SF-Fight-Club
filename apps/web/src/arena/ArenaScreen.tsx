import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, ReactElement } from "react";
import type { CriterionId, Cue, Slot } from "@sf-fight-club/schemas";

import { STAGE_HEIGHT, STAGE_WIDTH } from "../art/stage.js";
import { createSoundKit } from "../art/sound.js";
import { useReducedMotion } from "../styles/app-state.js";
import {
  Button,
  classNames,
  ElementChip,
  NarrationBox,
  Panel,
  SpeechBubble,
  Stamp,
  TitleBadge,
} from "../styles/components.js";
import { ArenaEffects } from "./effects.js";
import { buildArenaAssets, drawArenaFrame } from "./scene.js";
import {
  CRITERION_LABELS,
  PHASE_LABELS,
  ROUND_NAMES,
  STATUS_LABELS,
  TURN_PHASES,
  buildTimeline,
  phaseKey,
  receiptsAt,
  stateAt,
  turnStartMs,
  other,
  type ArenaState,
  type ArenaTimeline,
  type CueTreatment,
  type Receipt,
  type RoundTitleCue,
  type ShotCue,
  type TurnWindow,
  type WinnerCue,
} from "./timeline.js";
import {
  SPEEDS,
  isSpeed,
  jumpToMs,
  jumpToTurn,
  nextTurn as seekNextTurn,
  pause,
  play,
  restart,
  seek,
  tick,
  togglePlay,
  type PlaybackState,
  type Speed,
} from "./playback.js";
import type { ArenaFighter, ArenaScreenProps } from "./types.js";
import "./arena.css";

const OUTCOME_LABEL: Record<ShotCue["outcome"], string> = {
  hit: "LANDED",
  crit: "CRITICAL",
  partial: "PARTIAL",
  glancing: "GLANCING",
  parried: "PARRIED",
  whiff: "WHIFF",
  backfire: "FACT-CHECKED",
};

const MENU_CURSOR_STEP = 0.38;

const BEAT_DECK_LABEL: Record<Cue["kind"], string> = {
  intro: "TALE OF THE TAPE",
  round_title: "ROUND TITLE",
  shot: "TURN",
  hammer: "GAVEL",
  status: "STATUS",
  scorecard: "SCORECARD",
  outcome: "MATCH OVER",
  sudden_death: "SUDDEN DEATH",
  finisher: "FINAL BLOW",
  winner: "WINNER",
};

const DECIDED_BY_LABEL: Record<WinnerCue["decidedBy"], string> = {
  scores: "THE SCORECARD",
  sudden_death_judge: "SUDDEN DEATH PANEL",
  vc_panel: "VC PANEL",
  weighin_total: "THE WEIGH-IN",
  seed: "THE SEED",
};

interface StageView {
  state: ArenaState;
  cursor: number;
  pressed: boolean;
  receipts: readonly Receipt[];
  key: string;
}

interface Announcement {
  id: number;
  text: string;
}

export function ArenaScreen(props: ArenaScreenProps): ReactElement {
  const { script, fighters, onTurn, onComplete } = props;
  const timeline = useMemo(() => buildTimeline(script), [script]);
  const assets = useMemo(() => buildArenaAssets(fighters), [fighters]);
  const effects = useMemo(() => new ArenaEffects(), []);
  const sound = useMemo(() => createSoundKit(), []);
  const reducedMotion = useReducedMotion();

  const moment = useMemo(() => readMoment(timeline), [timeline]);
  const [muted, setMuted] = useState(true);
  const [playing, setPlayingState] = useState(moment.playing ?? props.autoplay ?? true);
  const [speed, setSpeed] = useState<Speed>(props.initialSpeed ?? moment.speed ?? 1);
  const [stageScale, setStageScale] = useState(1);
  const [announcement, setAnnouncement] = useState<Announcement>({ id: 0, text: "" });

  const playback = useRef<PlaybackState>({
    positionMs: moment.positionMs,
    playing: moment.playing ?? props.autoplay ?? true,
    completed: false,
  });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const progressRef = useRef<HTMLSpanElement | null>(null);
  const clockRef = useRef<HTMLSpanElement | null>(null);
  const lastKey = useRef("");
  const lastCursor = useRef(-1);
  const lastPressed = useRef(false);
  const prevMs = useRef(moment.positionMs);
  const announced = useRef(new Set<number>());
  const done = useRef(false);
  const callbacks = useRef({ onTurn, onComplete });
  const reduced = useRef(reducedMotion);
  const [view, setView] = useState<StageView>(() => initialView(timeline, moment.positionMs));

  callbacks.current = { onTurn, onComplete };
  reduced.current = reducedMotion;

  useEffect(() => {
    sound.setMuted(true);
    return () => sound.dispose();
  }, [sound]);

  useEffect(() => {
    effects.setReducedMotion(reducedMotion);
  }, [effects, reducedMotion]);

  useEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    const measure = (): void => {
      const width = element.getBoundingClientRect().width;
      if (width > 0) setStageScale(width / STAGE_WIDTH);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const paint = useCallback(
    (timeMs: number): void => {
      const now = performance.now();
      effects.sync({ timeline, timeMs });
      for (const name of effects.drainSounds()) sound.play(name);

      const state = stateAt(timeline, timeMs);
      const cursor = menuCursorFor(state);
      const pressed = state.turn ? state.turn.phase !== "turn_start" && state.turn.phase !== "menu" : false;
      const receipts = receiptsAt(timeline, timeMs);

      if (cursor !== lastCursor.current && state.turn && state.turn.phase === "menu") sound.play("tick");
      if (pressed && !lastPressed.current && state.turn && state.turn.phase === "callout") sound.play("select");
      lastCursor.current = cursor;
      lastPressed.current = pressed;

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        drawArenaFrame({ ctx, timeline, state, assets, effects, nowMs: now, reducedMotion: reduced.current });
      }

      if (progressRef.current) progressRef.current.style.width = `${(timeMs / timeline.durationMs) * 100}%`;
      if (clockRef.current) clockRef.current.textContent = `${formatClock(timeMs)} / ${formatClock(timeline.durationMs)}`;

      const key = viewKey({ state, cursor, pressed, receipts });
      if (key !== lastKey.current) {
        lastKey.current = key;
        setView({ state, cursor, pressed, receipts, key });
      }

      const was = prevMs.current;
      if (timeMs > was) {
        for (const turn of timeline.turns) {
          if (turn.impactAt <= was || turn.impactAt > timeMs) continue;
          if (!announced.current.has(turn.turn)) {
            announced.current.add(turn.turn);
            callbacks.current.onTurn?.(turn.turn);
            setAnnouncement((previous) => ({ id: previous.id + 1, text: announceTurn(turn, fighters) }));
          }
        }
        if (timeline.winnerAt !== null && was < timeline.durationMs && timeMs >= timeline.durationMs && !done.current) {
          done.current = true;
          callbacks.current.onComplete?.();
        }
      }
      prevMs.current = timeMs;
    },
    [assets, effects, fighters, sound, timeline],
  );

  useEffect(() => {
    let raf = 0;
    let previous = performance.now();
    const frame = (now: number): void => {
      const dt = Math.min(120, Math.max(0, now - previous));
      previous = now;
      const state = playback.current;
      if (state.playing && !document.hidden) {
        const slow = isFinisher(timeline, state.positionMs) && !reduced.current ? 0.3 : 1;
        const next = tick(state, { dtMs: dt * slow, durationMs: timeline.durationMs, speed });
        playback.current = next;
        if (next.completed) setPlayingState(false);
      }
      paint(playback.current.positionMs);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [paint, speed, timeline]);

  useEffect(() => {
    const onVisibility = (): void => {
      if (!document.hidden) return;
      playback.current = pause(playback.current);
      setPlayingState(false);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const seekTo = useCallback(
    (positionMs: number, resume: boolean) => {
      playback.current = seek(playback.current, { positionMs, durationMs: timeline.durationMs });
      playback.current = resume ? play(playback.current) : pause(playback.current);
      setPlayingState(playback.current.playing);
      prevMs.current = playback.current.positionMs;
      announced.current = new Set();
      done.current = checklistBefore(timeline, playback.current.positionMs);
      lastKey.current = "";
      paint(playback.current.positionMs);
    },
    [paint, timeline],
  );

  const handleToggle = useCallback(() => {
    playback.current = togglePlay(playback.current);
    setPlayingState(playback.current.playing);
    lastKey.current = "";
  }, []);

  const handleSpeed = useCallback((next: Speed) => {
    setSpeed(next);
  }, []);

  const handleNext = useCallback(() => {
    playback.current = seekNextTurn(playback.current, { timeline });
    setPlayingState(playback.current.playing);
    prevMs.current = playback.current.positionMs;
    announced.current = new Set();
    lastKey.current = "";
  }, [timeline]);

  const handleRestart = useCallback(() => {
    playback.current = restart(playback.current);
    setPlayingState(true);
    prevMs.current = 0;
    announced.current = new Set();
    done.current = false;
    lastKey.current = "";
    paint(0);
  }, [paint]);

  const handleTurnJump = useCallback(
    (turn: number) => {
      playback.current = jumpToTurn(playback.current, { timeline, turn });
      setPlayingState(playback.current.playing);
      prevMs.current = playback.current.positionMs;
      announced.current = new Set();
      done.current = checklistBefore(timeline, playback.current.positionMs);
      lastKey.current = "";
      paint(playback.current.positionMs);
    },
    [paint, timeline],
  );

  const handleSeekBar = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
      seekTo(ratio * timeline.durationMs, false);
    },
    [seekTo, timeline.durationMs],
  );

  const handleSound = useCallback(() => {
    const next = !muted;
    sound.setMuted(next);
    setMuted(next);
  }, [muted, sound]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select")) return;
      if (event.code === "Space") {
        event.preventDefault();
        handleToggle();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        handleNext();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        playback.current = jumpToMs(playback.current, { timeline, timeMs: Math.max(0, playback.current.positionMs - 2000) });
        prevMs.current = playback.current.positionMs;
        announced.current = new Set();
        lastKey.current = "";
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleNext, handleToggle, timeline]);

  const state = view.state;
  const activeTurn = state.turn;

  return (
    <div className="arena" data-reduced={reducedMotion} aria-label={`Arena match ${script.matchId}`}>
      <div className="arena__body">
        <section className="arena__main">
          <div className="arena-hud">
            <FighterPlate slot="A" fighter={fighters.A} state={state} />
            <RoundPlate
              state={state}
              scriptVersion={script.directorVersion}
              fallback={timeline.rounds.find((slice) => slice.round === state.round)?.criteria ?? []}
            />
            <FighterPlate slot="B" fighter={fighters.B} state={state} />
          </div>

          <div className="arena-stage" ref={frameRef}>
            <canvas
              ref={canvasRef}
              width={STAGE_WIDTH}
              height={STAGE_HEIGHT}
              className="arena-stage__canvas"
              aria-hidden="true"
            />
            <div
              className="arena-stage__overlay"
              style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT, transform: `scale(${stageScale})` }}
            >
              <StageOverlay
                state={state}
                timeline={timeline}
                fighters={fighters}
                cursor={view.cursor}
                pressed={view.pressed}
                reducedMotion={reducedMotion}
              />
            </div>
          </div>

          <TurnStrip timeline={timeline} state={state} onJump={handleTurnJump} />

          <CommandDeck
            state={state}
            fighters={fighters}
            narration={narrationFor({ state, fighters })}
          />

          <div className="arena-controls">
            <div className="arena-controls__group">
              <Button variant="hot" size="sm" onClick={handleToggle}>
                {playing ? "PAUSE" : playback.current.completed ? "REPLAY" : "PLAY"}
              </Button>
              <div className="arena-speeds" role="group" aria-label="Playback speed">
                {SPEEDS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className="arena-speed"
                    data-on={option === speed}
                    aria-pressed={option === speed}
                    onClick={() => handleSpeed(option)}
                  >
                    {option}x
                  </button>
                ))}
              </div>
              <Button size="sm" onClick={handleNext}>
                NEXT TURN
              </Button>
              <Button variant="ghost" size="sm" onClick={handleRestart}>
                RESTART
              </Button>
            </div>
            <div className="arena-controls__group">
              <Button variant="ghost" size="sm" aria-pressed={!muted} onClick={handleSound}>
                {muted ? "SOUND OFF" : "SOUND ON"}
              </Button>
              <span className="arena-clock" ref={clockRef}>
                0:00 / {formatClock(timeline.durationMs)}
              </span>
            </div>
          </div>

          <div className="arena-progress" onClick={handleSeekBar} role="presentation">
            <span className="arena-progress__fill" ref={progressRef} />
            {timeline.turns.map((turn) => (
              <i
                key={turn.turn}
                className="arena-progress__mark"
                data-aired={state.airedTurns.includes(turn.turn)}
                style={{ left: `${(turn.startMs / timeline.durationMs) * 100}%` }}
              />
            ))}
          </div>
        </section>

        <Receipts receipts={view.receipts} fighters={fighters} />
      </div>

      <p className="arena-sr-only" aria-live="polite" aria-atomic="true">
        {announcement.text}
      </p>
      <span className="arena-sr-only">
        Turn {activeTurn ? activeTurn.window.turn : state.turnNumber}. {PHASE_LABELS[activeTurn?.phase ?? "turn_start"]}.
      </span>
    </div>
  );
}

function FighterPlate({
  slot,
  fighter,
  state,
}: {
  slot: Slot;
  fighter: ArenaFighter;
  state: ArenaState;
}): ReactElement {
  const hp = state.hp[slot];
  const statuses = state.statuses[slot];
  const filled = Math.ceil(hp / 5);
  const side = slot === "A" ? "left" : "right";
  return (
    <div className="arena-plate" data-side={side} data-low={hp <= 30} data-ko={hp <= 0}>
      <div className="arena-plate__head">
        <span className="arena-plate__seed">
          #{fighter.seed} · {fighter.tier}
        </span>
        <TitleBadge title={fighter.title} />
      </div>
      <div className="arena-plate__name">{fighter.name}</div>
      <div className="arena-hp" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={hp} aria-label={`${fighter.name} health`}>
        <span className="arena-hp__ghost" style={{ width: `${hp}%` }} aria-hidden="true" />
        <span className="arena-hp__segments" aria-hidden="true">
          {Array.from({ length: 20 }, (_, index) => (
            <i key={index} data-filled={index < filled} />
          ))}
        </span>
      </div>
      <div className="arena-plate__foot">
        <span className="arena-plate__hp">{Math.round(hp)}</span>
        <span className="arena-plate__meta">CLOUT {fighter.clout}</span>
        <span className="arena-plate__crew">{fighter.crew.length} CREW</span>
      </div>
      <div className="arena-statuses">
        {statuses.map((status) => (
          <span key={status} className="arena-status" data-status={status}>
            {STATUS_LABELS[status]}
          </span>
        ))}
      </div>
    </div>
  );
}

function RoundPlate({
  state,
  scriptVersion,
  fallback,
}: {
  state: ArenaState;
  scriptVersion: string;
  fallback: RoundTitleCue["criteria"];
}): ReactElement {
  const cue = state.roundCue;
  const criteria = cue?.round === state.round ? cue.criteria : fallback;
  return (
    <div className="arena-round">
      <div className="arena-round__line">
        <span className="arena-round__tag">ROUND {state.round}</span>
        <span className="arena-round__name">{ROUND_NAMES[state.round]}</span>
      </div>
      <div className="arena-round__criteria">
        {criteria.map((criterion) => (
          <span
            key={criterion.id}
            className="arena-crit"
            data-live={state.roundCue?.round === state.round}
            data-active={state.turn ? state.turn.window.cue.criterion === criterion.id : false}
          >
            {CRITERION_LABELS[criterion.id]}
            <em>{criterion.weight}</em>
          </span>
        ))}
      </div>
      <div className="arena-build">SAME AGENT BOTH CORNERS · DIRECTOR v{scriptVersion}</div>
    </div>
  );
}

function TurnStrip({
  timeline,
  state,
  onJump,
}: {
  timeline: ArenaTimeline;
  state: ArenaState;
  onJump: (turn: number) => void;
}): ReactElement {
  return (
    <div className="arena-strip" aria-label="Turns">
      {timeline.rounds.map((round) => (
        <div className="arena-strip__group" key={round.round}>
          <span className="arena-strip__label" title={round.name}>
            R{round.round}
          </span>
          <div className="arena-strip__pips">
            {round.turns.map((turnNumber) => {
              const turn = timeline.turnByNumber.get(turnNumber);
              if (!turn) return null;
              const aired = state.airedTurns.includes(turnNumber);
              const current = state.turnNumber === turnNumber;
              return (
                <button
                  key={turnNumber}
                  type="button"
                  className="arena-pip"
                  data-actor={turn.cue.shooter}
                  data-aired={aired}
                  data-current={current}
                  onClick={() => onJump(turnNumber)}
                  aria-label={`Turn ${turnNumber}, ${stateLabel(turn)}`}
                  aria-current={current ? "true" : undefined}
                  title={`Turn ${turnNumber} · ${turn.cue.move.name}`}
                >
                  <span>{turnNumber}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function stateLabel(turn: TurnWindow): string {
  return `${turn.cue.shooter === "A" ? "left" : "right"} corner uses ${turn.cue.move.name}`;
}

function CommandDeck({
  state,
  fighters,
  narration,
}: {
  state: ArenaState;
  fighters: Record<Slot, ArenaFighter>;
  narration: { key: string; text: string; speaker: string };
}): ReactElement {
  const turn = state.turn;
  const cue = turn?.window.cue ?? null;
  const actor = cue ? fighters[cue.shooter] : null;
  const menu = cue?.menu ?? [];
  const cursor = turn ? menuCursorFor(state) : 0;
  const pressed = turn ? turn.phase !== "turn_start" && turn.phase !== "menu" : false;
  const revealed = turn !== null && (turn.phase === "impact" || turn.phase === "verdict");
  const deckActor = actor
    ? `${actor.name} ACTS`
    : state.winnerCue
      ? `${fighters[state.winnerCue.winner].name} TAKES IT`
      : state.finisherCue
        ? "FINAL BLOW"
        : state.suddenDeathCue
          ? "PANEL VOTES"
          : state.outcomeCue
            ? "MATCH OVER"
            : "AWAITING THE BELL";
  const deckPhase = turn ? PHASE_LABELS[turn.phase] : BEAT_DECK_LABEL[state.beat?.kind ?? "intro"];

  return (
    <div className="arena-deck">
      <div className="arena-deck__menu">
        <div className="arena-deck__head">
          <span className="arena-deck__actor" data-slot={cue?.shooter ?? "A"}>
            {deckActor}
          </span>
          <span className="arena-deck__phase">{deckPhase}</span>
        </div>
        <div className="arena-moves" role="list" data-count={menu.length}>
          {menu.length === 0 ? (
            <span className="arena-moves__empty">
              {state.outcomeCue || state.finisherCue || state.winnerCue
                ? "The bell has rung. No more moves."
                : "No moves on the table yet."}
            </span>
          ) : (
            menu.map((move, index) => {
              const picked = cue !== null && move.name === cue.move.name;
              return (
                <div
                  key={move.name}
                  className="arena-move"
                  role="listitem"
                  data-cursor={index === cursor}
                  data-picked={picked}
                  data-pressed={picked && pressed}
                >
                  <span className="arena-move__caret" aria-hidden="true">
                    {index === cursor ? "\u25B6" : ""}
                  </span>
                  <ElementChip element={move.element} className="arena-move__chip">
                    {move.name}
                  </ElementChip>
                  <span className="arena-move__type">{move.type}</span>
                  <span className="arena-move__tick" aria-hidden="true">
                    {picked && pressed ? "\u2713" : ""}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
      <div className="arena-deck__say">
        <NarrationBox key={narration.key} text={narration.text} speaker={narration.speaker} />
        {cue ? (
          <div className="arena-deck__facts">
            <span className="arena-deck__criterion">{CRITERION_LABELS[cue.criterion]}</span>
            <span className="arena-deck__volley">VOLLEY {cue.volley}</span>
            {revealed ? (
              <span className="arena-deck__damage" data-zero={cue.damage === 0}>
                {cue.damage > 0 ? `-${cue.damage} HP` : "NO DAMAGE"}
              </span>
            ) : (
              <span className="arena-deck__sealed-fact">DAMAGE SEALED</span>
            )}
          </div>
        ) : null}
      </div>
      <div className="arena-deck__sealed">SEALED MATCH. MOVES WERE WRITTEN BEFORE THE BELL.</div>
    </div>
  );
}

function Receipts({
  receipts,
  fighters,
}: {
  receipts: readonly Receipt[];
  fighters: Record<Slot, ArenaFighter>;
}): ReactElement {
  const listRef = useRef<HTMLOListElement | null>(null);
  const count = receipts.length;
  const newestFirst = [...receipts].reverse();
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTop = 0;
  }, [count]);

  return (
    <aside className="arena-receipts">
      <Panel
        title="RECEIPTS"
        label={`${count} AIRED`}
        stripe
        className="arena-receipts__panel"
        bodyClassName="arena-receipts__body"
      >
        {count === 0 ? (
          <p className="arena-receipts__empty">No shot has landed. The desk is still clean.</p>
        ) : (
          <ol className="arena-receipts__list" ref={listRef}>
            {newestFirst.map((receipt, index) => (
              <li key={receipt.turn} className="arena-receipt" data-new={index === 0}>
                <div className="arena-receipt__top">
                  <span className="arena-receipt__turn">#{pad(receipt.turn)}</span>
                  <span className="arena-receipt__actor" data-slot={receipt.actor}>
                    {fighters[receipt.actor].name}
                  </span>
                  <span className="arena-receipt__damage" data-zero={receipt.damage === 0}>
                    {receipt.damage > 0 ? `-${receipt.damage}` : "0"}
                  </span>
                </div>
                <div className="arena-receipt__move">
                  <ElementChip element={receipt.move.element}>{receipt.move.name}</ElementChip>
                  <span className="arena-receipt__outcome" data-outcome={receipt.outcome}>
                    {OUTCOME_LABEL[receipt.outcome]}
                  </span>
                </div>
                <p className="arena-receipt__headline" data-struck={receipt.outcome === "backfire"}>
                  {receipt.headline}
                </p>
                <EvidenceChips evidence={receipt.evidence} />
                <p className="arena-receipt__verdict">{receipt.verdictLine}</p>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </aside>
  );
}

function StageOverlay({
  state,
  timeline,
  fighters,
  cursor,
  pressed,
  reducedMotion,
}: {
  state: ArenaState;
  timeline: ArenaTimeline;
  fighters: Record<Slot, ArenaFighter>;
  cursor: number;
  pressed: boolean;
  reducedMotion: boolean;
}): ReactElement {
  return (
    <div className="arena-fx" data-reduced={reducedMotion}>
      {state.turn ? (
        <TurnOverlay
          state={state}
          turn={state.turn.window}
          phase={state.turn.phase}
          progress={state.turn.phaseProgress}
          fighters={fighters}
          cursor={cursor}
          pressed={pressed}
        />
      ) : null}
      <BeatOverlay state={state} timeline={timeline} fighters={fighters} />
    </div>
  );
}

function TurnOverlay({
  state,
  turn,
  phase,
  progress,
  fighters,
  cursor,
  pressed,
}: {
  state: ArenaState;
  turn: TurnWindow;
  phase: ArenaState["turn"] extends null ? never : NonNullable<ArenaState["turn"]>["phase"];
  progress: number;
  fighters: Record<Slot, ArenaFighter>;
  cursor: number;
  pressed: boolean;
}): ReactElement {
  const cue = turn.cue;
  const actor = cue.shooter;
  const target = cue.outcome === "backfire" ? actor : other(actor);
  const actorName = fighters[actor].name;
  const targetName = fighters[target].name;
  const showBubble = phase === "callout" || phase === "attack" || phase === "impact" || phase === "verdict";
  const showStamp = (phase === "impact" || phase === "verdict") && cue.outcome !== "hit" && cue.outcome !== "partial";
  const menu = cue.menu;
  const chosen = menu[cursor];

  return (
    <div className="arena-turnfx" data-actor={actor}>
      {phase === "turn_start" ? (
        <div className="arena-turnbanner" key={`${cue.id}-start`}>
          <span className="arena-turnbanner__num">TURN {pad(turn.turn)}</span>
          <span className="arena-turnbanner__name">{actorName}</span>
          <span className="arena-turnbanner__hint">SPOTLIGHT</span>
        </div>
      ) : null}

      {phase === "menu" && chosen?.name === cue.move.name ? (
        <div className="arena-menupeek" data-slot={actor}>
          <span className="arena-menupeek__label">COMMIT</span>
          <span className="arena-menupeek__move">{chosen.name}</span>
        </div>
      ) : null}

      {showBubble ? (
        <div
          className="arena-bubblewrap"
          data-slot={actor}
          data-struck={cue.outcome === "backfire"}
          key={`${cue.id}-bubble`}
        >
          <SpeechBubble
            align={actor === "A" ? "left" : "right"}
            headline={cue.headline}
            meta={`${cue.move.name} · ${CRITERION_LABELS[cue.criterion]}`}
          >
            <EvidenceChips evidence={cue.evidence} />
          </SpeechBubble>
        </div>
      ) : null}

      {cue.parry && (phase === "impact" || phase === "verdict") ? (
        <div className="arena-parrycall" data-slot={target}>
          <span className="arena-parrycall__tag">DEFENSE</span>
          <span className="arena-parrycall__move">{cue.parry.move.name}</span>
          <span className="arena-parrycall__line">{cue.parry.headline}</span>
        </div>
      ) : null}

      {cue.damage > 0 && (phase === "impact" || phase === "verdict") ? (
        <span
          key={`${cue.id}-damage`}
          className="arena-damage"
          data-target={target}
          data-outcome={cue.outcome}
        >
          -{cue.damage}
        </span>
      ) : null}

      {showStamp ? (
        <div className="arena-stampwrap" data-slot={target} key={`${cue.id}-stamp`}>
          <Stamp tone={stampTone(cue)} size={cue.outcome === "crit" || cue.outcome === "backfire" ? "lg" : "md"}>
            {OUTCOME_LABEL[cue.outcome]}
          </Stamp>
        </div>
      ) : null}

      {cue.outcome === "whiff" && (phase === "impact" || phase === "verdict") ? (
        <span className="arena-whiff" data-slot={target} aria-hidden="true">
          MISS
        </span>
      ) : null}

      <span className="arena-sr-only">
        {actorName} uses {cue.move.name} on {CRITERION_LABELS[cue.criterion]}. {cue.outcome}. {targetName} at{" "}
        {cue.hpAfter[target]}.
      </span>
      <span className="arena-sr-only">{Math.round(progress * 100)} percent through {phase}.</span>
    </div>
  );
}

function BeatOverlay({
  state,
  timeline,
  fighters,
}: {
  state: ArenaState;
  timeline: ArenaTimeline;
  fighters: Record<Slot, ArenaFighter>;
}): ReactElement | null {
  const beat = state.beat;
  if (!beat) return null;
  if (state.turn) return null;
  switch (beat.kind) {
    case "shot":
    case "status":
      return null;
    case "intro":
      return <IntroCard fighters={fighters} cueId={beat.id} />;
    case "round_title":
      return <RoundCard cue={beat} cueId={beat.id} />;
    case "hammer":
      return <HammerCard cue={beat} fighters={fighters} cueId={beat.id} />;
    case "scorecard":
      return <ScorecardCard cue={beat} cueId={beat.id} />;
    case "outcome":
      return <OutcomeCard cue={beat} timeline={timeline} fighters={fighters} cueId={beat.id} />;
    case "sudden_death":
      return <SuddenDeathCard cue={beat} fighters={fighters} cueId={beat.id} />;
    case "finisher":
      return <FinisherCard cueId={beat.id} />;
    case "winner":
      return <WinnerCard cue={beat} timeline={timeline} fighters={fighters} cueId={beat.id} />;
    default: {
      const _exhaustive: never = beat;
      return _exhaustive;
    }
  }
}

function IntroCard({ fighters, cueId }: { fighters: Record<Slot, ArenaFighter>; cueId: string }): ReactElement {
  return (
    <div className="arena-intro" key={cueId}>
      {(["A", "B"] as const).map((slot) => (
        <div className="arena-intro__card" data-slot={slot} key={slot}>
          <span className="arena-intro__corner">{slot === "A" ? "LEFT CORNER" : "RIGHT CORNER"}</span>
          <strong className="arena-intro__name">{fighters[slot].name}</strong>
          <span className="arena-intro__meta">
            SEED #{fighters[slot].seed} · TIER {fighters[slot].tier}
          </span>
          <TitleBadge title={fighters[slot].title} />
          <span className="arena-intro__crew">
            {fighters[slot].crew.length} crew · clout {fighters[slot].clout}
          </span>
        </div>
      ))}
      <div className="arena-intro__stamp">
        <Stamp tone="sun" size="lg">
          TALE OF THE TAPE
        </Stamp>
      </div>
    </div>
  );
}

function RoundCard({ cue, cueId }: { cue: RoundTitleCue; cueId: string }): ReactElement {
  return (
    <div className="arena-roundcard" key={cueId}>
      <div className="arena-roundcard__wipe" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((index) => (
          <i key={index} style={{ animationDelay: `${index * 55}ms` }} />
        ))}
      </div>
      <div className="arena-roundcard__plate">
        <span className="arena-roundcard__tag">ROUND {cue.round}</span>
        <strong className="arena-roundcard__name">{cue.name}</strong>
        <div className="arena-roundcard__criteria">
          {cue.criteria.map((criterion) => (
            <span key={criterion.id} className="arena-roundcard__crit">
              {CRITERION_LABELS[criterion.id]}
              <em>{criterion.weight}</em>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function HammerCard({
  cue,
  fighters,
  cueId,
}: {
  cue: Extract<ArenaTimeline["cues"][number], { kind: "hammer" }>;
  fighters: Record<Slot, ArenaFighter>;
  cueId: string;
}): ReactElement {
  return (
    <div className="arena-hammercard" key={cueId}>
      <span className="arena-hammercard__tag">HAMMER</span>
      <div className="arena-hammercard__body">
        <strong>{cue.reason}</strong>
        <span>
          {fighters[cue.target].name} takes {cue.damage} on {CRITERION_LABELS[cue.criterion]}.
        </span>
      </div>
    </div>
  );
}

function ScorecardCard({
  cue,
  cueId,
}: {
  cue: Extract<ArenaTimeline["cues"][number], { kind: "scorecard" }>;
  cueId: string;
}): ReactElement {
  return (
    <div className="arena-scorecard" key={cueId}>
      <header className="arena-scorecard__head">
        <span>ROUND {cue.round} SCORECARD</span>
        <span className="arena-scorecard__agree">{Math.round(cue.agreement * 100)}% AGREEMENT</span>
      </header>
      <div className="arena-scorecard__legend">
        <span>CRITERION</span>
        <span>{cue.rows.length > 0 ? "A" : ""}</span>
        <span>{cue.rows.length > 0 ? "B" : ""}</span>
        <span>POINTS</span>
        <span>HP</span>
      </div>
      <div className="arena-scorecard__rows">
        {cue.rows.map((row, index) => (
          <div className="arena-scorecard__row" key={row.criterion} style={{ animationDelay: `${120 + index * 90}ms` }}>
            <span className="arena-scorecard__crit">{CRITERION_LABELS[row.criterion]}</span>
            <span className="arena-scorecard__score" data-slot="A" data-win={row.to === "B" ? false : row.to === "A"}>
              {row.A.toFixed(1)}
            </span>
            <span className="arena-scorecard__score" data-slot="B" data-win={row.to === "A" ? false : row.to === "B"}>
              {row.B.toFixed(1)}
            </span>
            <span className="arena-scorecard__points">{row.points.toFixed(2)} pts</span>
            <span className="arena-scorecard__hp" data-slot={row.to ?? "none"}>
              {row.to === null ? "\u2014" : `-${row.hp}`}
            </span>
          </div>
        ))}
      </div>
      <footer className="arena-scorecard__foot">
        Scores out of 10. Points and HP follow the sealed rubric.
      </footer>
    </div>
  );
}

function OutcomeCard({
  cue,
  timeline,
  fighters,
  cueId,
}: {
  cue: Extract<ArenaTimeline["cues"][number], { kind: "outcome" }>;
  timeline: ArenaTimeline;
  fighters: Record<Slot, ArenaFighter>;
  cueId: string;
}): ReactElement {
  const winner = decidedWinner(timeline, cue.t) ?? "A";
  const loser = other(winner);
  const title =
    cue.outcome === "DECISION"
      ? `DECISION ${cue.decisionType === "majority" ? "MAJORITY" : "UNANIMOUS"}`
      : cue.outcome === "SUDDEN_DEATH"
        ? "SUDDEN DEATH"
        : cue.outcome;
  return (
    <div className="arena-outcome" key={cueId}>
      <Stamp tone={cue.outcome === "KO" ? "red" : "blue"} size="lg" className="arena-outcome__title">
        {title}
      </Stamp>
      <div className="arena-outcome__names">
        <span data-slot={winner}>{fighters[winner].name}</span>
        <span className="arena-outcome__vs">OVER</span>
        <span data-slot={loser}>{fighters[loser].name}</span>
      </div>
      <div className="arena-outcome__stamps">
        {cue.perfect ? <Stamp tone="good">PERFECT</Stamp> : null}
        {cue.pyrrhic ? <Stamp tone="sun">PYRRHIC VICTORY</Stamp> : null}
      </div>
    </div>
  );
}

function SuddenDeathCard({
  cue,
  fighters,
  cueId,
}: {
  cue: Extract<ArenaTimeline["cues"][number], { kind: "sudden_death" }>;
  fighters: Record<Slot, ArenaFighter>;
  cueId: string;
}): ReactElement {
  return (
    <div className="arena-death" key={cueId}>
      <Stamp tone="red" size="lg">
        SUDDEN DEATH
      </Stamp>
      <div className="arena-death__closings">
        {(["A", "B"] as const).map((slot) => (
          <div className="arena-death__closing" data-slot={slot} key={slot}>
            <span className="arena-death__name">{fighters[slot].name}</span>
            <p>{cue.closings[slot]}</p>
          </div>
        ))}
      </div>
      <div className="arena-death__tally">
        {(["A", "B"] as const).map((slot) => (
          <div className="arena-death__vote" data-slot={slot} key={slot}>
            <span>{fighters[slot].name}</span>
            <div className="arena-death__pips">
              {Array.from({ length: 5 }, (_, index) => (
                <i key={index} data-on={index < cue.tally[slot]} />
              ))}
            </div>
            <b>{cue.tally[slot]}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function FinisherCard({ cueId }: { cueId: string }): ReactElement {
  return (
    <div className="arena-finisher" key={cueId}>
      <span className="arena-finisher__bar arena-finisher__bar--top" />
      <span className="arena-finisher__tag">FINAL BLOW</span>
      <span className="arena-finisher__bar arena-finisher__bar--bottom" />
    </div>
  );
}

function WinnerCard({
  cue,
  timeline,
  fighters,
  cueId,
}: {
  cue: WinnerCue;
  timeline: ArenaTimeline;
  fighters: Record<Slot, ArenaFighter>;
  cueId: string;
}): ReactElement {
  const loser = other(cue.winner);
  const acquired = fighters[loser].crew.length;
  return (
    <div className="arena-winner" key={cueId}>
      <div className="arena-winner__banner">
        <span className="arena-winner__tag">WINNER ADVANCES</span>
        <strong data-slot={cue.winner}>{fighters[cue.winner].name}</strong>
        <span className="arena-winner__by">DECIDED BY {DECIDED_BY_LABEL[cue.decidedBy]}</span>
      </div>
      {acquired > 0 ? (
        <div className="arena-winner__acquired">
          <Stamp tone="good" size="lg">
            ACQUIRED
          </Stamp>
          <span>{acquired} in the loser's corner change shirts.</span>
        </div>
      ) : null}
      <span className="arena-winner__next">ON TO THE TOWER</span>
      <span className="arena-sr-only">{fighters[cue.winner].name} wins and advances to the tower.</span>
    </div>
  );
}

function EvidenceChips({ evidence }: { evidence: ShotCue["evidence"] }): ReactElement {
  return (
    <div className="arena-ev">
      {evidence.map((item) => (
        <span key={item.id} className="arena-ev__chip" data-status={item.status}>
          <span className="arena-ev__id">{item.id}</span>
          <span className="arena-ev__label">{item.status}</span>
        </span>
      ))}
    </div>
  );
}

function initialView(timeline: ArenaTimeline, positionMs: number): StageView {
  const state = stateAt(timeline, positionMs);
  const cursor = menuCursorFor(state);
  const pressed = false;
  const receipts = receiptsAt(timeline, positionMs);
  return { state, cursor, pressed, receipts, key: viewKey({ state, cursor, pressed, receipts }) };
}

function viewKey(input: {
  state: ArenaState;
  cursor: number;
  pressed: boolean;
  receipts: readonly Receipt[];
}): string {
  const { state } = input;
  return [
    phaseKey(state),
    state.hp.A,
    state.hp.B,
    state.statuses.A.join("+"),
    state.statuses.B.join("+"),
    state.airedTurns.length,
    input.cursor,
    input.pressed ? 1 : 0,
    input.receipts.length,
    state.round,
    state.suddenDeath ? 1 : 0,
    state.winnerCue ? 1 : 0,
  ].join("|");
}

function menuCursorFor(state: ArenaState): number {
  const turn = state.turn;
  if (!turn) return 0;
  const menu = turn.window.cue.menu;
  if (menu.length === 0) return 0;
  if (turn.phase === "turn_start") return 0;
  if (turn.phase === "menu") {
    const stepped = Math.floor(turn.phaseProgress / MENU_CURSOR_STEP);
    return Math.min(menu.length - 1, Math.max(0, stepped));
  }
  const picked = menu.findIndex((move) => move.name === turn.window.cue.move.name);
  return picked >= 0 ? picked : menu.length - 1;
}

function announceTurn(turn: TurnWindow, fighters: Record<Slot, ArenaFighter>): string {
  const cue = turn.cue;
  const target = cue.outcome === "backfire" ? cue.shooter : other(cue.shooter);
  const actor = fighters[cue.shooter].name;
  const name = fighters[target].name;
  const criterion = CRITERION_LABELS[cue.criterion];
  const hp = cue.hpAfter[target];
  if (cue.outcome === "backfire") {
    return `Fact check. ${actor} takes ${cue.damage} damage on ${criterion}. ${actor} at ${hp}.`;
  }
  if (cue.damage === 0) {
    return `${actor} uses ${cue.move.name} on ${criterion}. No damage. ${name} at ${hp}.`;
  }
  return `${name} takes ${cue.damage} damage on ${criterion}. ${name} at ${hp}.`;
}

function narrationFor({
  state,
  fighters,
}: {
  state: ArenaState;
  fighters: Record<Slot, ArenaFighter>;
}): { key: string; text: string; speaker: string } {
  const turn = state.turn;
  if (turn) {
    const cue = turn.window.cue;
    if (turn.phase === "turn_start" || turn.phase === "menu") {
      return {
        key: `${cue.id}:pick`,
        text: `${fighters[cue.shooter].name} is up.`,
        speaker: `Turn ${pad(turn.window.turn)}`,
      };
    }
    const settled = turn.phase === "verdict";
    return {
      key: `${cue.id}:${settled ? "verdict" : "call"}`,
      text: settled ? cue.verdictLine : `${fighters[cue.shooter].name} used ${cue.move.name}!`,
      speaker: settled ? "Verdict" : "Call-out",
    };
  }
  const beat = state.beat;
  if (!beat) {
    return {
      key: "cold",
      text: "Two founders. One deck. Same agent in both corners. The bell is coming.",
      speaker: "Narration",
    };
  }
  const winner = state.winnerCue;
  switch (beat.kind) {
    case "intro":
      return {
        key: beat.id,
        text: "Same build, same rubric, same judges. Only the founders differ.",
        speaker: "Narration",
      };
    case "round_title":
      return {
        key: beat.id,
        text: `Round ${beat.round}: ${beat.name}. ${beat.criteria.map((criterion) => CRITERION_LABELS[criterion.id]).join(", ")}.`,
        speaker: "Round",
      };
    case "shot": {
      const settled = state.lastImpact?.cue.id === beat.id;
      return {
        key: `${beat.id}:${settled ? "verdict" : "call"}`,
        text: settled ? beat.verdictLine : `${fighters[beat.shooter].name} used ${beat.move.name}!`,
        speaker: settled ? "Verdict" : "Call-out",
      };
    }
    case "hammer":
      return {
        key: beat.id,
        text: `The hammer falls on ${fighters[beat.target].name}. ${beat.reason}`,
        speaker: "Hammer",
      };
    case "status":
      return {
        key: beat.id,
        text: `${fighters[beat.target].name} is ${STATUS_LABELS[beat.status].toLowerCase()}.`,
        speaker: "Status",
      };
    case "scorecard":
      return {
        key: beat.id,
        text: `Round ${beat.round} scored. ${Math.round(beat.agreement * 100)} percent judge agreement.`,
        speaker: "Scorecard",
      };
    case "outcome":
      return {
        key: beat.id,
        text:
          beat.outcome === "KO"
            ? "K.O. The bar hit zero."
            : beat.outcome === "DECISION"
              ? `Decision ${beat.decisionType ?? "unanimous"}. The judges did the arithmetic.`
              : "Sudden death. The panel breaks the tie.",
        speaker: "Verdict",
      };
    case "sudden_death":
      return {
        key: beat.id,
        text: "Dead even. One closing each, then the panel votes. No more moves.",
        speaker: "Sudden death",
      };
    case "finisher":
      return {
        key: beat.id,
        text: winner ? `${fighters[winner.winner].name} finishes it.` : "The final blow.",
        speaker: "Final blow",
      };
    case "winner":
      return {
        key: beat.id,
        text: `${fighters[beat.winner].name} wins on the ${DECIDED_BY_LABEL[beat.decidedBy].toLowerCase()}. The crew changes shirts.`,
        speaker: "Winner",
      };
    default: {
      const _exhaustive: never = beat;
      return _exhaustive;
    }
  }
}

function decidedWinner(timeline: ArenaTimeline, timeMs: number): Slot | null {
  for (const cue of timeline.cues) {
    if (cue.t < timeMs) continue;
    if (cue.kind === "finisher") return cue.winner;
    if (cue.kind === "winner") return cue.winner;
  }
  return null;
}

function isFinisher(timeline: ArenaTimeline, timeMs: number): boolean {
  const index = timeline.cues.findIndex((cue) => cue.kind === "finisher");
  const start = timeline.cues[index];
  if (!start) return false;
  const next = timeline.cues.slice(index + 1).find((cue) => cue.kind !== "status");
  const end = next?.t ?? timeline.durationMs;
  return timeMs >= start.t && timeMs < end;
}

function checklistBefore(timeline: ArenaTimeline, timeMs: number): boolean {
  return timeline.winnerAt !== null && timeMs >= timeline.winnerAt;
}

function stampTone(cue: ShotCue): "red" | "sun" | "blue" | "good" {
  switch (cue.outcome) {
    case "crit":
    case "backfire":
      return "red";
    case "parried":
      return "blue";
    case "glancing":
      return "sun";
    default:
      return cue.evidence.some((item) => item.status === "fabricated") ? "red" : "blue";
  }
}

function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

interface UrlMoment {
  positionMs: number;
  playing: boolean | null;
  speed: Speed | null;
}

/**
 * The harness links straight into a moment: `?turn=7&at=impact`, or `?t=12345`
 * with `paused=1` and `speed=2`. The real match route carries no params and
 * starts from the top.
 */
function readMoment(timeline: ArenaTimeline): UrlMoment {
  if (typeof window === "undefined") return { positionMs: 0, playing: null, speed: null };
  const params = new URLSearchParams(window.location.search);
  const rawSpeed = Number(params.get("speed"));
  const speed = isSpeed(rawSpeed) ? rawSpeed : null;
  const paused = params.get("paused") === "1";
  const absolute = Number(params.get("t"));
  if (Number.isFinite(absolute) && absolute > 0) {
    return { positionMs: Math.min(absolute, timeline.durationMs), playing: !paused, speed };
  }
  const turnParam = Number(params.get("turn"));
  if (Number.isFinite(turnParam) && turnParam > 0) {
    const turn = timeline.turnByNumber.get(turnParam);
    if (turn) {
      const at = params.get("at");
      const phase = at === null ? null : TURN_PHASES.find((candidate) => candidate === at);
      if (phase) {
        const window = turn.phases.find((candidate) => candidate.phase === phase);
        if (window) {
          const positionMs = window.startMs + (window.endMs - window.startMs) * 0.45;
          return { positionMs, playing: false, speed };
        }
      }
      return { positionMs: turnStartMs(timeline, turn.turn) + 120, playing: !paused, speed };
    }
  }
  return { positionMs: 0, playing: paused ? false : null, speed };
}

