export type CollisionBounds = {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly minZ: number;
  readonly maxZ: number;
};

export type CollisionWorld = {
  isSolid(x: number, y: number, z: number): boolean;
  getSupportHeight?(bounds: CollisionBounds): number | null;
};
