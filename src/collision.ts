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

export type ProjectileBlockSweepHit = {
  readonly t: number;
  readonly normal: CollisionVector;
};

export type CollisionWorld = {
  isSolid(x: number, y: number, z: number): boolean;
  isPartialBlock?(x: number, y: number, z: number): boolean;
  getCellCollisionBoxes?(x: number, y: number, z: number): readonly CollisionBounds[] | null;
  canProjectileHitBlock?(
    x: number,
    y: number,
    z: number,
    start: CollisionVector,
    movement: CollisionVector,
    radius: number
  ): boolean;
  getProjectileBlockSweepHit?(
    x: number,
    y: number,
    z: number,
    start: CollisionVector,
    movement: CollisionVector,
    radius: number
  ): ProjectileBlockSweepHit | null;
  getSupportHeight?(bounds: CollisionBounds): number | null;
  getPlayerFootprintSupportHeight?(bounds: CollisionBounds, options?: {
    readonly minPassableSubBlocks?: number;
    readonly minHorizontalClearanceSubBlocks?: number;
    readonly stance?: "standing" | "crawling";
  }): number | null;
};
