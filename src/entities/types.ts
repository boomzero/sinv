import type { RigidBody, Collider } from '@dimforge/rapier2d-compat';

export type PickupType = 'gem' | 'orb' | 'shield' | 'boost';

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
}

export interface Hunter {
  kind: 'hunter';
  body: RigidBody;
  collider: Collider;
  stunnedUntil: number;
  lungeTimer: number;
  /** > 0 while telegraphing an imminent lunge (seconds remaining). */
  telegraph: number;
}

export interface Asteroid {
  kind: 'asteroid';
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

export interface Gate {
  kind: 'gate';
  collider: Collider;
  x: number;
  y: number;
  active: boolean;
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
}

export type Entity = Player | Hunter | Asteroid | Pickup | Gate | Wall;
