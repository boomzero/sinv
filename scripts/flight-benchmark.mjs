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
  // Fixed terrain sectors isolate collection pacing from gravity maneuvers.
  for (const seed of [0, 19, 42]) {
    game.reset(seed); game.state = 'menu'; game.launch();
    assert.equal(game.wells.length, 0, 'pacing fixtures must be terrain sectors');
    for (const hunter of game.hunters) game.physics.world.removeRigidBody(hunter.body);
    game.hunters = [];
    const nav = new Navigation(game.mapW, game.mapH, game.landmarks.flatMap(l => l.structures));
    let target = null, route = [], refresh = 0;
    for (let frame = 0; frame < 60 * 300 && game.state === 'playing'; frame++) {
      const pos = game.player.body.translation(), vel = game.player.body.linvel();
      if (!target || target.taken || game.gate.active && target !== game.gate) {
        target = game.gate.active ? game.gate : null;
        if (!target) {
          let shortest = Infinity;
          for (const gem of game.pickups.filter(p => p.type === 'gem' && !p.taken)) {
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
      const waypoint = route[0] ?? target;
      const dx = waypoint.x - pos.x, dy = waypoint.y - pos.y, distance = Math.max(1, Math.hypot(dx, dy));
      const speed = Math.min(game.player.boostFuel > 10 ? 650 : 350, Math.sqrt(2 * 220 * Math.max(0, distance - 8)));
      const ax = (dx / distance * speed - vel.x) * 3, ay = (dy / distance * speed - vel.y) * 3;
      const aim = Math.atan2(ay, ax);
      const error = Math.atan2(Math.sin(aim - game.player.body.rotation()), Math.cos(aim - game.player.body.rotation()));
      game.input.mouseX = pos.x + Math.cos(aim) * 200 - game.camera.x + game.viewW / 2;
      game.input.mouseY = pos.y + Math.sin(aim) * 200 - game.camera.y + game.viewH / 2;
      controls.thrust = Math.abs(error) < 0.5 && Math.hypot(ax, ay) > 30;
      controls.boost = Math.abs(error) < 0.15 && Math.hypot(ax, ay) > 650 && distance > 400;
      game.player.hull = 100;
      game.fixedUpdate(1 / 60);
    }
    console.log(JSON.stringify({ seed, state: game.state, seconds: Math.round(game.playT), gems: game.gemsCollected, quota: game.gemCount }));
    assert.equal(game.state, 'win', `collection pilot must finish seed ${seed}`);
    assert.ok(game.playT >= 100 && game.playT <= 180, `collection pacing regression on seed ${seed}: ${game.playT}s`);
  }
  game.physics.free();
} finally {
  await rm(temp, { recursive: true, force: true });
}
