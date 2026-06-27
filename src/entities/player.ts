import RAPIER from '@dimforge/rapier2d-compat';
import { PhysicsContext, PLAYER_GROUPS } from '../physics';
import type { Player } from './types';
import type { Input } from '../input';
import {
  PLAYER_RADIUS,
  PLAYER_ACCEL,
  PLAYER_REVERSE_ACCEL,
  PLAYER_TURN_SPEED,
  PLAYER_DAMPING,
  BOOST_MULT,
  BOOST_MAX,
  BOOST_DRAIN,
  BOOST_REGEN,
  HULL_MAX,
} from '../constants';

export function createPlayer(ctx: PhysicsContext, x: number, y: number): Player {
  const body = ctx.world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y)
      .setLinearDamping(PLAYER_DAMPING)
      .setAngularDamping(8)
      .setCcdEnabled(true),
  );
  const collider = ctx.world.createCollider(
    RAPIER.ColliderDesc.ball(PLAYER_RADIUS)
      .setRestitution(0.6)
      .setCollisionGroups(PLAYER_GROUPS)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    body,
  );
  const player: Player = {
    kind: 'player',
    body,
    collider,
    hull: HULL_MAX,
    boostFuel: BOOST_MAX,
    shield: false,
    mult: 1,
    damageCooldown: 0,
    alive: true,
    healedTotal: 0,
  };
  ctx.register(collider, player);
  return player;
}

export interface PlayerFrame {
  thrusting: boolean;
  boosting: boolean;
}

export function updatePlayer(
  player: Player,
  input: Input,
  dt: number,
  aimAngle: number | null = null,
  cheats = false,
): PlayerFrame {
  const { body } = player;
  player.damageCooldown = Math.max(0, player.damageCooldown - dt);

  if (input.turn !== 0 || aimAngle === null) {
    // Keyboard steering always wins when actively used
    body.setAngvel(input.turn * PLAYER_TURN_SPEED, true);
  } else {
    // Mouse steering: rotate toward the cursor, snappier than key turning
    let diff = aimAngle - body.rotation();
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const cap = PLAYER_TURN_SPEED * 1.5;
    body.setAngvel(Math.max(-cap, Math.min(cap, diff * 10)), true);
  }
  body.resetForces(true);

  const thrusting = input.thrust || (aimAngle !== null && input.mouseDown);
  const boosting = input.boost && thrusting && (cheats || player.boostFuel > 0);
  if (cheats) {
    // Infinite boost: the tank never empties.
    player.boostFuel = BOOST_MAX;
  } else if (boosting) {
    player.boostFuel = Math.max(0, player.boostFuel - BOOST_DRAIN * dt);
  } else {
    player.boostFuel = Math.min(BOOST_MAX, player.boostFuel + BOOST_REGEN * dt);
  }

  let accel = 0;
  if (thrusting) accel += PLAYER_ACCEL * (boosting ? BOOST_MULT : 1);
  if (input.reverse) accel -= PLAYER_REVERSE_ACCEL;

  if (accel !== 0) {
    const rot = body.rotation();
    const m = body.mass();
    body.addForce({ x: Math.cos(rot) * accel * m, y: Math.sin(rot) * accel * m }, true);
  }

  return { thrusting, boosting };
}
