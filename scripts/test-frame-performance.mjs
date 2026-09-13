import assert from 'node:assert/strict';
import { build } from 'vite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const temp = await mkdtemp(join(tmpdir(), 'sinv-frames-'));
try {
  await build({ configFile: false, logLevel: 'silent', publicDir: false, build: {
    outDir: temp, lib: { entry: ['src/fixed-step.ts', 'src/render/bounds.ts', 'src/render/motion.ts', 'src/camera.ts', 'src/render/particles.ts'], formats: ['es'], fileName: (_, name) => `${name}.mjs` },
  } });
  const { FixedStepAccumulator, FIXED_DT } = await import(pathToFileURL(join(temp, 'fixed-step.mjs')));
  const { drawBounds } = await import(pathToFileURL(join(temp, 'bounds.mjs')));
  const { RenderMotion } = await import(pathToFileURL(join(temp, 'motion.mjs')));
  const { Camera } = await import(pathToFileURL(join(temp, 'camera.mjs')));
  const { Particles } = await import(pathToFileURL(join(temp, 'particles.mjs')));
  for (const rate of [60, 120, 144]) {
    const clock = new FixedStepAccumulator();
    const motion = new RenderMotion();
    const point = { x: 0, y: 0 };
    let lastX;
    for (let frame = 0; frame < rate * 2; frame++) {
      clock.advance(1 / rate, dt => { motion.capture(point, point); point.x += 600 * dt; });
      motion.alpha = clock.alpha;
      const x = motion.position(point, point).x;
      if (frame > 3) assert.ok(Math.abs(x - lastX - 600 / rate) < 1e-7,
        `${rate} Hz: constant velocity must advance evenly on every rendered frame`);
      lastX = x;
    }
  }
  // Anything projected through the interpolated camera must be interpolated
  // too. A raw target pose slides backwards against the smoothly moving
  // viewport and snaps forward on every fixed step.
  for (const rate of [90, 144]) {
    const clock = new FixedStepAccumulator();
    const motion = new RenderMotion();
    const camera = new Camera(), target = { x: 0, y: 0 };
    let lastScreen;
    for (let frame = 0; frame < rate * 2; frame++) {
      clock.advance(1 / rate, dt => {
        motion.capture(camera, camera);
        motion.capture(target, target);
        camera.x += 200 * dt;
        target.x += 500 * dt;
      });
      motion.alpha = clock.alpha;
      const screen = motion.position(target, target).x - motion.position(camera, camera).x;
      if (frame > 3) assert.ok(Math.abs(screen - lastScreen - 300 / rate) < 1e-7,
        `${rate} Hz: screen markers must track the interpolated camera`);
      lastScreen = screen;
    }
  }
  const motion = new RenderMotion();
  const body = { translation: () => ({ x: 10, y: 20 }), rotation: () => -Math.PI + 0.1 };
  motion.capture(body, { x: 0, y: 0 }, Math.PI - 0.1);
  motion.alpha = 0.5;
  assert.deepEqual(motion.position(body, body.translation()), { x: 5, y: 10 });
  assert.ok(Math.abs(Math.abs(motion.body(body).angle) - Math.PI) < 1e-8, 'rotation crosses wrap by the shortest arc');
  assert.deepEqual(body.translation(), { x: 10, y: 20 }, 'rendering cannot mutate physics');
  assert.deepEqual(motion.position(body, { x: 1000, y: 20 }), { x: 1000, y: 20 }, 'teleport snaps');
  motion.reset();
  assert.deepEqual(motion.position(body, body.translation()), { x: 10, y: 20 }, 'reset discards snapshots');
  const camera = new Camera();
  camera.snapTo(10.25, 20.75);
  let translation;
  camera.apply({ translate: (x, y) => { translation = [x, y]; } }, 100, 100);
  assert.deepEqual(translation, [39.75, 29.25], 'camera preserves subpixel movement');
  const particles = new Particles();
  for (let i = 0; i < 1000; i++) particles.emit(i, 0, 10, 0, 1, 2, '#fff');
  let drawn = 0;
  const ctx = { save() {}, restore() {}, fillRect() { drawn++; } };
  particles.draw(ctx);
  assert.equal(drawn, 600, 'burst work remains bounded');
  particles.update(2);
  drawn = 0;
  particles.draw(ctx);
  assert.equal(drawn, 0, 'expired particles leave the draw list');
  particles.emit(0, 0, 10, 0, 1, 2, '#fff');
  particles.update(0.1);
  let particleX;
  particles.draw({ ...ctx, fillRect(x, y, width) { particleX = x + width / 2; } }, 0.5);
  assert.ok(Math.abs(particleX - 0.5) < 1e-8, 'reused particle interpolates its new position');
  particles.clear();
  drawn = 0;
  particles.draw(ctx);
  assert.equal(drawn, 0);
  for (const rate of [30, 60, 120, 144]) {
    const clock = new FixedStepAccumulator();
    let updates = 0;
    for (let frame = 0; frame < rate * 10; frame++) clock.advance(1 / rate, dt => {
      assert.equal(dt, FIXED_DT); updates++;
    });
    assert.equal(updates, 600, `${rate} Hz must retain 60 Hz physics`);
  }
  const clock = new FixedStepAccumulator();
  let updates = 0;
  const update = () => updates++;
  clock.advance(FIXED_DT / 2, update);
  clock.advance(0.127, update);
  assert.equal(updates, 3, '127 ms stall cannot trigger seven catch-up updates');
  clock.advance(FIXED_DT / 2, update);
  assert.equal(updates, 4, 'fractional time survives the catch-up cap');
  clock.advance(10, update);
  assert.equal(updates, 7, 'long stalls have the same bounded work');
  clock.advance(FIXED_DT / 2, update);
  clock.reset();
  clock.advance(FIXED_DT / 2, update);
  assert.equal(updates, 7, 'visibility reset discards the old remainder');

  function draw(cx, cy) {
    const points = [];
    let strokes = 0;
    const ctx = { save() {}, restore() {}, beginPath() {}, moveTo: (x, y) => points.push([x, y]),
      lineTo: (x, y) => points.push([x, y]), stroke: () => strokes++ };
    drawBounds(ctx, 0, 6000, 6000, cx, cy, 1000, 800);
    for (const [x, y] of points) {
      assert.ok(x >= cx - 548 && x <= cx + 548);
      assert.ok(y >= cy - 448 && y <= cy + 448);
      assert.ok(x === 0 || x === 6000 || y === 0 || y === 6000, 'no artificial viewport border');
    }
    return { points, strokes };
  }
  assert.equal(draw(3000, 3000).strokes, 0, 'offscreen border must submit no shadow work');
  for (const [cx, cy] of [[0, 3000], [6000, 3000], [3000, 0], [3000, 6000]]) {
    assert.equal(draw(cx, cy).points.length, 2, 'only the visible edge is submitted');
  }
  assert.equal(draw(0, 0).points.length, 4, 'both corner edges remain visible');
  assert.equal(draw(-2000, -2000).strokes, 0);
  console.log('PASS: smooth render motion, camera subpixels, particle recycling; bounded catch-up at 30/60/120/144 Hz; viewport-bounded border shadows.');
} finally {
  await rm(temp, { recursive: true, force: true });
}
