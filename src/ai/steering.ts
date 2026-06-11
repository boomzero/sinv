export interface Vec {
  x: number;
  y: number;
}

export function len(v: Vec): number {
  return Math.hypot(v.x, v.y);
}

export function norm(v: Vec): Vec {
  const l = len(v);
  return l > 1e-6 ? { x: v.x / l, y: v.y / l } : { x: 0, y: 0 };
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Pursuit with prediction: aim at where the target will be, assuming it keeps
 * its current velocity for the time it takes the pursuer to close the gap.
 * Returns the desired velocity (magnitude = maxSpeed).
 */
export function pursue(
  pos: Vec,
  targetPos: Vec,
  targetVel: Vec,
  maxSpeed: number,
): Vec {
  const dist = Math.hypot(targetPos.x - pos.x, targetPos.y - pos.y);
  const t = clamp(dist / Math.max(maxSpeed, 1), 0, 1.2);
  const aim = norm({
    x: targetPos.x + targetVel.x * t - pos.x,
    y: targetPos.y + targetVel.y * t - pos.y,
  });
  return { x: aim.x * maxSpeed, y: aim.y * maxSpeed };
}

/**
 * Steering force that drives the current velocity toward the desired one.
 * Capped so the pursuer can't accelerate unboundedly.
 */
export function steerToward(
  vel: Vec,
  desired: Vec,
  mass: number,
  gain: number,
  maxAccel: number,
): Vec {
  let fx = (desired.x - vel.x) * gain;
  let fy = (desired.y - vel.y) * gain;
  const a = Math.hypot(fx, fy);
  if (a > maxAccel) {
    fx = (fx / a) * maxAccel;
    fy = (fy / a) * maxAccel;
  }
  return { x: fx * mass, y: fy * mass };
}
