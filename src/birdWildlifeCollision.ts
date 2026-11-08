import type { CollisionBounds, CollisionVector, CollisionWorld } from "./collision";
import { WORLD_HEIGHT } from "./voxelConstants";

export type BirdWildlifePosition = CollisionVector;
export type BirdTreePerch = CollisionVector;
export type BirdWildlifeWorld = CollisionWorld & {
  isColumnLoaded(x: number, z: number): boolean;
  /** Loaded column's approximate top surface; null means a real empty column. */
  getColumnTopHeight(x: number, z: number): number | null;
  getTreePerch?(x: number, z: number): BirdTreePerch | null;
};

// Encloses the complete animated bird, including extended/banked wings.
export const BIRD_CLEARANCE_RADIUS = 0.78;
export const BIRD_MAX_SWEEP_DISTANCE = 4;
export const SOLO_BIRD_PERCH_BODY_HEIGHT = 0.28;
const EPSILON = 0.0001;

export function isBirdVolumeClear(world: BirdWildlifeWorld, position: BirdWildlifePosition): boolean {
  return finitePosition(position) && position.y >= BIRD_CLEARANCE_RADIUS && clearBounds(world, {
    minX: position.x - BIRD_CLEARANCE_RADIUS, maxX: position.x + BIRD_CLEARANCE_RADIUS,
    minY: position.y - BIRD_CLEARANCE_RADIUS, maxY: position.y + BIRD_CLEARANCE_RADIUS,
    minZ: position.z - BIRD_CLEARANCE_RADIUS, maxZ: position.z + BIRD_CLEARANCE_RADIUS
  });
}

/** Conservative swept volume, bounded even when called with a stalled-frame delta. */
export function sweepBirdFlight(world: BirdWildlifeWorld, from: BirdWildlifePosition, to: BirdWildlifePosition): boolean {
  if (!finitePosition(from) || !finitePosition(to)) return false;
  const distance = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  if (distance > BIRD_MAX_SWEEP_DISTANCE || Math.min(from.y, to.y) < BIRD_CLEARANCE_RADIUS) return false;
  const steps = Math.max(1, Math.ceil(distance / 0.25));
  let previous = from;
  for (let step = 1; step <= steps; step += 1) {
    const current = {
      x: from.x + (to.x - from.x) * step / steps,
      y: from.y + (to.y - from.y) * step / steps,
      z: from.z + (to.z - from.z) * step / steps
    };
    if (!clearBounds(world, {
      minX: Math.min(previous.x, current.x) - BIRD_CLEARANCE_RADIUS,
      maxX: Math.max(previous.x, current.x) + BIRD_CLEARANCE_RADIUS,
      minY: Math.min(previous.y, current.y) - BIRD_CLEARANCE_RADIUS,
      maxY: Math.max(previous.y, current.y) + BIRD_CLEARANCE_RADIUS,
      minZ: Math.min(previous.z, current.z) - BIRD_CLEARANCE_RADIUS,
      maxZ: Math.max(previous.z, current.z) + BIRD_CLEARANCE_RADIUS
    })) return false;
    previous = current;
  }
  return true;
}

function clearBounds(world: BirdWildlifeWorld, bounds: CollisionBounds): boolean {
  for (let x = Math.floor(bounds.minX + EPSILON); x <= Math.floor(bounds.maxX - EPSILON); x += 1) {
    for (let z = Math.floor(bounds.minZ + EPSILON); z <= Math.floor(bounds.maxZ - EPSILON); z += 1) {
      // This applies above WORLD_HEIGHT too: birds cannot wander into unknown
      // columns just because the authored terrain currently ends at 96m.
      if (!world.isColumnLoaded(x, z)) return false;
      for (let y = Math.max(0, Math.floor(bounds.minY + EPSILON)); y <= Math.min(WORLD_HEIGHT - 1, Math.floor(bounds.maxY - EPSILON)); y += 1) {
        const partial = world.getCellCollisionBoxes?.(x, y, z);
        if (partial !== undefined && partial !== null) {
          if (partial.some((box) => overlaps(bounds, box))) return false;
        } else if (world.isSolid(x, y, z)) {
          return false;
        }
      }
    }
  }
  return true;
}

