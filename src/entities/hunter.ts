import RAPIER from '@dimforge/rapier2d-compat';
import { PhysicsContext, HUNTER_GROUPS, HUNTER_RAY_GROUPS } from '../physics';
import type { Hunter, Player } from './types';
import { pursue, steerToward, norm, len } from '../ai/steering';
import {
  HUNTER_RADIUS,
  HUNTER_BASE_SPEED,
  HUNTER_SPEED_PER_15S,
  HUNTER_SPEED_PER_ORB,
  HUNTER_SPEED_CAP,
  HUNTER_GAIN,
  HUNTER_WARMUP,
  HUNTER_LUNGE_PERIOD,
  HUNTER_LUNGE_TELEGRAPH,
  HUNTER_LUNGE_IMPULSE,
  HUNTER_AVOID_DIST,
  HUNTER_AVOID_MIN_RADIUS,
} from '../constants';

export function createHunter(ctx: PhysicsContext, x: number, y: number): Hunter {
  const body = ctx.world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y)
      .setLinearDamping(0.6)
      .lockRotations()
      .setCcdEnabled(true),
  );
  const collider = ctx.world.createCollider(
    RAPIER.ColliderDesc.ball(HUNTER_RADIUS)
      .setDensity(4) // heavy: smashes asteroids aside
      .setRestitution(0.4)
      .setCollisionGroups(HUNTER_GROUPS)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    body,
  );
  const hunter: Hunter = {
    kind: 'hunter',
    body,
    collider,
    stunnedUntil: 0,
    lungeTimer: HUNTER_LUNGE_PERIOD,
    telegraph: 0,
  };
  ctx.register(collider, hunter);
  return hunter;
}

export function hunterMaxSpeed(playTime: number, orbsCollected: number): number {
  return Math.min(
    HUNTER_SPEED_CAP,
    HUNTER_BASE_SPEED +
      (playTime / 15) * HUNTER_SPEED_PER_15S +
      orbsCollected * HUNTER_SPEED_PER_ORB,
  );
}

export function updateHunter(
  hunter: Hunter,
  player: Player,
  ctx: PhysicsContext,
  playTime: number,
  orbsCollected: number,
  lungesUnlocked: boolean,
  dt: number,
): void {
  const { body } = hunter;
  body.resetForces(true);

  if (playTime < HUNTER_WARMUP || playTime < hunter.stunnedUntil) {
    hunter.telegraph = 0;
    return;
  }

  const pos = body.translation();
  const vel = body.linvel();
  const ppos = player.body.translation();
  const pvel = player.body.linvel();
  const maxSpeed = hunterMaxSpeed(playTime, orbsCollected);

  const desired = pursue(pos, ppos, pvel, maxSpeed);

  // Whisker: cast a ray along the heading; veer along the surface normal of
  // whatever rock or wall is in the way, stronger the closer it is.
  const heading = len(vel) > 30 ? norm(vel) : norm(desired);
  const ray = new RAPIER.Ray(pos, heading);
  const hit = ctx.world.castRayAndGetNormal(
    ray,
    HUNTER_AVOID_DIST,
    true,
    undefined,
    HUNTER_RAY_GROUPS,
    hunter.collider,
  );
  if (hit) {
    // Small rocks aren't worth dodging — the hunter plows through and shoves
    // them aside on contact. Only big rocks and walls get steered around.
    const obstacle = ctx.byCollider.get(hit.collider.handle);
    const ramThrough =
      obstacle?.kind === 'asteroid' && obstacle.radius < HUNTER_AVOID_MIN_RADIUS;
    if (!ramThrough) {
      const urgency = 1 - hit.timeOfImpact / HUNTER_AVOID_DIST;
      desired.x += hit.normal.x * maxSpeed * 1.6 * urgency;
      desired.y += hit.normal.y * maxSpeed * 1.6 * urgency;
    }
  }

  const force = steerToward(vel, desired, body.mass(), HUNTER_GAIN, 1100);
  body.addForce(force, true);

  // Periodic lunge once the player has collected most of the gems: telegraphed
  // by a red flash, then an impulse burst toward the predicted position.
  if (lungesUnlocked) {
    hunter.lungeTimer -= dt;
    hunter.telegraph =
      hunter.lungeTimer <= HUNTER_LUNGE_TELEGRAPH ? hunter.lungeTimer : 0;
    if (hunter.lungeTimer <= 0) {
      hunter.lungeTimer = HUNTER_LUNGE_PERIOD;
      const aim = norm(pursue(pos, ppos, pvel, maxSpeed));
      const m = body.mass();
      body.applyImpulse(
        { x: aim.x * HUNTER_LUNGE_IMPULSE * m, y: aim.y * HUNTER_LUNGE_IMPULSE * m },
        true,
      );
    }
  } else {
    hunter.telegraph = 0;
  }
}
