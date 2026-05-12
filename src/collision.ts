export type CollisionBounds = {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
};

export type CollisionVector = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type CollisionWorld = {
  isSolid(x: number, y: number, z: number): boolean;
  canProjectileHitBlock?(
    x: number,
    y: number,
    z: number,
    start: CollisionVector,
    movement: CollisionVector,
    radius: number
  ): boolean;
  getSupportHeight?(bounds: CollisionBounds): number | null;
};
