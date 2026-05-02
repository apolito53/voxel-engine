import * as THREE from "three";

const SUN_HORIZONTAL_X = 96;
const SUN_HORIZONTAL_Z = -64;
const SUN_ELEVATION_DEGREES = 40.392;
const SUN_HORIZONTAL_DISTANCE = Math.hypot(SUN_HORIZONTAL_X, SUN_HORIZONTAL_Z);

// The visible skybox sun sits around 40 degrees above the horizon. Keep the
// real directional light at the same readable angle so shadows point away from
// the sun players can actually see instead of looking like overhead noon mush.
export const SUN_OFFSET = new THREE.Vector3(
  SUN_HORIZONTAL_X,
  SUN_HORIZONTAL_DISTANCE * Math.tan(THREE.MathUtils.degToRad(SUN_ELEVATION_DEGREES)),
  SUN_HORIZONTAL_Z
);

export function getSunElevationDegrees(sunOffset: THREE.Vector3): number {
  const horizontalDistance = Math.hypot(sunOffset.x, sunOffset.z);
  return THREE.MathUtils.radToDeg(Math.atan2(sunOffset.y, horizontalDistance));
}
