import * as THREE from "three";

import type { DayNightVisualState, RgbColorTuple } from "./dayNightCycle";

const SKYBOX_RADIUS_METERS = 96;
const SKYBOX_SEGMENTS = 96;
const SKYBOX_RINGS = 48;

// Kept for old tests/docs that describe why the retired image skybox needed a
// lower mask. The procedural sky now generates its lower hemisphere directly.
export const SKYBOX_LOWER_FOG_MASK_START_Y = -0.1;
export const SKYBOX_LOWER_FOG_MASK_END_Y = -0.02;

export type ProceduralSkyState = {
  readonly timeOfDay: number;
  readonly topColor: RgbColorTuple;
  readonly horizonColor: RgbColorTuple;
  readonly lowerColor: RgbColorTuple;
  readonly sunColor: RgbColorTuple;
  readonly moonColor: RgbColorTuple;
  readonly starIntensity: number;
  readonly cloudOpacity: number;
  readonly sunDiscIntensity: number;
  readonly moonDiscIntensity: number;
};

type SkyboxUniforms = {
  readonly skyTopColor: { value: THREE.Color };
  readonly skyHorizonColor: { value: THREE.Color };
  readonly skyLowerColor: { value: THREE.Color };
  readonly sunColor: { value: THREE.Color };
  readonly moonColor: { value: THREE.Color };
  readonly sunDirection: { value: THREE.Vector3 };
  readonly moonDirection: { value: THREE.Vector3 };
  readonly timeOfDay: { value: number };
  readonly starIntensity: { value: number };
  readonly cloudOpacity: { value: number };
  readonly sunDiscIntensity: { value: number };
  readonly moonDiscIntensity: { value: number };
};

export type Skybox = {
  readonly object: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  setState(state: ProceduralSkyState): void;
  update(camera: THREE.Camera): void;
  dispose(): void;
};

