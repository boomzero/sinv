import RAPIER from '@dimforge/rapier2d-compat';
import type { EventQueue } from '@dimforge/rapier2d-compat';
import { PhysicsContext, createWalls } from './physics';
import { Input } from './input';
import { Camera } from './camera';
import { DIFFICULTIES, loadDifficultyIndex, loadHighScore, saveHighScore } from './difficulty';
import { Particles } from './render/particles';
import { drawScene } from './render/renderer';
import { drawHud, drawOverlay } from './render/hud';
import { mulberry32, range, type RNG } from './util/rng';
import { createPlayer, updatePlayer, type PlayerFrame } from './entities/player';
import { createHunter, updateHunter } from './entities/hunter';
import { createAsteroid } from './entities/asteroid';
import { createPickup, createGate, removePickup } from './entities/pickup';
import type {
  Player,
  Hunter,
  Asteroid,
  Pickup,
  Gate,
  GravityWell,
  Entity,
  PickupType,
} from './entities/types';
import {
  MAP_W,
  MAP_H,
  GEM_SCORE,
  GEM_BONUS_MULT,
  ORB_COUNT,
  MULT_MAX,
  SHIELD_COUNT,
  BOOSTCELL_COUNT,
  WELL_COUNT,
  WHITE_HOLE_COUNT,
  WHITE_HOLE_RADIUS,
  WHITE_HOLE_PUSH_FACTOR,
  HUNTER_SHOVE_DV,
  WELL_RADIUS,
  WELL_PULL,
  WELL_FALLOFF,
  WELL_MIN_DIST,
  WELL_HUNTER_FACTOR,
  WELL_CORE_RADIUS,
  WELL_BAIT_RADIUS,
  WELL_BAIT_DRAG,
  ORB_HEAL,
  HULL_MAX,
  BOOST_MAX,
  BOOST_PICKUP_REFILL,
  DAMAGE_SPEED_THRESHOLD,
  DAMAGE_SCALE,
  DAMAGE_MAX,
  DAMAGE_COOLDOWN,
  HUNTER_STUN,
  HUNTER_BLACKHOLE_RESPAWN,
  HUNTER_LUNGE_PERIOD,
  HUNTER_LUNGE_GEM_FRACTION,
  HULL_BONUS_PER,
  BOOST_BONUS_PER,
  WIN_BASE_BONUS,
  WIN_TIME_PAR,
  WIN_TIME_BONUS_PER,
} from './constants';

export type GameState = 'menu' | 'playing' | 'paused' | 'gameover' | 'win';
export type LossReason = 'caught' | 'destroyed';

export interface ScoreBreakdown {
  gems: number; // score banked from gems during the run
  escapeBonus: number; // flat reward + speed bonus for a fast getaway
  hullBonus: number; // points for surviving hull
  boostBonus: number; // points for leftover boost
  total: number;
}

const PLAYER_SPAWN = { x: 350, y: MAP_H - 350 };
const HUNTER_SPAWN = { x: MAP_W - 350, y: 350 };
const GATE_POS = { x: MAP_W - 320, y: MAP_H - 320 };

export class Game {
  readonly input = new Input();
  readonly camera = new Camera();
  readonly particles = new Particles();

  state: GameState = 'menu';
  lossReason: LossReason = 'caught';
  mouseSteer = localStorage.getItem('sinv-mouse') === '1';
  debugDraw = false;
  /** playT when the first BHAS override intercept was triggered this run (−1 = not yet). */
  interceptAt = -1;
  /** playT when lunges first unlocked this run (−1 = not yet). */
  lungeUnlockedAt = -1;
  difficultyIndex = loadDifficultyIndex();
  viewW = 0;
  viewH = 0;

  get difficulty() {
    return DIFFICULTIES[this.difficultyIndex];
  }

  /** Gems needed to unlock the exit gate this run. */
  get gemCount() {
    return this.difficulty.gemCount;
  }

