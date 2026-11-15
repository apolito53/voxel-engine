import { hashTextureCell } from "./blockTextureSelection";

export const LEAF_ALPHA_TEST = 0.5;
const LEAF_PIXELS_PER_METER = 32;

function leafValueNoise(x: number, y: number, period: number, salt: number): number {
  const cellX = Math.floor(x / period);
  const cellY = Math.floor(y / period);
  const rx = x - cellX * period;
  const ry = y - cellY * period;
  // Integer Hermite weights retain smooth clusters without CPU/GPU threshold
  // drift. The largest interpolation sum is 255 * 256 * 256, below 2^24.
  const wx = Math.floor(rx * rx * (3 * period - 2 * rx) * 256 / (period ** 3));
  const wy = Math.floor(ry * ry * (3 * period - 2 * ry) * 256 / (period ** 3));
  const lower = (hashTextureCell(cellX, cellY, salt) & 255) * (256 - wx)
    + (hashTextureCell(cellX + 1, cellY, salt) & 255) * wx;
  const upper = (hashTextureCell(cellX, cellY + 1, salt) & 255) * (256 - wx)
    + (hashTextureCell(cellX + 1, cellY + 1, salt) & 255) * wx;
  return (lower * (256 - wy) + upper * wy) >>> 16;
}

// Threshold overlapping noise fields rather than stamping a shape in each
// grid cell. Different scales/orientations vary both gap outlines and density;
// fine grain roughens their edges without changing the accepted Sunwashed RGB.
// Plane seeds stagger foliage layers; opposite normals share the same mask.
export function getLeafCutoutAlpha(
  position: readonly [number, number, number],
  normal: readonly [number, number, number]
): number {
  const [x, y, z] = position;
  const [nx, ny, nz] = normal.map(Math.abs);
  const [u, v, plane, axis] = ny >= nx && ny >= nz ? [x, z, y, 0]
    : nx >= nz ? [z, y, x, 1] : [x, y, z, 2];
  const pixelX = Math.floor(u * LEAF_PIXELS_PER_METER);
  const pixelY = Math.floor(v * LEAF_PIXELS_PER_METER);
  const salt = Math.floor(plane * LEAF_PIXELS_PER_METER + 0.5) * 3 + axis + 1;
  const fine = leafValueNoise(pixelX, pixelY, 5, salt);
  const broad = leafValueNoise(pixelX + pixelY, pixelY - pixelX, 13, salt ^ 0x51ed270b);
  const grain = hashTextureCell(pixelX, pixelY, salt ^ 0x68bc21eb) & 255;
  return fine * 3 + broad * 2 + grain < 696 ? 0 : 1;
}

// The normal color pass, sun-glare depth query and shadow depth/distance passes
// all use this exact function before Three's normal alpha-test discard.
export const LEAF_CUTOUT_GLSL = `
ivec2 voxelLeafNoiseAxis(int pixel, int period) {
  // ES3 leaves negative remainders/division rounding unspecified. Use only
  // nonnegative remainders and exact divisions, including at negative multiples.
  int magnitude = pixel < 0 ? -(pixel + 1) : pixel;
  int remainder = magnitude % period;
  int quotient = (magnitude - remainder) / period;
  return pixel < 0 ? ivec2(-1 - quotient, period - 1 - remainder) : ivec2(quotient, remainder);
}
int voxelLeafValueNoise(ivec2 pixel, int period, uint salt) {
  ivec2 x = voxelLeafNoiseAxis(pixel.x, period);
  ivec2 y = voxelLeafNoiseAxis(pixel.y, period);
  ivec2 cell = ivec2(x.x, y.x);
  ivec2 r = ivec2(x.y, y.y);
  ivec2 numerator = r * r * (3 * period - 2 * r) * 256;
  int denominator = period * period * period;
  ivec2 w = (numerator - numerator % denominator) / denominator;
  int lower = int(voxelTextureCellHash(cell, salt) & 255u) * (256 - w.x)
    + int(voxelTextureCellHash(cell + ivec2(1, 0), salt) & 255u) * w.x;
  int upper = int(voxelTextureCellHash(cell + ivec2(0, 1), salt) & 255u) * (256 - w.x)
    + int(voxelTextureCellHash(cell + ivec2(1, 1), salt) & 255u) * w.x;
  return (lower * (256 - w.y) + upper * w.y) >> 16;
}
float voxelLeafCutoutAlpha(vec3 position, vec3 faceNormal) {
  vec3 n = abs(faceNormal);
  vec2 uv;
  float plane;
  int axis;
  if (n.y >= n.x && n.y >= n.z) {
    uv = position.xz; plane = position.y; axis = 0;
  } else if (n.x >= n.z) {
    uv = position.zy; plane = position.x; axis = 1;
  } else {
    uv = position.xy; plane = position.z; axis = 2;
  }
  ivec2 pixel = ivec2(floor(uv * 32.0));
  uint salt = uint(int(floor(plane * 32.0 + 0.5)) * 3 + axis + 1);
  int fine = voxelLeafValueNoise(pixel, 5, salt);
  int broad = voxelLeafValueNoise(ivec2(pixel.x + pixel.y, pixel.y - pixel.x), 13, salt ^ 0x51ed270bu);
  int grain = int(voxelTextureCellHash(pixel, salt ^ 0x68bc21ebu) & 255u);
  return fine * 3 + broad * 2 + grain < 696 ? 0.0 : 1.0;
}`;
