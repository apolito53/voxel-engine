import * as THREE from "three";
import {
  getPhysicsCoreVelocityMultiplier,
  type PhysicsCoreSettings
} from "./physicsCoreSettings";

export const PLAYER_PHYSICS_CORE_BASE_LAUNCH_SPEED = 16;
export const PLAYER_CORE_MUZZLE_FORWARD_METERS = 0.85;
export const PLAYER_CORE_MUZZLE_SCREEN_RIGHT_FRACTION = 0.25;
export const PLAYER_CORE_MUZZLE_SCREEN_DOWN_FRACTION = 0.15;

export function createPlayerPhysicsCoreLaunchVelocity(
  aimDirection: THREE.Vector3,
  inheritedVelocity: THREE.Vector3,
  settings: PhysicsCoreSettings
): THREE.Vector3 {
  return normalizeAimDirection(aimDirection)
    .multiplyScalar(PLAYER_PHYSICS_CORE_BASE_LAUNCH_SPEED * getPhysicsCoreVelocityMultiplier(settings))
    .add(inheritedVelocity);
}

export function createPlayerCoreMuzzleLocalOffset(
  cameraFovDegrees: number,
  cameraAspect: number
): THREE.Vector3 {
  const forwardMeters = PLAYER_CORE_MUZZLE_FORWARD_METERS;
  const safeAspect = Number.isFinite(cameraAspect) && cameraAspect > 0 ? cameraAspect : 1;
  const safeFovDegrees = Number.isFinite(cameraFovDegrees) && cameraFovDegrees > 0
    ? cameraFovDegrees
    : 75;
  const halfHeight = Math.tan(THREE.MathUtils.degToRad(safeFovDegrees) * 0.5) * forwardMeters;
  const halfWidth = halfHeight * safeAspect;

  return new THREE.Vector3(
    halfWidth * PLAYER_CORE_MUZZLE_SCREEN_RIGHT_FRACTION,
    -halfHeight * PLAYER_CORE_MUZZLE_SCREEN_DOWN_FRACTION,
    -forwardMeters
  );
}

export function createPlayerCoreShotDirection(
  muzzlePosition: THREE.Vector3,
  cameraPosition: THREE.Vector3,
  cameraForward: THREE.Vector3,
  aimDistance: number
): THREE.Vector3 {
  const normalizedCameraForward = normalizeAimDirection(cameraForward);
  const safeAimDistance = Number.isFinite(aimDistance) && aimDistance > 0 ? aimDistance : 1;
  const aimPoint = cameraPosition.clone().addScaledVector(normalizedCameraForward, safeAimDistance);
  const muzzleAimDirection = aimPoint.sub(muzzlePosition);

  return muzzleAimDirection.lengthSq() > 0
    ? muzzleAimDirection.normalize()
    : normalizedCameraForward;
}

function normalizeAimDirection(aimDirection: THREE.Vector3): THREE.Vector3 {
  return aimDirection.lengthSq() > 0
    ? aimDirection.clone().normalize()
    : new THREE.Vector3(0, 0, -1);
}
