import type * as THREE from "three";
import type { PhysicsToy } from "./physics";

export const FRAGMENT_RUBBLE_ACTIVE_RADIUS_BUFFER_METERS = 2;

export type FragmentRubbleAbsorptionOptions = {
  readonly activeCenter?: THREE.Vector3;
  readonly activeRadius?: number;
  readonly activeRadiusBuffer?: number;
};

export function shouldAbsorbFragmentIntoRubble(
  toy: PhysicsToy,
  options: FragmentRubbleAbsorptionOptions = {}
): boolean {
  if (!toy.isInstancedFragment) return false;

  // Expiration is still a material-preservation fallback for explicit cleanup
  // paths. Normal active-bubble debris should not expire on a timer anymore.
  if (toy.isExpired) return true;

  // Without a player bubble, keep the historical unit-test/fallback behavior:
  // sleeping fragments graduate into rubble.
  if (!isActiveBubbleConfigured(options)) return toy.isSleeping;

  // In the browser loop, even awake orphan fragments outside the active bubble
  // should become cheap rubble instead of staying as unowned physics bodies.
  return isFragmentOutsideActiveBubble(toy, options);
}

function isActiveBubbleConfigured(options: FragmentRubbleAbsorptionOptions): boolean {
  return (
    options.activeCenter !== undefined &&
    options.activeRadius !== undefined &&
    Number.isFinite(options.activeRadius)
  );
}

function isFragmentOutsideActiveBubble(
  toy: PhysicsToy,
  options: FragmentRubbleAbsorptionOptions
): boolean {
  if (!options.activeCenter || options.activeRadius === undefined) return false;

  const radius = Math.max(0, options.activeRadius) +
    (options.activeRadiusBuffer ?? FRAGMENT_RUBBLE_ACTIVE_RADIUS_BUFFER_METERS);
  return toy.mesh.position.distanceToSquared(options.activeCenter) > radius * radius;
}
