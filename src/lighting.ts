import * as THREE from "three";
import { SUN_ELEVATION_DEGREES, SUN_HORIZONTAL_X, SUN_HORIZONTAL_Z, SUN_OFFSET_Y } from "./voxelLighting";

// The visible procedural sky sun sits around 40 degrees above the horizon.
// Keep the real directional light at the same readable angle so shadows point
// away from the sun players can actually see instead of overhead noon mush.
export const SUN_OFFSET = new THREE.Vector3(
  SUN_HORIZONTAL_X,
  SUN_OFFSET_Y,
  SUN_HORIZONTAL_Z
);

export function getSunElevationDegrees(sunOffset: THREE.Vector3): number {
  const horizontalDistance = Math.hypot(sunOffset.x, sunOffset.z);
  return THREE.MathUtils.radToDeg(Math.atan2(sunOffset.y, horizontalDistance));
}
