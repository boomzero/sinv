import assert from 'node:assert/strict';
import { build } from 'vite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const temp = await mkdtemp(join(tmpdir(), 'sinv-frames-'));
try {
  await build({ configFile: false, logLevel: 'silent', publicDir: false, build: {
    outDir: temp, lib: { entry: ['src/fixed-step.ts', 'src/render/bounds.ts'], formats: ['es'], fileName: (_, name) => `${name}.mjs` },
  } });
  const { FixedStepAccumulator, FIXED_DT } = await import(pathToFileURL(join(temp, 'fixed-step.mjs')));
  const { drawBounds } = await import(pathToFileURL(join(temp, 'bounds.mjs')));
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
  console.log('PASS: bounded catch-up at 30/60/120/144 Hz; viewport-bounded border shadows.');
} finally {
  await rm(temp, { recursive: true, force: true });
}
