import * as THREE from "three";
import type { QualityPreset } from "./qualityPresets";
import type { DayNightVisualState } from "./dayNightCycle";

export type DirectionalShadowBasis = {
  readonly right: THREE.Vector3;
  readonly up: THREE.Vector3;
  readonly forward: THREE.Vector3;
};

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const FALLBACK_UP = new THREE.Vector3(0, 0, 1);
const SHADOW_NEAR_METERS = 0.5;
const CLOUD_CASTER_DEPTH_MARGIN_METERS = 4;
export const CLOUD_SHADOW_MAX_COVERAGE = 1;
export const CLOUD_SHADOW_FULL_RADIUS = 0.65;

export type DirectionalShadowDepthRange = {
  readonly lightOffsetScale: number;
  readonly cameraFar: number;
};

export function getCloudShadowCoverage(
  quality: Pick<QualityPreset, "shadows" | "cloudShadows">,
  visual: Pick<DayNightVisualState, "dayFactor">
): number {
  if (!quality.shadows || !quality.cloudShadows || !Number.isFinite(visual.dayFactor)) return 0;
  // Fade naturally with daylight and skip the caster entirely once night has
  // removed the sun. The saved checkbox remains independent of this gate.
  return CLOUD_SHADOW_MAX_COVERAGE * Math.max(0, Math.min(1, visual.dayFactor));
}

export function getDirectionalShadowDepthRange(
  preset: Pick<QualityPreset, "shadowCameraSize" | "shadowCameraFar">,
  sunOffset: THREE.Vector3,
  cloudTopHeight: number | null
): DirectionalShadowDepthRange {
  const originalDistance = sunOffset.length();
  if (cloudTopHeight === null || sunOffset.y <= 0 || originalDistance <= 0) {
    return { lightOffsetScale: 1, cameraFar: preset.shadowCameraFar };
  }

  const basis = createDirectionalShadowBasis(sunOffset);
  const sunHeightPerMeter = sunOffset.y / originalDistance;
  // At a given world height the sunward-most point of the unchanged shadow
  // footprint lies at its lower light-space Y edge. Place the light ahead of
  // that point, then add the same distance to far so no terrain range is lost.
  const casterDistance = (cloudTopHeight + Math.abs(basis.up.y) * preset.shadowCameraSize) / sunHeightPerMeter;
  const extension = Math.max(0,
    casterDistance + SHADOW_NEAR_METERS + CLOUD_CASTER_DEPTH_MARGIN_METERS - originalDistance);
  return {
    lightOffsetScale: 1 + extension / originalDistance,
    cameraFar: preset.shadowCameraFar + extension
  };
}

export function getShadowTexelSize(preset: QualityPreset): number {
  return (preset.shadowCameraSize * 2) / preset.shadowMapSize;
}

export function createDirectionalShadowBasis(sunOffset: THREE.Vector3): DirectionalShadowBasis {
  const forward = sunOffset.clone().negate().normalize();
  const referenceUp = Math.abs(forward.dot(WORLD_UP)) > 0.99 ? FALLBACK_UP : WORLD_UP;
  const right = new THREE.Vector3().crossVectors(forward, referenceUp).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();

  return { right, up, forward };
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
  // sub-texel amounts. Snap only in the light's shadow-plane axes so the sun
  // direction stays fixed while the shadow projection lands on stable texels.
  const rightCoordinate = anchor.dot(basis.right);
  const upCoordinate = anchor.dot(basis.up);
  const snappedRight = Math.round(rightCoordinate / texelSize) * texelSize;
  const snappedUp = Math.round(upCoordinate / texelSize) * texelSize;

  target.addScaledVector(basis.right, snappedRight - rightCoordinate);
  target.addScaledVector(basis.up, snappedUp - upCoordinate);
  return target;
}