function overlaps(a: CollisionBounds, b: CollisionBounds): boolean {
  return a.maxX > b.minX + EPSILON && a.minX < b.maxX - EPSILON &&
    a.maxY > b.minY + EPSILON && a.minY < b.maxY - EPSILON &&
    a.maxZ > b.minZ + EPSILON && a.minZ < b.maxZ - EPSILON;
}

function finitePosition(position: BirdWildlifePosition): boolean {
  return [position.x, position.y, position.z].every(Number.isFinite);
}

/** Compact folded wings and feet use their actual resting envelope, not flight clearance. */
export function isBirdLandingVolumeClear(world: BirdWildlifeWorld, position: BirdWildlifePosition, yaw: number): boolean {
  if (!finitePosition(position) || !Number.isFinite(yaw) || position.y < SOLO_BIRD_PERCH_BODY_HEIGHT) return false;
  return clearBounds(world, landingBounds(position, yaw));
}

export function sweepBirdLanding(world: BirdWildlifeWorld, from: BirdWildlifePosition,
  to: BirdWildlifePosition, yaw: number): boolean {
  if (!finitePosition(from) || !finitePosition(to) || !Number.isFinite(yaw)) return false;
  const distance = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  if (distance > BIRD_MAX_SWEEP_DISTANCE || Math.min(from.y, to.y) < SOLO_BIRD_PERCH_BODY_HEIGHT) return false;
  const steps = Math.max(1, Math.ceil(distance / 0.15));
  let previous = landingBounds(from, yaw);
  for (let index = 1; index <= steps; index += 1) {
    const current = landingBounds({
      x: from.x + (to.x - from.x) * index / steps,
      y: from.y + (to.y - from.y) * index / steps,
      z: from.z + (to.z - from.z) * index / steps
    }, yaw);
    if (!clearBounds(world, {
      minX: Math.min(previous.minX, current.minX), maxX: Math.max(previous.maxX, current.maxX),
      minY: Math.min(previous.minY, current.minY), maxY: Math.max(previous.maxY, current.maxY),
      minZ: Math.min(previous.minZ, current.minZ), maxZ: Math.max(previous.maxZ, current.maxZ)
    })) return false;
    previous = current;
  }
  return true;
}

export function isBirdPerchSupported(world: BirdWildlifeWorld, perch: BirdTreePerch, yaw = 0): boolean {
  const live = world.getTreePerch?.(perch.x, perch.z);
  if (!live || Math.hypot(live.x - perch.x, live.y - perch.y, live.z - perch.z) > 0.015) return false;
  // Both small feet fit the provider's minimum 0.16m square even when turned.
  for (const side of [-1, 1]) {
    for (const cornerX of [-0.0175, 0.0175]) {
      for (const cornerZ of [-0.0325, 0.0325]) {
        const localX = side * 0.055 + cornerX;
        const x = perch.x + Math.cos(yaw) * localX + Math.sin(yaw) * cornerZ;
        const z = perch.z - Math.sin(yaw) * localX + Math.cos(yaw) * cornerZ;
        if (!world.isColumnLoaded(x, z)) return false;
        const cellX = Math.floor(x);
        const cellY = Math.floor(perch.y - EPSILON);
        const cellZ = Math.floor(z);
        const partial = world.getCellCollisionBoxes?.(cellX, cellY, cellZ);
        if (partial !== undefined && partial !== null) {
          if (!partial.some((box) => Math.abs(box.maxY - perch.y) < 0.015 &&
            x >= box.minX - EPSILON && x <= box.maxX + EPSILON && z >= box.minZ - EPSILON && z <= box.maxZ + EPSILON)) return false;
        } else if (!world.isSolid(cellX, cellY, cellZ) || Math.abs(cellY + 1 - perch.y) > 0.015) return false;
      }
    }
  }
  return true;
}

function landingBounds(position: BirdWildlifePosition, yaw: number): CollisionBounds {
  const radiusX = Math.abs(Math.cos(yaw)) * 0.25 + Math.abs(Math.sin(yaw)) * 0.62;
  const radiusZ = Math.abs(Math.sin(yaw)) * 0.25 + Math.abs(Math.cos(yaw)) * 0.62;
  return {
    minX: position.x - radiusX, maxX: position.x + radiusX,
    minY: position.y - SOLO_BIRD_PERCH_BODY_HEIGHT + EPSILON, maxY: position.y + 0.22,
    minZ: position.z - radiusZ, maxZ: position.z + radiusZ
  };
}
