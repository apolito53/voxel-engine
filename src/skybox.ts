import * as THREE from "three";

import type { DayNightVisualState, RgbColorTuple } from "./dayNightCycle";
import { getSolarDirection } from "./lighting";

const SKYBOX_RADIUS_METERS = 96;
const SKYBOX_SEGMENTS = 64;
const SKYBOX_RINGS = 32;

// Clouds use the same atmosphere at their distant edge. Keep this independent
// from terrain fog: the world can have a short, opaque chunk horizon beneath a
// much larger sky, including when the player flies above the cloud layer.
export const SKY_ATMOSPHERE_GLSL = `
  uniform vec3 skyTopColor;
  uniform vec3 skyHorizonColor;
  uniform vec3 skyLowerColor;
  uniform vec3 skyFogColor;
  uniform vec3 sunColor;
  uniform vec3 sunDirection;
  uniform float twilightFactor;
  uniform float sunDiscIntensity;

  vec3 sampleSkyAtmosphere(vec3 dir) {
    float elevation = pow(max(dir.y, 0.0), 0.48);
    vec3 upper = mix(skyHorizonColor, skyTopColor, elevation);
    vec3 color = mix(skyLowerColor, upper, smoothstep(-0.16, 0.015, dir.y));
    vec2 horizontal = dir.xz / max(length(dir.xz), 0.0001);
    vec2 sunHorizontal = sunDirection.xz / max(length(sunDirection.xz), 0.0001);
    float sunward = pow(max(dot(horizontal, sunHorizontal), 0.0), 3.0);
    float twilight = twilightFactor * sunward * exp(-abs(dir.y - 0.07) * 6.5);
    color = mix(color, vec3(1.0, 0.43, 0.20), twilight * 0.68);
    float sunDot = max(dot(dir, sunDirection), 0.0);
    color += sunColor * (pow(sunDot, 28.0) * 0.045 + pow(sunDot, 180.0) * 0.13) * sunDiscIntensity;
    // The existing fog wall/matte meet the true horizon. Lock that seam to
    // their actual color, then lift colored atmosphere smoothly above it.
    return mix(skyFogColor, color, smoothstep(0.0, 0.07, abs(dir.y)));
  }
`;

// Kept for old tests/docs that describe why the retired image skybox needed a
// lower mask. The procedural sky now generates its lower hemisphere directly.
export const SKYBOX_LOWER_FOG_MASK_START_Y = -0.1;
export const SKYBOX_LOWER_FOG_MASK_END_Y = -0.02;

export type ProceduralSkyState = {
  readonly timeOfDay: number;
  readonly topColor: RgbColorTuple;
  readonly horizonColor: RgbColorTuple;
  readonly lowerColor: RgbColorTuple;
  readonly fogColor: RgbColorTuple;
  readonly sunColor: RgbColorTuple;
  readonly moonColor: RgbColorTuple;
  readonly starIntensity: number;
  readonly twilightFactor: number;
  readonly sunDiscIntensity: number;
  readonly moonDiscIntensity: number;
};

type SkyboxUniforms = {
  readonly skyTopColor: { value: THREE.Color };
  readonly skyHorizonColor: { value: THREE.Color };
  readonly skyLowerColor: { value: THREE.Color };
  readonly skyFogColor: { value: THREE.Color };
  readonly sunColor: { value: THREE.Color };
  readonly moonColor: { value: THREE.Color };
  readonly sunDirection: { value: THREE.Vector3 };
  readonly moonDirection: { value: THREE.Vector3 };
  readonly starIntensity: { value: number };
  readonly twilightFactor: { value: number };
  readonly sunDiscIntensity: { value: number };
  readonly moonDiscIntensity: { value: number };
};

export type Skybox = {
  readonly object: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  setState(state: ProceduralSkyState, sunDirection: THREE.Vector3): void;
  update(camera: THREE.Camera): void;
  dispose(): void;
};

