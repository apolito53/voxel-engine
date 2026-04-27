import * as THREE from "three";
import type { QualityPreset } from "./qualityPresets";

export type DirectionalShadowBasis = {
  readonly right: THREE.Vector3;
  readonly up: THREE.Vector3;
  readonly forward: THREE.Vector3;
};

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const FALLBACK_UP = new THREE.Vector3(0, 0, 1);

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
