import RAPIER from '@dimforge/rapier2d-compat';
import { PhysicsContext, PICKUP_GROUPS, WALL_GROUPS } from '../physics';
import { exitLayout, MAX_BLASTS, MIN_BLASTS } from '../world/exit';
import type { Pickup, PickupType, Gate, BarrierChunk } from './types';

export const PICKUP_RADIUS: Record<PickupType, number> = {
  gem: 11,
  antimatter: 15,
  magnet: 14,
  orb: 13,
  shield: 13,
  boost: 11,
};

export function createPickup(
  ctx: PhysicsContext,
  type: PickupType,
  x: number,
  y: number,
  phase: number,
  bonus = false,
): Pickup {
  const collider = ctx.world.createCollider(
    RAPIER.ColliderDesc.ball(PICKUP_RADIUS[type] + 6) // forgiving grab radius
      .setTranslation(x, y)
      .setSensor(true)
      .setCollisionGroups(PICKUP_GROUPS)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
  );
  const pickup: Pickup = {
    kind: 'pickup',
    type,
    collider,
    x,
    y,
    taken: false,
    phase,
    bonus,
    magnetVx: 0,
    magnetVy: 0,
  };
  ctx.register(collider, pickup);
  return pickup;
}

export function removePickup(ctx: PhysicsContext, pickup: Pickup): void {
  pickup.taken = true;
  ctx.unregister(pickup.collider);
  ctx.world.removeCollider(pickup.collider, false);
}

export const GATE_RADIUS = 46;

export function createGate(ctx: PhysicsContext, x: number, y: number): Gate {
  const collider = ctx.world.createCollider(
    RAPIER.ColliderDesc.ball(GATE_RADIUS)
      .setTranslation(x, y)
      .setSensor(true)
      .setCollisionGroups(PICKUP_GROUPS)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
  );
  const layout = exitLayout(x + 320, y + 320);
  const chunks = layout.chunks.map(shape => {
    const solid = ctx.world.createCollider(RAPIER.ColliderDesc.convexHull(new Float32Array(shape.verts))!
      .setTranslation(shape.x, shape.y).setRestitution(0.25).setCollisionGroups(WALL_GROUPS).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS));
    const chunk: BarrierChunk = { kind: 'barrier', shape, collider: solid, destroyedAt: -1 };
    ctx.register(solid, chunk);
    return chunk;
  });
  const gate: Gate = { kind: 'gate', collider, x, y, active: false, layout, chunks, blasts: 0 };
  ctx.register(collider, gate);
  return gate;
}

/** Charges excavate a tunnel through real shards before widening its shoulders. */
export function blastBarrier(ctx: PhysicsContext, gate: Gate, time: number): boolean {
  if (gate.blasts >= MAX_BLASTS) return false;
  const indices = gate.layout.blastStages.flatMap((stage, i) => stage === gate.blasts + 1 ? [i] : []);
  for (const i of indices) {
    const chunk = gate.chunks[i];
    ctx.unregister(chunk.collider);
    ctx.world.removeCollider(chunk.collider, true);
    chunk.destroyedAt = time;
  }
  gate.blasts++;
  gate.active = gate.blasts >= MIN_BLASTS; // The third excavation connects the tunnel.
  return true;
}
