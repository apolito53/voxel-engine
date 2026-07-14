import * as THREE from "three";
import type { CollisionBounds, CollisionWorld } from "./collision";

export const PLAYER_VIEW_TOGGLE_KEY = "KeyV";
export const PLAYER_VIEW_STORAGE_KEY = "voxel-sandbox-player-view-mode";
export const THIRD_PERSON_CAMERA_DISTANCE_METERS = 3.8;
export const THIRD_PERSON_CAMERA_HEIGHT_METERS = 0.46;
export const THIRD_PERSON_CAMERA_RADIUS_METERS = 0.2;
export const THIRD_PERSON_AIM_CONVERGENCE_METERS = 8;

const THIRD_PERSON_CAMERA_COLLISION_SKIN_METERS = 0.05;
const THIRD_PERSON_CAMERA_EXTENSION_RESPONSE = 9;
const COLLISION_AXIS_EPSILON = 0.000001;
const WORLD_UP = new THREE.Vector3(0, 1, 0);

export type PlayerViewMode = "first-person" | "third-person";

type ViewModeStorage = Pick<Storage, "getItem" | "setItem">;

export type PlayerViewControllerOptions = {
  readonly gameplayCamera: THREE.PerspectiveCamera;
  readonly thirdPersonCamera: THREE.PerspectiveCamera;
  readonly collisionWorld: CollisionWorld;
  readonly initialMode?: PlayerViewMode;
};

/**
 * Keeps the physical/player camera authoritative while presenting a separate
 * collision-aware camera in third person. Movement, saves, tool reach, and aim
 * therefore keep using the same eye transform that already anchors the engine.
 */
export class PlayerViewController {
  private readonly gameplayCamera: THREE.PerspectiveCamera;
  private readonly thirdPersonCamera: THREE.PerspectiveCamera;
  private readonly collisionWorld: CollisionWorld;
  private readonly forward = new THREE.Vector3();
  private readonly cameraAnchor = new THREE.Vector3();
  private readonly desiredPosition = new THREE.Vector3();
  private readonly desiredOffset = new THREE.Vector3();
  private readonly aimTarget = new THREE.Vector3();
  private viewMode: PlayerViewMode;
  private thirdPersonDistance = THIRD_PERSON_CAMERA_DISTANCE_METERS;
  private thirdPersonInitialized = false;

  constructor(options: PlayerViewControllerOptions) {
    this.gameplayCamera = options.gameplayCamera;
    this.thirdPersonCamera = options.thirdPersonCamera;
    this.collisionWorld = options.collisionWorld;
    this.viewMode = options.initialMode ?? "first-person";
    this.thirdPersonCamera.name = "ThirdPersonPlayerCamera";
    this.syncProjection();
  }

  get mode(): PlayerViewMode {
    return this.viewMode;
  }

  get renderCamera(): THREE.PerspectiveCamera {
    return this.viewMode === "third-person" ? this.thirdPersonCamera : this.gameplayCamera;
  }

  get currentThirdPersonDistance(): number {
    return this.thirdPersonDistance;
  }

  setMode(mode: PlayerViewMode): void {
    const normalized = normalizePlayerViewMode(mode);
    if (normalized === this.viewMode) return;

    this.viewMode = normalized;
    // The first third-person frame should snap to a safe position. Only later
    // obstacle clearance eases outward, avoiding a camera that briefly starts
    // inside terrain because it inherited an obsolete distance.
    this.thirdPersonInitialized = false;
  }

  toggleMode(): PlayerViewMode {
    const nextMode = this.viewMode === "first-person" ? "third-person" : "first-person";
    this.setMode(nextMode);
    return this.viewMode;
  }

