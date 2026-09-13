import { hash2 } from '../util/rng';

/** Smooth seeded gusts: fixed-step/replay safe, with no per-frame random kicks. */
function gust(time: number, seed: number, channel: number): number {
  const tick = Math.floor(time);
  const t = time - tick;
  const blend = t * t * (3 - 2 * t);
  const a = hash2(tick, channel, seed) / 0xffffffff * 2 - 1;
  const b = hash2(tick + 1, channel, seed) / 0xffffffff * 2 - 1;
  return a + (b - a) * blend;
}

/** Inward surges plus orbital drag (1/s); neither can provide a sideways boost. */
export function blackHoleTurbulence(
  seed: number, x: number, y: number, time: number, distance: number, radius: number, angle: number,
): { radial: number; orbitDrag: number } {
  const salt = hash2(Math.round(x), Math.round(y), seed);
  // Full turbulence across the prize arc, fading smoothly over the outer 45%.
  const depth = Math.max(0, Math.min(1, (1 - distance / radius) / 0.45));
  const strength = depth * depth * (3 - 2 * depth);
  const phase = salt / 0xffffffff * Math.PI * 2;
  const radial = 0.7 * gust(time / 1.4, salt, 1) + 0.3 * Math.sin(angle * 3 + time * 1.1 + phase);
  const drag = 0.7 * gust(time / 1.1, salt, 2) + 0.3 * Math.sin(angle * 2 - time * 1.7 + phase);
  return {
    radial: 1 + strength * (0.2 + 0.65 * (radial + 1) / 2),
    orbitDrag: strength * (0.65 + 0.75 * (drag + 1) / 2),
  };
}
