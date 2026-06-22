import { BLOCK } from "./blocks";
import { getBlockColorVariantFromMeshKey, getBlockFromMeshKey } from "./blockColors";

export const BLOCK_TEXTURE_TILE_SIZE_PX = 16;
export const BLOCK_TEXTURE_VARIANTS_PER_BASE_TILE = 4;

export const BLOCK_TEXTURE_TILE = {
  grassTop: 0,
  grassSide: 1,
  dirt: 2,
  stone: 3,
  sand: 4,
  ember: 5,
  rubble: 6,
  woodSide: 7,
  woodTop: 8,
  leaves: 9,
  mossTop: 10,
  mossSide: 11,
  bush: 12,
  lamp: 13
} as const;

export const BLOCK_TEXTURE_BASE_TILE_COUNT = 14;
export const BLOCK_TEXTURE_TILE_COUNT = BLOCK_TEXTURE_BASE_TILE_COUNT * BLOCK_TEXTURE_VARIANTS_PER_BASE_TILE;
export const BLOCK_TEXTURE_ATLAS_COLUMNS = BLOCK_TEXTURE_TILE_COUNT;
export const BLOCK_TEXTURE_ATLAS_ROWS = 1;

export type BlockTextureBaseTileId = (typeof BLOCK_TEXTURE_TILE)[keyof typeof BLOCK_TEXTURE_TILE];
export type BlockTextureTileId = number;

type MeshNumberBuffer = number[];
type FaceNormal = readonly [number, number, number];
type QuadCorner = readonly [number, number, number];

export function getBlockTextureTileId(meshKey: number, normal: FaceNormal): BlockTextureTileId {
  const baseTile = getBlockTextureBaseTileId(meshKey, normal);
  const variant = getBlockTextureVariant(meshKey);
  return baseTile * BLOCK_TEXTURE_VARIANTS_PER_BASE_TILE + variant;
}

export function getBlockTextureBaseTileId(meshKey: number, normal: FaceNormal): BlockTextureBaseTileId {
  const block = getBlockFromMeshKey(meshKey);

  if (block === BLOCK.grass) {
    if (normal[1] > 0.5) return BLOCK_TEXTURE_TILE.grassTop;
    if (normal[1] < -0.5) return BLOCK_TEXTURE_TILE.dirt;
    return BLOCK_TEXTURE_TILE.grassSide;
  }

  if (block === BLOCK.wood) {
    return Math.abs(normal[1]) > 0.5 ? BLOCK_TEXTURE_TILE.woodTop : BLOCK_TEXTURE_TILE.woodSide;
  }

  if (block === BLOCK.leaves) return BLOCK_TEXTURE_TILE.leaves;
  if (block === BLOCK.moss) {
    if (normal[1] > 0.5) return BLOCK_TEXTURE_TILE.mossTop;
    if (normal[1] < -0.5) return BLOCK_TEXTURE_TILE.dirt;
    return BLOCK_TEXTURE_TILE.mossSide;
  }
  if (block === BLOCK.bush) return BLOCK_TEXTURE_TILE.bush;
  if (block === BLOCK.lamp) return BLOCK_TEXTURE_TILE.lamp;
  if (block === BLOCK.dirt) return BLOCK_TEXTURE_TILE.dirt;
  if (block === BLOCK.stone) return BLOCK_TEXTURE_TILE.stone;
  if (block === BLOCK.sand) return BLOCK_TEXTURE_TILE.sand;
  if (block === BLOCK.ember) return BLOCK_TEXTURE_TILE.ember;
  if (block === BLOCK.rubble) return BLOCK_TEXTURE_TILE.rubble;

  return BLOCK_TEXTURE_TILE.stone;
}

function getBlockTextureVariant(meshKey: number): number {
  return getBlockColorVariantFromMeshKey(meshKey) % BLOCK_TEXTURE_VARIANTS_PER_BASE_TILE;
}

export function appendBlockTextureQuadAttributes(
  uvs: MeshNumberBuffer,
  textureTiles: MeshNumberBuffer,
  meshKey: number,
  normal: FaceNormal,
  corners: readonly QuadCorner[]
): void {
  const tileId = getBlockTextureTileId(meshKey, normal);

  // UVs are derived from world-space face axes, not quad-local 0..1 corners.
  // That keeps greedy-meshed terrain faces tiled per meter instead of stretching
  // one giant texture across a combined run of blocks.
  for (const corner of corners) {
    const [u, v] = getWorldFaceUv(normal, corner);
    uvs.push(u, v);
    textureTiles.push(tileId);
  }
}

function getWorldFaceUv(normal: FaceNormal, corner: QuadCorner): readonly [number, number] {
  const absX = Math.abs(normal[0]);
  const absY = Math.abs(normal[1]);
  const absZ = Math.abs(normal[2]);

  if (absY >= absX && absY >= absZ) {
    return [corner[0], corner[2]];
  }

  if (absX >= absZ) {
    return [corner[2], corner[1]];
  }

  return [corner[0], corner[1]];
}
