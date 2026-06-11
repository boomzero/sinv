import RAPIER from '@dimforge/rapier2d-compat';
import { PhysicsContext, PICKUP_GROUPS } from '../physics';
import type { Pickup, PickupType, Gate } from './types';

export const PICKUP_RADIUS: Record<PickupType, number> = {
  gem: 11,
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
): Pickup {
  const collider = ctx.world.createCollider(
    RAPIER.ColliderDesc.ball(PICKUP_RADIUS[type] + 6) // forgiving grab radius
      .setTranslation(x, y)
      .setSensor(true)
      .setCollisionGroups(PICKUP_GROUPS)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
  );
  const pickup: Pickup = { kind: 'pickup', type, collider, x, y, taken: false, phase };
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
  const gate: Gate = { kind: 'gate', collider, x, y, active: false };
  ctx.register(collider, gate);
  return gate;
}
