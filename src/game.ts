import RAPIER from '@dimforge/rapier2d-compat';
import type { EventQueue } from '@dimforge/rapier2d-compat';
import { PhysicsContext, createWalls } from './physics';
import { BLAST_RANGE, GEM_THRUST_GAIN, MAX_BLASTS, EXIT_REFERENCE_ENGINE, EXIT_WELL_STRENGTH, EXIT_FIELD_DRAG, outsideExit } from './world/exit';
import { Input } from './input';
import { Camera } from './camera';
import { Navigation } from './ai/navigation';
import { DIFFICULTIES, loadDifficultyIndex, loadHighScore, saveHighScore } from './difficulty';
import { Particles } from './render/particles';
import { drawScene } from './render/renderer';
import { drawHud, drawOverlay } from './render/hud';
import { mulberry32 } from './util/rng';
import { generateWorld, distanceToStructure, type Landmark } from './world/generate';
import { createPlayer, updatePlayer, type PlayerFrame } from './entities/player';
import { createHunter, updateHunter } from './entities/hunter';
import { createAsteroid, createStructure, ASTEROID_MATERIALS } from './entities/asteroid';
import { readSaved, writeSaved } from './util/storage';
import { createPickup, createGate, removePickup, blastBarrier, PICKUP_RADIUS } from './entities/pickup';
import type {
  Player,
  Hunter,
  Asteroid,
  Pickup,
  Gate,
  GravityWell,
  Entity,
} from './entities/types';
import {
  SHIELD_INVULNERABILITY,
  MAGNET_DURATION, MAGNET_RADIUS, MAGNET_ACCEL, MAGNET_SOFTENING, MAGNET_MAX_SPEED,
  GEM_SCORE,
  GEM_BONUS_MULT,
  MULT_MAX,
  WHITE_HOLE_PUSH_FACTOR,
  WHITE_HOLE_SWIRL,
  WHITE_HOLE_SWIRL_DIR,
  HUNTER_SHOVE_DV,
  WELL_PULL,
  WELL_FALLOFF,
  WELL_MIN_DIST,
  WELL_HUNTER_FACTOR,
  WHITE_HOLE_HUNTER_REPEL,
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
  CLOSE_CALL_DIST,
  CLOSE_CALL_ESCAPE_DIST,
  CLOSE_CALL_SCORE,
  CLOSE_CALL_COOLDOWN,
} from './constants';

// Hidden cheat code: type these letters during a run (edge://surf style) to
// toggle access to the command console. Gameplay overrides are opt-in.
const CHEAT_CODE = 'kelly';

export type GameState = 'menu' | 'playing' | 'paused' | 'gameover' | 'win';
export type LossReason = 'caught' | 'destroyed';

export interface ScoreBreakdown {
  gems: number; // score banked from gems during the run
  closeCalls: number; // bonuses earned from close encounters with the hunter
  escapeBonus: number; // flat reward + speed bonus for a fast getaway
  hullBonus: number; // points for surviving hull
  boostBonus: number; // points for leftover boost
  total: number;
}

function spawnPositions(mapW: number, mapH: number) {
  return {
    player: { x: 350, y: mapH - 350 },
    hunters: [
      { x: mapW - 350, y: 350 },
      { x: 350, y: 350 },
    ],
    gate: { x: mapW - 320, y: mapH - 320 },
  };
}

export class Game {
  readonly input = new Input();
  readonly camera = new Camera();
  readonly particles = new Particles();

  state: GameState = 'menu';
  seed = 0;
  runId = 0;
  totalGems = 0;
  landmarks: Landmark[] = [];
  structures: Asteroid[] = [];
  chartOpen = false;
  discovery: Landmark | null = null;
  discoveredAt = -1;
  toggleChart(): void {
    if (this.state !== 'menu' && this.state !== 'playing' && this.state !== 'paused') return;
    this.chartOpen = !this.chartOpen;
    if (this.state !== 'menu') this.state = this.chartOpen ? 'paused' : 'playing';
    this.input.clearHeld();
  }

  launch(): void {
    if (this.state !== 'menu') return;
    this.state = 'playing';
    this.chartOpen = false;
    this.playT = 0;
    this.input.clearHeld();
    this.camera.snapTo(this.playerSpawn.x, this.playerSpawn.y);
  }

