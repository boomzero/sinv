import RAPIER from '@dimforge/rapier2d-compat';
import type { World, Collider } from '@dimforge/rapier2d-compat';
import { WALL_T } from './constants';
import type { Entity } from './entities/types';

// Collision group membership bits
export const GROUP = {
  PLAYER: 1 << 0,
  HUNTER: 1 << 1,
  ASTEROID: 1 << 2,
  WALL: 1 << 3,
  PICKUP: 1 << 4,
} as const;

const SOLID = GROUP.PLAYER | GROUP.HUNTER | GROUP.ASTEROID | GROUP.WALL;

/** Rapier interaction groups: high 16 bits = membership, low 16 = filter. */
export function groups(membership: number, filter: number): number {
  return ((membership << 16) | filter) >>> 0;
}

export const PLAYER_GROUPS = groups(GROUP.PLAYER, SOLID | GROUP.PICKUP);
export const HUNTER_GROUPS = groups(GROUP.HUNTER, SOLID);
export const ASTEROID_GROUPS = groups(GROUP.ASTEROID, SOLID);
export const WALL_GROUPS = groups(GROUP.WALL, SOLID);
export const PICKUP_GROUPS = groups(GROUP.PICKUP, GROUP.PLAYER);
// What the hunter's avoidance ray can see
export const HUNTER_RAY_GROUPS = groups(GROUP.HUNTER, GROUP.ASTEROID | GROUP.WALL);

/** Maps collider handles to game entities for collision-event dispatch. */
export class PhysicsContext {
  readonly world: World;
  readonly byCollider = new Map<number, Entity>();

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: 0 });
  }

  register(collider: Collider, entity: Entity): void {
    this.byCollider.set(collider.handle, entity);
  }

  unregister(collider: Collider): void {
    this.byCollider.delete(collider.handle);
  }

  free(): void {
    this.byCollider.clear();
    this.world.free();
  }
}

/** Four fixed cuboid colliders just outside the map rectangle. */
export function createWalls(ctx: PhysicsContext, mapW: number, mapH: number): void {
  const specs: Array<[number, number, number, number]> = [
    // [cx, cy, halfW, halfH]
    [mapW / 2, -WALL_T / 2, mapW / 2 + WALL_T, WALL_T / 2],
    [mapW / 2, mapH + WALL_T / 2, mapW / 2 + WALL_T, WALL_T / 2],
    [-WALL_T / 2, mapH / 2, WALL_T / 2, mapH / 2 + WALL_T],
    [mapW + WALL_T / 2, mapH / 2, WALL_T / 2, mapH / 2 + WALL_T],
  ];
  for (const [cx, cy, hw, hh] of specs) {
    const collider = ctx.world.createCollider(
      RAPIER.ColliderDesc.cuboid(hw, hh)
        .setTranslation(cx, cy)
        .setRestitution(0.6)
        .setCollisionGroups(WALL_GROUPS),
    );
    ctx.register(collider, { kind: 'wall', collider });
  }
}
