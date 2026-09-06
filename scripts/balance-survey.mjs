// A repeatable route-length comparison, not a prediction of human clear times.
// Greedy collection + exit, with terrain detours. Ignores threats and gravity.
import { build } from 'vite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const temp = await mkdtemp(join(tmpdir(), 'sinv-balance-'));
globalThis.Image = class {};
try {
  await build({ configFile: false, logLevel: 'silent', publicDir: false, build: { outDir: temp, lib: { entry: 'scripts/test-entry.ts', formats: ['es'], fileName: () => 'world.mjs' } } });
  const { generateWorld, DIFFICULTIES, Navigation } = await import(pathToFileURL(join(temp, 'world.mjs')));
  const difficulty = DIFFICULTIES[1];
  for (const seed of [0, 7, 19, 42, 73]) {
    const layout = generateWorld(seed, difficulty);
    const nav = new Navigation(difficulty.mapW, difficulty.mapH, layout.landmarks.flatMap(l => l.structures));
    const remaining = layout.pickups.filter(p => p.type === 'gem');
    let pos = { x: 350, y: difficulty.mapH - 350 }, distance = 0;
    const visited = new Set();
    const length = (start, path) => {
      if (!path.length) return Infinity;
      let total = 0, prev = start;
      for (const p of path) { total += Math.hypot(p.x - prev.x, p.y - prev.y); prev = p; }
      return total;
    };
    for (let i = 0; i < difficulty.gemCount; i++) {
      let best = -1, shortest = Infinity;
      for (const [j, gem] of remaining.entries()) {
        // Straight-line distance is a lower bound; avoid needless A* searches.
        if (Math.hypot(gem.x - pos.x, gem.y - pos.y) >= shortest) continue;
        const cost = length(pos, nav.findPath(pos, gem));
        if (cost < shortest) { shortest = cost; best = j; }
      }
      if (best < 0) throw new Error(`Unreachable gem on seed ${seed}`);
      pos = remaining.splice(best, 1)[0];
      if (pos.landmark) visited.add(pos.landmark);
      distance += shortest;
    }
    distance += length(pos, nav.findPath(pos, { x: difficulty.mapW - 320, y: difficulty.mapH - 320 }));
    console.log(JSON.stringify({ seed, gems: layout.totalGems, landmarksVisited: visited.size, routeUnits: Math.round(distance) }));
  }
} finally {
  await rm(temp, { recursive: true, force: true });
}
