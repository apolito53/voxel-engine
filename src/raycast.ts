type RaycastWorld = {
  isSolid(x: number, y: number, z: number): boolean;
};

type VectorLike = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type VoxelBlockPosition = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type VoxelRaycastHit = {
  readonly block: VoxelBlockPosition;
  readonly normal: VoxelBlockPosition;
  readonly distance: number;
};

export function voxelRaycast(
  world: RaycastWorld,
  origin: VectorLike,
  direction: VectorLike,
  maxDistance = 8
): VoxelRaycastHit | null {
  let x = getStartingVoxel(origin.x, direction.x);
  let y = getStartingVoxel(origin.y, direction.y);
  let z = getStartingVoxel(origin.z, direction.z);

  const stepX = direction.x > 0 ? 1 : -1;
  const stepY = direction.y > 0 ? 1 : -1;
  const stepZ = direction.z > 0 ? 1 : -1;

  const tDeltaX = Math.abs(1 / (direction.x || 0.000001));
  const tDeltaY = Math.abs(1 / (direction.y || 0.000001));
  const tDeltaZ = Math.abs(1 / (direction.z || 0.000001));

  let tMaxX = intBound(origin.x, direction.x);
  let tMaxY = intBound(origin.y, direction.y);
  let tMaxZ = intBound(origin.z, direction.z);
  let face: VoxelBlockPosition = { x: 0, y: 0, z: 0 };

  for (let distance = 0; distance <= maxDistance;) {
    if (world.isSolid(x, y, z)) {
      return { block: { x, y, z }, normal: face, distance };
    }

    const nextDistance = Math.min(tMaxX, tMaxY, tMaxZ);
    if (!Number.isFinite(nextDistance) || nextDistance > maxDistance) break;

    const crossesX = tMaxX === nextDistance;
    const crossesY = tMaxY === nextDistance;
    const crossesZ = tMaxZ === nextDistance;
    face = chooseEntryFace(crossesX, crossesY, crossesZ, direction, stepX, stepY, stepZ);

    // When the ray passes exactly through a voxel edge or corner, advance all
    // crossed axes together. Stepping only one arbitrary axis can briefly test
    // a side-neighbor that the ray merely grazed, which feels like random
    // adjacent block placement/deletion from the player's point of view.
    if (crossesX) {
      x += stepX;
      tMaxX += tDeltaX;
    }
    if (crossesY) {
      y += stepY;
      tMaxY += tDeltaY;
    }
    if (crossesZ) {
      z += stepZ;
      tMaxZ += tDeltaZ;
    }

    distance = nextDistance;
  }

  return null;
}

function getStartingVoxel(value: number, direction: number): number {
  // `Math.floor` assigns exact integer coordinates to the positive-side voxel.
  // If the ray points negative from that boundary, the first touched voxel is
  // immediately on the negative side instead, so start there explicitly.
  if (direction < 0 && Number.isInteger(value)) return value - 1;
  return Math.floor(value);
}

function intBound(value: number, direction: number): number {
  if (direction === 0) return Number.POSITIVE_INFINITY;
  const next = direction > 0 ? Math.floor(value) + 1 : Math.ceil(value) - 1;
  return (next - value) / direction;
}

function chooseEntryFace(
  crossesX: boolean,
  crossesY: boolean,
  crossesZ: boolean,
  direction: VectorLike,
  stepX: number,
  stepY: number,
  stepZ: number
): VoxelBlockPosition {
  let axis: "x" | "y" | "z" = "x";
  let strength = -1;

  if (crossesX) {
    axis = "x";
    strength = Math.abs(direction.x);
  }
  if (crossesY && Math.abs(direction.y) > strength) {
    axis = "y";
    strength = Math.abs(direction.y);
  }
  if (crossesZ && Math.abs(direction.z) > strength) {
    axis = "z";
  }

  if (axis === "x") return { x: -stepX, y: 0, z: 0 };
  if (axis === "y") return { x: 0, y: -stepY, z: 0 };
  return { x: 0, y: 0, z: -stepZ };
}
