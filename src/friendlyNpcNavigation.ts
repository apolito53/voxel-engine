import type { CollisionBounds, CollisionVector, CollisionWorld } from "./collision";
import { WORLD_HEIGHT } from "./voxelConstants";

/** Queries are deliberately loaded-only: an absent chunk is a boundary, never air. */
export type FriendlyNpcWorld = CollisionWorld & {
  isColumnLoaded(x: number, z: number): boolean;
};

export type FriendlyNpcPosition = CollisionVector;

export const FRIENDLY_NPC_RADIUS = 0.28;
export const FRIENDLY_NPC_HEIGHT = 1.72;
export const FRIENDLY_NPC_STEP_HEIGHT = 1 / 3 + 0.015;
export const FRIENDLY_NPC_MAX_DROP = 0.6;
export const FRIENDLY_NPC_MAX_MOVE = 2;
const COLLISION_EPSILON = 0.0001;
const MOVE_SUBSTEP = 0.1;

export function isNpcBodyClear(world: FriendlyNpcWorld, feet: FriendlyNpcPosition): boolean {
  if (!isFinitePosition(feet) || feet.y < 0 || feet.y + FRIENDLY_NPC_HEIGHT > WORLD_HEIGHT) return false;
  return isBoundsClear(world, bodyBounds(feet));
}

/** Finds real box tops under the center and all four corners of the footprint. */
export function findNpcStandPosition(
  world: FriendlyNpcWorld,
  x: number,
  z: number,
  minFeetY = 0,
  maxFeetY = WORLD_HEIGHT - FRIENDLY_NPC_HEIGHT
): FriendlyNpcPosition | null {
  if (![x, z, minFeetY, maxFeetY].every(Number.isFinite) || minFeetY > maxFeetY) return null;
  const low = Math.max(0, minFeetY);
  const high = Math.min(WORLD_HEIGHT - FRIENDLY_NPC_HEIGHT, maxFeetY);
  if (low > high) return null;
  // Match body contact tolerance, including tiny frame-rate strides at a lip.
  const inset = FRIENDLY_NPC_RADIUS - COLLISION_EPSILON;
  const probes = [[0, 0], [-inset, -inset], [-inset, inset], [inset, -inset], [inset, inset]] as const;
  const heights: number[] = [];
  for (const [dx, dz] of probes) {
    const height = supportTopAt(world, x + dx, z + dz, low, high);
    if (height === null) return null;
    heights.push(height);
  }
  // A narrow surviving lattice ridge can sit between the center and corners.
  // Include every overlapping box top before testing body clearance, so even
  // tiny strides climb that ridge when the leading body edge first reaches it.
  const overlappingTop = supportTopUnderFootprint(world, x, z, low, high);
  const y = Math.max(...heights, overlappingTop ?? -Infinity);
  if (y - Math.min(...heights) > FRIENDLY_NPC_STEP_HEIGHT + COLLISION_EPSILON) return null;
  const result = { x, y, z };
  return isNpcBodyClear(world, result) ? result : null;
}

