import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';

const temp = await mkdtemp(join(tmpdir(), 'sinv-test-'));
globalThis.window = new EventTarget();
globalThis.document = new EventTarget();
globalThis.Element = class {};
globalThis.Image = class { complete = true; naturalWidth = 1536; naturalHeight = 1024; };
const saved = new Map();
globalThis.localStorage = { getItem: k => saved.get(k) ?? null, setItem: (k, v) => saved.set(k, v) };
try {
  await build({ configFile: false, logLevel: 'silent', publicDir: false, build: { outDir: temp, lib: { entry: 'scripts/test-entry.ts', formats: ['es'], fileName: () => 'world.mjs' } } });
  const { FrameStats, generateWorld, distanceToStructure, DIFFICULTIES, Game, RAPIER, exitLayout, outsideExit, Navigation, PhysicsContext, createWalls, createStructure, createAsteroid, createHunter, updateHunter, createPlayer, drawStarfield, drawLandmark, drawExitStructure, drawSectorMap, readSaved, writeSaved } = await import(pathToFileURL(join(temp, 'world.mjs')));
  const stats = new FrameStats();
  assert.equal(stats.sample(0), null);
  for (let i = 1; i < 60; i++) assert.equal(stats.sample(i * 1000 / 60), null);
  assert.equal(stats.sample(1000), '60 FPS · max 16.7 ms');
  stats.reset();
  assert.equal(stats.sample(100000), null, 'background time is excluded after reset');
  for (let i = 1; i < 120; i++) stats.sample(100000 + i * 1000 / 120);
  assert.equal(stats.sample(101000), '120 FPS · max 8.3 ms');
  assert.equal(stats.sample(102000), '1 FPS · max 1000.0 ms', 'foreground stalls remain visible');
  console.log('PASS: FPS counts real frame intervals at 60/120 Hz, reports stalls and resets after backgrounding.');
  const seen = new Set(), combinations = new Set(), navigationFixtures = new Map();
  const count = Number(process.env.SINV_TEST_SEEDS ?? 100);
  for (const difficulty of DIFFICULTIES) {
    for (let seed = 0; seed < count; seed++) {
      const layout = generateWorld(seed, difficulty);
      assert.deepEqual(layout, generateWorld(seed, difficulty), 'seed must reproduce the entire layout');
      assert.equal(layout.landmarks.length, 3);
      assert.equal(layout.landmarks.filter(l => l.kind === 'binary').length, 1);
      assert.equal(new Set(layout.landmarks.map(l => l.kind)).size, 3);
      assert.equal(layout.pickups.filter(p => p.type === 'gem').length, layout.totalGems);
      assert.ok(layout.totalGems > difficulty.gemCount);
      const gems = layout.pickups.filter(p => p.type === 'gem');
      const fieldGems = gems.filter(p => !p.landmark);
      assert.equal(fieldGems.length, Math.floor(layout.totalGems / 3), 'one third of gems support open-space scavenging');
      for (const gem of fieldGems) assert.ok(layout.landmarks.every(l => Math.hypot(gem.x - l.x, gem.y - l.y) > l.radius), 'field gems actually lie outside landmark footprints');
      assert.equal(layout.rocks.length, difficulty.asteroidCount);
      assert.equal(layout.clouds.length, 4);
      for (const cloud of layout.clouds) {
        assert.ok(fieldGems.filter(p => Math.hypot(p.x - cloud.x, p.y - cloud.y) < 200).length >= 3, 'each asteroid cloud offers gems');
        assert.ok(layout.rocks.filter(p => Math.hypot(p.x - cloud.x, p.y - cloud.y) <= cloud.radius).length >= Math.floor(difficulty.asteroidCount * 0.1), 'each cloud contains a dense, flyable group of rocks');
      }
      for (const l of layout.landmarks) {
        const localCount = gems.filter(p => p.landmark === l.kind).length;
        assert.ok(localCount + fieldGems.length < difficulty.gemCount, 'field gems plus one landmark cannot trivialize engine preparation');
        assert.ok(layout.totalGems - localCount >= difficulty.gemCount, 'cloud scavenging allows any one landmark to be skipped');
        const localGems = gems.filter(p => p.landmark === l.kind);
        for (const [i, gem] of localGems.entries()) {
          assert.ok(Math.hypot(gem.x - l.x, gem.y - l.y) < l.radius, 'rewards stay within landmark footprints');
          for (const other of localGems.slice(i + 1)) assert.ok(Math.hypot(gem.x - other.x, gem.y - other.y) >= 125, 'landmark gems must not form dense pickup chains');
        }
        // A straight boost through a landmark must not award half the recommended gems.
        // Count pickup discs intersected by lines through every pair of gems.
        for (const a of localGems) for (const b of localGems) {
          if (a === b) continue;
          const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
          const inPass = localGems.filter(p => Math.abs(dx * (p.y - a.y) - dy * (p.x - a.x)) / length <= 31).length;
          assert.ok(inPass <= Math.ceil(difficulty.gemCount / 5), 'one boost pass yields at most one fifth of the recommended gem load');
        }
        if (difficulty.name === 'NORMAL' && l.kind !== 'binary' && !navigationFixtures.has(`${l.kind}:${l.variant}`)) navigationFixtures.set(`${l.kind}:${l.variant}`, { l, target: gems.find(p => p.landmark === l.kind), alternate: gems.filter(p => p.landmark === l.kind).at(-1), difficulty });
      }
      const exit = exitLayout(difficulty.mapW, difficulty.mapH);
      const solids = [...layout.landmarks.flatMap(l => l.structures), ...exit.walls];
      assert.equal(layout.wells.filter(w => w.exit).length, 2);
      assert.equal(layout.pickups.filter(p => p.type === 'antimatter').length, 8);
      assert.equal(layout.pickups.filter(p => p.type === 'magnet').length, 5);
      assert.ok(layout.pickups.every(p => outsideExit(p, difficulty.mapW, difficulty.mapH)));
      combinations.add(layout.landmarks.map(l => l.kind).sort().join(','));
      for (const [i, l] of layout.landmarks.entries()) {
        seen.add(`${l.kind}:${l.variant}`);
        assert.ok(l.x - l.radius > 100 && l.x + l.radius < difficulty.mapW - 100);
        assert.ok(l.y - l.radius > 100 && l.y + l.radius < difficulty.mapH - 100);
        for (const other of layout.landmarks.slice(i + 1)) assert.ok(Math.hypot(l.x - other.x, l.y - other.y) >= l.radius + other.radius + 140);
      }
      for (const p of layout.pickups) {
        assert.ok(p.x > 0 && p.y > 0 && p.x < difficulty.mapW && p.y < difficulty.mapH);
        for (const s of solids) assert.ok(distanceToStructure(p, s) > 25, `pickup in terrain: ${seed} ${difficulty.name} ${JSON.stringify(p)}`);
        for (const well of layout.wells) assert.ok(Math.hypot(p.x - well.x, p.y - well.y) > (well.polarity === 1 ? 240 : well.radius + 20), `pickup in lethal/repulsor zone: ${seed}`);
      }
      for (const rock of layout.rocks) for (const s of solids) assert.ok(distanceToStructure(rock, s) > rock.radius + 20);
      // Flood-fill navigable space with a 22-unit ship clearance. Every pickup
      // and the exit must connect to spawn; this catches accidentally sealed rings.
      const step = 35, cols = Math.ceil(difficulty.mapW / step), rows = Math.ceil(difficulty.mapH / step);
      const blocked = new Uint8Array(cols * rows);
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const p = { x: (x + 0.5) * step, y: (y + 0.5) * step };
        blocked[y * cols + x] = +(p.x < 22 || p.y < 22 || p.x > difficulty.mapW - 22 || p.y > difficulty.mapH - 22 || solids.some(s => distanceToStructure(p, s) < 22) || layout.wells.some(q => !q.exit && Math.hypot(p.x - q.x, p.y - q.y) < (q.polarity === 1 ? 210 : 210)));
      }
      const index = p => Math.floor(p.y / step) * cols + Math.floor(p.x / step);
      const queue = [index({ x: 350, y: difficulty.mapH - 350 })], reached = new Set(queue);
      for (let i = 0; i < queue.length; i++) {
        const at = queue[i], x = at % cols, y = Math.floor(at / cols);
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nx = x + dx, ny = y + dy, next = ny * cols + nx;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || blocked[next] || reached.has(next)) continue;
          reached.add(next); queue.push(next);
        }
      }
      for (const p of [...layout.pickups, exit.mouth]) {
        // A pickup may lie near the edge of an otherwise blocked grid cell.
        // Connect its exact position to a reached cell with a clear short segment.
        const px = Math.floor(p.x / step), py = Math.floor(p.y / step);
        let connected = false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const x = px + dx, y = py + dy;
          if (!reached.has(y * cols + x)) continue;
          const q = { x: (x + 0.5) * step, y: (y + 0.5) * step };
          if ([0, 0.25, 0.5, 0.75, 1].every(t => solids.every(s => distanceToStructure({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }, s) >= 22))) connected = true;
        }
        assert.ok(connected, `inaccessible pickup/exit: seed=${seed} ${difficulty.name} x=${p.x} y=${p.y}`);
      }
    }
  }
  assert.equal(seen.size, 10, 'all five landmarks and both conditions appear');
  if (count >= 100) assert.equal(combinations.size, 6, 'all Binary-plus-two combinations appear');
  console.log(`PASS: ${count * DIFFICULTIES.length} seeded maps, deterministic placement, spacing, safe pickups, navigable routes, 10 conditions and 6 combinations.`);
  console.log('PASS: dense asteroid clouds contain gems, one third of gems are outside landmarks, and any landmark can be skipped.');

  // Render calls must cover every rotated vertex, including pieces beyond the
  // old 880×880 texture and 1200×1200 gradient rectangles.
  const makeContext = () => {
    const images = [], fills = [], rotations = [], patterns = [];
    return { images, fills, rotations, patterns, save() {}, restore() {}, translate() {}, rotate: a => rotations.push(a), beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, clip() {}, scale() {}, rect() {}, arc() {}, strokeRect() {}, fill() {}, stroke() {}, fillText() {},
      createPattern: (tile, repetition) => { patterns.push({ tile, repetition }); return {}; },
      drawImage: (...args) => images.push(args), fillRect: (...args) => fills.push(args),
      createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) };
  };
  const canvases = [];
  document.createElement = () => {
    const ctx = makeContext(), canvas = { width: 0, height: 0, getContext: () => ctx };
    canvases.push({ canvas, ctx }); return canvas;
  };
  for (const { l } of navigationFixtures.values()) {
    const start = canvases.length;
    drawLandmark(makeContext(), l, 0, false);
    const { canvas, ctx } = canvases[start];
    const rectangles = ctx.fills;
    assert.ok(rectangles.length > 0);
    assert.ok(ctx.rotations.includes(l.angle), 'material rotates with its landmark');
    for (const solid of l.structures) for (let i = 0; i < solid.verts.length; i += 2) {
      const vx = solid.verts[i], vy = solid.verts[i + 1];
      assert.ok(Math.abs(vx) < canvas.width / 2 && Math.abs(vy) < canvas.height / 2, 'cache must contain the entire collider');
      const x = vx * Math.cos(l.angle) + vy * Math.sin(l.angle), y = -vx * Math.sin(l.angle) + vy * Math.cos(l.angle);
      for (const [left, top, width, height] of rectangles) assert.ok(x >= left && y >= top && x <= left + width && y <= top + height, 'materials must cover every physical vertex');
    }
    assert.equal(ctx.patterns.length, new Set(l.structures.map(s => s.material)).size, 'each material covers its combined physical surface');
    for (const { tile, repetition } of ctx.patterns) {
      assert.equal(repetition, 'repeat');
      assert.ok([320, 512].includes(tile.width), 'material density is independent of landmark size');
      assert.ok(Math.abs(tile.width / tile.height - 1.5) < 0.005, 'texture preserves source aspect ratio');
    }
    const cachedScene = makeContext();
    const cacheCount = canvases.length;
    drawLandmark(cachedScene, l, 1, false);
    assert.equal(canvases.length, cacheCount, 'surfaces are reused each frame');
    assert.equal(cachedScene.images[0][0], canvas);
  }
  console.log('PASS: all 8 rotated landmark variants have complete, cached material coverage at fixed texture density.');

  const exitFixture = () => {
    const layout = exitLayout(6800, 5100);
    return { playT: 0, gate: { layout, blasts: 0, chunks: layout.chunks.map(shape => ({ shape, destroyedAt: -1 })) } };
  };
  const exitGame = exitFixture();
  const coldExit = makeContext();
  drawExitStructure(coldExit, exitGame);
  const intactImage = coldExit.images[0][0];
  const warmedCount = canvases.length;
  const warmExit = makeContext();
  drawExitStructure(warmExit, exitGame);
  assert.equal(canvases.length, warmedCount);
  assert.equal(warmExit.images[0][0], intactImage);
  assert.equal(warmExit.patterns.length, 0, 'steady-state exit uses a bitmap, not live material painting');
  exitGame.gate.blasts = 1;
  exitGame.gate.chunks[0].destroyedAt = 0;
  const debrisExit = makeContext();
  drawExitStructure(debrisExit, exitGame);
  assert.notEqual(debrisExit.images[0][0], intactImage, 'detonation rebuilds the remaining barrier');
  assert.equal(debrisExit.patterns.length, 1, 'only the destroyed shard is painted live');
  exitGame.playT = 2;
  const settledExit = makeContext();
  drawExitStructure(settledExit, exitGame);
  assert.equal(settledExit.images[0][0], debrisExit.images[0][0]);
  assert.equal(settledExit.patterns.length, 0, 'debris expires without rebuilding the static surface');
  const newExit = makeContext();
  drawExitStructure(newExit, exitFixture());
  assert.notEqual(newExit.images[0][0], settledExit.images[0][0], 'restart does not retain the destroyed barrier');

  const mapGame = { ...exitGame, mapW: 6800, mapH: 5100, time: 0,
    landmarks: [...navigationFixtures.values()].map(f => f.l), asteroids: [], wells: [], pickups: [], hunters: [],
    player: { body: { translation: () => ({ x: 100, y: 100 }) } } };
  mapGame.gate.x = 6480; mapGame.gate.y = 4780;
  const coldMap = makeContext();
  drawSectorMap(coldMap, mapGame, 170 / 6800, true);
  assert.ok(coldMap.images.every(([image]) => image.width < 200), 'minimap samples small artwork');
  const mapCount = canvases.length;
  const warmMap = makeContext();
  drawSectorMap(warmMap, mapGame, 170 / 6800, true);
  assert.equal(canvases.length, mapCount);
  assert.deepEqual(warmMap.images, coldMap.images, 'minimap artwork is reused');
  console.log('PASS: cached exit rendering, detonation, debris expiry, restart and small minimap artwork.');

  const renderBackground = cam => {
    const stars = [], images = [];
    drawStarfield({ fillRect: (...args) => stars.push(args), drawImage: (...args) => images.push(args) }, cam, 1280, 720, 0, 4000, 3000);
    return { stars: stars.slice(1), images };
  };
  const before = renderBackground({ x: 1024, y: 1000, shakeX: 0, shakeY: 0 });
  const after = renderBackground({ x: 1074, y: 1030, shakeX: 2, shakeY: 1 });
  assert.equal(before.stars.length, after.stars.length);
  assert.equal(before.images.length, 1);
  for (let i = 0; i < before.stars.length; i++) {
    assert.ok(Math.abs(after.stars[i][0] - before.stars[i][0] + 48) < 1e-8);
    assert.ok(Math.abs(after.stars[i][1] - before.stars[i][1] + 29) < 1e-8);
  }
  assert.equal(after.images[0][1] - before.images[0][1], -48);
  assert.equal(after.images[0][2] - before.images[0][2], -29);
  console.log('PASS: every star layer and the nebula move exactly with terrain, including camera shake.');

  await RAPIER.init();
  // A stationary target must not leave the hunter parked at an avoidance
  // equilibrium, or make its route disappear when touching the map boundary.
  for (const scenario of ['head-on rock', 'wall contact']) {
    const physics = new PhysicsContext();
    createWalls(physics, 1200, 1000);
    const nav = new Navigation(1200, 1000, []);
    const target = scenario === 'wall contact' ? { x: 14, y: 500 } : { x: 900, y: 500 };
    const player = createPlayer(physics, target.x, target.y);
    player.body.setBodyType(RAPIER.RigidBodyType.Fixed, true);
    const hunter = createHunter(physics, 300, 500);
    if (scenario === 'head-on rock') {
      const rock = createAsteroid(physics, () => 0.5, 600, 500, 60, 0);
      rock.collider.setShape(new RAPIER.Ball(60));
    }
    let caught = false;
    for (let frame = 0; frame < 1200; frame++) {
      updateHunter(hunter, player, physics, 10 + frame / 60, 0, false, DIFFICULTIES[1], [], 1 / 60, nav);
      physics.world.step();
      const pos = hunter.body.translation();
      if (Math.hypot(pos.x - target.x, pos.y - target.y) < 31) { caught = true; break; }
    }
    assert.ok(caught, `${scenario}: hunter must catch stationary prey; final=${JSON.stringify(hunter.body.translation())}`);
    physics.free();
  }
  console.log('PASS: hunters catch stationary prey past a head-on rock and at wall contact without lunges.');
  // Identical shapes and inputs isolate the two materials' physical behavior.
  const materialResults = {};
  for (const composition of ['rock', 'ice']) {
    const physics = new PhysicsContext();
    const a = createAsteroid(physics, () => 0.5, -100, 0, 30, 0, composition);
    const mass = a.body.mass();
    a.body.applyImpulse({ x: 1000, y: 0 }, true);
    const pushedSpeed = a.body.linvel().x;
    a.body.setLinvel({ x: 100, y: 0 }, true);
    a.body.setAngvel(0, true);
    physics.world.createCollider(RAPIER.ColliderDesc.cuboid(10, 200).setRestitution(1).setFriction(0));
    for (let i = 0; i < 120; i++) physics.world.step();
    const reboundSpeed = -a.body.linvel().x;
    assert.ok(reboundSpeed > 0, `${composition} rebounds from the wall`);
    materialResults[composition] = { mass, pushedSpeed, reboundSpeed };
    physics.free();
  }
  assert.ok(materialResults.rock.mass > materialResults.ice.mass * 2, 'rock is substantially heavier at identical size');
  assert.ok(materialResults.ice.pushedSpeed > materialResults.rock.pushedSpeed * 2, 'the same impulse pushes ice farther');
  assert.ok(materialResults.ice.reboundSpeed > materialResults.rock.reboundSpeed * 1.15, 'ice preserves more speed on real collisions');
  console.log('PASS: equal-size ice is lighter, responds more to impulses and rebounds faster than rock in Rapier.');
  // Exercise real steering and collisions, not just existence of an A* path.
  for (const [name, fixture] of navigationFixtures) {
    const { l, target, alternate, difficulty } = fixture;
    const start = { x: l.x - Math.sin(l.angle) * (l.radius + 80), y: l.y + Math.cos(l.angle) * (l.radius + 80) };
    const physics = new PhysicsContext();
    createWalls(physics, difficulty.mapW, difficulty.mapH);
    for (const solid of l.structures) createStructure(physics, solid);
    const nav = new Navigation(difficulty.mapW, difficulty.mapH, l.structures);
    assert.ok(!nav.clearLine(start, target), `${name}: fixture must require a detour`);
    const route = nav.findPath(start, target);
    assert.ok(route.length > 1, `${name}: must find an indirect route`);
    let prev = start;
    for (const point of route) { assert.ok(nav.clearLine(prev, point, 15.5), `${name}: route crosses terrain`); prev = point; }
    const player = createPlayer(physics, target.x, target.y);
    player.body.setBodyType(RAPIER.RigidBodyType.Fixed, true);
    const hunter = createHunter(physics, start.x, start.y);
    // A visible target moving behind terrain must trigger a detour on the
    // next update, even if the previous path refresh was scheduled later.
    hunter.repathAt = difficulty.hunterWarmup + 0.5;
    player.body.setTranslation(start, true);
    updateHunter(hunter, player, physics, difficulty.hunterWarmup, 0, false, difficulty, [], 1 / 60, nav);
    player.body.setTranslation(target, true);
    updateHunter(hunter, player, physics, difficulty.hunterWarmup + 1 / 60, 0, false, difficulty, [], 1 / 60, nav);
    assert.ok(hunter.route.length > 1, `${name}: hunter must react immediately when prey ducks behind terrain`);
    let reached = false, closest = Infinity, destination = target;
    for (let frame = 0; frame < 2400; frame++) {
      if (frame === 90) {
        destination = alternate;
        player.body.setTranslation({ x: alternate.x, y: alternate.y }, true);
      }
      updateHunter(hunter, player, physics, difficulty.hunterWarmup + frame / 60, 0, true, difficulty, [], 1 / 60, nav);
      physics.world.step();
      const pos = hunter.body.translation();
      const distance = Math.hypot(pos.x - destination.x, pos.y - destination.y);
      closest = Math.min(closest, distance);
      if (frame > 90 && distance < 60) { reached = true; break; }
    }
    const last = hunter.body.translation();
    assert.ok(reached, `${name}: hunter failed detour, closest=${closest.toFixed(1)}, final=${JSON.stringify(last)}, path=${JSON.stringify(hunter.route)}`);
    physics.free();
  }
  assert.equal(navigationFixtures.size, 8);
  console.log('PASS: hunters physically navigate all 8 solid-landmark conditions, replan for relocated targets, with lunges enabled.');
  {
    const physics = new PhysicsContext();
    const nav = new Navigation(4000, 3000, []);
    const hunter = createHunter(physics, 1300, 1000);
    const player = createPlayer(physics, 1100, 1000);
    updateHunter(hunter, player, physics, 10, 0, false, DIFFICULTIES[1], [{ x: 1000, y: 1000, radius: 460, polarity: 1 }], 1 / 60, nav);
    assert.ok(hunter.lureCommitUntil > 10, 'BHAS override permits lure commitment');
    assert.equal(hunter.respawnAt, 0, 'BHAS override alone must not banish the hunter');
    assert.ok(Math.hypot(hunter.body.translation().x - 1000, hunter.body.translation().y - 1000) > 70);
    physics.free();
  }
  console.log('PASS: BHAS commitment is permission to lure, not guaranteed capture.');
  const game = new Game();
  game.reset(42);
  const initialBodies = game.physics.world.bodies.len();
  const initialLayout = generateWorld(42, game.difficulty);
  for (const [i, rock] of initialLayout.rocks.entries()) {
    const velocity = game.asteroids[i].body.linvel();
    const maxDrift = rock.cloud === undefined ? 70 : 4;
    assert.ok(Math.abs(velocity.x) <= maxDrift && Math.abs(velocity.y) <= maxDrift, 'clouds must persist while loose rocks retain their drift');
    assert.ok(game.asteroids[i].body.isDynamic(), 'cloud rocks still respond to impacts');
  }
  assert.equal(game.structures.length, game.landmarks.flatMap(l => l.structures).length + game.gate.layout.walls.length);
  assert.ok(game.structures.every(s => s.body.isFixed()));
  game.state = 'playing';
  // Pick up the recommended gems through actual sensor contacts, leaving optional gems.
  for (const p of game.pickups.filter(p => p.type === 'gem').slice(0, game.gemCount)) {
    game.player.body.setTranslation({ x: p.x, y: p.y }, true);
    game.player.body.setLinvel({ x: 0, y: 0 }, true);
    game.fixedUpdate(1 / 60);
  }
  assert.equal(game.gemsCollected, game.gemCount);
  assert.equal(game.gate.active, false, 'gems upgrade thrust without magically opening the exit');
  assert.ok(game.player.engineMultiplier > 1);
  const capsule = game.pickups.find(p => p.type === 'antimatter');
  game.player.body.setTranslation(capsule, true);
  game.player.body.setLinvel({ x: 0, y: 0 }, true);
  game.fixedUpdate(1 / 60);
  assert.equal(game.antimatter, 1, 'actual capsule contact adds inventory');
  game.player.body.setTranslation({ x: game.gate.layout.barrier.x - 150, y: game.gate.y }, true);
  assert.equal(game.detonate(), true);
  assert.equal(game.gate.active, false, 'first blast only excavates a crater');
  for (const extra of game.pickups.filter(p => p.type === 'antimatter' && !p.taken).slice(0, 2)) {
    game.player.body.setTranslation(extra, true); game.player.body.setLinvel({ x: 0, y: 0 }, true);
    game.fixedUpdate(1 / 60);
  }
  game.player.body.setTranslation({ x: game.gate.layout.barrier.x - 150, y: game.gate.y }, true);
  assert.equal(game.detonate(), true); assert.equal(game.detonate(), true);
  assert.equal(game.gate.active, true);
  assert.equal(game.antimatter, 0);
  assert.ok(game.pickups.some(p => p.type === 'gem' && !p.taken));
  game.player.body.setTranslation({ x: game.gate.x, y: game.gate.y }, true);
  game.fixedUpdate(1 / 60);
  assert.equal(game.state, 'win');
  game.reset(42);
  assert.equal(game.physics.world.bodies.len(), initialBodies, 'reset must not leak bodies');
  assert.equal(game.gate.active, false);
  assert.ok(game.landmarks.every(l => !l.discovered));
  // Controls exercise real Input events and keep chart/pause state coherent.
  const key = code => {
    const event = new Event('keydown'); Object.assign(event, { code, key: code === 'Tab' ? 'Tab' : '', repeat: false });
    window.dispatchEvent(event); game.fixedUpdate(1 / 60);
    const up = new Event('keyup'); Object.assign(up, { code }); window.dispatchEvent(up);
  };
  game.state = 'playing'; key('Tab');
  assert.equal(game.state, 'paused'); assert.equal(game.chartOpen, true);
  const time = game.playT; game.fixedUpdate(1 / 60); assert.equal(game.playT, time);
  key('Escape'); assert.equal(game.state, 'playing'); assert.equal(game.chartOpen, false);
  key('Tab'); key('Tab'); assert.equal(game.state, 'playing');
  game.state = 'menu'; key('Tab'); assert.equal(game.state, 'menu'); assert.equal(game.chartOpen, true);
  key('Enter'); assert.equal(game.state, 'playing'); assert.equal(game.chartOpen, false);
  for (let i = 0; i < 600; i++) game.fixedUpdate(1 / 60);
  assert.ok(Number.isFinite(game.player.body.translation().x));
  // A URL seed must survive changing difficulty, including switching back.
  game.state = 'menu'; game.reset(42);
  const originalKinds = game.landmarks.map(l => [l.kind, l.variant, l.x, l.y]);
  key('Digit4'); assert.equal(game.seed, 42); assert.equal(game.difficultyIndex, 3);
  key('Digit2'); assert.equal(game.seed, 42); assert.deepEqual(game.landmarks.map(l => [l.kind, l.variant, l.x, l.y]), originalKinds);

  const held = new Event('keydown'); Object.assign(held, { code: 'KeyW', key: 'w', repeat: false });
  game.state = 'playing'; window.dispatchEvent(held); game.input.mouseDown = true;
  key('KeyP'); assert.equal(game.state, 'paused'); assert.equal(game.input.thrust, false); assert.equal(game.input.mouseDown, false);
  key('KeyP'); assert.equal(game.playerFrame.thrusting, false);
  window.dispatchEvent(held); game.reset(42); assert.equal(game.input.thrust, false);
  window.dispatchEvent(held); window.dispatchEvent(new Event('blur'));
  assert.equal(game.input.justPressed('KeyW'), false, 'blur discards stale key presses');
  game.state = 'playing'; window.dispatchEvent(held); game.input.mouseDown = true;
  document.hidden = true; document.dispatchEvent(new Event('visibilitychange')); document.hidden = false;
  assert.equal(game.state, 'paused'); assert.equal(game.input.thrust, false); assert.equal(game.input.mouseDown, false);

  // Direct touch steers and thrusts independently of the saved mouse option;
  // a second contact acts as boost and cancellation clears the held state.
  const pointer = (type, pointerId, x, y) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { pointerType: 'touch', pointerId, clientX: x, clientY: y });
    window.dispatchEvent(event);
  };
  game.reset(42); game.state = 'playing'; game.mouseSteer = false;
  game.viewW = 800; game.viewH = 600;
  pointer('pointerdown', 1, 700, 300); game.fixedUpdate(1 / 60);
  assert.equal(game.input.touchActive, true); assert.equal(game.playerFrame.thrusting, true);
  pointer('pointerdown', 2, 100, 100); game.fixedUpdate(1 / 60);
  assert.equal(game.playerFrame.boosting, true);
  pointer('pointerup', 1, 700, 300);
  assert.equal(game.input.touchActive, true, 'remaining touch becomes the steering contact');
  pointer('pointercancel', 2, 100, 100); game.fixedUpdate(1 / 60);
  assert.equal(game.input.touchActive, false); assert.equal(game.playerFrame.thrusting, false);

  // Without a keyboard the paused overlay must still be dismissable: a tap on
  // the playfield resumes, a drag does not, and the map keeps its own control.
  game.state = 'playing'; game.togglePause(); assert.equal(game.state, 'paused');
  pointer('pointerdown', 3, 400, 300); game.fixedUpdate(1 / 60);
  assert.equal(game.state, 'paused', 'a finger resting on the paused screen keeps the freeze');
  pointer('pointerup', 3, 406, 303); game.fixedUpdate(1 / 60);
  assert.equal(game.state, 'playing', 'lifting the finger resumes the run');
  assert.equal(game.input.touchActive, false, 'the resuming tap leaves no held steering contact');
  game.togglePause();
  pointer('pointerdown', 4, 400, 300); pointer('pointermove', 4, 400, 480);
  pointer('pointerup', 4, 400, 480); game.fixedUpdate(1 / 60);
  assert.equal(game.state, 'paused', 'dragging across the paused screen is not a resume tap');
  pointer('pointerdown', 5, 400, 300); pointer('pointercancel', 5, 400, 300); game.fixedUpdate(1 / 60);
  assert.equal(game.state, 'paused', 'a cancelled touch is not a resume tap');
  game.togglePause(); assert.equal(game.state, 'playing');
  pointer('pointerdown', 6, 400, 300); pointer('pointerup', 6, 400, 300);
  game.fixedUpdate(1 / 60); game.togglePause(); game.fixedUpdate(1 / 60);
  assert.equal(game.state, 'paused', 'a tap taken while flying cannot resume a later pause');
  game.togglePause(); key('Tab'); assert.equal(game.state, 'paused'); assert.equal(game.chartOpen, true);
  pointer('pointerdown', 7, 400, 300); pointer('pointerup', 7, 400, 300); game.fixedUpdate(1 / 60);
  assert.equal(game.state, 'paused', 'the chart stays open until the player closes the map');
  key('Tab'); assert.equal(game.state, 'playing');

  // Fixed steering uses the stick center, independent of ship/camera position.
  game.input.setFixedJoystick(true);
  assert.equal(saved.get('sinv-fixed-joystick'), '1');
  game.input.joystickBounds = { x: 84, y: 516, radius: 60 };
  pointer('pointerdown', 3, 700, 300);
  game.fixedUpdate(1 / 60);
  assert.equal(game.playerFrame.thrusting, false, 'off-stick touch cannot steer');
  pointer('pointerdown', 4, 84, 516);
  game.fixedUpdate(1 / 60);
  assert.equal(game.playerFrame.thrusting, false, 'stick center is a dead zone');
  pointer('pointermove', 4, 84, 400);
  assert.equal(game.input.joystickAngle, -Math.PI / 2);
  assert.ok(Math.abs(game.input.joystickOffset.y + 60) < 1e-9, 'stick travel is clamped');
  game.fixedUpdate(1 / 60);
  assert.equal(game.playerFrame.thrusting, true);
  assert.equal(game.playerFrame.boosting, true, 'other finger boosts stick steering');
  pointer('pointercancel', 4, 84, 400);
  game.fixedUpdate(1 / 60);
  assert.equal(game.playerFrame.thrusting, false, 'boost finger cannot take over the stick');
  pointer('pointerup', 3, 700, 300);
  pointer('pointerdown', 5, 120, 516);
  game.fixedUpdate(1 / 60);
  assert.equal(game.playerFrame.thrusting, true);
  pointer('pointermove', 5, 88, 516);
  game.fixedUpdate(1 / 60);
  assert.equal(game.playerFrame.thrusting, false, 'returning to center stops thrust');
  pointer('pointermove', 5, 120, 516);
  game.togglePause();
  assert.equal(game.input.touchActive, false, 'pause releases the joystick');
  game.togglePause();
  game.input.setFixedJoystick(false);
  assert.equal(saved.get('sinv-fixed-joystick'), '0');

  // The scripted hunter contact impulse must not cancel material density.
  const shoveSpeeds = {};
  for (const composition of ['rock', 'ice']) {
    const asteroid = createAsteroid(game.physics, () => 0.5, 1000, 1000, 30, 0, composition);
    game.hunters[0].body.setLinvel({ x: 100, y: 0 }, true);
    game.handleContact(game.hunters[0], asteroid);
    shoveSpeeds[composition] = asteroid.body.linvel().x;
  }
  assert.ok(shoveSpeeds.ice > shoveSpeeds.rock * 2, 'hunter shoves lighter ice more strongly');

  const storage = globalThis.localStorage;
  globalThis.localStorage = { getItem() { throw new Error('Storage blocked'); }, setItem() { throw new Error('Storage blocked'); } };
  assert.doesNotThrow(() => new Game(), 'disabled storage cannot prevent game initialization');
  writeSaved('release-probe', 'ok'); assert.equal(readSaved('release-probe'), 'ok');
  globalThis.localStorage = storage;
  writeSaved('release-probe', 'persisted'); saved.set('release-probe', 'changed-in-another-tab');
  assert.equal(readSaved('release-probe'), 'changed-in-another-tab', 'successful writes do not mask changes from other tabs');
  console.log('PASS: seed-preserving difficulty changes, clean pause/restart/focus input, tap-to-resume, material-aware hunter shoves and blocked storage.');
  game.physics.free();
  console.log('PASS: Rapier terrain, real gem contacts, engine upgrades, capsule contact, barrier destruction, escape, reset, chart controls, pause and 600 simulation steps.');
} finally {
  await rm(temp, { recursive: true, force: true });
}