export function createSkybox(
  sunDirection: THREE.Vector3,
  initialState: ProceduralSkyState
): Skybox {
  const geometry = new THREE.SphereGeometry(SKYBOX_RADIUS_METERS, SKYBOX_SEGMENTS, SKYBOX_RINGS);
  const uniforms: SkyboxUniforms = {
    skyTopColor: { value: colorFromTuple(initialState.topColor) },
    skyHorizonColor: { value: colorFromTuple(initialState.horizonColor) },
    skyLowerColor: { value: colorFromTuple(initialState.lowerColor) },
    skyFogColor: { value: colorFromTuple(initialState.fogColor) },
    sunColor: { value: colorFromTuple(initialState.sunColor) },
    moonColor: { value: colorFromTuple(initialState.moonColor) },
    sunDirection: { value: sunDirection.clone() },
    moonDirection: { value: sunDirection.clone().negate() },
    starIntensity: { value: initialState.starIntensity },
    twilightFactor: { value: initialState.twilightFactor },
    sunDiscIntensity: { value: initialState.sunDiscIntensity },
    moonDiscIntensity: { value: initialState.moonDiscIntensity }
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: [
      "varying vec3 vSkyDirection;",
      "void main() {",
      "  vSkyDirection = normalize(position);",
      "  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
      // A background direction has no physical distance. Project it onto the
      // far plane instead of letting the sphere's radius meet camera clipping.
      "  gl_Position = clip.xyww;",
      "}"
    ].join("\n"),
    fragmentShader: [
      "precision highp float;",
      SKY_ATMOSPHERE_GLSL,
      "uniform vec3 moonColor;",
      "uniform vec3 moonDirection;",
      "uniform float starIntensity;",
      "uniform float moonDiscIntensity;",
      "varying vec3 vSkyDirection;",
      "float hash21(vec2 p) {",
      "  vec3 p3 = fract(vec3(p.xyx) * 0.1031);",
      "  p3 += dot(p3, p3.yzx + 33.33);",
      "  return fract((p3.x + p3.y) * p3.z);",
      "}",
      "void main() {",
      "  vec3 dir = normalize(vSkyDirection);",
      "  vec3 color = sampleSkyAtmosphere(dir);",
      "  float sunDot = max(dot(dir, normalize(sunDirection)), 0.0);",
      "  float sunDisc = smoothstep(0.99986, 0.99991, sunDot) * sunDiscIntensity;",
      "  color += sunColor * sunDisc;",
      "  float moonDot = max(dot(dir, normalize(moonDirection)), 0.0);",
      "  float moonDisc = smoothstep(0.99982, 0.99988, moonDot);",
      "  vec3 moonRight = normalize(cross(moonDirection, vec3(0.0, 1.0, 0.0)));",
      "  vec3 moonUp = cross(moonRight, moonDirection);",
      "  vec2 moonUv = vec2(dot(dir, moonRight), dot(dir, moonUp)) / 0.017;",
      "  float craters = (1.0 - smoothstep(0.13, 0.24, length(moonUv - vec2(0.28, 0.18)))) * 0.13;",
      "  craters += (1.0 - smoothstep(0.19, 0.30, length(moonUv + vec2(0.30, 0.23)))) * 0.10;",
      "  float moonGlow = pow(moonDot, 220.0) * 0.055;",
      "  color += moonColor * (moonDisc * (1.0 - craters) + moonGlow) * moonDiscIntensity;",
      "  vec2 starGrid = vec2(atan(dir.z, dir.x) / 6.2831853 + 0.5, asin(clamp(dir.y, -1.0, 1.0)) / 3.1415927 + 0.5) * vec2(720.0, 360.0);",
      "  vec2 starCell = floor(starGrid);",
      "  float seed = hash21(starCell);",
      "  vec2 starCenter = vec2(hash21(starCell + 17.3), hash21(starCell + 91.7)) * 0.6 + 0.2;",
      "  float starRadius = mix(0.045, 0.14, hash21(starCell + 31.2));",
      "  float starAa = max(0.025, length(fwidth(starGrid)) * 0.5);",
      "  float star = (1.0 - smoothstep(starRadius, starRadius + starAa, length(fract(starGrid) - starCenter))) * step(0.997, seed);",
      "  star *= smoothstep(0.015, 0.16, dir.y) * starIntensity * (1.0 - pow(moonDot, 100.0) * 0.8);",
      "  color += mix(vec3(0.67, 0.79, 1.0), vec3(1.0, 0.91, 0.76), hash21(starCell + 8.1)) * star;",
      "  gl_FragColor = vec4(color, 1.0);",
      "}"
    ].join("\n"),
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false
  });
  material.toneMapped = false;

  const object = new THREE.Mesh(geometry, material);
  object.name = "Procedural day-night sky";
  object.frustumCulled = false;
  object.renderOrder = -1000;

  return {
    object,
    setState(state: ProceduralSkyState, direction: THREE.Vector3): void {
      setColorUniform(uniforms.skyTopColor.value, state.topColor);
      setColorUniform(uniforms.skyHorizonColor.value, state.horizonColor);
      setColorUniform(uniforms.skyLowerColor.value, state.lowerColor);
      setColorUniform(uniforms.skyFogColor.value, state.fogColor);
      setColorUniform(uniforms.sunColor.value, state.sunColor);
      setColorUniform(uniforms.moonColor.value, state.moonColor);
      uniforms.sunDirection.value.copy(direction);
      uniforms.moonDirection.value.copy(direction).negate();
      uniforms.starIntensity.value = state.starIntensity;
      uniforms.twilightFactor.value = state.twilightFactor;
      uniforms.sunDiscIntensity.value = state.sunDiscIntensity;
      uniforms.moonDiscIntensity.value = state.moonDiscIntensity;
    },
    update(camera: THREE.Camera): void {
      object.position.copy(camera.position);
    },
    dispose(): void {
      object.removeFromParent();
      geometry.dispose();
      material.dispose();
    }
  };
}

