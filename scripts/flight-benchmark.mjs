// Collection pacing probe: a conservative autopilot flies the real ship and
// collects through Rapier sensors. Pursuers are removed and hull damage healed
// to isolate route cost. This is not a human run or a difficulty certification.
import { build } from 'vite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const temp = await mkdtemp(join(tmpdir(), 'sinv-flight-'));
globalThis.window = new EventTarget();
globalThis.document = new EventTarget();
globalThis.Element = class {};
globalThis.Image = class {};
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
try {
  await build({ configFile: false, logLevel: 'silent', publicDir: false, build: { outDir: temp, lib: { entry: 'scripts/test-entry.ts', formats: ['es'], fileName: () => 'world.mjs' } } });
  const { Game, RAPIER, Navigation } = await import(pathToFileURL(join(temp, 'world.mjs')));
  await RAPIER.init();
  const game = new Game();
  game.mouseSteer = true; game.viewW = 1280; game.viewH = 720;
  const controls = { thrust: false, boost: false };
  Object.defineProperties(game.input, { thrust: { get: () => controls.thrust }, boost: { get: () => controls.boost } });
  // Every sector includes a Binary. This conservative pilot routes around its fields.
  for (const seed of [0, 19, 42]) {
    game.reset(seed); game.state = 'menu'; game.launch();
    assert.equal(game.landmarks.filter(l => l.kind === 'binary').length, 1);
    for (const hunter of game.hunters) game.physics.world.removeRigidBody(hunter.body);
    game.hunters = [];
    const binary = game.landmarks.find(l => l.kind === 'binary');
    const makeNav = () => new Navigation(game.mapW, game.mapH, [
      ...game.landmarks.flatMap(l => l.structures), ...game.gate.layout.walls,
      ...game.gate.chunks.filter(c => c.destroyedAt < 0).map(c => c.shape),
      ...game.wells.filter(w => !w.exit).map(w => ({ x: w.x, y: w.y, material: 'rock', accent: '#fff',
        verts: Array.from({ length: 16 }, (_, i) => [Math.cos(i * Math.PI / 8) * (w.radius + 60), Math.sin(i * Math.PI / 8) * (w.radius + 60)]).flat() })),
    ]);
    let nav = makeNav();
    let target = null, route = [], refresh = 0;
    for (let frame = 0; frame < 60 * 300 && game.state === 'playing'; frame++) {
      const pos = game.player.body.translation(), vel = game.player.body.linvel();
      const ready = game.gemsCollected >= game.escapeGemTarget && game.antimatter + game.gate.blasts >= 3;
      if (ready && game.canDetonate) { while (game.canDetonate) game.detonate(); nav = makeNav(); }
      const destination = game.gate.active ? game.gate : game.gate.layout.mouth;
      if (!target || target.taken || ready && target !== destination) {
        target = ready ? destination : null;
        if (!target) {
          let shortest = Infinity;
          for (const gem of game.pickups.filter(p => !p.taken && Math.hypot(p.x - binary.x, p.y - binary.y) > binary.radius && (p.type === 'gem' && game.gemsCollected < game.escapeGemTarget || p.type === 'antimatter' && game.antimatter < 3))) {
            if (Math.hypot(gem.x - pos.x, gem.y - pos.y) >= shortest) continue;
            const path = nav.findPath(pos, gem);
            if (!path.length) continue;
            let prev = pos, distance = 0;
            for (const p of path) { distance += Math.hypot(p.x - prev.x, p.y - prev.y); prev = p; }
            if (distance < shortest) { target = gem; shortest = distance; }
          }
        }
        refresh = 0;
      }
      if (!target) break;
      if (frame >= refresh) { route = nav.findPath(pos, target); refresh = frame + 30; }
      while (route.length > 1 && (Math.hypot(route[0].x - pos.x, route[0].y - pos.y) < 30 || nav.clearLine(pos, route[1]))) route.shift();
      const inApproach = ready && Math.abs(pos.y - game.gate.y) < 60 && pos.x >= game.gate.layout.mouth.x - 70;
      const waypoint = inApproach ? game.gate : route[0] ?? target;
      const dx = waypoint.x - pos.x, dy = waypoint.y - pos.y, distance = Math.max(1, Math.hypot(dx, dy));
      const speed = Math.min(game.player.boostFuel > 10 ? 650 : 350, Math.sqrt(2 * 220 * Math.max(0, distance - 8)));
      const ax = (dx / distance * speed - vel.x) * 3, ay = (dy / distance * speed - vel.y) * 3;
      // Center before pushing through the narrow three-charge tunnel; strong
      // lateral correction also lets the pilot back off a jagged rock face.
      const aligning = inApproach && pos.x < game.gate.layout.barrier.x + 120 && Math.abs(pos.y - game.gate.y) > 8;
      const aim = inApproach ? Math.atan2((game.gate.y - pos.y) * (aligning ? 12 : 4) - vel.y * 3, aligning ? 70 : 450) : Math.atan2(ay, ax);
      const error = Math.atan2(Math.sin(aim - game.player.body.rotation()), Math.cos(aim - game.player.body.rotation()));
      game.input.mouseX = pos.x + Math.cos(aim) * 200 - game.camera.x + game.viewW / 2;
      game.input.mouseY = pos.y + Math.sin(aim) * 200 - game.camera.y + game.viewH / 2;
      controls.thrust = Math.abs(error) < 0.5 && Math.hypot(ax, ay) > 30;
      controls.boost = Math.abs(error) < 0.15 && Math.hypot(ax, ay) > 650 && distance > 400;
      if (inApproach) { controls.thrust = true; controls.boost = pos.x > game.gate.layout.barrier.x - 30; }
      game.player.hull = 100;
      game.fixedUpdate(1 / 60);
    }
    console.log(JSON.stringify({ seed, state: game.state, seconds: Math.round(game.playT), gems: game.gemsCollected, recommended: game.escapeGemTarget, blasts: game.gate.blasts }));
    assert.equal(game.state, 'win', `collection pilot must finish seed ${seed}`);
    assert.ok(game.playT >= 100 && game.playT <= 180, `escape pacing regression on seed ${seed}: ${game.playT}s`);
  }
  game.physics.free();
} finally {
  await rm(temp, { recursive: true, force: true });
}
