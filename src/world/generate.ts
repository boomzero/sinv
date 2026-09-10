import { exitLayout, outsideExit, CAPSULE_COUNT } from './exit';
import { mulberry32, range, type RNG } from '../util/rng';
import type { Difficulty } from '../difficulty';
import type { GravityWell, PickupType } from '../entities/types';
import { WELL_RADIUS, WHITE_HOLE_RADIUS, ORB_COUNT, SHIELD_COUNT, BOOSTCELL_COUNT, LANDMARK_SCALE, MAGNET_COUNT } from '../constants';

export interface Point { x: number; y: number }
export type LandmarkKind = 'halo' | 'binary' | 'graveyard' | 'needle' | 'pocket';
export interface Structure extends Point {
  /** Convex local vertices. Rendering and physics use this exact polygon. */
  verts: number[];
  material: 'metal' | 'rock';
  accent: string;
}
export interface Landmark extends Point {
  kind: LandmarkKind;
  name: string;
  condition: string;
  hint: string;
  radius: number;
  angle: number;
  variant: number;
  color: string;
  structures: Structure[];
  discovered: boolean;
}
export interface PickupSpawn extends Point { type: PickupType; bonus: boolean; phase: number; landmark?: LandmarkKind }
export interface RockSpawn extends Point { radius: number; cloud?: number }
export interface AsteroidCloud extends Point { radius: number }
export interface WorldLayout {
  seed: number;
  landmarks: Landmark[];
  wells: GravityWell[];
  pickups: PickupSpawn[];
  rocks: RockSpawn[];
  clouds: AsteroidCloud[];
  totalGems: number;
}

const TAU = Math.PI * 2;
const KINDS: LandmarkKind[] = ['halo', 'binary', 'graveyard', 'needle', 'pocket'];
const RADII: Record<LandmarkKind, number> = { halo: 480, binary: 660, graveyard: 510, needle: 490, pocket: 470 };
const DETAILS: Record<LandmarkKind, { name: string; color: string; conditions: [string, string]; hints: [string, string] }> = {
  halo: { name: 'BROKEN HALO', color: '#8be5ff', conditions: ['Open circuit', 'Shattered arc'], hints: ['Cut through the ring. Choose your exit early.', 'A collapsed arc opens a wider escape route.'] },
  binary: { name: 'THE BINARY', color: '#c69aff', conditions: ['Close embrace', 'Wide orbit'], hints: ['Skirt the violet core. Let the white vortex throw you clear.', 'The wider gap offers a gentler gravity crossing.'] },
  graveyard: { name: 'SHIP GRAVEYARD', color: '#e3b783', conditions: ['Convoy remains', 'Staggered flagship'], hints: ['Thread the wrecks or take the long way around.', 'The offset flagship changes your approach to the shortcut.'] },
  needle: { name: 'THE NEEDLE', color: '#f1c576', conditions: ['Straight shot', 'Offset seam'], hints: ['Line up before boosting through the seam.', 'The seam bends. Ease off before the second half.'] },
  pocket: { name: "SMUGGLER’S POCKET", color: '#79dfb2', conditions: ['Sheltered cache', 'Breached vault'], hints: ['Supplies inside. Keep the other exit in sight.', 'A third breach gives you another way out.'] },
};