  update(deltaSeconds: number): void {
    this.syncProjection();
    if (this.viewMode !== "third-person") return;

    this.gameplayCamera.getWorldDirection(this.forward);
    if (this.forward.lengthSq() <= COLLISION_AXIS_EPSILON) {
      this.forward.set(0, 0, -1);
    } else {
      this.forward.normalize();
    }

    // Start the obstruction probe just above the physical eye. The desired
    // camera sits higher and behind the player, putting the avatar below the
    // reticle while still converging on the exact interaction reach distance.
    this.cameraAnchor.copy(this.gameplayCamera.position).addScaledVector(WORLD_UP, 0.08);
    this.desiredPosition
      .copy(this.gameplayCamera.position)
      .addScaledVector(WORLD_UP, THIRD_PERSON_CAMERA_HEIGHT_METERS)
      .addScaledVector(this.forward, -THIRD_PERSON_CAMERA_DISTANCE_METERS);
    this.desiredOffset.subVectors(this.desiredPosition, this.cameraAnchor);

    const desiredDistance = this.desiredOffset.length();
    const collisionDistance = resolveThirdPersonCameraDistance(
      this.collisionWorld,
      this.cameraAnchor,
      this.desiredPosition,
      THIRD_PERSON_CAMERA_RADIUS_METERS
    );

    if (!this.thirdPersonInitialized || collisionDistance < this.thirdPersonDistance) {
      // Pull inward immediately so walls never enter the near plane.
      this.thirdPersonDistance = collisionDistance;
      this.thirdPersonInitialized = true;
    } else {
      // Ease back out after an obstruction clears. Instant extension creates a
      // harsh camera pop whenever the player leaves a doorway or cliff wall.
      this.thirdPersonDistance = damp(
        this.thirdPersonDistance,
        collisionDistance,
        THIRD_PERSON_CAMERA_EXTENSION_RESPONSE,
        deltaSeconds
      );
    }

    const normalizedDistance = desiredDistance > COLLISION_AXIS_EPSILON
      ? Math.min(this.thirdPersonDistance, desiredDistance) / desiredDistance
      : 0;
    this.thirdPersonCamera.position
      .copy(this.cameraAnchor)
      .addScaledVector(this.desiredOffset, normalizedDistance);

    this.aimTarget
      .copy(this.gameplayCamera.position)
      .addScaledVector(this.forward, THIRD_PERSON_AIM_CONVERGENCE_METERS);
    this.thirdPersonCamera.lookAt(this.aimTarget);
    this.thirdPersonCamera.updateMatrixWorld();
  }

  private syncProjection(): void {
    const source = this.gameplayCamera;
    const target = this.thirdPersonCamera;
    const projectionChanged = (
      target.fov !== source.fov ||
      target.aspect !== source.aspect ||
      target.near !== source.near ||
      target.far !== source.far ||
      target.zoom !== source.zoom
    );

    target.fov = source.fov;
    target.aspect = source.aspect;
    target.near = source.near;
    target.far = source.far;
    target.zoom = source.zoom;
    target.layers.mask = source.layers.mask;
    if (projectionChanged) target.updateProjectionMatrix();
  }
}

export function normalizePlayerViewMode(
  value: unknown,
  fallback: PlayerViewMode = "first-person"
): PlayerViewMode {
  return value === "first-person" || value === "third-person" ? value : fallback;
}

export function readPlayerViewModePreference(
  storage: ViewModeStorage | null | undefined = getBrowserStorage()
): PlayerViewMode {
  try {
    return normalizePlayerViewMode(storage?.getItem(PLAYER_VIEW_STORAGE_KEY));
  } catch {
    return "first-person";
  }
}

export function writePlayerViewModePreference(
  mode: PlayerViewMode,
  storage: ViewModeStorage | null | undefined = getBrowserStorage()
): void {
  try {
    storage?.setItem(PLAYER_VIEW_STORAGE_KEY, normalizePlayerViewMode(mode));
  } catch {
    // Camera preference persistence is optional; a blocked localStorage must
    // never interfere with entering or leaving gameplay.
  }
}

/**
 * Finds the first terrain obstruction along the camera boom. Collision boxes
 * are expanded by the camera radius, turning the probe into a cheap swept
 * sphere that also respects surviving partial-block lattice geometry.
 */
