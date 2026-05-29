import { BLOCK, BLOCKS, type BlockColor } from "./blocks";

export const BLOCK_COLOR_VARIANT_COUNT = 7;

const BLOCK_MESH_KEY_BLOCK_MASK = 0xff;

const BLOCK_COLOR_VARIATION_STRENGTH: Record<number, number> = {
  [BLOCK.grass]: 0.18,
  [BLOCK.dirt]: 0.14,
  [BLOCK.stone]: 0.12,
  [BLOCK.sand]: 0.11,
  [BLOCK.ember]: 0.22,
  [BLOCK.rubble]: 0.16,
  [BLOCK.wood]: 0.13,
  [BLOCK.leaves]: 0.20
};

export function createBlockMeshKey(block: number, worldX: number, worldY: number, worldZ: number): number {
  if (block === BLOCK.air) return BLOCK.air;
  return block | (getBlockColorVariant(block, worldX, worldY, worldZ) << 8);
}

export function getBlockFromMeshKey(meshKey: number): number {
  return meshKey & BLOCK_MESH_KEY_BLOCK_MASK;
}

export function getBlockColorVariantFromMeshKey(meshKey: number): number {
  return meshKey >>> 8;
}

export function getBlockColorVariant(block: number, worldX: number, worldY: number, worldZ: number): number {
  if (block === BLOCK.air) return 0;
  return hashBlockPosition(block, worldX, worldY, worldZ) % BLOCK_COLOR_VARIANT_COUNT;
}

export function getTintedBlockColor(meshKey: number, shade = 1): BlockColor {
  const block = getBlockFromMeshKey(meshKey);
  const definition = BLOCKS[block] ?? BLOCKS[BLOCK.air];
  const variant = getBlockColorVariantFromMeshKey(meshKey);
  const strength = BLOCK_COLOR_VARIATION_STRENGTH[block] ?? 0.08;
  const centeredVariant = BLOCK_COLOR_VARIANT_COUNT <= 1
    ? 0
    : (variant / (BLOCK_COLOR_VARIANT_COUNT - 1)) * 2 - 1;
  const brightness = 1 + centeredVariant * strength;
  const warmth = (((variant * 5) % BLOCK_COLOR_VARIANT_COUNT) / (BLOCK_COLOR_VARIANT_COUNT - 1) * 2 - 1) * strength * 0.28;

  // Keep the variation deterministic and subtle: enough to break up flat voxel
  // carpets, not enough to make a grass block look like a different material.
  return [
    clampColorChannel(definition.color[0] * (brightness + warmth) * shade),
    clampColorChannel(definition.color[1] * (brightness - Math.abs(warmth) * 0.2) * shade),
    clampColorChannel(definition.color[2] * (brightness - warmth) * shade)
  ];
}

function hashBlockPosition(block: number, worldX: number, worldY: number, worldZ: number): number {
  let hash = 2166136261;
  hash = mixHash(hash ^ Math.imul(Math.floor(worldX), 374761393));
  hash = mixHash(hash ^ Math.imul(Math.floor(worldY), 668265263));
  hash = mixHash(hash ^ Math.imul(Math.floor(worldZ), 2246822519));
  hash = mixHash(hash ^ Math.imul(block, 3266489917));
  return hash >>> 0;
}

function mixHash(value: number): number {
  let hash = value >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 2246822507);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 3266489909);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function clampColorChannel(value: number): number {
  return Math.max(0, Math.min(1, value));
}