function shuffled<T>(values: T[], rng: RNG): T[] {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function localPoint(l: Pick<Landmark, 'x' | 'y' | 'angle'>, x: number, y: number): Point {
  const c = Math.cos(l.angle), s = Math.sin(l.angle);
  return { x: l.x + x * c - y * s, y: l.y + x * s + y * c };
}

/** Distance from a point to a convex polygon, including its interior. */
export function distanceToStructure(p: Point, solid: Structure): number {
  const x = p.x - solid.x, y = p.y - solid.y, v = solid.verts;
  let inside = false, distance = Infinity;
  for (let i = 0, j = v.length - 2; i < v.length; j = i, i += 2) {
    const ax = v[j], ay = v[j + 1], bx = v[i], by = v[i + 1];
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    distance = Math.min(distance, Math.hypot(x - ax - dx * t, y - ay - dy * t));
  }
  return inside ? 0 : distance;
}

export function generateWorld(seed: number, difficulty: Pick<Difficulty, 'mapW' | 'mapH' | 'gemCount' | 'asteroidCount'>): WorldLayout {
  const rng = mulberry32(seed);
  const { mapW: w, mapH: h } = difficulty;
  // The first three gems follow the ship's starting heading and are visible
  // immediately. Reserve the whole opening trail before placing terrain.
  const openingTrail = [70, 140, 210].map(d => ({ x: 350 + d, y: h - 350 - d }));
  const protectedPoints = [{ x: 350, y: h - 350 }, ...openingTrail, { x: w - 320, y: h - 320 }, { x: 350, y: 350 }, { x: w - 350, y: 350 }];
  const chosen: LandmarkKind[] = ['binary', ...shuffled(KINDS.filter(k => k !== 'binary'), rng).slice(0, 2)];
  const landmarks: Landmark[] = [];
  // Reserve complete footprints, including gravity fields, so neighboring
  // landmarks never close one another's entrances. Rejection is bounded.
  for (let attempt = 0; attempt < 40; attempt++) {
    landmarks.length = 0;
    for (const kind of chosen) {
      const radius = RADII[kind] * LANDMARK_SCALE;
      for (let t = 0; t < 200; t++) {
        const p = { x: range(rng, radius + 130, w - radius - 130), y: range(rng, radius + 130, h - radius - 130) };
        if (!outsideExit(p, w, h, radius + 140)) continue;
        if (protectedPoints.some(q => Math.hypot(p.x - q.x, p.y - q.y) < radius + 200)) continue;
        if (landmarks.some(q => Math.hypot(p.x - q.x, p.y - q.y) < radius + q.radius + 140)) continue;
        const variant = rng() < 0.5 ? 0 : 1, d = DETAILS[kind];
        landmarks.push({ ...p, kind, radius, variant, angle: rng() * TAU, name: d.name, color: d.color, condition: d.conditions[variant], hint: d.hints[variant], structures: [], discovered: false });
        break;
      }
    }
    if (landmarks.length === 3) break;
  }
  if (landmarks.length !== 3) throw new Error(`Could not place landmarks for seed ${seed}`);

  // Open-space scavenging and landmarks are complementary routes. A pilot can
  // skip any one landmark by collecting more widely through the asteroid field.
  const world: WorldLayout = { seed: seed >>> 0, landmarks, wells: [], pickups: [], rocks: [], clouds: [], totalGems: Math.ceil(difficulty.gemCount * 1.4) };
  const fieldBudget = Math.floor(world.totalGems / 3);
  const addPickup = (p: Point, type: PickupType = 'gem', bonus = false, landmark?: LandmarkKind) => world.pickups.push({ ...p, type, bonus, phase: rng() * 10, landmark });
  for (const p of openingTrail) addPickup(p);
  const landmarkBudget = world.totalGems - fieldBudget;
  for (const [landmarkIndex, l] of landmarks.entries()) {
    const gemCount = Math.floor(landmarkBudget / landmarks.length) + (landmarkIndex < landmarkBudget % landmarks.length ? 1 : 0);
    const collect = (p: Point, type: PickupType = 'gem', bonus = false) => addPickup(p, type, bonus, l.kind);
    const point = (x: number, y: number) => localPoint(l, x * LANDMARK_SCALE, y * LANDMARK_SCALE);
    const solid = (verts: number[], material: Structure['material'] = 'metal') => {
      const rotated: number[] = [];
      for (let i = 0; i < verts.length; i += 2) {
        const p = point(verts[i], verts[i + 1]);
        rotated.push(p.x - l.x, p.y - l.y);
      }
      l.structures.push({ x: l.x, y: l.y, verts: rotated, material, accent: l.color });
    };
    const ring = (inner: number, outer: number, gaps: number[], material: Structure['material']) => {
      for (let i = 0; i < 24; i++) {
        if (gaps.includes(i)) continue;
        const a = i / 24 * TAU, b = (i + 1) / 24 * TAU;
        const edge = (n: number) => material === 'rock' ? outer * (0.93 + Math.sin(n * 4.91) * 0.07) : outer;
        const oa = edge(i), ob = edge(i + 1);
        solid([Math.cos(a) * inner, Math.sin(a) * inner, Math.cos(a) * oa, Math.sin(a) * oa, Math.cos(b) * ob, Math.sin(b) * ob, Math.cos(b) * inner, Math.sin(b) * inner], material);
      }
    };
    if (l.kind === 'halo') {
      ring(260, 360, l.variant ? [0, 1, 2, 3, 10, 11, 17, 18] : [0, 1, 10, 11, 17, 18], 'metal');
      const innerCount = Math.ceil(gemCount * 2 / 3), outerCount = gemCount - innerCount;
      for (let i = 0; i < innerCount; i++) collect(point(Math.cos(i * TAU / innerCount) * 200, Math.sin(i * TAU / innerCount) * 200));
      for (let i = 0; i < outerCount; i++) {
        const a = Math.PI / 6 + i * TAU / outerCount;
        collect(point(Math.cos(a) * 420, Math.sin(a) * 420));
      }
      collect(point(0, 0), 'boost');
    } else if (l.kind === 'binary') {
      const bx = l.variant ? -190 : -160, wx = l.variant ? 310 : 280;
      world.wells.push({ ...point(bx, 0), radius: WELL_RADIUS, polarity: 1 }, { ...point(wx, 0), radius: WHITE_HOLE_RADIUS, polarity: -1 });
      // Only the inner arc earns the danger bonus. Keep actual well forces,
      // core and bait distances unchanged as the surrounding routes expand.
      for (let band = 0; band < 3; band++) {
        const count = Math.floor(gemCount / 3) + (band < gemCount % 3 ? 1 : 0);
        const radius = [300, 460, 620][band];
        for (let i = 0; i < count; i++) {
          const a = Math.PI / 2 + i * Math.PI / (count - 1);
          collect(point(bx + Math.cos(a) * radius / LANDMARK_SCALE, Math.sin(a) * radius / LANDMARK_SCALE), 'gem', band === 0);
        }
      }
      collect(point(20, -400), 'boost');
    } else if (l.kind === 'graveyard') {
      for (let i = 0; i < 3; i++) {
        const y = (i - 1) * 245;
        const x = i === 1 && l.variant ? -150 : (i % 2 ? 80 : -60);
        solid([x - 285, y - 65, x + 170, y - 65, x + 285, y, x + 170, y + 65, x - 285, y + 65]);
      }
      for (let i = 0; i < gemCount; i++) {
        const row = i % 4;
        const rowCount = Math.floor(gemCount / 4) + (row < gemCount % 4 ? 1 : 0);
        const x = rowCount === 1 ? 0 : -200 + Math.floor(i / 4) * 400 / (rowCount - 1);
        collect(point(x, [-123, 123, -390, 390][row]));
      }
      collect(point(0, 420), 'shield');
    } else if (l.kind === 'needle') {
      // The offset variant widens the transition so it is always traversable.
      for (const side of [-1, 1]) {
        if (!l.variant) solid([-355, side * 60, 330, side * 60, 390, side * 145, 200, side * 235, -270, side * 220, -400, side * 140], 'rock');
        else {
          for (const half of [-1, 1]) {
            const x = half * 195, y = half * 35;
            solid([x - 180, y + side * 75, x + 180, y + side * 75, x + 150, y + side * 200, x - 155, y + side * 200], 'rock');
          }
        }
      }
      const seamCount = Math.ceil(gemCount / 3);
      for (let i = 0; i < seamCount; i++) {
        const x = -300 + i * 600 / (seamCount - 1);
        collect(point(x, l.variant ? Math.max(-1, Math.min(1, x / 90)) * 35 : 0));
      }
      for (let i = 0; i < gemCount - seamCount; i++) {
        const rowCount = i % 2 ? Math.floor((gemCount - seamCount) / 2) : Math.ceil((gemCount - seamCount) / 2);
        const x = -300 + Math.floor(i / 2) * 600 / Math.max(1, rowCount - 1);
        collect(point(x, i % 2 ? 310 : -310));
      }
      collect(point(-420, l.variant ? -35 : 0), 'boost');
    } else {
      ring(210, 330, l.variant ? [0, 1, 8, 9, 15, 16] : [0, 1, 12, 13], 'rock');
      const innerCount = Math.ceil(gemCount / 2), outerCount = gemCount - innerCount;
      for (let i = 0; i < innerCount; i++) collect(point(Math.cos(i * TAU / innerCount) * 145, Math.sin(i * TAU / innerCount) * 145));
      for (let i = 0; i < outerCount; i++) {
        const a = Math.PI / 6 + i * TAU / outerCount;
        collect(point(Math.cos(a) * 390, Math.sin(a) * 390));
      }
      collect(point(-50, 0), 'orb');
      collect(point(50, 0), 'boost');
    }
  }

  const solids = landmarks.flatMap(l => l.structures);
  const clear = (p: Point, clearance: number) => outsideExit(p, w, h, clearance) && p.x > 110 && p.y > 110 && p.x < w - 110 && p.y < h - 110 &&
    solids.every(s => distanceToStructure(p, s) > clearance) &&
    world.wells.every(q => Math.hypot(p.x - q.x, p.y - q.y) > q.radius + clearance);
  const sample = (clearance: number, spawnDistance: number): Point => {
    const valid = (p: Point) => clear(p, clearance) && protectedPoints.every(q => Math.hypot(p.x - q.x, p.y - q.y) > spawnDistance) && world.pickups.every(q => Math.hypot(p.x - q.x, p.y - q.y) > clearance + 35) && world.rocks.every(r => Math.hypot(p.x - r.x, p.y - r.y) > clearance + r.radius);
    for (let t = 0; t < 500; t++) {
      const p = { x: range(rng, 150, w - 150), y: range(rng, 150, h - 150) };
      if (valid(p)) return p;
    }
    // A deterministic scan replaces the old unchecked center-of-map fallback.
    for (let y = 160; y < h - 150; y += 85) for (let x = 160; x < w - 150; x += 85) if (valid({ x, y })) return { x, y };
    throw new Error(`No safe spawn for seed ${seed}`);
  };
  const outsideLandmarks = (p: Point, margin = 0) => landmarks.every(l => Math.hypot(p.x - l.x, p.y - l.y) > l.radius + margin);
  // Four clouds, one in each quarter, make open-space travel an active route.
  // Each reserves a small gem trail and enough room for weaving between rocks.
  for (let quadrant = 0; quadrant < 4; quadrant++) {
    const validCenter = (p: Point) => outsideLandmarks(p, 280) && clear(p, 400) &&
      protectedPoints.every(q => Math.hypot(p.x - q.x, p.y - q.y) > 850) &&
      world.clouds.every(q => Math.hypot(p.x - q.x, p.y - q.y) > 1000);
    let center: Point | undefined;
    for (let attempt = 0; attempt < 600; attempt++) {
      const p = { x: range(rng, 550, w / 2 - 300) + quadrant % 2 * w / 2, y: range(rng, 550, h / 2 - 300) + Math.floor(quadrant / 2) * h / 2 };
      if (validCenter(p)) { center = p; break; }
    }
    if (!center) {
      for (let y = 600; y < h - 500 && !center; y += 220) for (let x = 600; x < w - 500; x += 220) {
        if (validCenter({ x, y })) { center = { x, y }; break; }
      }
    }
    if (!center) throw new Error(`No asteroid cloud space for seed ${seed}`);
    world.clouds.push({ ...center, radius: 520 });
    const angle = rng() * TAU;
    for (const d of [-180, 0, 180]) addPickup({ x: center.x + Math.cos(angle) * d, y: center.y + Math.sin(angle) * d });
  }
  // Scatter the rest broadly, never inside an unlabelled landmark footprint.
  while (world.pickups.filter(p => p.type === 'gem' && !p.landmark).length < fieldBudget) {
    let point: Point | undefined;
    for (let attempt = 0; attempt < 600; attempt++) {
      const p = sample(100, 500);
      if (outsideLandmarks(p, 100)) { point = p; break; }
    }
    if (!point) throw new Error(`No field gem space for seed ${seed}`);
    addPickup(point);
  }
  // Supply budgets include the deliberately placed caches.
  for (const [type, count] of [['orb', ORB_COUNT], ['shield', SHIELD_COUNT], ['boost', BOOSTCELL_COUNT]] as const) {
    for (let i = world.pickups.filter(p => p.type === type).length; i < count; i++) addPickup(sample(40, 300), type);
  }
  // Guarantee an early refuel on a safe route away from the starting corner.
  addPickup({ x: 550, y: h - 400 }, 'boost');
  for (let i = 0; i < difficulty.asteroidCount; i++) {
    const radius = 20 + Math.pow(rng(), 1.8) * 50;
    let p: Point | undefined;
    let cloudIndex: number | undefined;
    if (i < Math.floor(difficulty.asteroidCount * 0.6)) {
      const cloud = world.clouds[i % world.clouds.length];
      for (let attempt = 0; attempt < 500; attempt++) {
        const a = rng() * TAU, d = Math.sqrt(rng()) * cloud.radius;
        const q = { x: cloud.x + Math.cos(a) * d, y: cloud.y + Math.sin(a) * d };
        if (clear(q, radius + 45) && protectedPoints.every(v => Math.hypot(q.x - v.x, q.y - v.y) > 450) &&
          world.pickups.every(v => Math.hypot(q.x - v.x, q.y - v.y) > radius + 70) &&
          world.rocks.every(r => Math.hypot(q.x - r.x, q.y - r.y) > radius + r.radius + 55)) { p = q; cloudIndex = i % world.clouds.length; break; }
      }
    }
    p ??= sample(radius + 45, 450);
    world.rocks.push({ ...p, radius, cloud: cloudIndex });
  }
  // Three independent landmark caches and three field capsules. No fixed route
  // is required, and all six lie outside the reserved exit challenge.
  for (const l of landmarks) {
    const anchor = world.pickups.find(p => p.landmark === l.kind && p.type !== 'gem')!;
    let placed = false;
    for (const offset of [65, 95, 125]) {
      for (let i = 0; i < 12 && !placed; i++) {
        const p = { x: anchor.x + Math.cos(i * TAU / 12) * offset, y: anchor.y + Math.sin(i * TAU / 12) * offset };
        if (clear(p, 30) && world.pickups.every(q => Math.hypot(p.x - q.x, p.y - q.y) > 45) &&
          world.rocks.every(r => Math.hypot(p.x - r.x, p.y - r.y) > r.radius + 40)) {
          addPickup(p, 'antimatter', false, l.kind); placed = true;
        }
      }
      if (placed) break;
    }
    if (!placed) addPickup(sample(50, 300), 'antimatter');
  }
  while (world.pickups.filter(p => p.type === 'antimatter').length < CAPSULE_COUNT) addPickup(sample(60, 300), 'antimatter');
  for (let i = 0; i < MAGNET_COUNT; i++) addPickup(sample(50, 300), 'magnet');
  world.wells.push(...exitLayout(w, h).wells);
  return world;
}
