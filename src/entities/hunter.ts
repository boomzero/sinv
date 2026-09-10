import RAPIER from '@dimforge/rapier2d-compat';
import { PhysicsContext, HUNTER_GROUPS, HUNTER_RAY_GROUPS } from '../physics';
import type { Hunter, Player, GravityWell } from './types';
import type { Difficulty } from '../difficulty';
import { pursue, steerToward, norm, len } from '../ai/steering';
import type { Navigation } from '../ai/navigation';
import {
  HUNTER_RADIUS,
  HUNTER_BASE_SPEED,
  HUNTER_SPEED_PER_15S,
  HUNTER_SPEED_PER_ORB,
  HUNTER_SPEED_CAP,
  HUNTER_GAIN,
  HUNTER_LUNGE_PERIOD,
  HUNTER_LUNGE_TELEGRAPH,
  HUNTER_LUNGE_IMPULSE,
  HUNTER_AVOID_DIST,
  HUNTER_AVOID_MIN_RADIUS,
  WELL_BAIT_RADIUS,
  HUNTER_LURE_COMMIT,
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
    respawnAt: 0,
    lureCommitUntil: 0,
    lureStrength: 0,
    spawnX: x,
    spawnY: y,
    lungePhase: 0,
    route: [],
    repathAt: 0,
  };
  ctx.register(collider, hunter);
  return hunter;
}

/**
 * Facing used by every hunter marker: the ship noses along its velocity, and
 * idles with a slow spin when it's barely moving. The world icon and the
 * chart/minimap symbol share this so they never disagree.
 */
export function hunterHeading(hunter: Hunter, time: number): number {
  const vel = hunter.body.linvel();
  return Math.hypot(vel.x, vel.y) > 5 ? Math.atan2(vel.y, vel.x) : time * 0.3;
}

export function hunterMaxSpeed(
  playTime: number,
  orbsCollected: number,
  speedMult: number,
  escalationMult = 1,
): number {
  return (
    Math.min(
      HUNTER_SPEED_CAP,
      HUNTER_BASE_SPEED +
        (playTime / 15) * HUNTER_SPEED_PER_15S * escalationMult +
        orbsCollected * HUNTER_SPEED_PER_ORB,
    ) * speedMult
  );
}

