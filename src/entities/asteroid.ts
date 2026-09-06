import RAPIER from '@dimforge/rapier2d-compat';
import { PhysicsContext, ASTEROID_GROUPS } from '../physics';
import type { Asteroid } from './types';
import type { RNG } from '../util/rng';
import { range } from '../util/rng';
import type { Structure } from '../world/generate';

export const ASTEROID_MATERIALS = {
  rock: { density: 1.35, restitution: 0.55, friction: 0.7 },
  ice: { density: 0.55, restitution: 0.95, friction: 0.08 },
} as const;

export function createStructure(ctx: PhysicsContext, shape: Structure): Asteroid {
  const body = ctx.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(shape.x, shape.y));
  const verts = new Float32Array(shape.verts);
  const desc = RAPIER.ColliderDesc.convexHull(verts);
  if (!desc) throw new Error('Invalid landmark collider');
  const collider = ctx.world.createCollider(desc.setRestitution(0.55).setCollisionGroups(ASTEROID_GROUPS).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), body);
  const radius = Math.max(...shape.verts.filter((_, i) => i % 2 === 0).map((x, i) => Math.hypot(x, shape.verts[i * 2 + 1])));
  const entity: Asteroid = { kind: 'asteroid', body, collider, verts, radius, fixed: true };
  ctx.register(collider, entity);
  return entity;
}

/** Irregular convex-ish polygon used for both the collider and drawing. */
function makeVerts(rng: RNG, radius: number): Float32Array {
  const n = 8 + Math.floor(rng() * 4);
  const verts = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = radius * range(rng, 0.72, 1.0);
    verts[i * 2] = Math.cos(a) * r;
    verts[i * 2 + 1] = Math.sin(a) * r;
  }
  return verts;
}

export function createAsteroid(
  ctx: PhysicsContext,
  rng: RNG,
  x: number,
  y: number,
  radius: number,
  driftSpeed = 70,
  composition?: 'rock' | 'ice',
): Asteroid {
  const body = ctx.world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y)
      .setLinvel(range(rng, -driftSpeed, driftSpeed), range(rng, -driftSpeed, driftSpeed))
      .setAngvel(range(rng, -0.7, 0.7))
      .setLinearDamping(0)
      .setAngularDamping(0),
  );
  const verts = makeVerts(rng, radius);
  // Reuse seeded geometry so adding variety never shifts gameplay RNG draws.
  composition ??= Math.abs(Math.sin(verts[0] * 127.1 + verts[1] * 311.7) * 43758.5453) % 1 < 0.38 ? 'ice' : 'rock';
  const material = ASTEROID_MATERIALS[composition];
  const desc =
    RAPIER.ColliderDesc.convexHull(verts) ?? RAPIER.ColliderDesc.ball(radius);
  const collider = ctx.world.createCollider(
    desc
      .setDensity(material.density)
      .setRestitution(material.restitution)
      .setFriction(material.friction)
      .setCollisionGroups(ASTEROID_GROUPS)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    body,
  );
  const asteroid: Asteroid = { kind: 'asteroid', composition, body, collider, radius, verts };
  ctx.register(collider, asteroid);
  return asteroid;
}
