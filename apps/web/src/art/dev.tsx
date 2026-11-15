import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";

import type { ElementName, OrgTitle } from "../styles/components.js";
import {
  Button,
  CloutMeter,
  ElementChip,
  NarrationBox,
  Panel,
  Pill,
  SpeechBubble,
  Stamp,
  StripeWipe,
  TitleBadge,
} from "../styles/components.js";
import { useAppState, useReducedMotion } from "../styles/app-state.js";
import { CREW_STATES, buildCrew, drawCrew, type CrewMember, type CrewState } from "./crew.js";
import { FxSystem, WEAPON_IDS, WEAPON_INFO, type WeaponId } from "./fx.js";
import { Icon } from "./icons.jsx";
import { ICON_NAMES, type IconName } from "./iconArt.js";
import {
  MASCOT_STATES,
  MASCOT_STATE_LABELS,
  buildMascot,
  drawMascot,
  type Mascot,
  type MascotState,
} from "./mascot.js";
import { CORNERS, MASCOT_CLASSES, MASCOT_CLASS_INFO, type Corner, type MascotClass } from "./palette.js";
import { SOUND_LABELS, SOUND_NAMES } from "./sound.js";
import { GROUND, TIME_OF_DAY_LABELS, TIMES_OF_DAY, drawStage, type TimeOfDay } from "./stage.js";

const SEED_POOL = [
  "mayabuilds",
  "inesvidal",
  "priyaships",
  "jonaheze",
  "samtanaka",
  "lenabrandt",
  "ravikessler",
  "anasorensen",
  "devraman",
  "tomach",
  "clarawhit",
  "oscarmbeki",
] as const;

const FOUNDERS = [
  "mayabuilds",
  "devraman",
  "inesvidal",
  "tomach",
  "priyaships",
  "jonaheze",
  "samtanaka",
  "lenabrandt",
  "oscarmbeki",
  "ravikessler",
  "anasorensen",
  "bolind",
] as const;

interface MascotSample {
  mascot: Mascot;
  corner: Corner;
}

const MASCOT_SAMPLES: MascotSample[] = MASCOT_CLASSES.flatMap((classId, classIndex) => {
  const seeds = [SEED_POOL[classIndex], SEED_POOL[(classIndex + 4) % SEED_POOL.length], SEED_POOL[(classIndex + 8) % SEED_POOL.length]];
  const category = MASCOT_CLASS_INFO[classId].categories[0] ?? "unknown";
  return seeds.flatMap((seed) =>
    CORNERS.map((corner) => ({
      corner,
      mascot: buildMascot({ spriteSeed: seed ?? `${classId}-${classIndex}`, category }),
    })),
  );
});

const STAGE_LEFT = buildMascot({ spriteSeed: "permitpilot", category: "proptech" });
const STAGE_RIGHT = buildMascot({ spriteSeed: "fogcast", category: "climate" });
const LEFT_CREW = ["mayabuilds", "devraman"].map((handle) => buildCrew(handle));
const RIGHT_CREW = ["anasorensen", "bolind", "oscarmbeki"].map((handle) => buildCrew(handle));
const CREW_SHOWCASE = FOUNDERS.slice(0, 8).map((handle) => buildCrew(handle));

const STATE_CLASS: Record<string, Mascot> = Object.fromEntries(
  MASCOT_CLASSES.map((classId, index) => {
    const seed = SEED_POOL[index] ?? classId;
    return [classId, buildMascot({ spriteSeed: seed, category: MASCOT_CLASS_INFO[classId].categories[0] ?? "unknown" })];
  }),
);

const CARD_BANDS = ["#FFDD73", "#FFAF01", "#FF8204", "#FA500F", "#E51300"] as const;
const ELEMENTS: readonly ElementName[] = ["market", "moat", "execution"];
const TITLES: readonly OrgTitle[] = ["Intern", "Manager", "Director", "VP", "President", "CEO"];

