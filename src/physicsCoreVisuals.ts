import * as THREE from "three";
import {
  normalizePhysicsCoreHueDegrees,
  type PhysicsCoreSettings
} from "./physicsCoreSettings";

const CORE_COLOR_SATURATION = 0.9;
const CORE_COLOR_LIGHTNESS = 0.58;
const CORE_EMISSIVE_LIGHTNESS = 0.2;

export function createPhysicsCoreColor(settings: PhysicsCoreSettings): THREE.Color {
  return createColorFromCoreHue(settings, CORE_COLOR_LIGHTNESS);
}

export function createPhysicsCoreEmissiveColor(settings: PhysicsCoreSettings): THREE.Color {
  return createColorFromCoreHue(settings, CORE_EMISSIVE_LIGHTNESS);
}

export function createPhysicsCoreMaterial(settings: PhysicsCoreSettings): THREE.MeshStandardMaterial {
  const color = createPhysicsCoreColor(settings);
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.42,
    metalness: 0.12,
    emissive: createPhysicsCoreEmissiveColor(settings),
    emissiveIntensity: 0.85
  });
}

export function applyPhysicsCoreMaterialColor(
  material: THREE.MeshStandardMaterial,
  settings: PhysicsCoreSettings
): void {
  // Active cores should respond while the player drags the hue slider. Keep the
  // material object stable so existing meshes/trails do not need to be rebuilt.
  material.color.copy(createPhysicsCoreColor(settings));
  material.emissive.copy(createPhysicsCoreEmissiveColor(settings));
  material.emissiveIntensity = 0.85;
}

export function getPhysicsCoreCssColor(settings: PhysicsCoreSettings): string {
  return `#${createPhysicsCoreColor(settings).getHexString()}`;
}

function createColorFromCoreHue(settings: PhysicsCoreSettings, lightness: number): THREE.Color {
  const hue = normalizePhysicsCoreHueDegrees(settings.hueDegrees) / 360;
  return new THREE.Color().setHSL(hue, CORE_COLOR_SATURATION, lightness);
}
