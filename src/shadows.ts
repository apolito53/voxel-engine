import * as THREE from "three";
import type { QualityPreset } from "./qualityPresets";
import type { DayNightVisualState } from "./dayNightCycle";
import { CHUNK_SIZE, WORLD_HEIGHT } from "./voxelConstants";

export type DirectionalShadowBasis = {
  readonly right: THREE.Vector3;
  readonly up: THREE.Vector3;
  readonly forward: THREE.Vector3;
};

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const FALLBACK_UP = new THREE.Vector3(0, 0, 1);
const SHADOW_NEAR_METERS = 0.5;
const CLOUD_CASTER_DEPTH_MARGIN_METERS = 4;
export const CLOUD_SHADOW_MIN_SUN_HEIGHT = 0.02;
export const CLOUD_SHADOW_SUN_HEIGHT_FADE = 0.04;
export const CLOUD_SHADOW_MAX_COVERAGE = 1;
export const CLOUD_SHADOW_FULL_RADIUS = 0.65;

export type DirectionalShadowDepthRange = {
  readonly lightOffsetScale: number;
  readonly cameraFar: number;
};

export function getCloudShadowCoverage(
  quality: Pick<QualityPreset, "shadows" | "cloudShadows">,
  visual: Pick<DayNightVisualState, "dayFactor">,
  sunDirection: THREE.Vector3,
  minSunHeight: number
): number {
  if (!quality.shadows || !quality.cloudShadows || !Number.isFinite(visual.dayFactor)) return 0;
  const fraction = Math.max(0, Math.min(1,
    (sunDirection.y - minSunHeight) / CLOUD_SHADOW_SUN_HEIGHT_FADE));
  const elevationFade = fraction * fraction * (3 - 2 * fraction);
  return CLOUD_SHADOW_MAX_COVERAGE * Math.max(0, Math.min(1, visual.dayFactor)) * elevationFade;
}

export function getCloudShadowMinSunHeight(
  cameraSize: number,
  cloudTopHeight: number,
  cloudViewDistance: number,
  cameraHeight = 0,
  cloudBaseHeight = cloudTopHeight,
  anchorMargin = 0
): number {
  // Bound the slanted cloud-plane corners to the actual cloud horizon. With
  // half-width S and height H, the horizontal reach is <= (H+S)/sin(elevation).
  // Reserve vertical eye-to-cloud distance and the perpendicular corner before
  // fitting that reach; high flight and short presets need a higher elevation.
  const halfSize = cameraSize + anchorMargin;
  const heightGap = Math.max(Math.abs(cloudTopHeight - cameraHeight), Math.abs(cloudBaseHeight - cameraHeight));
  const remainingRangeSquared = cloudViewDistance ** 2 - heightGap ** 2 - halfSize ** 2;
  if (!(remainingRangeSquared > 0)) return 1;
  return Math.max(CLOUD_SHADOW_MIN_SUN_HEIGHT,
    (cloudTopHeight + halfSize) / Math.sqrt(remainingRangeSquared));
}

export function getDirectionalShadowDepthRange(
  preset: Pick<QualityPreset, "shadowCameraSize" | "shadowCameraFar" | "renderRadius">,
  sunOffset: THREE.Vector3,
  cloudTopHeight: number | null,
  minSunHeight = CLOUD_SHADOW_MIN_SUN_HEIGHT
): DirectionalShadowDepthRange {
  const originalDistance = sunOffset.length();
  if (!(originalDistance > 0) || !Number.isFinite(originalDistance)) {
    return { lightOffsetScale: 1, cameraFar: preset.shadowCameraFar };
  }

  const sunHeightPerMeter = sunOffset.y / originalDistance;
  const horizontalPerMeter = Math.hypot(sunOffset.x, sunOffset.z) / originalDistance;
  // Fit the already rendered terrain cylinder, including chunk/snap edge slack.
  // Dot-product bounds stay finite even at a horizontal sun. Extend both sides:
  // high sunward hills must remain ahead of the light, and opposite receivers
  // must remain before far when clouds are disabled or outside their horizon.
  const horizontalReach = (preset.renderRadius + 2) * CHUNK_SIZE * horizontalPerMeter;
  const terrainCasterDistance = horizontalReach + Math.max(0, sunHeightPerMeter) * WORLD_HEIGHT;
  const terrainFar = Math.max(preset.shadowCameraFar,
    originalDistance + horizontalReach + Math.max(0, -sunHeightPerMeter) * WORLD_HEIGHT + CLOUD_CASTER_DEPTH_MARGIN_METERS);
  let extension = Math.max(0,
    terrainCasterDistance + SHADOW_NEAR_METERS + CLOUD_CASTER_DEPTH_MARGIN_METERS - originalDistance);
  // At a given world height the sunward-most point of the unchanged shadow
  // footprint lies at its lower light-space Y edge. Place the light ahead of
  // that point, then add the same distance to far so no terrain range is lost.
  if (cloudTopHeight !== null && sunHeightPerMeter > minSunHeight) {
    const basis = createDirectionalShadowBasis(sunOffset);
    const casterDistance = (cloudTopHeight + Math.abs(basis.up.y) * preset.shadowCameraSize) / sunHeightPerMeter;
    extension = Math.max(extension,
      casterDistance + SHADOW_NEAR_METERS + CLOUD_CASTER_DEPTH_MARGIN_METERS - originalDistance);
  }
  return {
    lightOffsetScale: 1 + extension / originalDistance,
    cameraFar: terrainFar + extension
  };
}

export function getShadowTexelSize(preset: QualityPreset): number {
  return (preset.shadowCameraSize * 2) / preset.shadowMapSize;
}

export function createDirectionalShadowBasis(
  sunOffset: THREE.Vector3,
  target: DirectionalShadowBasis = { right: new THREE.Vector3(), up: new THREE.Vector3(), forward: new THREE.Vector3() }
): DirectionalShadowBasis {
  const forward = target.forward.copy(sunOffset).negate().normalize();
  const referenceUp = Math.abs(forward.dot(WORLD_UP)) > 0.99 ? FALLBACK_UP : WORLD_UP;
  const right = target.right.crossVectors(forward, referenceUp).normalize();
  const up = target.up.crossVectors(right, forward).normalize();

  return target;
}

export function snapShadowAnchorToTexelGrid(
  anchor: THREE.Vector3,
  basis: DirectionalShadowBasis,
  texelSize: number,
  target = new THREE.Vector3()
): THREE.Vector3 {
  target.copy(anchor);
  if (texelSize <= 0) return target;

  // Directional shadow maps crawl when their orthographic camera moves by tiny
  // sub-texel amounts. Snap only in the light's shadow-plane axes so its current
  // direction is preserved while the projection lands on stable texels.
  const rightCoordinate = anchor.dot(basis.right);
  const upCoordinate = anchor.dot(basis.up);
  const snappedRight = Math.round(rightCoordinate / texelSize) * texelSize;
  const snappedUp = Math.round(upCoordinate / texelSize) * texelSize;

  target.addScaledVector(basis.right, snappedRight - rightCoordinate);
  target.addScaledVector(basis.up, snappedUp - upCoordinate);
  return target;
}
