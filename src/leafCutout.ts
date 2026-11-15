import { hashTextureCell } from "./blockTextureSelection";

export const LEAF_ALPHA_TEST = 0.5;
const LEAF_PIXELS_PER_METER = 32;

// Use clustered pixel holes rather than changing the accepted Sunwashed RGB
// art. The face-plane seed prevents successive foliage layers lining up into
// empty tunnels. Opposite normals on a shared plane use the same mask.
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
  const clusterX = Math.floor(pixelX / 4);
  const clusterY = Math.floor(pixelY / 4);
  const salt = Math.floor(plane * LEAF_PIXELS_PER_METER + 0.5) * 3 + axis + 1;
  const hash = hashTextureCell(clusterX, clusterY, salt);
  if ((hash & 3) === 0) return 1;
  const centerX = 1 + ((hash >>> 2) & 1);
  const centerY = 1 + ((hash >>> 3) & 1);
  const radius = 1 + ((hash >>> 4) & 1);
  const distance = Math.abs(pixelX - clusterX * 4 - centerX) + Math.abs(pixelY - clusterY * 4 - centerY);
  return distance <= radius ? 0 : 1;
}

// The normal color pass, sun-glare depth query and shadow depth/distance passes
// all use this exact function before Three's normal alpha-test discard.
export const LEAF_CUTOUT_GLSL = `
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
  vec2 pixel = floor(uv * 32.0);
  ivec2 cluster = ivec2(floor(pixel / 4.0));
  uint salt = uint(int(floor(plane * 32.0 + 0.5)) * 3 + axis + 1);
  uint hash = voxelTextureCellHash(cluster, salt);
  if ((hash & 3u) == 0u) return 1.0;
  vec2 center = vec2(1.0 + float((hash >> 2u) & 1u), 1.0 + float((hash >> 3u) & 1u));
  float radius = 1.0 + float((hash >> 4u) & 1u);
  vec2 delta = abs(pixel - vec2(cluster) * 4.0 - center);
  return delta.x + delta.y <= radius ? 0.0 : 1.0;
}`;
