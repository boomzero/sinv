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
  };
  ctx.register(collider, player);
  return player;
}

export interface PlayerFrame {
  thrusting: boolean;
  boosting: boolean;
}

export function updatePlayer(player: Player, input: Input, dt: number): PlayerFrame {
  const { body } = player;
  player.damageCooldown = Math.max(0, player.damageCooldown - dt);

  body.setAngvel(input.turn * PLAYER_TURN_SPEED, true);
  body.resetForces(true);

  const boosting = input.boost && input.thrust && player.boostFuel > 0;
  if (boosting) {
    player.boostFuel = Math.max(0, player.boostFuel - BOOST_DRAIN * dt);
  } else {
    player.boostFuel = Math.min(BOOST_MAX, player.boostFuel + BOOST_REGEN * dt);
  }

  let accel = 0;
  if (input.thrust) accel += PLAYER_ACCEL * (boosting ? BOOST_MULT : 1);
  if (input.reverse) accel -= PLAYER_REVERSE_ACCEL;

  if (accel !== 0) {
    const rot = body.rotation();
    const m = body.mass();
    body.addForce({ x: Math.cos(rot) * accel * m, y: Math.sin(rot) * accel * m }, true);
  }

  return { thrusting: input.thrust, boosting };
}
