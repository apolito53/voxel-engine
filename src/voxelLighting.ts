export type FaceNormal = readonly [number, number, number];

const FACE_AMBIENT_SHADE = 0.58;
const FACE_SKY_FILL_SHADE = 0.2;
const FACE_UNDERSIDE_OCCLUSION = 0.24;

export function getSunlitFaceShade(normal: FaceNormal): number {
  const upwardSkyFill = Math.max(0, normal[1]) * FACE_SKY_FILL_SHADE;
  const undersideOcclusion = Math.max(0, -normal[1]) * FACE_UNDERSIDE_OCCLUSION;

  // Historical name: mesh colors now bake only neutral ambient/sky readability.
  // The live DirectionalLight owns the sun angle, without clock-driven remeshing.
  // Preserve dark undersides and the separate sealed-cavity/block-light layers.
  return clamp(FACE_AMBIENT_SHADE + upwardSkyFill - undersideOcclusion, 0.32, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
