import { rngFromSeed } from "@sf-fight-club/engine";

import { GROUND, STAGE_WIDTH } from "./stage.js";

export const WEAPON_IDS = [
  "flame",
  "ballista",
  "coin",
  "laser",
  "trebuchet",
  "railgun",
  "gatling",
  "rocket",
  "orbital",
] as const;

export type WeaponId = (typeof WEAPON_IDS)[number];

export interface WeaponInfo {
  id: WeaponId;
  name: string;
  travelMs: number;
}

/** From docs/05-ui.md, weapons by criterion. */
export const WEAPON_INFO: Record<WeaponId, WeaponInfo> = {
  flame: { id: "flame", name: "Flame lance", travelMs: 450 },
  ballista: { id: "ballista", name: "Ballista", travelMs: 1000 },
  coin: { id: "coin", name: "Coin cannon", travelMs: 700 },
  laser: { id: "laser", name: "Laser rifle", travelMs: 150 },
  trebuchet: { id: "trebuchet", name: "Trebuchet", travelMs: 1100 },
  railgun: { id: "railgun", name: "Clockwork railgun", travelMs: 450 },
  gatling: { id: "gatling", name: "Gatling gun", travelMs: 600 },
  rocket: { id: "rocket", name: "Rocket", travelMs: 900 },
  orbital: { id: "orbital", name: "Orbital beam", travelMs: 500 },
};

export interface Point {
  x: number;
  y: number;
}

const SUN_RAMP = ["#FFDD73", "#FFAF01", "#FF8204", "#FA500F", "#FAFAF4"] as const;
const STRIPE_RAMP = ["#FFDD73", "#FFAF01", "#FF8204", "#FA500F", "#E51300"] as const;
const POOL_CAP = 400;

type ParticleKind = "square" | "streak" | "confetti";

interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  kind: ParticleKind;
  phase: number;
}

class ParticlePool {
  private readonly storage: Particle[] = [];
  private readonly free: number[] = [];
  private readonly active: number[] = [];

