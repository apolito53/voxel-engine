export type FaceNormal = readonly [number, number, number];

export const SUN_HORIZONTAL_X = 96;
export const SUN_HORIZONTAL_Z = -64;
export const SUN_ELEVATION_DEGREES = 40.392;

const SUN_HORIZONTAL_DISTANCE = Math.hypot(SUN_HORIZONTAL_X, SUN_HORIZONTAL_Z);
export const SUN_OFFSET_Y = SUN_HORIZONTAL_DISTANCE * Math.tan(degreesToRadians(SUN_ELEVATION_DEGREES));

const SUN_LENGTH = Math.hypot(SUN_HORIZONTAL_X, SUN_OFFSET_Y, SUN_HORIZONTAL_Z);
const SUN_DIRECTION_X = SUN_HORIZONTAL_X / SUN_LENGTH;
const SUN_DIRECTION_Y = SUN_OFFSET_Y / SUN_LENGTH;
const SUN_DIRECTION_Z = SUN_HORIZONTAL_Z / SUN_LENGTH;

const FACE_AMBIENT_SHADE = 0.58;
const FACE_DIRECT_SHADE = 0.34;
const FACE_SKY_FILL_SHADE = 0.2;
const FACE_UNDERSIDE_OCCLUSION = 0.13;

export function getSunlitFaceShade(normal: FaceNormal): number {
  const sunDot = Math.max(
    0,
    normal[0] * SUN_DIRECTION_X + normal[1] * SUN_DIRECTION_Y + normal[2] * SUN_DIRECTION_Z
  );
  const upwardSkyFill = Math.max(0, normal[1]) * FACE_SKY_FILL_SHADE;
  const undersideOcclusion = Math.max(0, -normal[1]) * FACE_UNDERSIDE_OCCLUSION;

  // Vertex colors still carry a cheap voxel-art readability pass, but now the
  // bright side follows the real sun vector instead of pretending every wall is
  // lit the same. Real shadow maps then add the moving/contact shadow detail.
  return clamp(FACE_AMBIENT_SHADE + sunDot * FACE_DIRECT_SHADE + upwardSkyFill - undersideOcclusion, 0.42, 1);
}

function degreesToRadians(degrees: number): number {
  return degrees * Math.PI / 180;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
