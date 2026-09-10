import type { RigidBody, Collider } from '@dimforge/rapier2d-compat';

export type PickupType = 'gem' | 'orb' | 'shield' | 'boost' | 'antimatter' | 'magnet';

export interface Player {
  kind: 'player';
  body: RigidBody;
  collider: Collider;
  hull: number;
  boostFuel: number;
  shield: boolean;
  mult: number;
  damageCooldown: number;
  alive: boolean;
  /** Total hull restored by orbs — healed hull only earns half win bonus. */
  healedTotal: number;
  engineMultiplier: number;
}

export interface Hunter {
  kind: 'hunter';
  body: RigidBody;
  collider: Collider;
  stunnedUntil: number;
  lungeTimer: number;
  /** > 0 while telegraphing an imminent lunge (seconds remaining). */
  telegraph: number;
  /** playT at which the hunter re-materializes after a black hole ate it (0 = active). */
  respawnAt: number;
  /** playTime until which a bait near a core keeps the hunter recklessly committed. */
  lureCommitUntil: number;
  /** Strength (0..1) of the avoidance reduction captured at bait time. */
  lureStrength: number;
  /** Corner this hunter spawns and re-materializes at. */
  spawnX: number;
  spawnY: number;
  /** 0..1 offset into the lunge cycle, so multiple hunters don't lunge in sync. */
  lungePhase: number;
  route: { x: number; y: number }[];
  repathAt: number;
}

export interface Asteroid {
  kind: 'asteroid';
  /** Moving asteroid composition controls both its art and physics. */
  composition?: 'rock' | 'ice';
  /** Station and landmark pieces are immovable terrain. */
  fixed?: boolean;
  body: RigidBody;
  collider: Collider;
  radius: number;
  /** Local-space polygon vertices [x0,y0, x1,y1, ...] for both collider and drawing. */
  verts: Float32Array;
}

export interface Pickup {
  kind: 'pickup';
  type: PickupType;
  collider: Collider;
  x: number;
  y: number;
  taken: boolean;
  phase: number; // animation offset
  /** Bonus gems (rings around gravity wells) are worth extra. */
  bonus: boolean;
}

export interface BarrierChunk {
  kind: 'barrier';
  shape: import('../world/generate').Structure;
  collider: Collider;
  destroyedAt: number;
}

export interface Gate {
  kind: 'gate';
  collider: Collider;
  x: number;
  y: number;
  active: boolean;
  layout: import('../world/exit').ExitLayout;
  chunks: BarrierChunk[];
  blasts: number;
}

export interface Wall {
  kind: 'wall';
  collider: Collider;
}

export interface GravityWell {
  x: number;
  y: number;
  radius: number;
  /** 1 = black hole (pulls, deadly core), -1 = white hole (repels). */
  polarity: 1 | -1;
  /** Exit repulsors have no tangential slingshot and dissipate approach momentum. */
  exit?: boolean;
}

export type Entity = Player | Hunter | Asteroid | Pickup | Gate | Wall | BarrierChunk;
