// Real Rapier escape regressions. Remove pursuit/loose rocks to isolate geometry
// and engine-vs-field physics; do not refill boost or fake the win condition.
import assert from 'node:assert/strict';
import { build } from 'vite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
globalThis.window = new EventTarget(); globalThis.document = new EventTarget(); globalThis.Element = class {};
globalThis.Image = class {};
globalThis.localStorage = { getItem: () => null, setItem() {} };
const temp = await mkdtemp(join(tmpdir(), 'sinv-escape-'));
try {
  await build({ configFile: false, logLevel: 'silent', publicDir: false, build: { outDir: temp, lib: { entry: 'scripts/test-entry.ts', formats: ['es'], fileName: () => 'test.mjs' } } });
  const { Game, RAPIER, DIFFICULTIES, createPickup, createHunter, hunterMaxSpeed, runCheatCommand, PhysicsContext, Navigation, createPlayer, updatePlayer, updateHunter, PLAYER_ACCEL, PLAYER_DAMPING, GEM_THRUST_GAIN } = await import(pathToFileURL(join(temp, 'test.mjs')));
  await RAPIER.init();
  assert.equal(hunterMaxSpeed(0, 0, 1, 0.8), hunterMaxSpeed(0, 0, 1), 'Normal starting speed is unchanged');
  assert.ok(hunterMaxSpeed(150, 0, 1, 0.8) > hunterMaxSpeed(0, 0, 1, 0.8), 'hunter still accelerates with time');
  assert.ok(hunterMaxSpeed(150, 0, 1, 0.8) < hunterMaxSpeed(150, 0, 1), 'Normal late-run acceleration is eased');
  // Real open-space pursuit: ordinary thrust cannot permanently escape an
  // endgame hunter, but a fuel-limited boost still creates breathing room.
  for (const difficulty of DIFFICULTIES.slice(1)) {
    for (const gems of [difficulty.escapeGems ?? difficulty.gemCount, 120]) {
      for (const boost of [false, true]) {
        const physics = new PhysicsContext();
        const player = createPlayer(physics, 1000, 1000);
        const hunter = createHunter(physics, 650, 1000);
        player.engineMultiplier = 1 + gems * GEM_THRUST_GAIN;
        const cruise = PLAYER_ACCEL / PLAYER_DAMPING * player.engineMultiplier;
        player.body.setLinvel({ x: cruise, y: 0 }, true);
        hunter.body.setLinvel({ x: cruise, y: 0 }, true);
        const nav = new Navigation(40000, 2000, []);
        const input = { turn: 0, thrust: true, boost, reverse: false };
        let caught = false, gap = 350;
        for (let frame = 0; frame < (boost ? 150 : 900); frame++) {
          updatePlayer(player, input, 1 / 60);
          updateHunter(hunter, player, physics, 150 + frame / 60, 0, false, difficulty, [], 1 / 60, nav);
          physics.world.step();
          gap = player.body.translation().x - hunter.body.translation().x;
          if (gap < 31) { caught = true; break; }
        }
        if (boost) {
          assert.ok(!caught && gap > 450, `${difficulty.name}/${gems}: a boost tank must open a gap (${gap})`);
          assert.ok(player.boostFuel < 11, 'escape uses real boost fuel');
        } else {
          assert.ok(caught, `${difficulty.name}/${gems}: hunter must close on cruising endgame prey (${gap})`);
        }
        physics.free();
      }
    }
  }
  console.log('PASS: endgame hunters catch sustained cruise; finite boost opens a gap on Normal, Hard and Extreme, including surplus upgrades.');
  const game = new Game();
  const controls = { thrust: true, boost: true };
  Object.defineProperties(game.input, {
    thrust: { get: () => controls.thrust }, boost: { get: () => controls.boost },
    turn: { get: () => 0 }, reverse: { get: () => false },
  });
  function setup(difficulty = 1, gems = 0) {
    game.difficultyIndex = difficulty; game.reset(42); game.state = 'playing';
    game.mouseSteer = false; game.cheatsUsed = true;
    for (const h of game.hunters) game.physics.world.removeRigidBody(h.body); game.hunters = [];
    for (const a of game.asteroids) game.physics.world.removeRigidBody(a.body); game.asteroids = [];
    game.player.body.setTranslation({ x: game.gate.layout.barrier.x - 150, y: game.gate.y }, true);
    game.player.body.setRotation(0, true);
    // Use the production pickup path, including duplicate-contact protection.
    for (const gem of game.pickups.filter(p => p.type === 'gem').slice(0, gems)) { gem.bonus = false; game.consumePickup(gem); }
    controls.thrust = true; controls.boost = true;
  }
  // Sample the actual applied forces at the prize arc, with pursuit isolated.
  setup();
  const turbulenceWell = { x: 2000, y: 2000, radius: 460, polarity: 1 };
  game.wells = [turbulenceWell];
  function sampleField(time, distance = 300) {
    game.playT = time;
    game.player.body.setTranslation({ x: 2000 + distance, y: 2000 }, true);
    game.player.body.resetForces(true);
    game.applyGravityWells();
    const f = game.player.body.userForce(), mass = game.player.body.mass();
    return { x: f.x / mass, y: f.y / mass };
  }
  game.player.body.setLinvel({ x: 0, y: 400 }, true);
  const samples = Array.from({ length: 121 }, (_, i) => sampleField(i / 10));
  assert.deepEqual(sampleField(0), samples[0], 'same seed and simulation time reproduce the field');
  const steadyPull = 700000 / Math.pow(300, 1.4);
  assert.ok(samples.every(f => f.x <= -steadyPull && f.y < 0), 'surges never weaken gravity and orbital drag always removes energy');
  game.player.body.setLinvel({ x: 0, y: -400 }, true);
  assert.ok(sampleField(0).y > 0, 'reverse orbits also lose speed');
  game.player.body.setLinvel({ x: -400, y: 0 }, true);
  assert.equal(sampleField(0).y, 0, 'radial falls receive no sideways kick');
  game.player.body.setLinvel({ x: 0, y: 400 }, true);
  assert.ok(Math.max(...samples.map(f => f.x)) - Math.min(...samples.map(f => f.x)) > 40,
    'a fixed orbit cannot rely on constant radial pull');
  const gustBefore = sampleField(1.4 - 0.00001), gustAfter = sampleField(1.4 + 0.00001);
  assert.ok(Math.hypot(gustBefore.x - gustAfter.x, gustBefore.y - gustAfter.y) < 0.1, 'gust transitions are smooth');
  const rim = sampleField(3, 459.99);
  assert.ok(Math.abs(rim.y) < 0.01, 'turbulence fades at the rim');
  game.seed = 43;
  assert.notDeepEqual(sampleField(0), samples[0], 'different runs have different currents');
  turbulenceWell.polarity = -1;
  assert.deepEqual(sampleField(0), sampleField(5), 'white-hole slingshots remain steady');
  // Compare a circular orbit in the original steady field against production
  // turbulence. Disable ordinary ship damping to isolate the field's effect.
  for (const seed of [0, 1, 7, 19, 42, 100, 999, 12345]) {
    for (const direction of [-1, 1]) {
      for (const turbulent of [false, true]) {
        setup(); game.seed = seed; game.wells = [{ ...turbulenceWell, polarity: 1 }];
        const body = game.player.body;
        body.setLinearDamping(0);
        body.setTranslation({ x: 2300, y: 2000 }, true);
        body.setLinvel({ x: 0, y: direction * Math.sqrt(steadyPull * 300) }, true);
        let swallowed = false;
        for (let frame = 0; frame < 600; frame++) {
          game.playT = frame / 60;
          body.resetForces(true);
          if (turbulent) game.applyGravityWells();
          else {
            const p = body.translation(), dx = 2000 - p.x, dy = 2000 - p.y;
            const r = Math.hypot(dx, dy), f = 700000 / Math.pow(r, 1.4) * body.mass() / r;
            body.addForce({ x: dx * f, y: dy * f }, true);
          }
          game.physics.world.step();
          const p = body.translation();
          if (Math.hypot(p.x - 2000, p.y - 2000) < 70) { swallowed = true; break; }
        }
        assert.equal(swallowed, turbulent, `seed ${seed}, orbit ${direction}: only turbulent field must consume an uncorrected orbit`);
      }
    }
    setup(); game.seed = seed; game.wells = [{ ...turbulenceWell, polarity: 1 }];
    game.player.body.setTranslation({ x: 2300, y: 2000 }, true);
    game.player.body.setRotation(0, true);
    for (let frame = 0; frame < 120; frame++) {
      game.playT = frame / 60;
      updatePlayer(game.player, { turn: 0, thrust: true, boost: true, reverse: false }, 1 / 60);
      game.applyGravityWells(); game.physics.world.step();
    }
    assert.ok(game.player.body.translation().x > 2460, `seed ${seed}: prompt outward boost escapes the prize arc`);
  }
  console.log('PASS: surges never weaken pull; orbital drag consumes both orbit directions across 8 seeds while prompt boost still escapes.');
  setup();
  const small = createPickup(game.physics, 'gem', 0, 0, 0, false);
  const big = createPickup(game.physics, 'gem', 0, 0, 0, true);
  game.consumePickup(small); assert.equal(game.thrustGems, 1);
  game.consumePickup(big); assert.equal(game.thrustGems, 4);
  game.consumePickup(big); assert.equal(game.thrustGems, 4, 'duplicate big-gem contact grants nothing');
  assert.equal(game.gemsCollected, 2, 'physical collection count remains separate from power');
  assert.match(runCheatCommand(game, 'gems 54'), /Enable cheat/);
  assert.equal(game.thrustGems, 4, 'commands cannot mutate a clean run');
  game.cheats = true;
  assert.match(runCheatCommand(game, 'gems 54'), /OK/); assert.equal(game.thrustGems, 54);
  runCheatCommand(game, 'gems NaN'); assert.equal(game.thrustGems, 54);
  runCheatCommand(game, 'magnet 100');
  const longMagnetExpiry = game.magnetUntil;
  game.playT += 2;
  game.consumePickup(createPickup(game.physics, 'magnet', 0, 0, 0));
  assert.equal(game.magnetUntil, longMagnetExpiry, 'magnet pickup preserves longer cheat duration');
  runCheatCommand(game, 'antimatter 5'); assert.equal(game.antimatter, 5);
  runCheatCommand(game, 'shield'); assert.equal(game.player.shield, true);
  runCheatCommand(game, 'tp exit');
  assert.ok(Math.abs(game.player.body.translation().x - game.gate.layout.mouth.x) < 0.01);
  assert.equal(game.cheatsUsed, true);
  setup(3); game.cheats = true;
  const testHunter = createHunter(game.physics, 100, 100); game.hunters.push(testHunter);
  runCheatCommand(game, 'hunters off'); assert.equal(testHunter.body.isEnabled(), false);
  const hunterPosition = testHunter.body.translation();
  game.wells = [{ x: hunterPosition.x, y: hunterPosition.y, radius: 600, polarity: 1 }];
  const respawnBefore = testHunter.respawnAt;
  for (let i = 0; i < 10; i++) game.fixedUpdate(1 / 60);
  assert.equal(testHunter.respawnAt, respawnBefore, 'disabled hunter is not swallowed by a core');
  assert.deepEqual(testHunter.body.translation(), hunterPosition, 'disabled hunter does not move');
  testHunter.stunnedUntil = game.playT + 2;
  runCheatCommand(game, 'hunters on'); assert.equal(testHunter.body.isEnabled(), true);
  assert.equal(testHunter.stunnedUntil, game.playT + 2, 'reenabling hunters preserves a real shield stun');
  setup(); game.cheats = true;
  assert.equal(game.infiniteBoost, false); assert.equal(game.impactImmunity, false);
  game.impactDamage(1000); assert.ok(game.player.hull < 100, 'console access alone does not prevent damage');
  game.player.hull = 100; game.player.damageCooldown = 0;
  runCheatCommand(game, 'impact-immunity on'); game.impactDamage(1000);
  assert.equal(game.player.hull, 100, 'impact immunity independently blocks rocks');
  game.player.boostFuel = 50; game.fixedUpdate(1 / 60);
  assert.ok(game.player.boostFuel < 50, 'impact immunity does not grant infinite boost');
  runCheatCommand(game, 'impact-immunity off');
  runCheatCommand(game, 'infinite-boost on'); game.fixedUpdate(1 / 60);
  assert.equal(game.player.boostFuel, 100);
  game.player.damageCooldown = 0; game.impactDamage(1000);
  assert.ok(game.player.hull < 100, 'infinite boost does not prevent damage');
  runCheatCommand(game, 'infinite-boost off'); game.fixedUpdate(1 / 60);
  assert.ok(game.player.boostFuel < 100, 'fuel drains again when disabled');
  runCheatCommand(game, 'infinite-boost nonsense'); assert.equal(game.infiniteBoost, false);
  game.infiniteBoost = true; game.impactImmunity = true; game.reset(42);
  assert.equal(game.infiniteBoost, false); assert.equal(game.impactImmunity, false);
  setup(); controls.thrust = false;
  assert.equal(game.noGravity, false, 'player gravity starts enabled');
  assert.match(runCheatCommand(game, 'gravity off'), /Enable cheat/);
  assert.equal(game.noGravity, false, 'gravity override requires cheat mode');
  game.cheats = true;
  for (const field of [{ polarity: 1 }, { polarity: -1 }, { polarity: -1, exit: true }]) {
    const p = game.player.body.translation();
    game.wells = [{ x: p.x + 120, y: p.y, radius: 500, ...field }];
    const hunter = createHunter(game.physics, p.x, p.y + 100);
    game.hunters = [hunter];
    game.player.body.setLinvel({ x: 10, y: 20 }, true);
    runCheatCommand(game, 'gravity off');
    assert.match(runCheatCommand(game, 'status'), /player gravity off/);
    assert.match(runCheatCommand(game, 'gravity invalid'), /Usage: gravity on\|off/);
    assert.equal(game.noGravity, true, 'invalid command preserves setting');
    game.player.body.resetForces(true);
    game.player.body.addForce({ x: 7, y: 9 }, true);
    game.applyGravityWells();
    assert.deepEqual({ ...game.player.body.userForce() }, { x: 7, y: 9 }, 'gravity off preserves thrust without adding field forces');
    assert.ok(Math.hypot(...Object.values(hunter.body.userForce())) > 0, 'hunter still feels gravity');
    runCheatCommand(game, 'gravity on');
    game.player.body.resetForces(true); game.applyGravityWells();
    assert.ok(Math.hypot(...Object.values(game.player.body.userForce())) > 0, 'gravity on restores field forces');
    runCheatCommand(game, 'gravity off'); game.cheats = false;
    game.player.body.resetForces(true); game.applyGravityWells();
    assert.ok(Math.hypot(...Object.values(game.player.body.userForce())) > 0, 'leaving cheat mode restores gravity');
    game.cheats = true;
    game.physics.world.removeRigidBody(hunter.body); game.hunters = [];
  }
  game.reset(42);
  assert.equal(game.noGravity, false, 'new run restores player gravity');
  setup(); controls.thrust = false;
  const pressRestart = () => {
    const event = new Event('keydown'); Object.assign(event, { code: 'KeyR', key: 'r', repeat: false });
    window.dispatchEvent(event); game.fixedUpdate(1 / 60);
    const up = new Event('keyup'); Object.assign(up, { code: 'KeyR' }); window.dispatchEvent(up);
  };
  const activeRun = game.runId; pressRestart();
  assert.equal(game.runId, activeRun, 'R cannot accidentally restart active flight');
  for (const state of ['paused', 'gameover', 'win']) {
    game.state = state; const previousRun = game.runId; pressRestart();
    assert.equal(game.runId, previousRun + 1, `R restarts from ${state}`);
  }
  console.log('PASS: big-gem triple thrust, duplicate contacts, validated cheat commands and hunter toggle.');
  function open(charges = 5) {
    game.antimatter = charges;
    for (let i = 0; i < charges; i++) assert.equal(game.detonate(), true);
  }
  function fly(seconds = 25) {
    let maxX = -Infinity;
    for (let i = 0; i < seconds * 60 && game.state === 'playing'; i++) {
      game.fixedUpdate(1 / 60);
      maxX = Math.max(maxX, game.player.body.translation().x);
    }
    return maxX;
  }

  setup(1, 60);
  for (const chunk of game.gate.chunks) {
    const v = chunk.shape.verts, turns = [];
    assert.ok(v.length >= 8, 'barrier rocks have at least four sides, never triangular tiles');
    for (let i = 0; i < v.length; i += 2) {
      const j = (i + 2) % v.length, k = (i + 4) % v.length;
      turns.push((v[j]-v[i])*(v[k+1]-v[j+1])-(v[j+1]-v[i+1])*(v[k]-v[j]));
    }
    assert.ok(turns.every(t => t > 0), 'rock outlines remain convex and match Rapier hulls exactly');
  }
  const initialColliders = game.physics.world.colliders.len();
  game.antimatter = 6;
  game.state = 'paused'; assert.equal(game.detonate(), false); assert.equal(game.antimatter, 6);
  game.state = 'playing'; game.player.body.setTranslation(game.gate.layout.mouth, true);
  assert.equal(game.detonate(), false, 'out-of-range charges are never consumed');
  game.player.body.setTranslation({ x: game.gate.layout.barrier.x - 150, y: game.gate.y }, true);
  for (const [i, removed] of [4, 8, 12, 36, 60].entries()) {
    assert.equal(game.detonate(), true);
    assert.equal(game.physics.world.colliders.len(), initialColliders - removed);
    assert.equal(game.gate.chunks.filter(c => c.destroyedAt >= 0).length, removed);
    assert.equal(game.antimatter, 5 - i);
  }
  assert.equal(game.detonate(), false, 'fully clear barrier does not waste capsules');
  assert.equal(game.antimatter, 1);
  game.player.body.setTranslation(game.gate.layout.mouth, true);
  assert.equal(game.gate.blasts, 5, 'retreat preserves the breach');
  game.reset(42);
  assert.equal(game.gate.blasts, 0); assert.equal(game.antimatter, 0);
  assert.equal(game.player.engineMultiplier, 1);
  assert.ok(game.gate.chunks.every(c => c.destroyedAt === -1));

  for (let difficulty = 0; difficulty < DIFFICULTIES.length; difficulty++) {
    const recommended = DIFFICULTIES[difficulty].escapeGems ?? DIFFICULTIES[difficulty].gemCount;
    setup(difficulty, recommended); open(3); fly();
    assert.equal(game.state, 'win', `${DIFFICULTIES[difficulty].name}: recommended engine fits the narrow breach`);
    setup(difficulty, Math.floor(recommended / 2)); open(); fly();
    assert.equal(game.state, 'playing', 'half preparation cannot overcome the field with the normal tank');
    setup(difficulty, recommended); open(); fly();
    assert.equal(game.state, 'win', 'recommended engine overcomes actual white-hole forces');
    const preparedTime = game.playT;
    setup(difficulty, Math.floor(recommended * 1.4)); open(); fly();
    assert.equal(game.state, 'win'); assert.ok(game.playT < preparedTime, 'surplus gems ease the crossing');
    console.log(`PASS: ${DIFFICULTIES[difficulty].name} narrow/wide passage, underpowered rejection, surplus-gem benefit.`);
  }

  setup(); game.antimatter = 3; controls.thrust = false;
  const pressE = () => {
    const event = new Event('keydown'); Object.assign(event, { code: 'KeyE', key: 'e', repeat: false });
    window.dispatchEvent(event);
  };
  pressE(); game.fixedUpdate(1 / 60);
  assert.equal(game.gate.blasts, 1, 'E detonates through the production input path');
  game.fixedUpdate(1 / 60);
  assert.equal(game.gate.blasts, 1, 'holding E does not spend more charges');
  const release = new Event('keyup'); Object.assign(release, { code: 'KeyE' }); window.dispatchEvent(release);
  pressE(); game.fixedUpdate(1 / 60);
  assert.equal(game.gate.blasts, 2, 'a second press widens the breach');

  assert.equal(game.gate.chunks.length, 60, 'barrier is a field of individual shards');
  for (const charges of [1, 2]) for (const offset of [-100, -45, 0, 45, 100]) {
    setup(1, 84); open(charges);
    game.player.body.setTranslation({ x: game.gate.layout.barrier.x - 150, y: game.gate.y + offset }, true);
    game.player.body.setLinvel({ x: 1600, y: 0 }, true);
    assert.ok(fly(5) < game.gate.layout.barrier.x + 65, 'one or two blasts leave a physical blockage, even at high speed');
  }

  // Full-throttle, high-speed run-up at center and near either corridor edge.
  // 2200 exceeds the base engine's sustainable boosted speed by over 2x.
  for (const offset of [-100, 0, 100]) {
    setup(); open();
    game.player.body.setTranslation({ x: game.gate.layout.mouth.x, y: game.gate.y + offset }, true);
    game.player.body.setLinvel({ x: 2200, y: 0 }, true);
    fly(); assert.equal(game.state, 'playing', 'run-up speed cannot substitute for engine upgrades');
  }
  setup(1, 60); open(); controls.thrust = false; controls.boost = false;
  game.player.body.setLinvel({ x: 2200, y: 0 }, true);
  fly(); assert.equal(game.state, 'playing', 'coasting cannot cross the repulsion field');

  // Strong engine cannot penetrate the intact barrier, or closed side/rear walls.
  setup(1, 84); const b = game.gate.layout.barrier;
  assert.ok(fly(10) < b.x - 24, 'solid barrier blocks the strongest engine');
  for (const side of [-1, 1]) {
    setup(1, 84); open();
    game.player.body.setTranslation({ x: game.gate.x, y: game.gate.y + side * 250 }, true);
    game.player.body.setRotation(-side * Math.PI / 2, true);
    game.player.body.setLinvel({ x: 0, y: -side * 1800 }, true);
    fly(4); assert.equal(game.state, 'playing', 'side walls cannot be bypassed');
  }
  setup(1, 84); open();
  game.player.body.setTranslation({ x: game.gate.x + 190, y: game.gate.y }, true);
  game.player.body.setRotation(Math.PI, true); game.player.body.setLinvel({ x: -1800, y: 0 }, true);
  fly(4); assert.equal(game.state, 'playing', 'rear wall cannot be bypassed');

  // Three charges cut a narrow tunnel; four clear its shoulders.
  for (const charges of [3, 4]) {
    setup(1, 60); open(charges);
    game.player.body.setTranslation({ x: game.gate.layout.barrier.x - 150, y: game.gate.y + 45 }, true);
    const max = fly(3);
    assert.equal(max > game.gate.layout.barrier.x + 25, charges === 4, 'more antimatter physically widens the flying tolerance');
  }
  console.log('PASS: capsule conservation, persistent damage/reset, high-speed and coasting rejection, sealed barrier, side/rear walls, wider breach tolerance.');
  setup(); controls.thrust = false; game.wells = [];
  const origin = { x: game.gate.layout.mouth.x - 180, y: game.gate.y };
  game.player.body.setTranslation(origin, true);
  const add = (type, dx, dy = 0) => {
    const p = createPickup(game.physics, type, origin.x + dx, origin.y + dy, 0);
    game.pickups.push(p); return p;
  };
  const magnet = add('magnet', 0), nearby = add('gem', 150), far = add('gem', 300);
  const attracted = ['antimatter', 'orb', 'shield', 'boost', 'magnet'].map((type, i) => add(type, 100, 70 + i * 20));
  
  game.fixedUpdate(1 / 60);
  assert.equal(magnet.taken, true, 'magnet capsule collected through actual contact');
  assert.ok(game.magnetRemaining > 11.9);
  game.fixedUpdate(1 / 60);
  assert.ok(nearby.x < origin.x + 150, 'nearby pickup is physically attracted');
  const firstPull = origin.x + 150 - nearby.x;
  assert.ok(firstPull < 0.2, 'attraction starts gently instead of jumping to cruising speed');
  const firstX = nearby.x;
  game.fixedUpdate(1 / 60);
  assert.ok(firstX - nearby.x > firstPull * 2, 'successive frames build speed under the magnetic force');
  assert.equal(far.x, origin.x + 300, 'out-of-range pickup stays still');
  for (let i = 0; i < 60; i++) game.fixedUpdate(1 / 60);
  assert.equal(nearby.taken, true, 'attracted gem collects via its moving sensor');
  attracted.forEach(p => assert.equal(p.taken, true, `${p.type} is attracted and collected`));
  const count = game.gemsCollected;
  game.fixedUpdate(1 / 60); assert.equal(game.gemsCollected, count, 'taken pickups never collect twice');
  game.state = 'paused'; const remaining = game.magnetRemaining;
  game.fixedUpdate(1 / 60); assert.equal(game.magnetRemaining, remaining, 'pause freezes magnetism');
  game.state = 'playing';
  game.consumePickup(add('magnet', 0));
  assert.equal(game.magnetRemaining, 12, 'second capsule refreshes instead of stacking duration');
  const stopped = add('gem', 150);
  game.attractPickups(1 / 60);
  assert.ok(stopped.magnetVx < 0, 'an attracted pickup accumulates momentum');
  const before = stopped.x;
  game.playT = game.magnetUntil;
  game.fixedUpdate(1 / 60); assert.equal(stopped.x, before, 'attraction stops when the skill expires');
  assert.equal(stopped.magnetVx, 0, 'expiry clears accumulated momentum');

  game.magnetUntil = game.playT + 12;
  const turning = add('gem', 180);
  for (let i = 0; i < 10; i++) game.attractPickups(1 / 60);
  const turningX = turning.x;
  game.player.body.setTranslation({ x: turning.x, y: turning.y + 100 }, true);
  game.attractPickups(1 / 60);
  assert.ok(turning.x < turningX && turning.y > origin.y, 'momentum curves toward a moving ship instead of instantly changing direction');
  game.player.body.setTranslation({ x: turning.x + 300, y: turning.y }, true);
  const released = { x: turning.x, y: turning.y };
  game.attractPickups(1 / 60);
  assert.deepEqual({ x: turning.x, y: turning.y }, released, 'leaving the field stops attraction');
  assert.equal(Math.hypot(turning.magnetVx, turning.magnetVy), 0, 'leaving the field clears momentum');

  // A pickup across a corridor wall is in range but must remain unreachable.
  setup(); controls.thrust = false; game.wells = [];
  const ship = { x: game.gate.layout.barrier.x - 150, y: game.gate.y - 100 };
  game.player.body.setTranslation(ship, true); game.magnetUntil = 12;
  const blocked = createPickup(game.physics, 'gem', ship.x, game.gate.y - 240, 0);
  game.pickups.push(blocked); const blockedY = blocked.y;
  for (let i = 0; i < 60; i++) game.fixedUpdate(1 / 60);
  assert.equal(blocked.y, blockedY, 'magnetism cannot pull rewards through solid terrain');
  game.reset(42); assert.equal(game.magnetRemaining, 0, 'restart clears magnetism');
  console.log('PASS: magnet capsule contacts, range, sensor collection, duplicate protection, pause, refresh, expiry, wall occlusion and reset.');
  // Use an actual Binary reward: the magnet must not extract its triple
  // upgrade from outside the well, but a close pass still gets assistance.
  setup(); controls.thrust = false;
  const dangerGem = game.pickups.find(p => p.type === 'gem' && p.bonus);
  assert.ok(dangerGem, 'generated Binary contains danger gems');
  const well = game.wells.find(w => w.polarity === 1 && Math.hypot(w.x - dangerGem.x, w.y - dangerGem.y) < w.radius);
  assert.ok(well);
  const gemStart = { x: dangerGem.x, y: dangerGem.y };
  const gemRadius = Math.hypot(dangerGem.x - well.x, dangerGem.y - well.y);
  const outward = { x: (dangerGem.x - well.x) / gemRadius, y: (dangerGem.y - well.y) / gemRadius };
  const placeOutsideGem = distance => game.player.body.setTranslation({ x: gemStart.x + outward.x * distance, y: gemStart.y + outward.y * distance }, true);
  game.magnetUntil = game.playT + 12;
  placeOutsideGem(well.radius + 10 - gemRadius);
  for (let i = 0; i < 120; i++) game.attractPickups(1 / 60);
  assert.deepEqual({ x: dangerGem.x, y: dangerGem.y }, gemStart, 'safe rim cannot vacuum a danger gem out of the Binary');
  placeOutsideGem(81);
  game.attractPickups(1 / 60);
  assert.deepEqual({ x: dangerGem.x, y: dangerGem.y }, gemStart, 'big-gem attraction requires the inner magnet ring');
  placeOutsideGem(70);
  const thrustBeforeClosePass = game.player.engineMultiplier;
  for (let i = 0; i < 30; i++) game.fixedUpdate(1 / 60);
  assert.equal(dangerGem.taken, true, 'close-pass magnet assistance collects through the real sensor');
  assert.ok(game.player.engineMultiplier >= thrustBeforeClosePass + 3 * GEM_THRUST_GAIN - 1e-10, 'assisted danger gems retain their full triple reward');
  console.log('PASS: Binary danger gems resist safe-rim extraction and retain close-pass magnet assistance and triple thrust.');
  setup(); controls.thrust = false; game.wells = [];
  const shardX = game.gate.layout.barrier.x;
  game.player.body.setTranslation({ x: shardX - 170, y: game.gate.y }, true);
  game.player.body.setLinvel({ x: 700, y: 0 }, true);
  for (let i = 0; i < 12; i++) game.fixedUpdate(1 / 60);
  assert.ok(game.player.hull < 100 && game.player.hull >= 60, 'real shard contact damages hull once under shared cooldown');
  setup(); controls.thrust = false; game.wells = []; game.player.shield = true;
  game.player.body.setTranslation({ x: game.gate.layout.barrier.x - 170, y: game.gate.y }, true);
  game.player.body.setLinvel({ x: 700, y: 0 }, true);
  for (let i = 0; i < 12; i++) game.fixedUpdate(1 / 60);
  assert.equal(game.player.hull, 100); assert.equal(game.player.shield, false, 'shield absorbs a shard impact');
  assert.ok(game.shieldRemaining > 0.7 && game.shieldRemaining <= 1, 'shard impact triggers a one-second protection window');
  game.player.damageCooldown = 0;
  game.impactDamage(1000); assert.equal(game.player.hull, 100, 'another shard cannot damage an active shield window');
  game.state = 'paused'; const shieldTime = game.shieldRemaining;
  game.fixedUpdate(1 / 60); assert.equal(game.shieldRemaining, shieldTime, 'pause freezes invulnerability');
  game.state = 'playing';
  game.consumePickup(createPickup(game.physics, 'shield', 0, 0, 0));
  game.impactDamage(1000); assert.equal(game.player.shield, true, 'new shield is saved during active protection');
  game.playT = game.shieldUntil + 0.01; game.impactDamage(1000);
  assert.equal(game.player.shield, false); assert.ok(Math.abs(game.shieldRemaining - 1) < 1e-9, 'saved shield grants a fresh one-second window on the next hit');
  game.playT = game.shieldUntil + 0.5; game.player.damageCooldown = 0;
  game.impactDamage(1000); assert.ok(game.player.hull < 100, 'damage resumes after expiry');

  setup(3); controls.thrust = false; game.wells = []; game.player.shield = true;
  const pp = game.player.body.translation();
  game.hunters = [createHunter(game.physics, pp.x + 25, pp.y), createHunter(game.physics, pp.x - 25, pp.y)];
  game.fixedUpdate(1 / 60);
  assert.equal(game.state, 'playing', 'two simultaneous Extreme hunter contacts cannot bypass the shield');
  assert.equal(game.player.hull, 100); assert.equal(game.player.shield, false);
  assert.ok(game.hunters.every(h => h.stunnedUntil > game.playT), 'both hunters are repelled and stunned');
  game.player.damageCooldown = 0; game.impactDamage(1000);
  assert.equal(game.player.hull, 100, 'shards cannot finish a player just hit by a hunter');
  game.playT = game.shieldUntil + 0.01; game.hunters[0].stunnedUntil = 0;
  game.resolveHunterTouch(game.hunters[0]); assert.equal(game.state, 'gameover', 'hunter contact is lethal again after protection expires');
  setup(); controls.thrust = false; game.player.shield = true;
  const core = game.wells.find(w => w.polarity === 1);
  game.player.body.setTranslation(core, true); game.fixedUpdate(1 / 60);
  assert.equal(game.state, 'playing'); assert.ok(game.shieldRemaining > 0, 'core damage also triggers protection');
  game.playT = game.shieldUntil + 0.01; game.player.body.setTranslation(core, true);
  game.fixedUpdate(1 / 60); assert.equal(game.state, 'gameover', 'remaining in a core after expiry is lethal');
  game.reset(42); assert.equal(game.shieldRemaining, 0, 'restart clears invulnerability');
  console.log('PASS: shield invulnerability across simultaneous hunters, repeated shards and cores; pause, expiry, rearming and reset.');
  game.physics.free();
} finally { await rm(temp, { recursive: true, force: true }); }
