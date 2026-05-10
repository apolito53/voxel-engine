import * as THREE from "three";
import {
  getPhysicsCoreVelocityMultiplier,
  type PhysicsCoreSettings
} from "./physicsCoreSettings";

export const PLAYER_PHYSICS_CORE_BASE_LAUNCH_SPEED = 16;

export function createPlayerPhysicsCoreLaunchVelocity(
  aimDirection: THREE.Vector3,
  inheritedVelocity: THREE.Vector3,
  settings: PhysicsCoreSettings
): THREE.Vector3 {
  return normalizeAimDirection(aimDirection)
    .multiplyScalar(PLAYER_PHYSICS_CORE_BASE_LAUNCH_SPEED * getPhysicsCoreVelocityMultiplier(settings))
    .add(inheritedVelocity);
}

function normalizeAimDirection(aimDirection: THREE.Vector3): THREE.Vector3 {
  return aimDirection.lengthSq() > 0
    ? aimDirection.clone().normalize()
    : new THREE.Vector3(0, 0, -1);
}