  /** True while a black hole has swallowed the hunter and it hasn't re-materialized yet. */
  get hunterRespawning() {
    return this.hunter.respawnAt > this.playT;
  }
  time = 0; // wall time since boot (for animation)
  playT = 0; // time since this run started
  score = 0;
  highScore = loadHighScore();
  isNewHighScore = false;
  winBreakdown: ScoreBreakdown | null = null;
  gemsCollected = 0;
  orbsCollected = 0;

  physics!: PhysicsContext;
  private eventQueue!: EventQueue;
  player!: Player;
  hunter!: Hunter;
  asteroids: Asteroid[] = [];
  pickups: Pickup[] = [];
  gate!: Gate;
  wells: GravityWell[] = [];
  playerFrame: PlayerFrame = { thrusting: false, boosting: false };

  constructor() {
    // Don't let the hunter close in while the player is on another tab
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.state = 'paused';
    });
  }

  reset(seed: number): void {
    if (this.physics) this.physics.free();
    if (this.eventQueue) this.eventQueue.free();
    this.physics = new PhysicsContext();
    this.eventQueue = new RAPIER.EventQueue(true);
    this.particles.clear();
    this.asteroids = [];
    this.pickups = [];
    this.wells = [];
    this.playT = 0;
    this.score = 0;
    this.isNewHighScore = false;
    this.winBreakdown = null;
    this.gemsCollected = 0;
    this.orbsCollected = 0;
    this.interceptAt = -1;
    this.lungeUnlockedAt = -1;

    const rng = mulberry32(seed);
    createWalls(this.physics);
    this.player = createPlayer(this.physics, PLAYER_SPAWN.x, PLAYER_SPAWN.y);
    this.player.body.setRotation(-Math.PI / 4, true); // face into the map
    this.hunter = createHunter(this.physics, HUNTER_SPAWN.x, HUNTER_SPAWN.y);
    this.gate = createGate(this.physics, GATE_POS.x, GATE_POS.y);
    this.populate(rng);
    this.camera.snapTo(PLAYER_SPAWN.x, PLAYER_SPAWN.y);
  }

  private populate(rng: RNG): void {
    const margin = 180;
    const farFrom = (
      x: number,
      y: number,
      points: Array<{ x: number; y: number }>,
      minDist: number,
    ) => points.every((p) => Math.hypot(p.x - x, p.y - y) >= minDist);

    const sample = (minFromSpawn: number): { x: number; y: number } => {
      for (let tries = 0; tries < 60; tries++) {
        const x = range(rng, margin, MAP_W - margin);
        const y = range(rng, margin, MAP_H - margin);
        if (
          Math.hypot(x - PLAYER_SPAWN.x, y - PLAYER_SPAWN.y) >= minFromSpawn &&
          Math.hypot(x - GATE_POS.x, y - GATE_POS.y) >= 200 &&
          // Keep random spawns out of gravity fields: white holes push
          // anything placed inside out of reach, and black wells would
          // hand out free deep-field gems next to the deliberate bonus
          // rings (or just feed rocks straight into the core)
          this.wells.every(
            (w) => Math.hypot(x - w.x, y - w.y) >= w.radius + 40,
          )
        ) {
          return { x, y };
        }
      }
      return { x: MAP_W / 2, y: MAP_H / 2 };
    };

    // Gravity wells, spaced out and away from spawn/gate
    for (let tries = 0; this.wells.length < WELL_COUNT && tries < 300; tries++) {
      const x = range(rng, 700, MAP_W - 700);
      const y = range(rng, 600, MAP_H - 600);
      if (
        Math.hypot(x - PLAYER_SPAWN.x, y - PLAYER_SPAWN.y) >= 900 &&
        Math.hypot(x - GATE_POS.x, y - GATE_POS.y) >= 900 &&
        farFrom(x, y, this.wells, 1100)
      ) {
        this.wells.push({ x, y, radius: WELL_RADIUS, polarity: 1 });
      }
    }

    // White holes: repulsors wedged between the black wells
    const whiteHoles: GravityWell[] = [];
    for (let tries = 0; whiteHoles.length < WHITE_HOLE_COUNT && tries < 300; tries++) {
      const x = range(rng, 600, MAP_W - 600);
      const y = range(rng, 500, MAP_H - 500);
      if (
        Math.hypot(x - PLAYER_SPAWN.x, y - PLAYER_SPAWN.y) >= 800 &&
        Math.hypot(x - GATE_POS.x, y - GATE_POS.y) >= 700 &&
        farFrom(x, y, this.wells, 1000) &&
        farFrom(x, y, whiteHoles, 1000)
      ) {
        whiteHoles.push({ x, y, radius: WHITE_HOLE_RADIUS, polarity: -1 });
      }
    }
    this.wells.push(...whiteHoles);

    // Gems: a ring of bonus gems around each well (risk/reward), rest scattered
    let gemsLeft = this.gemCount;
    for (const well of this.wells) {
      if (well.polarity !== 1) continue; // only deadly wells pay bonus gems
      const ringCount = 4;
      const startA = rng() * Math.PI * 2;
      for (let i = 0; i < ringCount && gemsLeft > 0; i++, gemsLeft--) {
        const a = startA + (i / ringCount) * Math.PI * 2;
        // Outside the strong-pull zone so grabbing them is a dive, not a death
        const r = range(rng, 280, 360);
        this.pickups.push(
          createPickup(
            this.physics,
            'gem',
            well.x + Math.cos(a) * r,
            well.y + Math.sin(a) * r,
            rng() * 10,
            true,
          ),
        );
      }
    }
    while (gemsLeft-- > 0) {
      const p = sample(400);
      this.pickups.push(createPickup(this.physics, 'gem', p.x, p.y, rng() * 10));
    }

    const scatter = (type: PickupType, count: number, minFromSpawn: number) => {
      for (let i = 0; i < count; i++) {
        const p = sample(minFromSpawn);
        this.pickups.push(createPickup(this.physics, type, p.x, p.y, rng() * 10));
      }
    };
    scatter('orb', ORB_COUNT, 700);
    scatter('shield', SHIELD_COUNT, 500);
    scatter('boost', BOOSTCELL_COUNT, 300);

    for (let i = 0; i < this.difficulty.asteroidCount; i++) {
      const p = sample(450);
      if (Math.hypot(p.x - HUNTER_SPAWN.x, p.y - HUNTER_SPAWN.y) < 250) continue;
      // Mostly small rocks, a few big ones
      const radius = 20 + Math.pow(rng(), 1.8) * 50;
      this.asteroids.push(createAsteroid(this.physics, rng, p.x, p.y, radius));
    }
  }

  fixedUpdate(dt: number): void {
    this.time += dt;

    if (this.input.justPressed('KeyM')) {
      this.mouseSteer = !this.mouseSteer;
      localStorage.setItem('sinv-mouse', this.mouseSteer ? '1' : '0');
    }
    if (this.input.justPressed('Backquote')) this.debugDraw = !this.debugDraw;
    if (this.input.justPressed('KeyR') && this.state !== 'menu') {
      this.reset((Math.random() * 2 ** 31) | 0);
      this.state = 'playing';
    }
    if (
      (this.input.justPressed('KeyP') || this.input.justPressed('Escape')) &&
      (this.state === 'playing' || this.state === 'paused')
    ) {
      this.state = this.state === 'playing' ? 'paused' : 'playing';
    }
    if (this.state === 'paused') {
      // Full freeze: no physics, no AI, no particles — only the overlay pulses
      this.input.endFrame();
      return;
    }
    if (this.state === 'menu') {
      // Difficulty selection rebuilds the map (asteroid density changes)
      for (let d = 0; d < DIFFICULTIES.length; d++) {
        if (this.input.justPressed(`Digit${d + 1}`) && d !== this.difficultyIndex) {
          this.difficultyIndex = d;
          localStorage.setItem('sinv-diff', String(d));
          this.reset((Math.random() * 2 ** 31) | 0);
        }
      }
      if (this.input.justPressed('Enter')) {
        this.state = 'playing';
        this.playT = 0;
      }
    }

    if (this.state === 'playing') {
      this.playT += dt;
      let aimAngle: number | null = null;
      if (this.mouseSteer && this.viewW > 0) {
        const wx = this.input.mouseX - this.viewW / 2 + this.camera.x;
        const wy = this.input.mouseY - this.viewH / 2 + this.camera.y;
        const pp = this.player.body.translation();
        aimAngle = Math.atan2(wy - pp.y, wx - pp.x);
      }
      this.playerFrame = updatePlayer(this.player, this.input, dt, aimAngle);
      this.emitEngineTrail();
      if (this.hunterRespawning) {
        // Swallowed by a core: sit out the timer, parked and inert at spawn.
        this.hunter.body.resetForces(true);
        this.hunter.telegraph = 0;
      } else {
        if (!this.hunter.collider.isEnabled()) {
          // Timer elapsed — re-materialize at the spawn corner.
          this.hunter.collider.setEnabled(true);
          this.hunter.lungeTimer = HUNTER_LUNGE_PERIOD;
          const hp = this.hunter.body.translation();
          this.particles.burst(hp.x, hp.y, 30, 260, 0.9, 4, '#ff5050');
        }
        updateHunter(
          this.hunter,
          this.player,
          this.physics,
          this.playT,
          this.orbsCollected,
          this.gemsCollected >= this.gemCount * HUNTER_LUNGE_GEM_FRACTION,
          this.difficulty,
          this.wells,
          dt,
        );
        if (this.hunter.lureCommitUntil > this.playT && this.interceptAt < 0) {
          this.interceptAt = this.playT;
        }
        if (this.gemsCollected >= this.gemCount * HUNTER_LUNGE_GEM_FRACTION && this.lungeUnlockedAt < 0) {
          this.lungeUnlockedAt = this.playT;
        }
      }
    } else {
      // Ships idle: clear any leftover forces so they just drift
      this.player.body.resetForces(true);
      this.hunter.body.resetForces(true);
    }

    this.applyGravityWells();

    this.physics.world.step(this.eventQueue);
    this.eventQueue.drainCollisionEvents((h1, h2, started) => {
      if (!started || this.state !== 'playing') return;
      const a = this.physics.byCollider.get(h1);
      const b = this.physics.byCollider.get(h2);
      if (!a || !b) return;
      this.handleContact(a, b);
      this.handleContact(b, a);
    });

    this.particles.update(dt);
    const pos = this.player.body.translation();
    const vel = this.player.body.linvel();
    this.camera.follow(pos.x, pos.y, vel.x, vel.y, dt);
    this.input.endFrame();
  }

  private applyGravityWells(): void {
    for (const a of this.asteroids) a.body.resetForces(true);
    const huntable = this.state === 'playing' && !this.hunterRespawning;
    const bodies = [
      ...this.asteroids.map((a) => a.body),
      ...(this.state === 'playing' ? [this.player.body] : []),
      ...(huntable ? [this.hunter.body] : []),
    ];
    for (const body of bodies) {
      const p = body.translation();
      const factor = body === this.hunter.body ? WELL_HUNTER_FACTOR : 1;
      for (const well of this.wells) {
        const dx = well.x - p.x;
        const dy = well.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist < well.radius && dist > 1) {
          const accel =
            (WELL_PULL / Math.pow(Math.max(dist, WELL_MIN_DIST), WELL_FALLOFF)) *
            factor *
            well.polarity *
            (well.polarity === -1 ? WHITE_HOLE_PUSH_FACTOR : 1);
          const f = (accel * body.mass()) / dist;
          body.addForce({ x: dx * f, y: dy * f }, true);

          // Inside a black hole's bait band, ships hit heavy drag that bleeds
          // the speed keeping them clear of the core — coast and you spiral in,
          // so the slingshot pass demands constant boost to hold velocity.
          if (
            well.polarity === 1 &&
            dist < WELL_BAIT_RADIUS &&
            (body === this.player.body || body === this.hunter.body)
          ) {
            const v = body.linvel();
            const k = WELL_BAIT_DRAG * body.mass();
            body.addForce({ x: -v.x * k, y: -v.y * k }, true);
          }
        }
      }
    }
    this.consumeCoreAsteroids();
  }

  /** Rocks that fall into a well core are destroyed and respawn elsewhere, so
   *  debris can never pile up in the center (or trap the hunter there). */
  private consumeCoreAsteroids(): void {
    if (this.state === 'playing' && this.player.alive) {
      const pp = this.player.body.translation();
      for (const well of this.wells) {
        if (well.polarity !== 1) continue;
        if (Math.hypot(well.x - pp.x, well.y - pp.y) < WELL_CORE_RADIUS) {
          this.player.hull = 0;
          this.particles.burst(pp.x, pp.y, 30, 220, 0.9, 4, '#c873ff');
          this.lose('destroyed');
          break;
        }
      }
    }
    // Despite resisting the pull, the hunter can still get dragged into a core
    // mid-chase. When that happens the singularity eats it: it vanishes for a
    // good while, handing the player a real breather, then re-materializes back
    // at its spawn corner.
    if (this.state === 'playing' && !this.hunterRespawning) {
      const hp = this.hunter.body.translation();
      for (const well of this.wells) {
        if (well.polarity !== 1) continue;
        if (Math.hypot(well.x - hp.x, well.y - hp.y) < WELL_CORE_RADIUS) {
          this.particles.burst(hp.x, hp.y, 34, 280, 0.9, 5, '#c873ff');
          this.particles.burst(hp.x, hp.y, 20, 200, 0.7, 4, '#ff5050');
          this.hunter.respawnAt = this.playT + HUNTER_BLACKHOLE_RESPAWN;
          this.hunter.stunnedUntil = this.hunter.respawnAt;
          // Pull it out of the world: no collisions, no forces, not drawn.
          this.hunter.collider.setEnabled(false);
          this.hunter.body.setLinvel({ x: 0, y: 0 }, true);
          this.hunter.body.resetForces(true);
          this.hunter.body.setTranslation(
            { x: HUNTER_SPAWN.x, y: HUNTER_SPAWN.y },
            true,
          );
          break;
        }
      }
    }
    for (const asteroid of this.asteroids) {
      const p = asteroid.body.translation();
      for (const well of this.wells) {
        if (well.polarity !== 1) continue;
        if (Math.hypot(well.x - p.x, well.y - p.y) >= WELL_CORE_RADIUS) continue;
        this.particles.burst(p.x, p.y, 12, 180, 0.6, 4, '#c873ff');
        const ppos = this.player.body.translation();
        let x = MAP_W / 2;
        let y = MAP_H / 2;
        for (let tries = 0; tries < 40; tries++) {
          const cx = 180 + Math.random() * (MAP_W - 360);
          const cy = 180 + Math.random() * (MAP_H - 360);
          if (
            Math.hypot(cx - ppos.x, cy - ppos.y) > 600 &&
            this.wells.every((w) => Math.hypot(cx - w.x, cy - w.y) > WELL_RADIUS)
          ) {
            x = cx;
            y = cy;
            break;
          }
        }
        asteroid.body.setTranslation({ x, y }, true);
        asteroid.body.setLinvel(
          { x: (Math.random() - 0.5) * 140, y: (Math.random() - 0.5) * 140 },
          true,
        );
        break;
      }
    }
  }

  private emitEngineTrail(): void {
    if (!this.playerFrame.thrusting || !this.player.alive) return;
    const body = this.player.body;
    const rot = body.rotation();
    const pos = body.translation();
    const vel = body.linvel();
    const fx = Math.cos(rot);
    const fy = Math.sin(rot);
    const n = this.playerFrame.boosting ? 4 : 2;
    const color = this.playerFrame.boosting ? '#ffffff' : '#3fd6ff';
    for (let i = 0; i < n; i++) {
      this.particles.emit(
        pos.x - fx * 16 + (Math.random() - 0.5) * 6,
        pos.y - fy * 16 + (Math.random() - 0.5) * 6,
        vel.x * 0.3 - fx * 160 + (Math.random() - 0.5) * 50,
        vel.y * 0.3 - fy * 160 + (Math.random() - 0.5) * 50,
        0.3 + Math.random() * 0.25,
        this.playerFrame.boosting ? 5 : 4,
        color,
      );
    }
  }

  private handleContact(a: Entity, b: Entity): void {
    if (a.kind === 'player') {
      if (b.kind === 'pickup') this.consumePickup(b);
      else if (b.kind === 'gate' && b.active) this.win();
      else if (b.kind === 'hunter') this.resolveHunterTouch();
      else if (b.kind === 'asteroid') this.asteroidImpact(b);
    } else if (a.kind === 'hunter' && b.kind === 'asteroid') {
      // The hunter bulldozes: any rock it touches gets launched along its
      // direction of travel, turning the chase itself into a hazard.
      const hv = a.body.linvel();
      const hs = Math.hypot(hv.x, hv.y);
      const hp = a.body.translation();
      const ap = b.body.translation();
      let dx = hs > 20 ? hv.x / hs : ap.x - hp.x;
      let dy = hs > 20 ? hv.y / hs : ap.y - hp.y;
      const dl = Math.hypot(dx, dy) || 1;
      dx /= dl;
      dy /= dl;
      const m = b.body.mass();
      b.body.applyImpulse(
        { x: dx * HUNTER_SHOVE_DV * m, y: dy * HUNTER_SHOVE_DV * m },
        true,
      );
      this.particles.burst(ap.x, ap.y, 10, 180, 0.5, 3, '#ff8866');
    }
  }

  private consumePickup(pickup: Pickup): void {
    if (pickup.taken) return;
    removePickup(this.physics, pickup);
    switch (pickup.type) {
      case 'gem': {
        const value = pickup.bonus ? GEM_SCORE * GEM_BONUS_MULT : GEM_SCORE;
        this.score += Math.round(value * this.player.mult * this.difficulty.scoreMultiplier);
        this.gemsCollected++;
        if (this.gemsCollected >= this.gemCount) this.gate.active = true;
        const n = pickup.bonus ? 20 : 10;
        this.particles.burst(pickup.x, pickup.y, n, 150, 0.5, 3, '#41ffe0');
        break;
      }
      case 'orb': {
        this.player.mult = Math.min(MULT_MAX, this.player.mult + 1);
        const healed =
          Math.min(HULL_MAX, this.player.hull + ORB_HEAL) - this.player.hull;
        this.player.hull += healed;
        this.player.healedTotal += healed;
        this.orbsCollected++;
        this.particles.burst(pickup.x, pickup.y, 14, 180, 0.6, 4, '#ffd24a');
        break;
      }
      case 'shield':
        this.player.shield = true;
        this.particles.burst(pickup.x, pickup.y, 12, 160, 0.6, 4, '#6699ff');
        break;
      case 'boost':
        this.player.boostFuel = Math.min(
          BOOST_MAX,
          this.player.boostFuel + BOOST_PICKUP_REFILL,
        );
        this.particles.burst(pickup.x, pickup.y, 10, 140, 0.5, 3, '#b67aff');
        break;
    }
  }

  private asteroidImpact(asteroid: Asteroid): void {
    if (this.player.damageCooldown > 0) return;
    const pv = this.player.body.linvel();
    const av = asteroid.body.linvel();
    const relSpeed = Math.hypot(pv.x - av.x, pv.y - av.y);
    const dmg = Math.min(
      DAMAGE_MAX,
      (relSpeed - DAMAGE_SPEED_THRESHOLD) * DAMAGE_SCALE,
    );
    if (dmg <= 0) return;
    this.player.damageCooldown = DAMAGE_COOLDOWN;
    if (this.player.shield) {
      this.player.shield = false;
      this.camera.addShake(5);
      const sp = this.player.body.translation();
      this.particles.burst(sp.x, sp.y, 18, 240, 0.6, 4, '#6699ff');
      return;
    }
    this.player.hull -= dmg;
    this.player.mult = 1;
    this.camera.addShake(4 + dmg * 0.5);
    const p = this.player.body.translation();
    this.particles.burst(p.x, p.y, 12, 200, 0.5, 4, '#aabbcc');
    if (this.player.hull <= 0) {
      this.player.hull = 0;
      this.lose('destroyed');
    }
  }

  private resolveHunterTouch(): void {
    if (this.player.shield) {
      this.player.shield = false;
      this.hunter.stunnedUntil = this.playT + HUNTER_STUN;
      const hp = this.hunter.body.translation();
      const pp = this.player.body.translation();
      const dx = hp.x - pp.x;
      const dy = hp.y - pp.y;
      const d = Math.max(Math.hypot(dx, dy), 1);
      const m = this.hunter.body.mass();
      this.hunter.body.applyImpulse(
        { x: (dx / d) * 700 * m, y: (dy / d) * 700 * m },
        true,
      );
      this.camera.addShake(14);
      this.particles.burst(pp.x, pp.y, 26, 320, 0.7, 4, '#6699ff');
    } else if (this.playT >= this.hunter.stunnedUntil) {
      // A stunned hunter is harmless — grace period after a shield break
      this.lose('caught');
    }
  }

  private lose(reason: LossReason): void {
    this.state = 'gameover';
    this.lossReason = reason;
    this.player.alive = false;
    const p = this.player.body.translation();
    this.particles.burst(p.x, p.y, 50, 380, 1.1, 5, '#3fd6ff');
    this.particles.burst(p.x, p.y, 30, 260, 0.9, 4, '#ffffff');
    this.camera.addShake(22);
    this.isNewHighScore = saveHighScore(this.score);
    if (this.isNewHighScore) this.highScore = this.score;
  }

  private win(): void {
    this.state = 'win';
    const sm = this.difficulty.scoreMultiplier;
    // Score banked from gems so far (already scaled by difficulty per-pickup)
    const gems = this.score;
    // Escape bonus: a flat reward for reaching the gate plus a speed bonus that
    // pays out for every second the getaway beats par.
    const speedBonus = Math.max(0, WIN_TIME_PAR - this.playT) * WIN_TIME_BONUS_PER;
    const escapeBonus = Math.round((WIN_BASE_BONUS + speedBonus) * sm);
    // Healed hull only earns half bonus — patched plating isn't clean flying
    const bonusHull = Math.max(
      0,
      this.player.hull - this.player.healedTotal * 0.5,
    );
    const hullBonus = Math.round(bonusHull * HULL_BONUS_PER * sm);
    const boostBonus = Math.round(this.player.boostFuel * BOOST_BONUS_PER * sm);
    this.score = gems + escapeBonus + hullBonus + boostBonus;
    this.winBreakdown = {
      gems,
      escapeBonus,
      hullBonus,
      boostBonus,
      total: this.score,
    };
    this.isNewHighScore = saveHighScore(this.score);
    if (this.isNewHighScore) this.highScore = this.score;
    const g = this.gate;
    this.particles.burst(g.x, g.y, 60, 300, 1.2, 4, '#5dff8a');
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    drawScene(ctx, this, w, h);
    drawHud(ctx, this, w, h);
    drawOverlay(ctx, this, w, h);
  }
}