export function updateHunter(
  hunter: Hunter,
  player: Player,
  ctx: PhysicsContext,
  playTime: number,
  orbsCollected: number,
  lungesUnlocked: boolean,
  difficulty: Difficulty,
  wells: GravityWell[],
  dt: number,
  navigation: Navigation,
): void {
  const { body } = hunter;
  body.resetForces(true);

  if (playTime < difficulty.hunterWarmup || playTime < hunter.stunnedUntil) {
    hunter.telegraph = 0;
    return;
  }

  const pos = body.translation();
  const vel = body.linvel();
  const ppos = player.body.translation();
  const pvel = player.body.linvel();
  const maxSpeed = hunterMaxSpeed(playTime, orbsCollected, difficulty.hunterSpeedMult, difficulty.hunterEscalationMult);

  const predictionTime = Math.min(1.2, Math.hypot(ppos.x - pos.x, ppos.y - pos.y) / maxSpeed);
  const predicted = { x: ppos.x + pvel.x * predictionTime, y: ppos.y + pvel.y * predictionTime };
  const direct = navigation.clearLine(pos, ppos);
  const clearPrediction = direct && navigation.clearLine(pos, predicted);
  const desired = clearPrediction ? pursue(pos, ppos, pvel, maxSpeed) : pursue(pos, ppos, { x: 0, y: 0 }, maxSpeed);
  if (direct) {
    hunter.route = [];
    // Losing sight around a corner needs a route immediately, even when the
    // previous route's refresh timer hasn't expired yet.
    hunter.repathAt = 0;
  } else {
    if (playTime >= hunter.repathAt) {
      hunter.route = navigation.findPath(pos, ppos);
      hunter.repathAt = playTime + 0.6;
    }
    // Advance to the furthest visible waypoint without cutting solid corners.
    while (hunter.route.length > 1 && (Math.hypot(hunter.route[0].x - pos.x, hunter.route[0].y - pos.y) < 28 || navigation.clearLine(pos, hunter.route[1]))) hunter.route.shift();
    const waypoint = hunter.route[0];
    if (waypoint) {
      const delta = { x: waypoint.x - pos.x, y: waypoint.y - pos.y };
      const distance = len(delta), direction = norm(delta);
      // Enter a turn slowly enough to follow it with momentum-based physics.
      const speed = hunter.route.length > 1 ? Math.min(maxSpeed, 85 + distance * 1.2) : maxSpeed;
      desired.x = direction.x * speed; desired.y = direction.y * speed;
    } else {
      // Re-evaluate shortly rather than blindly accelerate into the same wall.
      desired.x = 0; desired.y = 0;
    }
  }

  // Black-hole avoidance: the hunter resists the pull but can still be dragged
  // into a core, so it actively steers away from any deadly well it's inside.
  // The push ramps with depth^2, so it'll skim a field edge while chasing but
  // bolt outward once it gets dangerously close to the center.
  //
  // Commitment, though, makes it baitable: if the prey is leading it through
  // the same well, the hunter fixates on the catch and won't bail nearly as
  // hard — so a player who skims a core and jukes out at the last moment can
  // lure the chasing hunter straight into the singularity. No shield needed.
  for (const well of wells) {
    if (well.polarity !== 1) continue;
    const dx = pos.x - well.x;
    const dy = pos.y - well.y;
    const dist = Math.hypot(dx, dy);
    if (dist < well.radius && dist > 1) {
      const depth = (well.radius - dist) / well.radius;
      const preyDist = Math.hypot(ppos.x - well.x, ppos.y - well.y);
      // The bait works from inside the visible inner band: thread it and the
      // hunter commits hard — flat strength so a clean pass anywhere in the
      // ring lands, not just a pixel-perfect dive at the core.
      if (preyDist < WELL_BAIT_RADIUS) {
        // Latch the commitment: the prey slingshots clear in a fraction of a
        // second, but the hunter stays locked on long enough for gravity to
        // finish dragging it into the core.
        hunter.lureCommitUntil = playTime + HUNTER_LURE_COMMIT;
        hunter.lureStrength = 0.85;
      }
      const lure = playTime < hunter.lureCommitUntil ? hunter.lureStrength : 0;
      const avoidStrength = 2.6 * (1 - lure);
      const push = maxSpeed * avoidStrength * depth * depth;
      desired.x += (dx / dist) * push;
      desired.y += (dy / dist) * push;
    }
  }

  // Whisker: cast a ray along the heading; veer along the surface normal of
  // whatever rock or wall is in the way, stronger the closer it is.
  const heading = len(vel) > 30 ? norm(vel) : norm(desired);
  const ray = new RAPIER.Ray(pos, heading);
  // Terrain beyond the prey must not repel us before we can make contact.
  const hit = ctx.world.castRayAndGetNormal(
    ray,
    Math.min(HUNTER_AVOID_DIST, Math.hypot(ppos.x - pos.x, ppos.y - pos.y)),
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
    if (!ramThrough && !(!direct && obstacle?.kind === 'asteroid' && obstacle.fixed)) {
      const urgency = 1 - hit.timeOfImpact / HUNTER_AVOID_DIST;
      // A normal-only push can exactly cancel pursuit head-on. Keep a
      // sideways component so the hunter goes around the obstacle instead
      // of waiting for the player to move and break the equilibrium.
      const tangent = { x: -hit.normal.y, y: hit.normal.x };
      const side = desired.x * tangent.x + desired.y * tangent.y < 0 ? -1 : 1;
      desired.x += tangent.x * side * maxSpeed * urgency;
      desired.y += tangent.y * side * maxSpeed * urgency;
      desired.x += hit.normal.x * maxSpeed * 1.6 * urgency;
      desired.y += hit.normal.y * maxSpeed * 1.6 * urgency;
    }
  }

  const force = steerToward(vel, desired, body.mass(), direct ? HUNTER_GAIN : 6, direct ? 1100 : 1400);
  body.addForce(force, true);

  // Periodic lunge once the player has collected most of the gems: telegraphed
  // by a red flash, then an impulse burst toward the predicted position.
  if (lungesUnlocked && clearPrediction) {
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
    // A blocked shot must become visible for a full telegraph before firing.
    hunter.lungeTimer = Math.max(hunter.lungeTimer, HUNTER_LUNGE_TELEGRAPH);
  }
}