  togglePause(): void {
    if (this.state !== 'playing' && this.state !== 'paused') return;
    this.state = this.state === 'playing' ? 'paused' : 'playing';
    this.chartOpen = false;
    this.input.clearHeld();
  }

  restart(): void {
    const wasMenu = this.state === 'menu';
    this.reset((Math.random() * 2 ** 31) | 0);
    this.state = wasMenu ? 'menu' : 'playing';
  }

  selectDifficulty(index: number): void {
    if (this.state !== 'menu' || index === this.difficultyIndex || !DIFFICULTIES[index]) return;
    this.difficultyIndex = index;
    writeSaved('sinv-diff', String(index));
    this.reset(this.seed);
  }
  lossReason: LossReason = 'caught';
  mouseSteer = readSaved('sinv-mouse') === '1';
  debugDraw = false;
  /** Enables testing commands; gameplay overrides start disabled. */
  cheats = false;
  infiniteBoost = false;
  impactImmunity = false;
  /** Sticky for the run: once cheats touch a run, its score never saves — even if toggled back off. */
  cheatsUsed = false;
  /** playT when the first BHAS override intercept was triggered this run (−1 = not yet). */
  interceptAt = -1;
  /** playT when lunges first unlocked this run (−1 = not yet). */
  lungeUnlockedAt = -1;
  /** The specific hunter being threaded right now (null = no active close call). */
  closeCallHunter: Hunter | null = null;
  closeCallCooldown = 0;
  /** playT of the most recent successful close call (−1 = none yet). */
  lastCloseCallAt = -1;
  lastCloseCallBonus = 0;
  totalCloseCallBonus = 0;
  difficultyIndex = loadDifficultyIndex();
  mapW = 0;
  mapH = 0;
  private playerSpawn = { x: 0, y: 0 };
  viewW = 0;
  viewH = 0;

  get difficulty() {
    return DIFFICULTIES[this.difficultyIndex];
  }

  /** Recommended gem preparation; escape is decided by physics, never a quota. */
  get gemCount() {
    return this.difficulty.gemCount;
  }

  get escapeGemTarget() { return this.difficulty.escapeGems ?? this.gemCount; }

  /** True while a black hole has swallowed this hunter and it hasn't re-materialized yet. */
  respawning(h: Hunter): boolean {
    return h.respawnAt > this.playT;
  }
  time = 0; // wall time since boot (for animation)
  playT = 0; // time since this run started
  score = 0;
  highScore = loadHighScore();
  isNewHighScore = false;
  winBreakdown: ScoreBreakdown | null = null;
  gemsCollected = 0;
  orbsCollected = 0;
  antimatter = 0;
  magnetUntil = 0;
  shieldUntil = 0;
  private impactSpeed = 0;
  lastGemAt = -1;
  lastBlastAt = -1;

  physics!: PhysicsContext;
  navigation!: Navigation;
  private eventQueue!: EventQueue;
  player!: Player;
  hunters: Hunter[] = [];
  asteroids: Asteroid[] = [];
  pickups: Pickup[] = [];
  gate!: Gate;
  wells: GravityWell[] = [];
  playerFrame: PlayerFrame = { thrusting: false, boosting: false };

