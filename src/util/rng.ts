export type RNG = () => number;

/** Mulberry32 seeded PRNG returning floats in [0, 1). */
export function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic hash of integer coordinates to a 32-bit seed (for starfield tiles). */
export function hash2(x: number, y: number, salt: number): number {
  let h = (x * 374761393 + y * 668265263 + salt * 144665) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export function range(rng: RNG, min: number, max: number): number {
  return min + rng() * (max - min);
}
