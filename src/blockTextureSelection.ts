// Sunwashed's 64 authored tiles are four interior alternatives for each of the
// 16 binary corner masks. Bit order is image NW, NE, SE, SW (1, 2, 4, 8).
export const BLOCK_TEXTURE_CORNER_MASK_COUNT = 16;
export const BLOCK_TEXTURE_INTERIOR_ALTERNATIVE_COUNT = 4;

// Keep this integer hash and the GLSL below identical. Unsigned multiplication
// and shifts avoid GPU-dependent sin/fract rounding, including at negative UVs.
// World UVs already use Float32 mesh coordinates; integers within that range
// are converted to the same signed 32-bit cell before hashing on either path.
function hashTextureCell(x: number, y: number, salt: number): number {
  let hash = Math.imul(x, 0x1f123bb5) ^ Math.imul(y, 0x5f356495) ^ Math.imul(salt, 0x9e3779b9);
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
  return (hash ^ (hash >>> 16)) >>> 0;
}

export function getConnectedBlockTextureVariant(baseTileId: number, worldU: number, worldV: number): number {
  const x = Math.floor(worldU);
  const y = Math.floor(worldV);
  const cornerSalt = baseTileId * 2 + 1;
  // Canvas row zero is the top of the image. Local UV v grows upward, so its
  // upper two corners use y + 1; the GPU atlas lookup preserves that convention.
  const nw = hashTextureCell(x, y + 1, cornerSalt) & 1;
  const ne = hashTextureCell(x + 1, y + 1, cornerSalt) & 1;
  const se = hashTextureCell(x + 1, y, cornerSalt) & 1;
  const sw = hashTextureCell(x, y, cornerSalt) & 1;
  const mask = nw + ne * 2 + se * 4 + sw * 8;
  const alternative = hashTextureCell(x, y, cornerSalt + 1) & 3;
  return mask + alternative * BLOCK_TEXTURE_CORNER_MASK_COUNT;
}

// WebGLRenderer uses WebGL2. Integer hashing remains exact without rotating,
// mirroring or splitting greedy faces, and the independent salt keeps interior
// alternatives free to vary while all neighboring image borders still agree.
export const BLOCK_TEXTURE_SELECTION_GLSL = `
uint voxelTextureCellHash(ivec2 cell, uint salt) {
  uint hash = uint(cell.x) * 0x1f123bb5u ^ uint(cell.y) * 0x5f356495u ^ salt * 0x9e3779b9u;
  hash = (hash ^ (hash >> 16u)) * 0x7feb352du;
  hash = (hash ^ (hash >> 15u)) * 0x846ca68bu;
  return hash ^ (hash >> 16u);
}
float voxelConnectedTextureVariant(vec2 worldCell, float baseTile) {
  ivec2 cell = ivec2(worldCell);
  uint cornerSalt = uint(baseTile) * 2u + 1u;
  uint nw = voxelTextureCellHash(cell + ivec2(0, 1), cornerSalt) & 1u;
  uint ne = voxelTextureCellHash(cell + ivec2(1, 1), cornerSalt) & 1u;
  uint se = voxelTextureCellHash(cell + ivec2(1, 0), cornerSalt) & 1u;
  uint sw = voxelTextureCellHash(cell, cornerSalt) & 1u;
  uint mask = nw + ne * 2u + se * 4u + sw * 8u;
  uint alternative = voxelTextureCellHash(cell, cornerSalt + 1u) & 3u;
  return float(mask + alternative * 16u);
}`;
