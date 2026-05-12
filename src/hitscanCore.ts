import * as THREE from "three";
import type { CollisionWorld } from "./collision";
import { PLAYER_PHYSICS_CORE_BASE_LAUNCH_SPEED } from "./physicsCoreLaunch";
import {
  PHYSICS_CORE_BASE_RADIUS,
  PHYSICS_CORE_SIZE_MIN_PERCENT,
  PHYSICS_CORE_VELOCITY_MAX_PERCENT
} from "./physicsCoreSettings";

export const HITSCAN_CORE_RANGE = 96;
export const HITSCAN_CORE_RADIUS = PHYSICS_CORE_BASE_RADIUS * (PHYSICS_CORE_SIZE_MIN_PERCENT / 100);
export const HITSCAN_CORE_IMPACT_SPEED =
  PLAYER_PHYSICS_CORE_BASE_LAUNCH_SPEED * (PHYSICS_CORE_VELOCITY_MAX_PERCENT / 100);
export const HITSCAN_CORE_MAX_IMPACTS = 12;

const HITSCAN_EPSILON = 0.000001;

export type HitscanCoreHit = {
  readonly block: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
  readonly normal: THREE.Vector3;
  readonly position: THREE.Vector3;
  readonly distance: number;
};

export function raycastHitscanCore(
  world: CollisionWorld,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  maxDistance = HITSCAN_CORE_RANGE,
  radius = HITSCAN_CORE_RADIUS
): HitscanCoreHit | null {
  const normalizedDirection = normalizeHitscanDirection(direction);
  if (!normalizedDirection) return null;

  const safeMaxDistance = Math.max(0, Number.isFinite(maxDistance) ? maxDistance : 0);
  if (safeMaxDistance <= HITSCAN_EPSILON) return null;

  // Hitscan uses grid traversal instead of physics bodies, but it still asks
  // the world's projectile query about partial-block bite cells. That keeps
  // instant shots honest: open visual tunnels are open, remaining material is
  // still material.
  const movement = normalizedDirection.clone().multiplyScalar(safeMaxDistance);
  let x = getStartingVoxel(origin.x, normalizedDirection.x);
  let y = getStartingVoxel(origin.y, normalizedDirection.y);
  let z = getStartingVoxel(origin.z, normalizedDirection.z);

  const stepX = normalizedDirection.x > 0 ? 1 : -1;
  const stepY = normalizedDirection.y > 0 ? 1 : -1;
  const stepZ = normalizedDirection.z > 0 ? 1 : -1;

  const tDeltaX = Math.abs(1 / (normalizedDirection.x || HITSCAN_EPSILON));
  const tDeltaY = Math.abs(1 / (normalizedDirection.y || HITSCAN_EPSILON));
  const tDeltaZ = Math.abs(1 / (normalizedDirection.z || HITSCAN_EPSILON));

  let tMaxX = intBound(origin.x, normalizedDirection.x);
  let tMaxY = intBound(origin.y, normalizedDirection.y);
  let tMaxZ = intBound(origin.z, normalizedDirection.z);
  let face = new THREE.Vector3(0, 0, 0);

  for (let distance = 0; distance <= safeMaxDistance;) {
    if (world.isSolid(x, y, z) && canHitscanCoreHitBlock(world, x, y, z, origin, movement, radius)) {
      return {
        block: { x, y, z },
        normal: face.clone(),
        position: origin.clone().addScaledVector(normalizedDirection, distance),
        distance
      };
    }

    const nextDistance = Math.min(tMaxX, tMaxY, tMaxZ);
    if (!Number.isFinite(nextDistance) || nextDistance > safeMaxDistance) break;

    const crossesX = tMaxX === nextDistance;
    const crossesY = tMaxY === nextDistance;
    const crossesZ = tMaxZ === nextDistance;
    face = chooseEntryFace(crossesX, crossesY, crossesZ, normalizedDirection, stepX, stepY, stepZ);

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

function normalizeHitscanDirection(direction: THREE.Vector3): THREE.Vector3 | null {
  if (direction.lengthSq() <= HITSCAN_EPSILON) return null;
  return direction.clone().normalize();
}

function canHitscanCoreHitBlock(
  world: CollisionWorld,
  x: number,
  y: number,
  z: number,
  origin: THREE.Vector3,
  movement: THREE.Vector3,
  radius: number
): boolean {
  return world.canProjectileHitBlock?.(x, y, z, origin, movement, radius) ?? true;
}

function getStartingVoxel(value: number, direction: number): number {
  if (direction < 0 && Number.isInteger(value)) return value - 1;
  return Math.floor(value);
}

function intBound(value: number, direction: number): number {
  if (Math.abs(direction) <= HITSCAN_EPSILON) return Number.POSITIVE_INFINITY;
  const next = direction > 0 ? Math.floor(value) + 1 : Math.ceil(value) - 1;
  return (next - value) / direction;
}

function chooseEntryFace(
  crossesX: boolean,
  crossesY: boolean,
  crossesZ: boolean,
  direction: THREE.Vector3,
  stepX: number,
  stepY: number,
  stepZ: number
): THREE.Vector3 {
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

  if (axis === "x") return new THREE.Vector3(-stepX, 0, 0);
  if (axis === "y") return new THREE.Vector3(0, -stepY, 0);
  return new THREE.Vector3(0, 0, -stepZ);
}