export function createProceduralSkyState(visual: DayNightVisualState): ProceduralSkyState {
  return {
    timeOfDay: visual.timeOfDay,
    topColor: visual.skyTopColor,
    horizonColor: visual.skyHorizonColor,
    lowerColor: visual.skyLowerColor,
    fogColor: visual.fogColor,
    sunColor: visual.sunColor,
    moonColor: visual.moonColor,
    starIntensity: visual.starIntensity,
    twilightFactor: visual.twilightFactor,
    sunDiscIntensity: visual.sunDiscIntensity,
    moonDiscIntensity: visual.moonDiscIntensity
  };
}

export function getProceduralSkySunDirection(
  timeOfDay: number,
  sunOffset: THREE.Vector3,
  target = new THREE.Vector3()
): THREE.Vector3 {
  return getSolarDirection(timeOfDay, sunOffset, target);
}

export function getProceduralSkyMoonDirection(
  timeOfDay: number,
  sunOffset: THREE.Vector3,
  target = new THREE.Vector3()
): THREE.Vector3 {
  return getProceduralSkySunDirection(timeOfDay, sunOffset, target).multiplyScalar(-1);
}

export function getSkyboxYawForSunDirection(_sunOffset: THREE.Vector3): number {
  return 0;
}

export function getSkyboxAlignedSunDirection(
  sunOffset: THREE.Vector3,
  target = new THREE.Vector3()
): THREE.Vector3 {
  return getProceduralSkySunDirection(0.5, sunOffset, target);
}

function colorFromTuple(color: RgbColorTuple): THREE.Color {
  return new THREE.Color(color[0], color[1], color[2]);
}

function setColorUniform(target: THREE.Color, color: RgbColorTuple): void {
  target.setRGB(color[0], color[1], color[2]);
}