function paintBackdrop(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#F2F1E8";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#E4E2D6";
  ctx.fillRect(0, height - 22, width, 1);
  const bandHeight = 4;
  CARD_BANDS.forEach((color, index) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, height - 20 + index * bandHeight, width, bandHeight);
  });
}

function paintMascot(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  mascot: Mascot,
  corner: Corner,
  state: MascotState,
  timeMs: number,
  scale: number,
  silhouette: boolean,
): void {
  paintBackdrop(ctx, width, height);
  const animated = state === "ko" ? timeMs % 1700 : timeMs;
  drawMascot(ctx, mascot, {
    x: width / 2,
    y: height - 2,
    facing: 1,
    state,
    timeMs: animated,
    corner,
    scale,
    silhouette,
  });
}

function StaticMascot({
  mascot,
  corner,
  silhouette,
}: {
  mascot: Mascot;
  corner: Corner;
  silhouette: boolean;
}): ReactElement {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    paintMascot(ctx, canvas.width, canvas.height, mascot, corner, "idle", 0, 2, silhouette);
  }, [mascot, corner, silhouette]);
  return <canvas ref={ref} width={96} height={96} className="art-card__canvas" aria-label={`${mascot.classId} mascot, ${mascot.spriteSeed}`} />;
}

function AnimatedMascot({
  mascot,
  corner,
  state,
  silhouette,
  scale = 4,
}: {
  mascot: Mascot;
  corner: Corner;
  state: MascotState;
  silhouette: boolean;
  scale?: number;
}): ReactElement {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const start = performance.now();
    let frame = 0;
    const loop = (now: number): void => {
      paintMascot(ctx, canvas.width, canvas.height, mascot, corner, state, now - start, scale, silhouette);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [mascot, corner, state, silhouette, scale]);
  return <canvas ref={ref} width={48 * scale} height={48 * scale} aria-label={`${mascot.classId} ${state} animation`} />;
}

function CrewStrip({ member }: { member: CrewMember }): ReactElement {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#FAFAF4";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    CREW_STATES.forEach((state, index) => {
      drawCrew(ctx, member, { x: 18 + index * 36, y: 58, facing: 1, state, timeMs: 0, scale: 3 });
    });
  }, [member]);
  return <canvas ref={ref} width={144} height={64} aria-label={`Crew member ${member.handle}`} />;
}

