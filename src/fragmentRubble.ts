import type { PhysicsToy } from "./physics";

export function shouldAbsorbFragmentIntoRubble(toy: PhysicsToy): boolean {
  if (!toy.isInstancedFragment) return false;

  // Sleeping is the normal graduation path. Expiration is the low-quality
  // fallback: Potato may only spawn two visible shards, so losing those before
  // they sleep would incorrectly erase the whole block's gameplay rubble mass.
  return toy.isSleeping || toy.isExpired;
}
