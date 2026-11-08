import { BLOCK } from "./blocks";
import type { CollisionBounds, CollisionVector } from "./collision";

export type BirdTreePerchWorld = {
  isColumnLoaded(x: number, z: number): boolean;
  getTopBlock(x: number, z: number): { readonly block: number; readonly y: number };
  getCellCollisionBoxes(x: number, y: number, z: number): readonly CollisionBounds[] | null;
};

/** A local canopy/wood surface, including surviving partial material. No scans or loads. */
export function findBirdTreePerch(world: BirdTreePerchWorld, x: number, z: number): CollisionVector | null {
  if (!Number.isFinite(x) || !Number.isFinite(z) || !world.isColumnLoaded(x, z)) return null;
  const cellX = Math.floor(x);
  const cellZ = Math.floor(z);
  const top = world.getTopBlock(cellX, cellZ);
  if (top.block !== BLOCK.leaves && top.block !== BLOCK.wood) return null;
  if (!Number.isFinite(top.y) || top.y < 0) return null;
  const partial = world.getCellCollisionBoxes(cellX, top.y, cellZ);
  if (partial === null) return { x: cellX + 0.5, y: top.y + 1, z: cellZ + 0.5 };
  let candidate: CollisionBounds | null = null;
  for (const box of partial) {
    if (box.maxX - box.minX < 0.16 || box.maxZ - box.minZ < 0.16) continue;
    if (!candidate || box.maxY > candidate.maxY || (box.maxY === candidate.maxY &&
      (box.maxX - box.minX) * (box.maxZ - box.minZ) >
      (candidate.maxX - candidate.minX) * (candidate.maxZ - candidate.minZ))) candidate = box;
  }
  return candidate ? {
    x: (candidate.minX + candidate.maxX) / 2,
    y: candidate.maxY,
    z: (candidate.minZ + candidate.maxZ) / 2
  } : null;
}