  constructor(capacity: number) {
    for (let index = 0; index < capacity; index += 1) {
      this.storage.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        gravity: 0,
        life: 0,
        maxLife: 0,
        size: 1,
        color: "#FAFAF4",
        kind: "square",
        phase: 0,
      });
      this.free.push(index);
    }
  }

  get count(): number {
    return this.active.length;
  }

  spawn(props: Omit<Particle, "active" | "life" | "maxLife"> & { life: number }): void {
    let index = this.free.pop();
    if (index === undefined) {
      index = this.active.shift();
      if (index === undefined) return;
    }
    const particle = this.storage[index];
    if (!particle) return;
    particle.active = true;
    particle.x = props.x;
    particle.y = props.y;
    particle.vx = props.vx;
    particle.vy = props.vy;
    particle.gravity = props.gravity;
    particle.life = props.life;
    particle.maxLife = props.life;
    particle.size = props.size;
    particle.color = props.color;
    particle.kind = props.kind;
    particle.phase = props.phase;
    this.active.push(index);
  }

  update(dtMs: number): void {
    const seconds = dtMs / 1000;
    for (let cursor = this.active.length - 1; cursor >= 0; cursor -= 1) {
      const index = this.active[cursor];
      if (index === undefined) continue;
      const particle = this.storage[index];
      if (!particle) continue;
      particle.life -= dtMs;
      if (particle.life <= 0) {
        particle.active = false;
        this.active.splice(cursor, 1);
        this.free.push(index);
        continue;
      }
      particle.vy += particle.gravity * seconds;
      particle.x += particle.vx * seconds;
      particle.y += particle.vy * seconds;
      if (particle.kind === "confetti") {
        particle.x += Math.sin(particle.life / 120 + particle.phase) * 0.35;
        particle.vy = Math.min(particle.vy, 34);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const index of this.active) {
      const particle = this.storage[index];
      if (!particle || particle.life <= 0) continue;
      const fade = particle.life / Math.max(1, particle.maxLife);
      ctx.globalAlpha = fade < 0.25 ? 0.55 : 1;
      ctx.fillStyle = particle.color;
      if (particle.kind === "streak") {
        ctx.fillRect(Math.round(particle.x), Math.round(particle.y), Math.max(2, particle.size * 3), 1);
      } else {
        const size = Math.max(1, Math.round(particle.size));
        ctx.fillRect(Math.round(particle.x), Math.round(particle.y), size, size);
      }
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    for (const index of this.active) {
      const particle = this.storage[index];
      if (particle) particle.active = false;
    }
    this.active.length = 0;
    this.free.length = 0;
    for (let index = 0; index < this.storage.length; index += 1) this.free.push(index);
  }
}

type ProjectileKind = "bolt" | "boulder" | "coin" | "fire" | "slug" | "bullet" | "rocket";

interface Projectile {
  kind: ProjectileKind;
  t0: number;
  duration: number;
  from: Point;
  to: Point;
  arc: number;
  size: number;
  wobble: number;
  trail: readonly string[];
  phase: number;
}

type BeamKind = "laser" | "warn" | "orbital";

interface Beam {
  kind: BeamKind;
  t0: number;
  duration: number;
  from: Point;
  to: Point;
  size: number;
  color: string;
}

interface Shield {
  x: number;
  y: number;
  t0: number;
  duration: number;
}

interface Wall {
  x: number;
  y: number;
  t0: number;
  duration: number;
}

interface Gavel {
  x: number;
  y: number;
  t0: number;
  duration: number;
}

interface Timer {
  at: number;
  run: () => void;
}

export interface FireWeaponInput {
  weapon: WeaponId;
  from: Point;
  to: Point;
  impact: 1 | 2 | 3;
}

function impactScale(impact: 1 | 2 | 3): number {
  return impact === 3 ? 1.4 : impact === 1 ? 0.7 : 1;
}

export class FxSystem {
  private clock = 0;
  private readonly rng: () => number;
  private readonly particles = new ParticlePool(POOL_CAP);
  private readonly timers: Timer[] = [];
  private readonly projectiles: Projectile[] = [];
  private readonly beams: Beam[] = [];
  private readonly shields: Shield[] = [];
  private readonly walls: Wall[] = [];
  private readonly gavels: Gavel[] = [];
  private readonly flashes: { at: number; strength: number }[] = [];
  private shakeAmplitude = 0;
  private shakeAt = -1_000_000;
  private lastFlashAt = -1_000_000;
  private frozenUntil = -1;
  private reducedMotion = false;

  constructor(seed = "sf-fight-club") {
    this.rng = rngFromSeed(`fx:${seed}`);
  }

  get timeMs(): number {
    return this.clock;
  }

  get particleCount(): number {
    return this.particles.count;
  }

  setReducedMotion(value: boolean): void {
    this.reducedMotion = value;
  }

  reset(): void {
    this.clock = 0;
    this.particles.clear();
    this.timers.length = 0;
    this.projectiles.length = 0;
    this.beams.length = 0;
    this.shields.length = 0;
    this.walls.length = 0;
    this.gavels.length = 0;
    this.flashes.length = 0;
    this.shakeAmplitude = 0;
    this.shakeAt = -1_000_000;
    this.lastFlashAt = -1_000_000;
    this.frozenUntil = -1;
  }

  update(dtMs: number): void {
    this.clock += Math.max(0, Math.min(50, dtMs));
    for (let index = this.timers.length - 1; index >= 0; index -= 1) {
      const timer = this.timers[index];
      if (!timer) continue;
      if (timer.at <= this.clock) {
        this.timers.splice(index, 1);
        timer.run();
      }
    }
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = this.projectiles[index];
      if (!projectile) continue;
      const progress = (this.clock - projectile.t0) / projectile.duration;
      if (progress >= 1) {
        this.projectiles.splice(index, 1);
        continue;
      }
      if (progress < 0) continue;
      this.emitTrail(projectile, progress);
    }
    this.particles.update(dtMs);
    const expire = (item: { t0: number; duration: number }): boolean => this.clock - item.t0 > item.duration;
    this.beams.splice(0, this.beams.length, ...this.beams.filter((beam) => !expire(beam)));
    this.shields.splice(0, this.shields.length, ...this.shields.filter((shield) => !expire(shield)));
    this.walls.splice(0, this.walls.length, ...this.walls.filter((wall) => !expire(wall)));
    this.gavels.splice(0, this.gavels.length, ...this.gavels.filter((gavel) => !expire(gavel)));
    this.flashes.splice(0, this.flashes.length, ...this.flashes.filter((flash) => this.clock - flash.at < 160));
  }

  private schedule(delay: number, run: () => void): void {
    this.timers.push({ at: this.clock + delay, run });
  }

  private rand(min: number, max: number): number {
    return min + this.rng() * (max - min);
  }

  private burst(
    at: Point,
    count: number,
    colors: readonly string[],
    speed: number,
    life: number,
    gravity: number,
    size: number,
  ): void {
    for (let index = 0; index < count; index += 1) {
      const angle = this.rng() * Math.PI * 2;
      const velocity = speed * this.rand(0.3, 1.1);
      this.particles.spawn({
        x: at.x + this.rand(-2, 2),
        y: at.y + this.rand(-2, 2),
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - speed * 0.25,
        gravity,
        life: life * this.rand(0.6, 1.3),
        size: Math.max(1, Math.round(size * this.rand(0.7, 1.4))),
        color: colors[Math.floor(this.rng() * colors.length)] ?? "#FAFAF4",
        kind: "square",
        phase: this.rng() * Math.PI * 2,
      });
    }
  }

  private ring(at: Point, count: number, radius: number, color: string): void {
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2;
      this.particles.spawn({
        x: at.x + Math.cos(angle) * radius,
        y: at.y + Math.sin(angle) * radius,
        vx: Math.cos(angle) * 46,
        vy: Math.sin(angle) * 46,
        gravity: 30,
        life: 320,
        size: 2,
        color,
        kind: "square",
        phase: 0,
      });
    }
  }

  private emitTrail(projectile: Projectile, progress: number): void {
    const position = this.projectilePosition(projectile, progress);
    if (projectile.trail.length === 0 || this.rng() > 0.7) return;
    const color = projectile.trail[Math.floor(this.rng() * projectile.trail.length)] ?? "#FAFAF4";
    this.particles.spawn({
      x: position.x + this.rand(-2, 2),
      y: position.y + this.rand(-2, 2),
      vx: this.rand(-14, 14),
      vy: this.rand(-18, -2),
      gravity: projectile.kind === "fire" ? -30 : 6,
      life: projectile.kind === "fire" ? 300 : 420,
      size: projectile.kind === "fire" ? 3 : 2,
      color,
      kind: "square",
      phase: 0,
    });
  }

  private projectilePosition(projectile: Projectile, progress: number): Point {
    const x = projectile.from.x + (projectile.to.x - projectile.from.x) * progress;
    const y =
      projectile.from.y +
      (projectile.to.y - projectile.from.y) * progress -
      projectile.arc * 4 * progress * (1 - progress);
    const wobble = projectile.wobble > 0 ? Math.sin(progress * Math.PI * 5) * projectile.wobble * (1 - progress) : 0;
    return { x, y: y + wobble };
  }

  requestFlash(strength = 0.5): void {
    if (this.reducedMotion) return;
    if (this.clock - this.lastFlashAt < 340) return;
    this.lastFlashAt = this.clock;
    this.flashes.push({ at: this.clock, strength });
  }

  requestShake(amplitude: number): void {
    if (this.reducedMotion) return;
    if (this.clock - this.shakeAt > 220) this.shakeAmplitude = 0;
    this.shakeAmplitude = Math.max(this.shakeAmplitude, amplitude);
    this.shakeAt = this.clock;
  }

  requestHitStop(durationMs = 80): void {
    if (this.reducedMotion) return;
    this.frozenUntil = Math.max(this.frozenUntil, this.clock + durationMs);
  }

  hitStopRemaining(): number {
    return Math.max(0, this.frozenUntil - this.clock);
  }

  shakeOffset(): Point {
    if (this.reducedMotion) return { x: 0, y: 0 };
    const age = this.clock - this.shakeAt;
    if (age > 220) return { x: 0, y: 0 };
    const decay = 1 - age / 220;
    return {
      x: Math.round(Math.sin(this.clock * 0.31) * this.shakeAmplitude * decay),
      y: Math.round(Math.cos(this.clock * 0.27) * this.shakeAmplitude * 0.7 * decay),
    };
  }

  fireWeapon({ weapon, from, to, impact }: FireWeaponInput): number {
    const info = WEAPON_INFO[weapon];
    const size = impactScale(impact);
    const durationScale = this.reducedMotion ? 0.4 : 1;
    switch (weapon) {
      case "flame": {
        this.projectiles.push({
          kind: "fire",
          t0: this.clock,
          duration: info.travelMs * durationScale,
          from,
          to,
          arc: 0,
          size,
          wobble: 0,
          trail: ["#FFDD73", "#FF8204", "#E51300"],
          phase: 0,
        });
        break;
      }
      case "ballista": {
        this.projectiles.push({
          kind: "bolt",
          t0: this.clock,
          duration: info.travelMs * durationScale,
          from,
          to,
          arc: 52,
          size,
          wobble: 0,
          trail: [],
          phase: 0,
        });
        break;
      }
      case "coin": {
        for (let index = 0; index < 7; index += 1) {
          const jitter = { x: to.x + this.rand(-9, 9), y: to.y + this.rand(-6, 6) };
          this.projectiles.push({
            kind: "coin",
            t0: this.clock + index * 40,
            duration: (700 - index * 40) * durationScale,
            from,
            to: jitter,
            arc: 30 + index * 7,
            size: 1,
            wobble: 0,
            trail: [],
            phase: index,
          });
        }
        break;
      }
      case "laser": {
        this.beams.push({
          kind: "laser",
          t0: this.clock,
          duration: 300 * durationScale,
          from,
          to,
          size,
          color: "#FFDD73",
        });
        break;
      }
      case "trebuchet": {
        this.projectiles.push({
          kind: "boulder",
          t0: this.clock,
          duration: info.travelMs * durationScale,
          from,
          to,
          arc: 118,
          size,
          wobble: 0,
          trail: [],
          phase: 0,
        });
        break;
      }
      case "railgun": {
        for (let index = 0; index < 3; index += 1) {
          this.schedule(index * 70, () => {
            this.burst(from, 8, ["#FFDD73", "#BFBCAC", "#FAFAF4"], 28, 220, 0, 1);
          });
        }
        this.schedule(200, () => {
          this.projectiles.push({
            kind: "slug",
            t0: this.clock,
            duration: 250 * durationScale,
            from,
            to,
            arc: 0,
            size: 2,
            wobble: 0,
            trail: ["#55B3FB", "#FAFAF4"],
            phase: 0,
          });
        });
        break;
      }
      case "gatling": {
        for (let index = 0; index < 8; index += 1) {
          this.schedule(index * 55, () => {
            const jitter = { x: to.x + this.rand(-8, 8), y: to.y + this.rand(-8, 8) };
            this.projectiles.push({
              kind: "bullet",
              t0: this.clock,
              duration: 220 * durationScale,
              from: { x: from.x + this.rand(-1, 1), y: from.y + (index % 2) },
              to: jitter,
              arc: 0,
              size: 1,
              wobble: 0,
              trail: [],
              phase: 0,
            });
            this.burst(from, 3, ["#FFDD73", "#FAFAF4"], 26, 120, 0, 1);
          });
        }
        break;
      }
      case "rocket": {
        this.projectiles.push({
          kind: "rocket",
          t0: this.clock,
          duration: info.travelMs * durationScale,
          from,
          to,
          arc: 34,
          size,
          wobble: 9,
          trail: ["#BFBCAC", "#8B8879", "#FF8204"],
          phase: 0,
        });
        break;
      }
      case "orbital": {
        this.beams.push({ kind: "warn", t0: this.clock, duration: 300, from, to, size, color: "#E51300" });
        this.schedule(300, () => {
          this.beams.push({ kind: "orbital", t0: this.clock, duration: 520 * durationScale, from, to, size, color: "#FFDD73" });
        });
        break;
      }
      default: {
        const exhaustive: never = weapon;
        throw new Error(`Unhandled weapon: ${String(exhaustive)}`);
      }
    }

    const arrival = weapon === "orbital" ? 820 : weapon === "railgun" ? 450 : info.travelMs;
    const scaledArrival = this.reducedMotion ? arrival * 0.4 : arrival;
    this.schedule(weapon === "gatling" ? (this.reducedMotion ? 240 : 600) : scaledArrival, () => {
      this.impactBurst({ at: to, impact });
    });
    return arrival;
  }

  impactBurst({ at, impact }: { at: Point; impact: 1 | 2 | 3 }): void {
    const size = impactScale(impact);
    const count = impact === 3 ? 44 : impact === 2 ? 26 : 14;
    this.burst(at, count, SUN_RAMP, 90 * size, 620, 150, 2 * size);
    this.ring(at, impact === 3 ? 12 : 8, 6, "#FAFAF4");
    if (impact === 3) {
      this.requestFlash(0.35);
      this.requestShake(4);
      this.requestHitStop(60);
    } else if (impact === 2) {
      this.requestShake(2);
    }
  }

  parry({ at, kind }: { at: Point; kind: "shield" | "wall" }): void {
    if (kind === "shield") {
      this.shields.push({ x: at.x, y: at.y, t0: this.clock, duration: 700 });
      this.burst(at, 16, ["#FAFAF4", "#55B3FB", "#8FB8FF"], 64, 420, 60, 2);
    } else {
      this.walls.push({ x: at.x, y: at.y, t0: this.clock, duration: 900 });
      this.burst({ x: at.x, y: at.y - 22 }, 18, ["#8B8879", "#BFBCAC", "#56566C"], 52, 520, 120, 2);
    }
    this.requestShake(2);
  }

  gavel({ at }: { at: Point }): void {
    this.gavels.push({ x: at.x, y: at.y, t0: this.clock, duration: 820 });
    this.schedule(260, () => {
      this.burst({ x: at.x, y: at.y + 2 }, 20, ["#BFBCAC", "#8B8879", "#FAFAF4"], 56, 500, 130, 2);
      this.requestShake(4);
    });
  }

  jam({ at }: { at: Point }): void {
    this.burst(at, 8, ["#BFBCAC", "#8B8879"], 20, 640, -12, 3);
    this.schedule(180, () => this.burst({ x: at.x + 3, y: at.y - 6 }, 7, ["#DCDCE8", "#8B8879"], 16, 720, -10, 3));
    this.schedule(360, () => this.burst({ x: at.x - 2, y: at.y - 10 }, 5, ["#DCDCE8", "#8B8879"], 12, 780, -8, 4));
  }

  backfire({ at }: { at: Point }): void {
    this.burst(at, 54, ["#E51300", "#FF8204", "#FFDD73", "#151524"], 140, 760, 140, 3);
    this.burst(at, 16, ["#8B8879", "#BFBCAC"], 60, 900, -14, 4);
    this.ring(at, 14, 8, "#FFDD73");
    this.requestFlash(0.7);
    this.requestShake(6);
    this.requestHitStop(80);
  }

  knockOut({ at, direction }: { at: Point; direction: 1 | -1 }): void {
    this.burst(at, 66, [...SUN_RAMP, "#151524"], 150, 900, 120, 3);
    this.ring(at, 16, 10, "#FAFAF4");
    for (let index = 0; index < 22; index += 1) {
      this.particles.spawn({
        x: direction === 1 ? -20 : STAGE_WIDTH + 20,
        y: this.rand(30, GROUND - 10),
        vx: direction * this.rand(120, 220),
        vy: this.rand(-10, 8),
        gravity: 0,
        life: this.rand(700, 1400),
        size: 1,
        color: this.rng() < 0.5 ? "#FAFAF4" : "#DCDCE8",
        kind: "streak",
        phase: 0,
      });
    }
    this.requestFlash(0.8);
    this.requestShake(6);
    this.requestHitStop(90);
  }

  confetti({ at }: { at: Point }): void {
    for (let index = 0; index < 110; index += 1) {
      this.particles.spawn({
        x: at.x + this.rand(-STAGE_WIDTH / 2, STAGE_WIDTH / 2),
        y: at.y + this.rand(-30, 10),
        vx: this.rand(-20, 20),
        vy: this.rand(18, 46),
        gravity: 18,
        life: this.rand(1800, 3200),
        size: this.rng() < 0.4 ? 3 : 2,
        color: STRIPE_RAMP[Math.floor(this.rng() * STRIPE_RAMP.length)] ?? "#FFDD73",
        kind: "confetti",
        phase: this.rng() * Math.PI * 2,
      });
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    this.drawBeams(ctx);
    this.drawProjectiles(ctx);
    this.drawWalls(ctx);
    this.drawShields(ctx);
    this.drawGavels(ctx);
    this.particles.draw(ctx);
    const flash = this.flashAlpha();
    if (flash > 0) {
      ctx.globalAlpha = flash;
      ctx.fillStyle = "#FAFAF4";
      ctx.fillRect(0, 0, STAGE_WIDTH, GROUND);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  private flashAlpha(): number {
    let alpha = 0;
    for (const flash of this.flashes) {
      const age = this.clock - flash.at;
      if (age < 0 || age > 140) continue;
      alpha = Math.max(alpha, flash.strength * (1 - age / 140));
    }
    return alpha;
  }

  private drawProjectiles(ctx: CanvasRenderingContext2D): void {
    for (const projectile of this.projectiles) {
      const progress = (this.clock - projectile.t0) / projectile.duration;
      if (progress < 0 || progress > 1) continue;
      const position = this.projectilePosition(projectile, progress);
      const before = this.projectilePosition(projectile, Math.max(0, progress - 0.04));
      const dx = position.x - before.x;
      const dy = position.y - before.y;
      const length = Math.hypot(dx, dy) || 1;
      const ux = dx / length;
      const uy = dy / length;
      const size = projectile.size;
      switch (projectile.kind) {
        case "bolt": {
          const span = 18 * size;
          this.stroke(ctx, position.x - ux * span, position.y - uy * span, position.x, position.y, "#151524", 4);
          this.stroke(ctx, position.x - ux * span, position.y - uy * span, position.x, position.y, "#FAFAF4", 2);
          this.stroke(
            ctx,
            position.x - ux * span,
            position.y - uy * span,
            position.x - ux * (span - 5),
            position.y - uy * (span - 5),
            "#151524",
            4,
          );
          this.stroke(
            ctx,
            position.x - ux * span,
            position.y - uy * span,
            position.x - ux * (span - 5),
            position.y - uy * (span - 5),
            "#E51300",
            2,
          );
          const tip = Math.round(4 * size);
          ctx.fillStyle = "#151524";
          ctx.fillRect(Math.round(position.x) - tip - 1, Math.round(position.y) - tip - 1, tip * 2 + 2, tip * 2 + 2);
          ctx.fillStyle = "#FFAF01";
          ctx.fillRect(Math.round(position.x) - tip, Math.round(position.y) - tip, tip * 2, tip * 2);
          ctx.fillStyle = "#FAFAF4";
          ctx.fillRect(Math.round(position.x) - 1, Math.round(position.y) - 1, 2, 2);
          break;
        }
        case "boulder": {
          const span = Math.round(8 * size);
          ctx.fillStyle = "#151524";
          ctx.fillRect(Math.round(position.x) - Math.floor(span / 2) - 1, Math.round(position.y) - Math.floor(span / 2) - 1, span + 2, span + 2);
          ctx.fillStyle = "#8B8879";
          ctx.fillRect(Math.round(position.x) - Math.floor(span / 2), Math.round(position.y) - Math.floor(span / 2), span, span);
          ctx.fillStyle = "#BFBCAC";
          ctx.fillRect(Math.round(position.x) - Math.floor(span / 2) + 1, Math.round(position.y) - Math.floor(span / 2) + 1, 2, 2);
          break;
        }
        case "coin": {
          const spin = Math.floor(this.clock / 60 + projectile.phase) % 2;
          ctx.fillStyle = "#151524";
          ctx.fillRect(Math.round(position.x) - 3, Math.round(position.y) - 3, spin ? 6 : 4, 6);
          ctx.fillStyle = "#A77201";
          ctx.fillRect(Math.round(position.x) - 2, Math.round(position.y) - 2, spin ? 4 : 2, 4);
          ctx.fillStyle = "#FFDD73";
          ctx.fillRect(Math.round(position.x) - 1, Math.round(position.y) - 1, spin ? 2 : 1, 2);
          break;
        }
        case "fire": {
          const span = Math.round(6 * size);
          ctx.fillStyle = "#151524";
          ctx.fillRect(Math.round(position.x) - span - 1, Math.round(position.y) - span - 1, span * 2 + 2, span * 2 + 2);
          ctx.fillStyle = "#FA500F";
          ctx.fillRect(Math.round(position.x) - span, Math.round(position.y) - span, span * 2, span * 2);
          ctx.fillStyle = "#FF8204";
          ctx.fillRect(Math.round(position.x) - span + 1, Math.round(position.y) - span + 1, span * 2 - 2, span * 2 - 2);
          ctx.fillStyle = "#FFDD73";
          ctx.fillRect(Math.round(position.x) - 2, Math.round(position.y) - 2, 4, 4);
          ctx.fillStyle = "#FAFAF4";
          ctx.fillRect(Math.round(position.x) - 1, Math.round(position.y) - 1, 2, 2);
          break;
        }
        case "slug": {
          this.stroke(ctx, position.x - ux * 12, position.y - uy * 12, position.x, position.y, "#151524", 5);
          this.stroke(ctx, position.x - ux * 12, position.y - uy * 12, position.x, position.y, "#55B3FB", 3);
          this.stroke(ctx, position.x - ux * 9, position.y - uy * 9, position.x, position.y, "#FAFAF4", 1);
          break;
        }
        case "bullet": {
          this.stroke(ctx, position.x - ux * 6, position.y - uy * 6, position.x, position.y, "#151524", 3);
          this.stroke(ctx, position.x - ux * 5, position.y - uy * 5, position.x, position.y, "#FFDD73", 1);
          ctx.fillStyle = "#FAFAF4";
          ctx.fillRect(Math.round(position.x), Math.round(position.y), 2, 2);
          break;
        }
        case "rocket": {
          const body = Math.max(8, Math.round(6 + 4 * size));
          this.stroke(ctx, position.x - ux * body, position.y - uy * body, position.x + ux * 3, position.y + uy * 3, "#151524", 6);
          this.stroke(ctx, position.x - ux * body, position.y - uy * body, position.x + ux * 3, position.y + uy * 3, "#E51300", 4);
          this.stroke(ctx, position.x - ux * 3, position.y - uy * 3, position.x + ux * 3, position.y + uy * 3, "#FAFAF4", 2);
          ctx.fillStyle = "#151524";
          ctx.fillRect(Math.round(position.x - ux * body - 3), Math.round(position.y - uy * body - 3), 6, 6);
          ctx.fillStyle = "#FF8204";
          ctx.fillRect(Math.round(position.x - ux * body - 2), Math.round(position.y - uy * body - 2), 4, 4);
          ctx.fillStyle = "#FFDD73";
          ctx.fillRect(Math.round(position.x - ux * body), Math.round(position.y - uy * body), 2, 2);
          break;
        }
      }
    }
  }

  private drawBeams(ctx: CanvasRenderingContext2D): void {
    for (const beam of this.beams) {
      const progress = (this.clock - beam.t0) / beam.duration;
      if (progress < 0 || progress > 1) continue;
      switch (beam.kind) {
        case "laser": {
          const thickness = progress < 0.5 ? 4 : progress < 0.8 ? 2 : 1;
          this.stroke(ctx, beam.from.x, beam.from.y, beam.to.x, beam.to.y, beam.color, thickness + 2);
          this.stroke(ctx, beam.from.x, beam.from.y + 1, beam.to.x, beam.to.y + 1, "#FAFAF4", thickness);
          break;
        }
        case "warn": {
          if (Math.floor(this.clock / 70) % 2 === 0) {
            ctx.fillStyle = "#FAFAF4";
            ctx.fillRect(beam.to.x - 8, beam.to.y, 16, 1);
            ctx.fillRect(beam.to.x, beam.to.y - 8, 1, 16);
            ctx.fillStyle = "#E51300";
            ctx.fillRect(beam.to.x - 9, GROUND - 2, 19, 2);
          }
          break;
        }
        case "orbital": {
          const width = Math.max(2, Math.round(beam.size * 14 * (1 - progress * 0.7)));
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = "#FA500F";
          ctx.fillRect(beam.to.x - width - 4, 0, (width + 4) * 2, GROUND);
          ctx.globalAlpha = 0.8;
          ctx.fillStyle = "#FFDD73";
          ctx.fillRect(beam.to.x - width, 0, width * 2, GROUND);
          ctx.globalAlpha = 1;
          ctx.fillStyle = "#FAFAF4";
          ctx.fillRect(beam.to.x - Math.ceil(width / 2), 0, Math.ceil(width / 2) * 2, GROUND);
          ctx.fillStyle = "#FFDD73";
          ctx.fillRect(beam.to.x - width - 8, GROUND - 3, (width + 8) * 2, 3);
          break;
        }
      }
    }
  }

  private drawShields(ctx: CanvasRenderingContext2D): void {
    for (const shield of this.shields) {
      const progress = (this.clock - shield.t0) / shield.duration;
      if (progress < 0 || progress > 1) continue;
      if (progress > 0.7 && Math.floor(this.clock / 50) % 2 === 0) continue;
      for (let dy = -24; dy <= 24; dy += 1) {
        const distance = Math.abs(dy);
        const half = distance <= 6 ? 14 : distance <= 18 ? 12 : Math.max(2, 12 - (distance - 18) * 2);
        ctx.fillStyle = "#151524";
        ctx.fillRect(shield.x - half - 1, shield.y + dy, half * 2 + 2, 1);
        ctx.fillStyle = "#55B3FB";
        ctx.fillRect(shield.x - half, shield.y + dy, half * 2, 1);
        ctx.fillStyle = "#8FB8FF";
        ctx.fillRect(shield.x - half + 1, shield.y + dy, 2, 1);
        ctx.fillRect(shield.x + half - 3, shield.y + dy, 2, 1);
        ctx.fillStyle = "#FAFAF4";
        ctx.fillRect(shield.x - 1, shield.y + dy, 2, 1);
      }
      ctx.fillStyle = "#151524";
      ctx.fillRect(shield.x - 12, shield.y - 7, 24, 1);
      ctx.fillRect(shield.x - 12, shield.y + 6, 24, 1);
      const pulse = 1 + Math.round(progress * 4);
      ctx.fillStyle = "#8FB8FF";
      ctx.fillRect(shield.x - 2 - pulse, shield.y - 26, pulse, 2);
      ctx.fillRect(shield.x + 2, shield.y - 26, pulse, 2);
    }
  }

  private drawWalls(ctx: CanvasRenderingContext2D): void {
    for (const wall of this.walls) {
      const progress = (this.clock - wall.t0) / wall.duration;
      if (progress < 0 || progress > 1) continue;
      const height = Math.round(Math.min(1, progress * 6) * 56);
      ctx.fillStyle = "#151524";
      ctx.fillRect(wall.x - 9, wall.y - height - 1, 18, height + 1);
      ctx.fillStyle = "#8B8879";
      ctx.fillRect(wall.x - 8, wall.y - height, 16, height);
      ctx.fillStyle = "#56566C";
      for (let y = wall.y - height + 5; y < wall.y; y += 7) ctx.fillRect(wall.x - 8, y, 16, 1);
      ctx.fillStyle = "#BFBCAC";
      ctx.fillRect(wall.x - 8, wall.y - height, 3, 2);
      ctx.fillRect(wall.x + 3, wall.y - height + 8, 3, 2);
    }
  }

  private drawGavels(ctx: CanvasRenderingContext2D): void {
    for (const gavel of this.gavels) {
      const progress = Math.min(1, (this.clock - gavel.t0) / 260);
      const drop = progress < 1 ? -70 + progress * 70 : 0;
      const bounce = progress >= 1 ? Math.max(0, 6 - (this.clock - gavel.t0 - 260) / 40) : 0;
      const x = gavel.x;
      const y = gavel.y - 18 + drop - bounce;
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      if (progress < 1) ctx.rotate((-0.5 + progress * 0.5) * 0.6);
      ctx.fillStyle = "#151524";
      ctx.fillRect(-13, -6, 26, 13);
      ctx.fillStyle = "#56566C";
      ctx.fillRect(-12, -5, 24, 11);
      ctx.fillStyle = "#8A8FA3";
      ctx.fillRect(-12, -5, 24, 3);
      ctx.fillStyle = "#FFAF01";
      ctx.fillRect(-12, 1, 24, 2);
      ctx.fillStyle = "#151524";
      ctx.fillRect(-2, 6, 4, 20);
      ctx.fillStyle = "#8B8879";
      ctx.fillRect(-1, 8, 2, 16);
      ctx.restore();
    }
  }

  private stroke(
    ctx: CanvasRenderingContext2D,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: string,
    thickness: number,
  ): void {
    ctx.fillStyle = color;
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let index = 0; index <= steps; index += 1) {
      const x = Math.round(x0 + ((x1 - x0) * index) / steps);
      const y = Math.round(y0 + ((y1 - y0) * index) / steps);
      ctx.fillRect(x, y, thickness, thickness);
    }
  }
}
