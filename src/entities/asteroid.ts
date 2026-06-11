import RAPIER from '@dimforge/rapier2d-compat';
import { PhysicsContext, ASTEROID_GROUPS } from '../physics';
import type { Asteroid } from './types';
import type { RNG } from '../util/rng';
import { range } from '../util/rng';

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
): Asteroid {
  const body = ctx.world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y)
      .setLinvel(range(rng, -70, 70), range(rng, -70, 70))
      .setAngvel(range(rng, -0.7, 0.7))
      .setLinearDamping(0)
      .setAngularDamping(0),
  );
  const verts = makeVerts(rng, radius);
  const desc =
    RAPIER.ColliderDesc.convexHull(verts) ?? RAPIER.ColliderDesc.ball(radius);
  const collider = ctx.world.createCollider(
    desc
      .setRestitution(0.9)
      .setCollisionGroups(ASTEROID_GROUPS)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    body,
  );
  const asteroid: Asteroid = { kind: 'asteroid', body, collider, radius, verts };
  ctx.register(collider, asteroid);
  return asteroid;
}
