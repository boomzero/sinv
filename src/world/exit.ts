import { GEM_COUNT } from '../constants';
import type { GravityWell } from '../entities/types';
import type { Point, Structure } from './generate';

export const EXIT_HALF_WIDTH = 130;
export const BARRIER_OFFSET = 760;
export const BLAST_RANGE = 260;
export const MIN_BLASTS = 3;
export const MAX_BLASTS = 5;
export const BARRIER_LABELS = [
  'SEALED', 'SURFACE BLASTED', 'CORE EXPOSED', 'NARROW BREACH', 'WIDE BREACH', 'CLEARED',
];
export const CAPSULE_COUNT = 8;
export const GEM_THRUST_GAIN = 0.012;
export const EXIT_REFERENCE_ENGINE = 1 + GEM_COUNT * GEM_THRUST_GAIN;
export const EXIT_WELL_STRENGTH = 1.8;
export const EXIT_FIELD_DRAG = 3;

export interface ExitLayout {
  gate: Point;
  mouth: Point;
  barrier: Point;
  walls: Structure[];
  chunks: Structure[];
  blastStages: number[];
  wells: GravityWell[];
}

/** A west-facing, sealed-back corridor. Only its entrance can reach the exit. */
export function exitLayout(mapW: number, mapH: number): ExitLayout {
  const gate = { x: mapW - 320, y: mapH - 320 };
  const rect = (x: number, y: number, hw: number, hh: number, accent = '#7794a2'): Structure => ({
    x: gate.x + x, y: gate.y + y,
    verts: [-hw, -hh, hw, -hh, hw, hh, -hw, hh], material: 'metal', accent,
  });
  // Fractured boulders share Voronoi boundaries, so their physical hulls
  // seal the corridor without turning every rock into a triangular tile.
  const seeds = Array.from({ length: 60 }, (_, i) => {
    const row = Math.floor(i / 6), col = i % 6;
    return { x: -105 + col * 42 + Math.sin(i * 7.1) * 10,
      y: -130.5 + row * 29 + Math.sin(i * 3.7) * 4, row, col };
  });
  const rocks: Structure[] = [], blastStages: number[] = [];
  for (const seed of seeds) {
    let points: Point[] = [
      { x: -110, y: -145 }, { x: 110, y: -145 }, { x: 125, y: 0 },
      { x: 110, y: 145 }, { x: -110, y: 145 }, { x: -125, y: 0 },
    ];
    for (const other of seeds) {
      if (other === seed) continue;
      const nx = other.x - seed.x, ny = other.y - seed.y;
      const limit = (other.x ** 2 + other.y ** 2 - seed.x ** 2 - seed.y ** 2) / 2;
      const clipped: Point[] = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        const da = a.x * nx + a.y * ny - limit, db = b.x * nx + b.y * ny - limit;
        if (da <= 0) clipped.push(a);
        if ((da <= 0) !== (db <= 0)) {
          const t = da / (da - db);
          clipped.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        }
      }
      points = clipped;
    }
    rocks.push({ x: gate.x - BARRIER_OFFSET, y: gate.y, material: 'rock', accent: '#b7a18b',
      verts: points.flatMap(p => [p.x, p.y]) });
    // Three successive depths open the tunnel; later blasts widen it.
    blastStages.push(seed.row >= 4 && seed.row <= 5 ? Math.floor(seed.col / 2) + 1
      : seed.row >= 2 && seed.row <= 7 ? 4 : 5);
  }
  return {
    gate, mouth: { x: gate.x - 1050, y: gate.y },
    barrier: { x: gate.x - BARRIER_OFFSET, y: gate.y },
    walls: [rect(-460, -170, 580, 40), rect(-460, 170, 580, 40), rect(100, 0, 20, 170)],
    chunks: rocks, blastStages,
    wells: [-1, 1].map(side => ({ x: gate.x - 320, y: gate.y + side * 160, radius: 600, polarity: -1, exit: true })),
  };
}

/** Reserve the entire approach, including its repulsion field and staging area. */
export function outsideExit(p: Point, mapW: number, mapH: number, margin = 0): boolean {
  const gx = mapW - 320, gy = mapH - 320;
  const dx = Math.max(gx - 1250 - p.x, 0, p.x - (gx + 150));
  const dy = Math.max(Math.abs(p.y - gy) - 780, 0);
  return Math.hypot(dx, dy) > margin;
}