export function resolveThirdPersonCameraDistance(
  world: CollisionWorld,
  start: THREE.Vector3,
  desiredPosition: THREE.Vector3,
  radius = THIRD_PERSON_CAMERA_RADIUS_METERS
): number {
  const movement = desiredPosition.clone().sub(start);
  const maxDistance = movement.length();
  if (!Number.isFinite(maxDistance) || maxDistance <= COLLISION_AXIS_EPSILON) return 0;

  const direction = movement.multiplyScalar(1 / maxDistance);
  const safeRadius = Number.isFinite(radius) ? Math.max(0, radius) : 0;
  const minX = Math.floor(Math.min(start.x, desiredPosition.x) - safeRadius);
  const maxX = Math.floor(Math.max(start.x, desiredPosition.x) + safeRadius);
  const minY = Math.floor(Math.min(start.y, desiredPosition.y) - safeRadius);
  const maxY = Math.floor(Math.max(start.y, desiredPosition.y) + safeRadius);
  const minZ = Math.floor(Math.min(start.z, desiredPosition.z) - safeRadius);
  const maxZ = Math.floor(Math.max(start.z, desiredPosition.z) + safeRadius);
  let allowedDistance = maxDistance;

  for (let y = minY; y <= maxY; y += 1) {
    for (let z = minZ; z <= maxZ; z += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (!world.isSolid(x, y, z)) continue;

        const explicitBoxes = world.getCellCollisionBoxes?.(x, y, z);
        const collisionBoxes = explicitBoxes ?? [createFullBlockBounds(x, y, z)];
        for (const bounds of collisionBoxes) {
          const hitDistance = intersectExpandedBounds(
            start,
            direction,
            allowedDistance,
            bounds,
            safeRadius
          );
          if (hitDistance === null) continue;
          allowedDistance = Math.max(0, hitDistance - THIRD_PERSON_CAMERA_COLLISION_SKIN_METERS);
        }
      }
    }
  }

  return allowedDistance;
}

function intersectExpandedBounds(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  maxDistance: number,
  bounds: CollisionBounds,
  radius: number
): number | null {
  let nearDistance = 0;
  let farDistance = maxDistance;

  const axes = [
    [origin.x, direction.x, bounds.minX - radius, bounds.maxX + radius],
    [origin.y, direction.y, bounds.minY - radius, bounds.maxY + radius],
    [origin.z, direction.z, bounds.minZ - radius, bounds.maxZ + radius]
  ] as const;

  for (const [axisOrigin, axisDirection, axisMin, axisMax] of axes) {
    if (Math.abs(axisDirection) <= COLLISION_AXIS_EPSILON) {
      if (axisOrigin < axisMin || axisOrigin > axisMax) return null;
      continue;
    }

    const inverseDirection = 1 / axisDirection;
    let axisNear = (axisMin - axisOrigin) * inverseDirection;
    let axisFar = (axisMax - axisOrigin) * inverseDirection;
    if (axisNear > axisFar) {
      [axisNear, axisFar] = [axisFar, axisNear];
    }
    nearDistance = Math.max(nearDistance, axisNear);
    farDistance = Math.min(farDistance, axisFar);
    if (nearDistance > farDistance) return null;
  }

  return nearDistance <= maxDistance && farDistance >= 0 ? Math.max(0, nearDistance) : null;
}

function createFullBlockBounds(x: number, y: number, z: number): CollisionBounds {
  return {
    minX: x,
    maxX: x + 1,
    minY: y,
    maxY: y + 1,
    minZ: z,
    maxZ: z + 1
  };
}

function damp(current: number, target: number, response: number, deltaSeconds: number): number {
  if (deltaSeconds <= 0 || current === target) return current;
  const blend = 1 - Math.exp(-response * deltaSeconds);
  return current + (target - current) * blend;
}

function getBrowserStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