export function createSkybox(
  sunOffset: THREE.Vector3,
  initialState: ProceduralSkyState
): Skybox {
  const geometry = new THREE.SphereGeometry(SKYBOX_RADIUS_METERS, SKYBOX_SEGMENTS, SKYBOX_RINGS);
  const uniforms: SkyboxUniforms = {
    skyTopColor: { value: colorFromTuple(initialState.topColor) },
    skyHorizonColor: { value: colorFromTuple(initialState.horizonColor) },
    skyLowerColor: { value: colorFromTuple(initialState.lowerColor) },
    sunColor: { value: colorFromTuple(initialState.sunColor) },
    moonColor: { value: colorFromTuple(initialState.moonColor) },
    sunDirection: { value: getProceduralSkySunDirection(initialState.timeOfDay, sunOffset) },
    moonDirection: { value: getProceduralSkyMoonDirection(initialState.timeOfDay, sunOffset) },
    timeOfDay: { value: initialState.timeOfDay },
    starIntensity: { value: initialState.starIntensity },
    cloudOpacity: { value: initialState.cloudOpacity },
    sunDiscIntensity: { value: initialState.sunDiscIntensity },
    moonDiscIntensity: { value: initialState.moonDiscIntensity }
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: [
      "varying vec3 vSkyDirection;",
      "void main() {",
      "  vSkyDirection = normalize(position);",
      "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
      "}"
    ].join("\n"),
    fragmentShader: [
      "precision highp float;",
      "uniform vec3 skyTopColor;",
      "uniform vec3 skyHorizonColor;",
      "uniform vec3 skyLowerColor;",
      "uniform vec3 sunColor;",
      "uniform vec3 moonColor;",
      "uniform vec3 sunDirection;",
      "uniform vec3 moonDirection;",
      "uniform float timeOfDay;",
      "uniform float starIntensity;",
      "uniform float cloudOpacity;",
      "uniform float sunDiscIntensity;",
      "uniform float moonDiscIntensity;",
      "varying vec3 vSkyDirection;",
      "float hash13(vec3 p) {",
      "  p = fract(p * 0.1031);",
      "  p += dot(p, p.yzx + 33.33);",
      "  return fract((p.x + p.y) * p.z);",
      "}",
      "float cloudBand(vec3 dir) {",
      "  float aboveHorizon = smoothstep(0.02, 0.28, dir.y);",
      "  float highFade = 1.0 - smoothstep(0.62, 0.92, dir.y);",
      "  float bandA = sin(dir.x * 14.0 + dir.z * 4.5 + timeOfDay * 6.28318);",
      "  float bandB = sin(dir.z * 19.0 - dir.x * 3.0 + timeOfDay * 3.2);",
      "  float detail = sin((dir.x + dir.z) * 46.0);",
      "  return smoothstep(0.58, 0.88, bandA * 0.45 + bandB * 0.35 + detail * 0.12 + 0.5) * aboveHorizon * highFade;",
      "}",
      "void main() {",
      "  vec3 dir = normalize(vSkyDirection);",
      "  float horizonBlend = smoothstep(-0.12, 0.18, dir.y);",
      "  float upperBlend = smoothstep(0.08, 0.78, dir.y);",
      "  vec3 color = mix(skyLowerColor, skyHorizonColor, horizonBlend);",
      "  color = mix(color, skyTopColor, upperBlend);",
      "  float sunDot = max(dot(dir, normalize(sunDirection)), 0.0);",
      "  float sunDisc = smoothstep(0.99925, 0.99985, sunDot) * sunDiscIntensity;",
      "  float sunGlow = pow(sunDot, 96.0) * 0.52 * sunDiscIntensity;",
      "  color += sunColor * (sunDisc + sunGlow);",
      "  float moonDot = max(dot(dir, normalize(moonDirection)), 0.0);",
      "  float moonDisc = smoothstep(0.9994, 0.99988, moonDot) * moonDiscIntensity;",
      "  float moonGlow = pow(moonDot, 92.0) * 0.16 * moonDiscIntensity;",
      "  color += moonColor * (moonDisc + moonGlow);",
      "  float starCell = hash13(floor(dir * 190.0));",
      "  float star = smoothstep(0.993, 1.0, starCell) * smoothstep(0.04, 0.18, dir.y) * starIntensity;",
      "  color += vec3(star);",
      "  float clouds = cloudBand(dir) * cloudOpacity;",
      "  color = mix(color, color + vec3(0.76, 0.84, 0.92), clouds * 0.55);",
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
    setState(state: ProceduralSkyState): void {
      setColorUniform(uniforms.skyTopColor.value, state.topColor);
      setColorUniform(uniforms.skyHorizonColor.value, state.horizonColor);
      setColorUniform(uniforms.skyLowerColor.value, state.lowerColor);
      setColorUniform(uniforms.sunColor.value, state.sunColor);
      setColorUniform(uniforms.moonColor.value, state.moonColor);
      uniforms.sunDirection.value.copy(getProceduralSkySunDirection(state.timeOfDay, sunOffset));
      uniforms.moonDirection.value.copy(getProceduralSkyMoonDirection(state.timeOfDay, sunOffset));
      uniforms.timeOfDay.value = state.timeOfDay;
      uniforms.starIntensity.value = state.starIntensity;
      uniforms.cloudOpacity.value = state.cloudOpacity;
      uniforms.sunDiscIntensity.value = state.sunDiscIntensity;
      uniforms.moonDiscIntensity.value = state.moonDiscIntensity;
    },
    update(camera: THREE.Camera): void {
      object.position.copy(camera.position);
    },
    dispose(): void {
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
    sunColor: visual.sunColor,
    moonColor: visual.moonColor,
    starIntensity: visual.starIntensity,
    cloudOpacity: visual.cloudOpacity,
    sunDiscIntensity: visual.sunDiscIntensity,
    moonDiscIntensity: visual.moonDiscIntensity
  };
}

export function getProceduralSkySunDirection(
  timeOfDay: number,
  sunOffset: THREE.Vector3,
  target = new THREE.Vector3()
): THREE.Vector3 {
  const noonDirection = sunOffset.clone().normalize();
  const horizontal = new THREE.Vector3(noonDirection.x, 0, noonDirection.z);
  if (horizontal.lengthSq() < 1e-6) {
    horizontal.set(1, 0, 0);
  } else {
    horizontal.normalize();
  }

  const solarHeight = Math.sin((timeOfDay - 0.25) * Math.PI * 2);
  const y = solarHeight >= 0
    ? solarHeight * Math.max(0.2, noonDirection.y)
    : solarHeight * 0.35;
  const horizontalScale = Math.sqrt(Math.max(0.0001, 1 - y * y));
  return target
    .set(horizontal.x * horizontalScale, y, horizontal.z * horizontalScale)
    .normalize();
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
