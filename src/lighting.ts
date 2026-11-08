import * as THREE from "three";
import { normalizeTimeOfDay } from "./dayNightCycle";

const SUN_HORIZONTAL_X = 96;
const SUN_HORIZONTAL_Z = -64;
const SUN_ELEVATION_DEGREES = 40.392;
const SUN_OFFSET_Y = Math.hypot(SUN_HORIZONTAL_X, SUN_HORIZONTAL_Z) *
  Math.tan(THREE.MathUtils.degToRad(SUN_ELEVATION_DEGREES));

// Noon calibration and distance, not the live light direction. All celestial
// visuals and directional lighting consume the same clock-driven unit vector.
export const SUN_OFFSET = new THREE.Vector3(
  SUN_HORIZONTAL_X,
  SUN_OFFSET_Y,
  SUN_HORIZONTAL_Z
);

export function getSolarDirection(
  timeOfDay: number,
  noonOffset: THREE.Vector3 = SUN_OFFSET,
  target = new THREE.Vector3()
): THREE.Vector3 {
  const length = noonOffset.length();
  const noonHeight = length > 0 ? noonOffset.y / length : 0.65;
  const horizontalLength = Math.hypot(noonOffset.x, noonOffset.z);
  const x = horizontalLength > 0 ? noonOffset.x / horizontalLength : 1;
  const z = horizontalLength > 0 ? noonOffset.z / horizontalLength : 0;
  // Preserve the established fixed-azimuth visual orbit, including its shallower
  // below-horizon arc. Never lift/clamp the real vector to enable cloud casting.
  const solarHeight = Math.sin((normalizeTimeOfDay(timeOfDay) - 0.25) * Math.PI * 2);
  const y = solarHeight * (solarHeight >= 0 ? Math.max(0.2, noonHeight) : 0.35);
  const horizontalScale = Math.sqrt(Math.max(0.0001, 1 - y * y));
  return target.set(x * horizontalScale, y, z * horizontalScale).normalize();
}

export function getDirectSunHorizonFade(sunDirection: THREE.Vector3): number {
  const fraction = Math.max(0, Math.min(1, sunDirection.y / 0.06));
  return fraction * fraction * (3 - 2 * fraction);
}

export function getSunElevationDegrees(sunOffset: THREE.Vector3): number {
  const horizontalDistance = Math.hypot(sunOffset.x, sunOffset.z);
  return THREE.MathUtils.radToDeg(Math.atan2(sunOffset.y, horizontalDistance));
}
