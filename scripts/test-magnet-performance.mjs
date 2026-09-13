import assert from 'node:assert/strict';
import { build } from 'vite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

globalThis.Image = class {};
const temp = await mkdtemp(join(tmpdir(), 'sinv-magnet-'));
try {
  await build({ configFile: false, logLevel: 'silent', publicDir: false, build: {
    outDir: temp, lib: { entry: 'scripts/test-entry.ts', formats: ['es'], fileName: () => 'test.mjs' },
  } });
  const { Navigation, generateWorld, DIFFICULTIES, exitLayout } = await import(pathToFileURL(join(temp, 'test.mjs')));
  function originalClearLine(nav, a, b, margin) {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 12));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (!nav.clearPoint({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, margin)) return false;
    }
    return true;
  }
  const cases = [];
  for (const seed of [1, 42, 137]) {
    const difficulty = DIFFICULTIES[1], world = generateWorld(seed, difficulty);
    const exit = exitLayout(difficulty.mapW, difficulty.mapH);
    const nav = new Navigation(difficulty.mapW, difficulty.mapH, [
      ...world.landmarks.flatMap(l => l.structures), ...exit.walls, ...exit.chunks,
    ]);
    for (const a of world.pickups) {
      for (const radius of [0, 10, 240, 720]) for (let angle = 0; angle < 8; angle++) {
        const b = { x: a.x + Math.cos(angle * Math.PI / 4) * radius, y: a.y + Math.sin(angle * Math.PI / 4) * radius };
        for (const margin of [17, 21, 38]) cases.push({ nav, a, b, margin });
      }
    }
  }
  for (const { nav, a, b, margin } of cases) {
    assert.equal(nav.clearLine(a, b, margin), originalClearLine(nav, a, b, margin), 'optimized clearance preserves terrain and boundary decisions');
  }
  const measure = fn => {
    const samples = [];
    for (let run = 0; run < 5; run++) {
      const start = performance.now();
      for (const c of cases) fn(c.nav, c.a, c.b, c.margin);
      samples.push(performance.now() - start);
    }
    return samples.sort((a, b) => a - b)[2];
  };
  const before = measure(originalClearLine);
  const after = measure((nav, a, b, margin) => nav.clearLine(a, b, margin));
  console.log(`PASS: ${cases.length} clearance comparisons; median batch ${before.toFixed(1)} ms original, ${after.toFixed(1)} ms current (${(before / after).toFixed(1)}x).`);
} finally {
  await rm(temp, { recursive: true, force: true });
}