function StageDemo({ silhouette }: { silhouette: boolean }): ReactElement {
  const { sound } = useAppState();
  const reducedMotion = useReducedMotion();
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>("sunset");
  const [fog, setFog] = useState(false);
  const [spotlight, setSpotlight] = useState(false);
  const [koStamp, setKoStamp] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fx = useMemo(() => new FxSystem("art-lab"), []);
  const settings = useRef({ timeOfDay, fog, spotlight, reducedMotion });
  settings.current = { timeOfDay, fog, spotlight, reducedMotion };
  const poses = useRef({ attackAt: -1, leftHurtAt: -1, koAt: -1, victoryAt: -1 });

  useEffect(() => {
    fx.setReducedMotion(reducedMotion);
  }, [fx, reducedMotion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let frame = 0;
    let last = performance.now();
    const loop = (now: number): void => {
      const dt = Math.min(50, now - last);
      last = now;
      fx.update(dt);
      const current = settings.current;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#151524";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const shake = fx.shakeOffset();
      ctx.setTransform(1, 0, 0, 1, shake.x, shake.y);
      drawStage(ctx, {
        timeOfDay: current.timeOfDay,
        cameraX: 0,
        cameraZoom: 1,
        fog: current.fog,
        spotlight: current.spotlight,
        timeMs: now,
        reducedMotion: current.reducedMotion,
      });

      const stateOf = (side: "left" | "right"): MascotState => {
        if (side === "right" && poses.current.koAt > 0) return "ko";
        const victoryAge = now - poses.current.victoryAt;
        if (victoryAge >= 0 && victoryAge < 1200) return "victory";
        if (side === "left" && now - poses.current.leftHurtAt < 260) return "hurt";
        if (side === "left" && now - poses.current.attackAt < 240) return "lunge";
        return "idle";
      };

      const crewState: CrewState =
        poses.current.victoryAt > 0 && now - poses.current.victoryAt < 1200 ? "cheer" : "idle";
      LEFT_CREW.forEach((member, index) => {
        drawCrew(ctx, member, { x: 96 - index * 18, y: 209, facing: 1, state: crewState, timeMs: now, scale: 2 });
      });
      RIGHT_CREW.forEach((member, index) => {
        drawCrew(ctx, member, { x: 352 + index * 17, y: 209, facing: -1, state: crewState, timeMs: now, scale: 2 });
      });

      const leftState = stateOf("left");
      const rightState = stateOf("right");
      drawMascot(ctx, STAGE_LEFT, {
        x: 130,
        y: 211,
        facing: 1,
        state: leftState,
        timeMs: now,
        corner: "left",
        scale: 2,
        silhouette,
        reducedMotion: current.reducedMotion,
      });
      drawMascot(ctx, STAGE_RIGHT, {
        x: 320,
        y: 211,
        facing: -1,
        state: rightState,
        timeMs: rightState === "ko" ? now - poses.current.koAt : now,
        corner: "right",
        scale: 2,
        silhouette,
        reducedMotion: current.reducedMotion,
      });

      fx.draw(ctx);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [fx, silhouette]);

  const attack = (weapon: WeaponId): void => {
    sound.play(weapon);
    poses.current.attackAt = performance.now();
    fx.fireWeapon({
      weapon,
      from: { x: 166, y: 157 },
      to: { x: 318, y: 164 },
      impact: weapon === "ballista" || weapon === "trebuchet" || weapon === "orbital" ? 3 : 2,
    });
  };

  const parry = (): void => {
    sound.play("parry");
    fx.parry({ at: { x: 300, y: 164 }, kind: "shield" });
  };

  const gavel = (): void => {
    sound.play("crit");
    fx.gavel({ at: { x: 318, y: 188 } });
  };

  const backfire = (): void => {
    sound.play("hit");
    poses.current.leftHurtAt = performance.now();
    fx.backfire({ at: { x: 166, y: 160 } });
  };

  const knockOut = (): void => {
    sound.play("ko");
    poses.current.koAt = performance.now();
    poses.current.victoryAt = performance.now() + 900;
    setKoStamp(true);
    window.setTimeout(() => setKoStamp(false), 1500);
    fx.knockOut({ at: { x: 318, y: 164 }, direction: 1 });
  };

  const confetti = (): void => {
    sound.play("promotion");
    poses.current.victoryAt = performance.now();
    fx.confetti({ at: { x: 240, y: 12 } });
  };

  const reset = (): void => {
    fx.reset();
    poses.current = { attackAt: -1, leftHurtAt: -1, koAt: -1, victoryAt: -1 };
    setKoStamp(false);
  };

  return (
    <div className="art-stage-layout">
      <div className="art-stage-frame" data-testid="stage-frame">
        <div className="art-stage-hud" aria-hidden="true">
          <span>SF FIGHT CLUB / 480 X 270</span>
          <span>{TIME_OF_DAY_LABELS[timeOfDay]}{fog ? " / FOG" : ""}{spotlight ? " / SPOT" : ""}</span>
        </div>
        <canvas ref={canvasRef} width={480} height={270} aria-label="Two mascots facing each other on the San Francisco stage" />
        {koStamp ? (
          <div className="art-stage-stamp" aria-hidden="true">
            K.O.
          </div>
        ) : null}
      </div>
      <div className="art-stage-panel">
        <Panel title="Stage" label="Parallax skyline" bodyClassName="sfc-stack">
          <div className="art-toolbar" style={{ marginBottom: 0 }}>
            <span className="art-toolbar__label">Time</span>
            {TIMES_OF_DAY.map((time) => (
              <Button
                key={time}
                size="sm"
                aria-pressed={timeOfDay === time}
                onClick={() => setTimeOfDay(time)}
                data-testid={`tod-${time}`}
              >
                {TIME_OF_DAY_LABELS[time]}
              </Button>
            ))}
          </div>
          <div className="art-toolbar" style={{ marginBottom: 0 }}>
            <Button size="sm" aria-pressed={fog} onClick={() => setFog(!fog)} data-testid="fog-toggle">
              Sudden death fog
            </Button>
            <Button size="sm" aria-pressed={spotlight} onClick={() => setSpotlight(!spotlight)} data-testid="spotlight-toggle">
              Spotlight
            </Button>
            <Button size="sm" onClick={reset} data-testid="stage-reset">
              Reset
            </Button>
          </div>
          <p className="art-note">Mascots at 2x on the 480x270 stage. Same scale the arena uses.</p>
        </Panel>
        <Panel title="Weapons" label="Nine effects" bodyClassName="sfc-stack">
          <div className="art-button-grid">
            {WEAPON_IDS.map((weapon) => (
              <Button
                key={weapon}
                size="sm"
                variant="dark"
                className="art-weapon-btn"
                onClick={() => attack(weapon)}
                data-testid={`weapon-${weapon}`}
              >
                {WEAPON_INFO[weapon].name}
                <small>{WEAPON_INFO[weapon].travelMs} ms</small>
              </Button>
            ))}
          </div>
          <div className="art-button-grid">
            <Button size="sm" onClick={parry} data-testid="effect-parry">
              Parry
            </Button>
            <Button size="sm" onClick={gavel} data-testid="effect-gavel">
              Gavel
            </Button>
            <Button size="sm" onClick={backfire} data-testid="effect-backfire">
              Backfire
            </Button>
            <Button size="sm" variant="hot" onClick={knockOut} data-testid="effect-ko">
              K.O.
            </Button>
            <Button size="sm" onClick={confetti} data-testid="effect-confetti">
              Confetti
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function ComponentsDemo(): ReactElement {
  const [narrationKey, setNarrationKey] = useState(0);
  const [wipe, setWipe] = useState(false);
  const { sound } = useAppState();
  return (
    <div className="art-components">
      <div className="art-component-cell">
        <h3>Buttons</h3>
        <div className="sfc-row">
          <Button onClick={() => sound.play("tick")}>Default</Button>
          <Button variant="hot" onClick={() => sound.play("select")}>
            Ring the bell
          </Button>
          <Button variant="dark" onClick={() => sound.play("tick")}>
            Dark
          </Button>
          <Button size="sm" variant="ghost" onClick={() => sound.play("tick")}>
            Ghost
          </Button>
        </div>
        <p className="art-note">Press one. It sits into its hard shadow.</p>
      </div>
      <div className="art-component-cell">
        <h3>Pills</h3>
        <div className="sfc-row">
          <Pill tone="open">Betting open</Pill>
          <Pill tone="locked">Locked</Pill>
          <Pill tone="live">Live</Pill>
          <Pill tone="final">Final</Pill>
          <Pill tone="upset">Upset</Pill>
          <Pill tone="bye">Bye</Pill>
        </div>
      </div>
      <div className="art-component-cell">
        <h3>Elements</h3>
        <div className="sfc-row">
          {ELEMENTS.map((element) => (
            <ElementChip key={element} element={element} />
          ))}
          <ElementChip element="market">Problem</ElementChip>
          <ElementChip element="moat">Moat</ElementChip>
          <ElementChip element="execution">Scale</ElementChip>
        </div>
      </div>
      <div className="art-component-cell">
        <h3>Titles</h3>
        <div className="sfc-row">
          {TITLES.map((title) => (
            <TitleBadge key={title} title={title} headcount={title === "CEO" ? 8 : undefined} />
          ))}
        </div>
      </div>
      <div className="art-component-cell">
        <h3>Clout</h3>
        <CloutMeter score={84} tier="A" />
        <CloutMeter score={41} tier="B" />
        <CloutMeter score={12} tier="C" />
        <p className="art-note">Crowd size only. It never touches a score.</p>
      </div>
      <div className="art-component-cell">
        <h3>Stamp</h3>
        <div className="sfc-row">
          <Stamp>Critical</Stamp>
          <Stamp tone="blue">Parried</Stamp>
          <Stamp tone="good">Supported</Stamp>
        </div>
      </div>
      <div className="art-component-cell">
        <h3>Narration</h3>
        <NarrationBox
          key={narrationKey}
          speaker="PermitPilot"
          text="PermitPilot used BOTTOM-UP TAM! DIRECT HIT. The judges bought all of it."
        />
        <Button size="sm" onClick={() => setNarrationKey((value) => value + 1)}>
          Replay typing
        </Button>
      </div>
      <div className="art-component-cell">
        <h3>Speech bubble</h3>
        <SpeechBubble headline="SF permits take 7+ months. Builders bleed cash waiting." meta="Problem / impact 3 / supported">
          <div className="sfc-row">
            <span className="sfc-pill">E4</span>
            <span className="sfc-pill">-22 HP</span>
          </div>
        </SpeechBubble>
      </div>
      <div className="art-component-cell">
        <h3>Stripe wipe</h3>
        <Button
          id="wipe-demo"
          variant="hot"
          onClick={() => {
            setWipe(true);
            sound.play("select");
          }}
        >
          Play wipe
        </Button>
        <p className="art-note">Five bands, hard edges, steps(). Every screen change uses it.</p>
        <StripeWipe active={wipe} onDone={() => setWipe(false)} />
      </div>
      <div className="art-component-cell">
        <h3>Panel and tags</h3>
        <Panel title="The Tower" label="Night theme" stripe>
          <div className="sfc-row">
            <Pill tone="live">Live</Pill>
            <TitleBadge title="Director" />
            <span className="sfc-mono">BUILD A1B2C3</span>
          </div>
        </Panel>
      </div>
    </div>
  );
}

export default function ArtGallery(): ReactElement {
  const [silhouette, setSilhouette] = useState(false);
  const [stateClass, setStateClass] = useState<MascotClass>("clerk");
  const [state, setState] = useState<MascotState>("idle");
  const { sound, muted } = useAppState();
  const stateMascot = STATE_CLASS[stateClass] ?? STAGE_LEFT;

  return (
    <div className="art-page" data-testid="art-gallery">
      <header className="art-hero">
        <div className="art-hero__bands" aria-hidden="true" />
        <div className="art-hero__inner">
          <p className="art-kicker">Art lab / phase 1</p>
          <h1 className="art-title">
            EIGHT CLASSES.
            <br />
            <em>ONE BELT.</em>
          </h1>
          <p className="art-lede">
            Procedural pixel mascots, crew, skyline, weapons and sound. Every pixel is drawn from a seed. No image or
            audio files. The mechs are gone; these fighters have silhouettes.
          </p>
          <div className="art-hero__meta">
            <Pill>8 classes</Pill>
            <Pill>3 seeds each</Pill>
            <Pill>2 corners</Pill>
            <Pill>9 states</Pill>
            <Pill>9 weapons</Pill>
            <Pill>400 particle cap</Pill>
          </div>
        </div>
      </header>

      <nav className="art-jump" aria-label="Art sections">
        <a href="#mascots">Mascots</a>
        <a href="#states">States</a>
        <a href="#stage">Stage</a>
        <a href="#crew">Crew</a>
        <a href="#icons">Icons</a>
        <a href="#components">Components</a>
        <a href="#sound">Sound</a>
        <a href="#tokens">Tokens</a>
      </nav>

      <section className="art-section" id="mascots">
        <div className="art-section__head">
          <h2 className="art-section__title">
            Mascots <small>8 classes / 3 seeds / both corners</small>
          </h2>
          <p className="art-section__note">
            Corner color lives on trim and the plate. The body keeps its class material, so a fighter
            survives a corner swap.
          </p>
        </div>
        <div className="art-toolbar">
          <Button
            size="sm"
            aria-pressed={silhouette}
            onClick={() => setSilhouette(!silhouette)}
            data-testid="silhouette-toggle"
          >
            Silhouette {silhouette ? "on" : "off"}
          </Button>
          <span className="art-toolbar__label">{MASCOT_SAMPLES.length} mascots</span>
        </div>
        <div className="art-grid">
          {MASCOT_SAMPLES.map(({ mascot, corner }) => (
            <figure className="art-card" key={`${mascot.classId}-${mascot.spriteSeed}-${corner}`}>
              <div className="art-card__frame">
                <StaticMascot mascot={mascot} corner={corner} silhouette={silhouette} />
              </div>
              <figcaption className="art-card__caption">
                <span className="art-card__name">{MASCOT_CLASS_INFO[mascot.classId].label}</span>
                <span className={`art-tag art-tag--${corner}`}>{corner === "left" ? "L" : "R"}</span>
              </figcaption>
              <div className="art-card__meta">{mascot.spriteSeed}</div>
            </figure>
          ))}
        </div>
      </section>

      <section className="art-section" id="states">
        <div className="art-section__head">
          <h2 className="art-section__title">
            States <small>Pick a class, then a state</small>
          </h2>
          <p className="art-section__note">
            Idle bobs in four frames. Hurt recoils and flashes white. K.O. dissolves into pixels the wind carries off
            the stage.
          </p>
        </div>
        <div className="art-statebar" role="group" aria-label="Mascot class">
          {MASCOT_CLASSES.map((classId) => (
            <Button
              key={classId}
              size="sm"
              aria-pressed={stateClass === classId}
              onClick={() => setStateClass(classId)}
              data-testid={`state-class-${classId}`}
            >
              {MASCOT_CLASS_INFO[classId].label}
            </Button>
          ))}
        </div>
        <div className="art-statebar" role="group" aria-label="Mascot state">
          {MASCOT_STATES.map((item) => (
            <Button
              key={item}
              size="sm"
              variant={item === "ko" ? "hot" : "default"}
              aria-pressed={state === item}
              onClick={() => setState(item)}
              data-testid={`state-${item}`}
            >
              {MASCOT_STATE_LABELS[item]}
            </Button>
          ))}
        </div>
        <div className="art-showcase">
          <div className="art-bigframe">
            <AnimatedMascot mascot={stateMascot} corner="left" state={state} silhouette={silhouette} />
          </div>
          <div>
            <p className="art-note" style={{ marginBottom: 8 }}>
              {MASCOT_CLASS_INFO[stateMascot.classId].label}: {MASCOT_CLASS_INFO[stateMascot.classId].silhouette}.
            </p>
            <div className="art-state-strip">
              {MASCOT_STATES.map((item) => (
                <div className="art-state-tile" key={item}>
                  <AnimatedMascot mascot={stateMascot} corner="left" state={item} silhouette={silhouette} scale={2} />
                  <span>{MASCOT_STATE_LABELS[item]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="art-section" id="stage">
        <div className="art-section__head">
          <h2 className="art-section__title">
            Stage <small>480x270, nearest neighbour</small>
          </h2>
          <p className="art-section__note">
            Sunset, dusk and night. Three parallax layers, lit windows, broken water reflections. Sudden death rolls the
            fog in and drops one spotlight.
          </p>
        </div>
        <StageDemo silhouette={silhouette} />
      </section>

      <section className="art-section" id="crew">
        <div className="art-section__head">
          <h2 className="art-section__title">
            Crew <small>12x16, from a handle</small>
          </h2>
          <p className="art-section__note">
            Generated people, never photos. Idle, cheer, flinch and walk. They stand behind the mascot and take the
            stage when it wins.
          </p>
        </div>
        <div className="art-crew-grid">
          {CREW_SHOWCASE.map((member) => (
            <div className="art-crew-card" key={member.handle}>
              <CrewStrip member={member} />
              <div className="art-crew-card__foot">
                <span>@{member.handle}</span>
                <span>idle / cheer / flinch / walk</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="art-section" id="icons">
        <div className="art-section__head">
          <h2 className="art-section__title">
            Icons <small>16x16, drawn in code</small>
          </h2>
          <p className="art-section__note">
            Same nine icons as a React component and as a canvas draw call. Color is never the only cue.
          </p>
        </div>
        <div className="art-icon-grid">
          {ICON_NAMES.map((name: IconName) => (
            <div className="art-icon-card" key={name}>
              <Icon name={name} title={name} />
              <span>{name}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="art-section" id="components">
        <div className="art-section__head">
          <h2 className="art-section__title">
            Components <small>Shared by every screen</small>
          </h2>
          <p className="art-section__note">Square corners, 2px borders, hard offset shadows, no blur.</p>
        </div>
        <ComponentsDemo />
      </section>

      <section className="art-section" id="sound">
        <div className="art-section__head">
          <h2 className="art-section__title">
            Sound <small>Web Audio, no files</small>
          </h2>
          <p className="art-section__note">
            {muted ? "Muted by default. Turn sound on in the top bar, then press a button." : "Sound is on. Press a button."}
          </p>
        </div>
        <div className="art-sound-grid">
          {SOUND_NAMES.map((name) => (
            <Button key={name} size="sm" variant="dark" onClick={() => sound.play(name)} data-testid={`sound-${name}`}>
              {SOUND_LABELS[name]}
            </Button>
          ))}
        </div>
      </section>

      <section className="art-section" id="tokens">
        <div className="art-section__head">
          <h2 className="art-section__title">
            Tokens <small>Palette and elements</small>
          </h2>
          <p className="art-section__note">Paper for reading, night for the show. Elements pair color with an icon.</p>
        </div>
        <div className="art-components">
          <div className="art-component-cell">
            <h3>Sunset ramp</h3>
            <div className="sfc-row">
              {["#FFDD73", "#FFAF01", "#FF8204", "#FA500F", "#E51300", "#C4001D"].map((color) => (
                <span className="art-swatch" key={color} style={{ background: color }} title={color} />
              ))}
            </div>
            <h3>Corners</h3>
            <div className="sfc-row">
              <span className="art-swatch" style={{ background: "#FA500F" }} title="Left corner #FA500F" />
              <span className="art-swatch" style={{ background: "#0082E6" }} title="Right corner #0082E6" />
              <span className="art-swatch" style={{ background: "#151524" }} title="Ink #151524" />
              <span className="art-swatch" style={{ background: "#FAFAF4" }} title="Paper #FAFAF4" />
            </div>
          </div>
          <div className="art-component-cell">
            <h3>Elements</h3>
            <div className="sfc-row">
              <ElementChip element="market">Market / sun-2</ElementChip>
              <ElementChip element="moat">Moat / stone</ElementChip>
              <ElementChip element="execution">Execution / sun-5</ElementChip>
            </div>
            <p className="art-note">Moat is #56566C on paper and #8FA3B8 on night.</p>
          </div>
          <div className="art-component-cell">
            <h3>Type</h3>
            <p className="sfc-pixel" style={{ fontSize: 40, lineHeight: 1 }}>
              K.O.
            </p>
            <p className="sfc-mono">Space Mono / labels / 11 to 13</p>
            <p style={{ fontSize: 17 }}>Inter body at 17. A sentence that has to be read, not shouted.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