/** Small swept, ground-following steps; callers replan instead of walking over a gap. */
export function moveNpcOnGround(
  world: FriendlyNpcWorld,
  from: FriendlyNpcPosition,
  dx: number,
  dz: number
): FriendlyNpcPosition | null {
  const distance = Math.hypot(dx, dz);
  if (!isFinitePosition(from) || !Number.isFinite(distance) || distance > FRIENDLY_NPC_MAX_MOVE) return null;
  if (!isNpcBodyClear(world, from)) return null;
  const steps = Math.max(1, Math.ceil(distance / MOVE_SUBSTEP));
  let current = from;
  for (let index = 1; index <= steps; index += 1) {
    const next = findNpcStandPosition(
      world,
      from.x + dx * index / steps,
      from.z + dz * index / steps,
      current.y - FRIENDLY_NPC_MAX_DROP,
      current.y + FRIENDLY_NPC_STEP_HEIGHT
    );
    if (!next) return null;
    // Step upward before horizontal travel, and down only after it. Check both
    // swept volumes so a low beam or thin partial wall cannot be tunneled through.
    const highY = Math.max(current.y, next.y);
    if (!isBoundsClear(world, {
      minX: Math.min(current.x, next.x) - FRIENDLY_NPC_RADIUS,
      maxX: Math.max(current.x, next.x) + FRIENDLY_NPC_RADIUS,
      minY: highY + COLLISION_EPSILON,
      maxY: highY + FRIENDLY_NPC_HEIGHT,
      minZ: Math.min(current.z, next.z) - FRIENDLY_NPC_RADIUS,
      maxZ: Math.max(current.z, next.z) + FRIENDLY_NPC_RADIUS
    })) return null;
    const verticalPosition = next.y > current.y ? current : next;
    if (!isBoundsClear(world, {
      ...bodyBounds(verticalPosition),
      minY: Math.min(current.y, next.y) + COLLISION_EPSILON,
      maxY: highY + FRIENDLY_NPC_HEIGHT
    })) return null;
    current = next;
  }
  return current;
}

/** Exact segment/box tests over a small bounded region, including carved cells. */
export function hasNpcLineOfSight(
  world: FriendlyNpcWorld,
  from: FriendlyNpcPosition,
  to: FriendlyNpcPosition
): boolean {
  if (!isFinitePosition(from) || !isFinitePosition(to) || Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) > 9) return false;
  const minX = Math.floor(Math.min(from.x, to.x));
  const maxX = Math.floor(Math.max(from.x, to.x));
  const minY = Math.max(0, Math.floor(Math.min(from.y, to.y)));
  const maxY = Math.min(WORLD_HEIGHT - 1, Math.floor(Math.max(from.y, to.y)));
  const minZ = Math.floor(Math.min(from.z, to.z));
  const maxZ = Math.floor(Math.max(from.z, to.z));
  for (let x = minX; x <= maxX; x += 1) {
    for (let z = minZ; z <= maxZ; z += 1) {
      if (!segmentHitsBox(from, to, {
        minX: x, maxX: x + 1, minZ: z, maxZ: z + 1,
        minY: Math.min(from.y, to.y) - 1, maxY: Math.max(from.y, to.y) + 1
      })) continue;
      if (!world.isColumnLoaded(x, z)) return false;
      for (let y = minY; y <= maxY; y += 1) {
        for (const box of cellBoxes(world, x, y, z)) {
          if (segmentHitsBox(from, to, box)) return false;
        }
      }
    }
  }
  return true;
}

function supportTopAt(world: FriendlyNpcWorld, x: number, z: number, low: number, high: number): number | null {
  if (!world.isColumnLoaded(x, z)) return null;
  let highest: number | null = null;
  for (let y = Math.min(WORLD_HEIGHT - 1, Math.floor(high)); y >= Math.max(0, Math.floor(low - 1)); y -= 1) {
    for (const box of cellBoxes(world, Math.floor(x), y, Math.floor(z))) {
      if (x < box.minX || x > box.maxX || z < box.minZ || z > box.maxZ) continue;
      if (box.maxY < low - COLLISION_EPSILON || box.maxY > high + COLLISION_EPSILON) continue;
      highest = Math.max(highest ?? -Infinity, box.maxY);
    }
    if (highest !== null) break;
  }
  return highest;
}