  constructor() {
    // Don't let the hunter close in while the player is on another tab
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') {
        this.state = 'paused';
        this.input.clearHeld();
      }
    });
  }

  reset(seed: number): void {
    this.runId++;
    this.input.clearHeld();
    if (this.physics) this.physics.free();
    if (this.eventQueue) this.eventQueue.free();
    this.physics = new PhysicsContext();
    this.eventQueue = new RAPIER.EventQueue(true);
    this.particles.clear();
    this.asteroids = [];
    this.structures = [];
    this.landmarks = [];
    this.seed = seed >>> 0;
    this.chartOpen = false;
    this.discovery = null;
    this.discoveredAt = -1;
    this.pickups = [];
    this.wells = [];
    this.playT = 0;
    this.score = 0;
    // A fresh run starts clean: cheats off and the run's score-saving untainted.
    this.cheats = false;
    this.infiniteBoost = false;
    this.impactImmunity = false;
    this.cheatsUsed = false;
    this.isNewHighScore = false;
    this.winBreakdown = null;
    this.gemsCollected = 0;
    this.orbsCollected = 0;
    this.antimatter = 0;
    this.magnetUntil = 0;
    this.shieldUntil = 0;
    this.lastGemAt = -1;
    this.lastBlastAt = -1;
    this.interceptAt = -1;
    this.lungeUnlockedAt = -1;
    this.closeCallHunter = null;
    this.closeCallCooldown = 0;
    this.lastCloseCallAt = -1;
    this.lastCloseCallBonus = 0;
    this.totalCloseCallBonus = 0;

    this.mapW = this.difficulty.mapW;
    this.mapH = this.difficulty.mapH;
    const spawns = spawnPositions(this.mapW, this.mapH);
    this.playerSpawn = spawns.player;

    createWalls(this.physics, this.mapW, this.mapH);
    this.player = createPlayer(this.physics, spawns.player.x, spawns.player.y);
    this.player.body.setRotation(-Math.PI / 4, true); // face into the map
    this.hunters = [];
    const count = this.difficulty.hunterCount;
    for (let i = 0; i < count; i++) {
      const s = spawns.hunters[i % spawns.hunters.length];
      const hunter = createHunter(this.physics, s.x, s.y);
      hunter.lungePhase = i / count;
      hunter.lungeTimer = HUNTER_LUNGE_PERIOD * (1 - hunter.lungePhase);
      this.hunters.push(hunter);
    }
    this.gate = createGate(this.physics, spawns.gate.x, spawns.gate.y);
    this.populate();
    this.camera.snapTo(spawns.player.x, spawns.player.y);
  }

  private populate(): void {
    const layout = generateWorld(this.seed, this.difficulty);
    this.landmarks = layout.landmarks;
    this.totalGems = layout.totalGems;
    this.wells = layout.wells;
    this.rebuildNavigation();
    for (const shape of this.gate.layout.walls) this.structures.push(createStructure(this.physics, shape));
    const rng = mulberry32(this.seed ^ 0x51f15e);
    for (const landmark of this.landmarks) {
      for (const shape of landmark.structures) this.structures.push(createStructure(this.physics, shape));
    }
    for (const p of layout.pickups) this.pickups.push(createPickup(this.physics, p.type, p.x, p.y, p.phase, p.bonus));
    // Clouds stay coherent over a full run; loose field rocks keep their fast
    // drift. Both remain physical and can be pushed apart by impacts.
    for (const r of layout.rocks) this.asteroids.push(createAsteroid(this.physics, rng, r.x, r.y, r.radius, r.cloud === undefined ? 70 : 4));
  }

  get thrustGems(): number { return Math.round((this.player.engineMultiplier - 1) / GEM_THRUST_GAIN); }

  get shieldRemaining(): number { return Math.max(0, this.shieldUntil - this.playT); }

  private activateShield(): void {
    this.player.shield = false;
    this.shieldUntil = this.playT + SHIELD_INVULNERABILITY;
    const p = this.player.body.translation();
    this.particles.burst(p.x, p.y, 24, 240, 0.7, 4, '#a8cfff');
  }

  get magnetRemaining(): number { return Math.max(0, this.magnetUntil - this.playT); }

  private attractPickups(dt: number): void {
    const active = this.magnetRemaining > 0 && this.player.alive;
    const pos = this.player.body.translation();
    for (const pickup of this.pickups) {
      if (pickup.taken) continue;
      const dx = pos.x - pickup.x, dy = pos.y - pickup.y, distance = Math.hypot(dx, dy);
      const clearance = PICKUP_RADIUS[pickup.type] + 6;
      // Release momentum when the field is lost; rewards must stay within
      // their collection range and cannot drift through station walls.
      if (!active || distance < 1 || distance > MAGNET_RADIUS || !this.navigation.clearLine(pickup, pos, clearance)) {
        pickup.magnetVx = 0; pickup.magnetVy = 0;
        continue;
      }
      // A softened inverse-square force starts gently and strengthens nearby.
      // Retaining vector velocity lets the pull bend naturally as the ship turns.
      const acceleration = MAGNET_ACCEL / (1 + (distance / MAGNET_SOFTENING) ** 2);
      const oldVx = pickup.magnetVx, oldVy = pickup.magnetVy;
      pickup.magnetVx += dx / distance * acceleration * dt;
      pickup.magnetVy += dy / distance * acceleration * dt;
      const speed = Math.hypot(pickup.magnetVx, pickup.magnetVy);
      if (speed > MAGNET_MAX_SPEED) {
        pickup.magnetVx *= MAGNET_MAX_SPEED / speed;
        pickup.magnetVy *= MAGNET_MAX_SPEED / speed;
      }
      const stepX = (oldVx + pickup.magnetVx) * 0.5 * dt;
      const stepY = (oldVy + pickup.magnetVy) * 0.5 * dt;
      const scale = Math.min(1, distance / Math.max(1e-6, Math.hypot(stepX, stepY)));
      const next = { x: pickup.x + stepX * scale, y: pickup.y + stepY * scale };
      // Momentum can point away from the ship, so check the actual swept path too.
      if (!this.navigation.clearLine(pickup, next, clearance)) {
        pickup.magnetVx = 0; pickup.magnetVy = 0;
        continue;
      }
      pickup.x = next.x; pickup.y = next.y;
      pickup.collider.setTranslation({ x: pickup.x, y: pickup.y });
    }
  }

  get nearBarrier(): boolean {
    const p = this.player.body.translation(), b = this.gate.layout.barrier;
    return Math.hypot(p.x - b.x, p.y - b.y) <= BLAST_RANGE && Math.abs(p.y - b.y) < 125;
  }

  get canDetonate(): boolean {
    return this.state === 'playing' && this.player.alive && this.nearBarrier &&
      this.antimatter > 0 && this.gate.blasts < MAX_BLASTS;
  }

  detonate(): boolean {
    if (!this.canDetonate || !blastBarrier(this.physics, this.gate, this.playT)) return false;
    this.antimatter--;
    this.lastBlastAt = this.playT;
    const b = this.gate.layout.barrier;
    this.particles.burst(b.x, b.y, 55, 280, 1.4, 6, '#ffb875');
    this.rebuildNavigation();
    for (const h of this.hunters) { h.route = []; h.repathAt = 0; }
    return true;
  }

  private rebuildNavigation(): void {
    this.navigation = new Navigation(this.mapW, this.mapH, [
      ...this.landmarks.flatMap(l => l.structures), ...this.gate.layout.walls,
      ...this.gate.chunks.filter(c => c.destroyedAt < 0).map(c => c.shape),
    ]);
  }

  fixedUpdate(dt: number): void {
    this.time += dt;

    if (this.input.justPressed('KeyM')) {
      this.mouseSteer = !this.mouseSteer;
      writeSaved('sinv-mouse', this.mouseSteer ? '1' : '0');
    }
    if (this.input.justPressed('Backquote')) this.debugDraw = !this.debugDraw;
    if (this.input.consumeTyped(CHEAT_CODE)) {
      this.cheats = !this.cheats;
      // Touching a run with cheats permanently bars its score from saving.
      if (this.cheats) this.cheatsUsed = true;
    }
    if (this.input.justPressed('Tab')) this.toggleChart();
    if (this.state === 'menu' && this.chartOpen && this.input.justPressed('Escape')) this.toggleChart();
    if (this.input.justPressed('KeyR') &&
      (this.state === 'paused' || this.state === 'gameover' || this.state === 'win')) {
      this.restart();
    }
    if (
      (this.input.justPressed('KeyP') || this.input.justPressed('Escape')) &&
      (this.state === 'playing' || this.state === 'paused')
    ) {
      this.togglePause();
    }
    // Touch devices have no P/Esc key, so a tap on the paused playfield resumes.
    // The chart keeps its own Close map control, so leave that pause alone.
    if (this.state === 'paused' && !this.chartOpen && this.input.consumeTap()) {
      this.togglePause();
    }
    if (this.state === 'paused') {
      // Full freeze: no physics, no AI, no particles — only the overlay pulses
      this.input.endFrame();
      return;
    }
    if (this.state === 'menu') {
      // Difficulty selection rebuilds the map (asteroid density changes)
      for (let d = 0; d < DIFFICULTIES.length; d++) {
        if (this.input.justPressed(`Digit${d + 1}`)) this.selectDifficulty(d);
      }
      if (this.input.justPressed('Enter')) {
        this.launch();
      } else {
        const vista = this.landmarks.find(l => l.kind === 'halo') ?? this.landmarks[0];
        this.camera.snapTo(vista.x + Math.cos(this.time * 0.06) * 65, vista.y + Math.sin(this.time * 0.06) * 45);
        this.input.endFrame();
        return;
      }
    }

    if (this.state === 'playing') {
      this.playT += dt;
      if (this.input.justPressed('KeyE')) this.detonate();
      let aimAngle: number | null = null;
      if (this.input.fixedJoystick && this.input.touchActive) {
        aimAngle = this.input.joystickAngle;
      } else if ((this.mouseSteer || (!this.input.fixedJoystick && this.input.touchActive)) && this.viewW > 0) {
        const wx = this.input.mouseX - this.viewW / 2 + this.camera.x;
        const wy = this.input.mouseY - this.viewH / 2 + this.camera.y;
        const pp = this.player.body.translation();
        aimAngle = Math.atan2(wy - pp.y, wx - pp.x);
      }
      this.playerFrame = updatePlayer(this.player, this.input, dt, aimAngle, this.cheats && this.infiniteBoost);
      this.emitEngineTrail();
      const lungesUnlocked =
        this.gemsCollected >= this.gemCount * HUNTER_LUNGE_GEM_FRACTION;
      if (lungesUnlocked && this.lungeUnlockedAt < 0) {
        this.lungeUnlockedAt = this.playT;
      }
      for (const hunter of this.hunters) {
        if (!hunter.body.isEnabled()) continue;
        if (this.respawning(hunter)) {
          // Swallowed by a core: sit out the timer, parked and inert at spawn.
          hunter.body.resetForces(true);
          hunter.telegraph = 0;
          continue;
        }
        if (!hunter.collider.isEnabled()) {
          // Timer elapsed — re-materialize at the spawn corner, keeping its
          // lunge offset so it stays out of sync with the other hunter.
          hunter.collider.setEnabled(true);
          hunter.lungeTimer = HUNTER_LUNGE_PERIOD * (1 - hunter.lungePhase);
          const hp = hunter.body.translation();
          this.particles.burst(hp.x, hp.y, 30, 260, 0.9, 4, '#ff5050');
        }
        updateHunter(
          hunter,
          this.player,
          this.physics,
          this.playT,
          this.orbsCollected,
          lungesUnlocked,
          this.difficulty,
          this.wells,
          dt,
          this.navigation,
        );
        if (hunter.lureCommitUntil > this.playT && this.interceptAt < 0) {
          this.interceptAt = this.playT;
        }
      }
    } else {
      // Ships idle: clear any leftover forces so they just drift
      this.player.body.resetForces(true);
      for (const hunter of this.hunters) hunter.body.resetForces(true);
    }

    this.applyGravityWells();

    if (this.state === 'playing') this.attractPickups(dt);
    const incoming = this.player.body.linvel();
    this.impactSpeed = Math.hypot(incoming.x, incoming.y);
    this.physics.world.step(this.eventQueue);
    this.eventQueue.drainCollisionEvents((h1, h2, started) => {
      if (!started || this.state !== 'playing') return;
      const a = this.physics.byCollider.get(h1);
      const b = this.physics.byCollider.get(h2);
      if (!a || !b) return;
      this.handleContact(a, b);
      this.handleContact(b, a);
    });

    if (this.state === 'playing') {
      const p = this.player.body.translation();
      for (const landmark of this.landmarks) {
        if (!landmark.discovered && Math.hypot(p.x - landmark.x, p.y - landmark.y) < landmark.radius + 120) {
          landmark.discovered = true;
          this.discovery = landmark;
          this.discoveredAt = this.playT;
        }
      }
    }
    this.tickCloseCall(dt);
    this.particles.update(dt);
    const pos = this.player.body.translation();
    const vel = this.player.body.linvel();
    this.camera.follow(pos.x, pos.y, vel.x, vel.y, dt);
    this.input.endFrame();
  }

  /** A hunter counts as a close-call threat only when on the map and active. */
  private threatening(h: Hunter): boolean {
    return h.body.isEnabled() && !this.respawning(h) && h.stunnedUntil <= this.playT;
  }

  private tickCloseCall(dt: number): void {
    if (this.state !== 'playing' || !this.player.alive) {
      this.closeCallHunter = null;
      return;
    }
    this.closeCallCooldown = Math.max(0, this.closeCallCooldown - dt);
    const pp = this.player.body.translation();
    const distTo = (h: Hunter) => {
      const hp = h.body.translation();
      return Math.hypot(pp.x - hp.x, pp.y - hp.y);
    };

    if (!this.closeCallHunter) {
      if (this.closeCallCooldown > 0) return;
      // Arm against the nearest active hunter we've drawn dangerously close to.
      for (const hunter of this.hunters) {
        if (this.threatening(hunter) && distTo(hunter) < CLOSE_CALL_DIST) {
          this.closeCallHunter = hunter;
          break;
        }
      }
      return;
    }

    const hunter = this.closeCallHunter;
    if (!this.threatening(hunter)) {
      // The hunter we were threading got stunned or banished mid-pass — that's
      // not a clean escape, so cancel without awarding.
      this.closeCallHunter = null;
    } else if (distTo(hunter) > CLOSE_CALL_ESCAPE_DIST) {
      const bonus = Math.round(
        CLOSE_CALL_SCORE * this.player.mult * this.difficulty.scoreMultiplier,
      );
      this.score += bonus;
      this.totalCloseCallBonus += bonus;
      this.lastCloseCallAt = this.playT;
      this.lastCloseCallBonus = bonus;
      this.closeCallHunter = null;
      this.closeCallCooldown = CLOSE_CALL_COOLDOWN;
      const p = this.player.body.translation();
      this.particles.burst(p.x, p.y, 10, 220, 0.45, 3, '#ff9944');
    }
  }

  private applyGravityWells(): void {
    for (const a of this.asteroids) a.body.resetForces(true);
    const playing = this.state === 'playing';
    const hunterBodies = new Set(
      this.hunters
        .filter((h) => playing && h.body.isEnabled() && !this.respawning(h))
        .map((h) => h.body),
    );
    const bodies = [
      ...this.asteroids.map((a) => a.body),
      ...(playing ? [this.player.body] : []),
      ...hunterBodies,
    ];
    for (const body of bodies) {
      const p = body.translation();
      const isHunter = hunterBodies.has(body);
      const isPlayer = body === this.player.body;
      const isShip = isPlayer || isHunter;
      for (const well of this.wells) {
        const dx = well.x - p.x;
        const dy = well.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist < well.radius && dist > 1) {
          // Hunters resist a black hole's pull (so they can't be trapped, only
          // lured) but get SHOVED hard by white holes — a white hole is the
          // player's chase-breaker: dive through and the pursuer bounces off.
          const factor = !isHunter
            ? 1
            : well.polarity === 1
              ? WELL_HUNTER_FACTOR
              : WHITE_HOLE_HUNTER_REPEL;
          const accel =
            (WELL_PULL / Math.pow(Math.max(dist, WELL_MIN_DIST), WELL_FALLOFF)) *
            factor *
            (well.exit ? EXIT_WELL_STRENGTH * (1 + this.escapeGemTarget * GEM_THRUST_GAIN) / EXIT_REFERENCE_ENGINE : 1) *
            well.polarity *
            (well.polarity === -1 ? WHITE_HOLE_PUSH_FACTOR : 1);
          const f = (accel * body.mass()) / dist;
          body.addForce({ x: dx * f, y: dy * f }, true);

          // White-hole vortex slingshot — PLAYER ONLY. A tangential whirl on
          // top of the radial push; grazing it along the spin does net positive
          // work, so you leave faster. The hunter gets no boost from it, only
          // the hard radial bounce above, so a white hole pass opens distance.
          if (well.polarity === -1 && isPlayer && !well.exit) {
            const tanMag =
              (WHITE_HOLE_SWIRL * Math.abs(accel) * body.mass() * WHITE_HOLE_SWIRL_DIR) /
              dist;
            body.addForce({ x: dy * tanMag, y: -dx * tanMag }, true);
          }

          if (well.exit) {
            // Momentum dissipates in the repulsor field. No gem-count check,
            // velocity clamp or invisible lock: sustained thrust must win.
            const v = body.linvel();
            const drag = EXIT_FIELD_DRAG * Math.min(1, (well.radius - dist) / 150) * body.mass();
            body.addForce({ x: -v.x * drag, y: -v.y * drag }, true);
          }

          // Inside a black hole's bait band, ships hit heavy drag that bleeds
          // the speed keeping them clear of the core — coast and you spiral in,
          // so the slingshot pass demands constant boost to hold velocity.
          if (well.polarity === 1 && dist < WELL_BAIT_RADIUS && isShip) {
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
          if (this.shieldRemaining > 0) continue;
          if (this.player.shield) { this.activateShield(); continue; }
          this.player.hull = 0;
          this.particles.burst(pp.x, pp.y, 30, 220, 0.9, 4, '#c873ff');
          this.lose('destroyed');
          break;
        }
      }
    }
    // Despite resisting the pull, a hunter can still get dragged into a core
    // mid-chase. When that happens the singularity eats it: it vanishes for a
    // good while, handing the player a real breather, then re-materializes back
    // at its own spawn corner.
    if (this.state === 'playing') {
      for (const hunter of this.hunters) {
        if (!hunter.body.isEnabled()) continue;
        if (this.respawning(hunter)) continue;
        const hp = hunter.body.translation();
        for (const well of this.wells) {
          if (well.polarity !== 1) continue;
          if (Math.hypot(well.x - hp.x, well.y - hp.y) < WELL_CORE_RADIUS) {
            this.particles.burst(hp.x, hp.y, 34, 280, 0.9, 5, '#c873ff');
            this.particles.burst(hp.x, hp.y, 20, 200, 0.7, 4, '#ff5050');
            hunter.respawnAt = this.playT + HUNTER_BLACKHOLE_RESPAWN;
            hunter.stunnedUntil = hunter.respawnAt;
            // Pull it out of the world: no collisions, no forces, not drawn.
            hunter.collider.setEnabled(false);
            hunter.body.setLinvel({ x: 0, y: 0 }, true);
            hunter.body.resetForces(true);
            hunter.body.setTranslation(
              { x: hunter.spawnX, y: hunter.spawnY },
              true,
            );
            break;
          }
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
        let x = ppos.x < this.mapW / 2 ? this.mapW - 160 : 160;
        let y = 160;
        for (let tries = 0; tries < 40; tries++) {
          const cx = 180 + Math.random() * (this.mapW - 360);
          const cy = 180 + Math.random() * (this.mapH - 360);
          if (!outsideExit({ x: cx, y: cy }, this.mapW, this.mapH, asteroid.radius + 40)) continue;
          if (
            Math.hypot(cx - ppos.x, cy - ppos.y) > 600 &&
            this.wells.every((w) => Math.hypot(cx - w.x, cy - w.y) > w.radius + asteroid.radius) &&
            this.landmarks.every(l => l.structures.every(s => distanceToStructure({ x: cx, y: cy }, s) > asteroid.radius + 30))
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
    const n = (this.playerFrame.boosting ? 4 : 2) + Math.floor((this.player.engineMultiplier - 1) * 3);
    const color = this.playerFrame.boosting ? '#ffffff' : '#3fd6ff';
    for (let i = 0; i < n; i++) {
      this.particles.emit(
        pos.x - fx * 16 + (Math.random() - 0.5) * 6,
        pos.y - fy * 16 + (Math.random() - 0.5) * 6,
        vel.x * 0.3 - fx * 160 * this.player.engineMultiplier + (Math.random() - 0.5) * 50,
        vel.y * 0.3 - fy * 160 * this.player.engineMultiplier + (Math.random() - 0.5) * 50,
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
      else if (b.kind === 'hunter') this.resolveHunterTouch(b);
      else if (b.kind === 'asteroid') this.asteroidImpact(b);
      else if (b.kind === 'barrier') this.impactDamage(this.impactSpeed);
    } else if (a.kind === 'hunter' && b.kind === 'asteroid' && !b.fixed) {
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
      // Use equal impulse for equal-size rocks. Scaling by the struck body's
      // mass would erase the lighter ice material's response to this shove.
      const density = ASTEROID_MATERIALS[b.composition ?? 'rock'].density;
      const m = b.body.mass() / density;
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
        this.player.engineMultiplier += GEM_THRUST_GAIN * (pickup.bonus ? GEM_BONUS_MULT : 1);
        this.lastGemAt = this.playT;
        const n = pickup.bonus ? 20 : 10;
        this.particles.burst(pickup.x, pickup.y, n, 150, 0.5, 3, '#41ffe0');
        break;
      }
      case 'magnet':
        this.magnetUntil = Math.max(this.magnetUntil, this.playT + MAGNET_DURATION);
        this.particles.burst(pickup.x, pickup.y, 18, 180, 0.7, 4, '#f48ed5');
        break;
      case 'antimatter':
        this.antimatter++;
        this.particles.burst(pickup.x, pickup.y, 18, 140, 0.7, 4, '#ffb875');
        break;
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
    // Optional impact immunity: rocks still bounce physically, but never dent the hull or
    // burn the shield. Hunter contact stays lethal — handled elsewhere.
    if (this.cheats && this.impactImmunity) return;
    if (this.player.damageCooldown > 0) return;
    const pv = this.player.body.linvel();
    const av = asteroid.body.linvel();
    const relSpeed = Math.hypot(pv.x - av.x, pv.y - av.y);
    this.impactDamage(relSpeed);
  }

  private impactDamage(speed: number): void {
    if ((this.cheats && this.impactImmunity) || this.shieldRemaining > 0 || this.player.damageCooldown > 0) return;
    const dmg = Math.min(
      DAMAGE_MAX,
      (speed - DAMAGE_SPEED_THRESHOLD) * DAMAGE_SCALE,
    );
    if (dmg <= 0) return;
    this.player.damageCooldown = DAMAGE_COOLDOWN;
    if (this.player.shield) {
      this.activateShield();
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

  private resolveHunterTouch(hunter: Hunter): void {
    // A stunned hunter is harmless — ignore the touch entirely so it can't burn
    // the player's shield or end the run during its grace period.
    if (!hunter.body.isEnabled() || hunter.stunnedUntil > this.playT) return;
    if (this.player.shield || this.shieldRemaining > 0) {
      if (this.shieldRemaining <= 0) this.activateShield();
      hunter.stunnedUntil = this.playT + HUNTER_STUN;
      const hp = hunter.body.translation();
      const pp = this.player.body.translation();
      const dx = hp.x - pp.x;
      const dy = hp.y - pp.y;
      const d = Math.max(Math.hypot(dx, dy), 1);
      const m = hunter.body.mass();
      hunter.body.applyImpulse(
        { x: (dx / d) * 700 * m, y: (dy / d) * 700 * m },
        true,
      );
      this.camera.addShake(14);
      this.particles.burst(pp.x, pp.y, 26, 320, 0.7, 4, '#6699ff');
    } else {
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
    // Cheated runs never touch the high score.
    this.isNewHighScore = this.cheatsUsed ? false : saveHighScore(this.score);
    if (this.isNewHighScore) this.highScore = this.score;
  }

  private win(): void {
    this.state = 'win';
    const sm = this.difficulty.scoreMultiplier;
    // Split banked score into gem points vs close-call bonuses for the breakdown
    const closeCalls = this.totalCloseCallBonus;
    const gems = this.score - closeCalls;
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
    this.score = this.score + escapeBonus + hullBonus + boostBonus;
    this.winBreakdown = {
      gems,
      closeCalls,
      escapeBonus,
      hullBonus,
      boostBonus,
      total: this.score,
    };
    // Cheated runs never touch the high score.
    this.isNewHighScore = this.cheatsUsed ? false : saveHighScore(this.score);
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
