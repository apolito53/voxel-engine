import * as THREE from "three";
import {
  getLocalLightDefinition,
  type LocalLightSelection
} from "./localLights";
import type { QualityPreset } from "./qualityPresets";

export const LOCAL_LIGHT_POINT_PROXY_CAPACITY = 32;
const LOCAL_LIGHT_IDLE_Y = -10000;

export type LocalLightRendererStats = {
  readonly sourceCount: number;
  readonly activePointLights: number;
  readonly pointLightCapacity: number;
  readonly emissiveOnlySources: number;
  readonly shadowCastingPointLights: number;
};

function createEmptyLocalLightRendererStats(): LocalLightRendererStats {
  return {
    sourceCount: 0,
    activePointLights: 0,
    pointLightCapacity: LOCAL_LIGHT_POINT_PROXY_CAPACITY,
    emissiveOnlySources: 0,
    shadowCastingPointLights: 0
  };
}

export class LocalLightRenderer {
  private readonly scene: THREE.Scene;
  private readonly lights: THREE.PointLight[] = [];
  private lastStats = createEmptyLocalLightRendererStats();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.ensureLightPool();
  }

  update(sources: readonly LocalLightSelection[], preset: QualityPreset): void {
    this.ensureLightPool();

    let activePointLights = 0;
    let shadowCastingPointLights = 0;
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
      activePointLights += 1;
      if (light.castShadow) shadowCastingPointLights += 1;
    }

    this.lastStats = {
      sourceCount: sources.length,
      activePointLights,
      pointLightCapacity: this.lights.length,
      // Every lamp tile now emits in the terrain shader. Sources beyond the
      // fixed proxy pool still visibly glow; they just skip expensive dynamic
      // light spill for this frame.
      emissiveOnlySources: Math.max(0, sources.length - activePointLights),
      shadowCastingPointLights
    };
  }

  hide(): void {
    for (const light of this.lights) {
      light.visible = false;
      light.castShadow = false;
    }
    this.lastStats = createEmptyLocalLightRendererStats();
  }

  getStats(): LocalLightRendererStats {
    return this.lastStats;
  }

  dispose(): void {
    for (const light of this.lights) {
      this.scene.remove(light);
      light.dispose();
    }
    this.lights.length = 0;
    this.lastStats = createEmptyLocalLightRendererStats();
  }

  private ensureLightPool(): void {
    while (this.lights.length < LOCAL_LIGHT_POINT_PROXY_CAPACITY) {
      const light = new THREE.PointLight(0xffb45f, 0, 12, 1.75);
      // Keep pooled lights visible with zero intensity once a world is active.
      // Three.js bakes visible light counts into shader variants, so toggling
      // lights on/off for every placed Lamp block can cause the half-second
      // browser-side hitch that barely shows up in our JS timing buckets.
      //
      // The pool is intentionally generous now, but still finite: lamp faces
      // glow in the terrain shader, while these real PointLights are only the
      // optional warm spill that brightens nearby stone, dirt, and wood.
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