function supportTopUnderFootprint(world: FriendlyNpcWorld, x: number, z: number, low: number, high: number): number | null {
  const bounds = bodyBounds({ x, y: low, z });
  let highest: number | null = null;
  for (let cellX = Math.floor(bounds.minX + COLLISION_EPSILON); cellX <= Math.floor(bounds.maxX - COLLISION_EPSILON); cellX += 1) {
    for (let cellZ = Math.floor(bounds.minZ + COLLISION_EPSILON); cellZ <= Math.floor(bounds.maxZ - COLLISION_EPSILON); cellZ += 1) {
      if (!world.isColumnLoaded(cellX, cellZ)) return null;
      for (let y = Math.min(WORLD_HEIGHT - 1, Math.floor(high)); y >= Math.max(0, Math.floor(low - 1)); y -= 1) {
        for (const box of cellBoxes(world, cellX, y, cellZ)) {
          if (box.maxX <= bounds.minX + COLLISION_EPSILON || box.minX >= bounds.maxX - COLLISION_EPSILON ||
            box.maxZ <= bounds.minZ + COLLISION_EPSILON || box.minZ >= bounds.maxZ - COLLISION_EPSILON ||
            box.maxY < low - COLLISION_EPSILON || box.maxY > high + COLLISION_EPSILON) continue;
          highest = Math.max(highest ?? -Infinity, box.maxY);
        }
      }
    }
  }
  return highest;
}

function isBoundsClear(world: FriendlyNpcWorld, bounds: CollisionBounds): boolean {
  for (let x = Math.floor(bounds.minX + COLLISION_EPSILON); x <= Math.floor(bounds.maxX - COLLISION_EPSILON); x += 1) {
    for (let z = Math.floor(bounds.minZ + COLLISION_EPSILON); z <= Math.floor(bounds.maxZ - COLLISION_EPSILON); z += 1) {
      if (!world.isColumnLoaded(x, z)) return false;
      for (let y = Math.max(0, Math.floor(bounds.minY)); y <= Math.min(WORLD_HEIGHT - 1, Math.floor(bounds.maxY)); y += 1) {
        for (const box of cellBoxes(world, x, y, z)) {
          if (bounds.maxX > box.minX + COLLISION_EPSILON && bounds.minX < box.maxX - COLLISION_EPSILON &&
            bounds.maxY > box.minY + COLLISION_EPSILON && bounds.minY < box.maxY - COLLISION_EPSILON &&
            bounds.maxZ > box.minZ + COLLISION_EPSILON && bounds.minZ < box.maxZ - COLLISION_EPSILON) return false;
        }
      }
    }
  }
  return true;
}

function cellBoxes(world: FriendlyNpcWorld, x: number, y: number, z: number): readonly CollisionBounds[] {
  if (y < 0 || y >= WORLD_HEIGHT) return [];
  const partial = world.getCellCollisionBoxes?.(x, y, z);
  if (partial !== undefined && partial !== null) return partial;
  return world.isSolid(x, y, z) ? [{ minX: x, maxX: x + 1, minY: y, maxY: y + 1, minZ: z, maxZ: z + 1 }] : [];
}

function bodyBounds(feet: FriendlyNpcPosition): CollisionBounds {
  return {
    minX: feet.x - FRIENDLY_NPC_RADIUS,
    maxX: feet.x + FRIENDLY_NPC_RADIUS,
    minY: feet.y + COLLISION_EPSILON,
    maxY: feet.y + FRIENDLY_NPC_HEIGHT,
    minZ: feet.z - FRIENDLY_NPC_RADIUS,
    maxZ: feet.z + FRIENDLY_NPC_RADIUS
  };
}

function segmentHitsBox(from: FriendlyNpcPosition, to: FriendlyNpcPosition, box: CollisionBounds): boolean {
  let start = 0;
  let end = 1;
  const axes = [[from.x, to.x - from.x, box.minX, box.maxX], [from.y, to.y - from.y, box.minY, box.maxY],
    [from.z, to.z - from.z, box.minZ, box.maxZ]] as const;
  for (const [origin, direction, low, high] of axes) {
    if (Math.abs(direction) < 0.000001) {
      if (origin < low || origin > high) return false;
      continue;
    }
    const first = (low - origin) / direction;
    const second = (high - origin) / direction;
    start = Math.max(start, Math.min(first, second));
    end = Math.min(end, Math.max(first, second));
    if (start > end) return false;
  }
  return end > COLLISION_EPSILON && start < 1 - COLLISION_EPSILON;
}

function isFinitePosition(value: FriendlyNpcPosition): boolean {
  return [value.x, value.y, value.z].every(Number.isFinite);
}
