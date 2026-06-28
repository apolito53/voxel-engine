import * as THREE from "three";
import {
  getLocalLightDefinition,
  type LocalLightSelection
} from "./localLights";
import type { QualityPreset } from "./qualityPresets";

const LOCAL_LIGHT_POOL_GROW_CHUNK = 16;
const LOCAL_LIGHT_IDLE_Y = -10000;

export class LocalLightRenderer {
  private readonly scene: THREE.Scene;
  private readonly lights: THREE.PointLight[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  update(sources: readonly LocalLightSelection[], preset: QualityPreset): void {
    this.ensureLightPool(sources.length);

    for (let index = 0; index < this.lights.length; index += 1) {
      const light = this.lights[index];
      const source = sources[index];
      if (!source) {
        this.deactivateLight(light);
        continue;
      }

      const definition = getLocalLightDefinition(source.block);
      if (!definition) {
        this.deactivateLight(light);
        continue;
      }

      light.visible = true;
      light.color.setHex(definition.color);
      light.intensity = definition.intensity * source.intensityScale;
      light.distance = definition.distance * source.distanceScale;
      light.decay = definition.decay;
      light.position.set(source.centerX, source.centerY, source.centerZ);

      // Local lights are emitted from solid voxel fixtures. Even after moving
      // the light toward exposed surfaces, a normal shadow-casting PointLight
      // can still render the lamp voxels into its own cube-map and turn the
      // fixture into its own occluder. Leave lamp shadow maps off until we have
      // a voxel-aware exclusion path for the emitter volume.
      light.castShadow = false;
      light.shadow.mapSize.set(preset.localLightShadowMapSize, preset.localLightShadowMapSize);
      light.shadow.camera.near = 0.05;
      light.shadow.camera.far = light.distance;
      light.shadow.bias = -0.00008;
      light.shadow.normalBias = 0.012;
    }
  }

  hide(): void {
    for (const light of this.lights) {
      light.visible = false;
      light.castShadow = false;
    }
  }

  dispose(): void {
    for (const light of this.lights) {
      this.scene.remove(light);
      light.dispose();
    }
    this.lights.length = 0;
  }

  private ensureLightPool(budget: number): void {
    const requestedCount = Math.max(0, Math.floor(budget));
    const targetCount = requestedCount === 0
      ? 0
      : Math.ceil(requestedCount / LOCAL_LIGHT_POOL_GROW_CHUNK) * LOCAL_LIGHT_POOL_GROW_CHUNK;
    while (this.lights.length < targetCount) {
      const light = new THREE.PointLight(0xffb45f, 0, 12, 1.75);
      // Keep pooled lights visible with zero intensity once a world is active.
      // Three.js bakes visible light counts into shader variants, so toggling
      // lights on/off for every placed Lamp block can cause the half-second
      // browser-side hitch that barely shows up in our JS timing buckets.
      light.visible = true;
      light.castShadow = false;
      light.position.set(0, LOCAL_LIGHT_IDLE_Y, 0);
      light.name = `Local voxel light ${this.lights.length + 1}`;
      this.scene.add(light);
      this.lights.push(light);
    }
  }

  private deactivateLight(light: THREE.PointLight): void {
    light.visible = true;
    light.intensity = 0;
    light.castShadow = false;
    light.position.set(0, LOCAL_LIGHT_IDLE_Y, 0);
  }
}
